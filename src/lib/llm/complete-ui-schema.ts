import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import {
  buildUiSchemaRefineSystemPrompt,
  buildUiSchemaSystemPrompt,
} from "@/lib/prompts/ui-schema-generation";
import { getEnvApiKey } from "@/lib/llm/env-keys";
import { getGrokApiModel } from "@/lib/llm/grok-model-map";
import { getOpenAIReasoningEffort } from "@/lib/llm/reasoning-openai";
import {
  getProviderFromModelId,
  studioModelSupportsVision,
  type LLMProvider,
} from "@/lib/llm/studio-models";
import { withTransientRetries } from "@/lib/llm/retry-transient";
import {
  getThinkingConfig,
  type ThinkingMode,
} from "@/lib/llm/thinking-mode";

const OPENAI_TIMEOUT_MS = 900_000;

export { extractJsonObjectFromLlmText } from "@/lib/llm/extract-json";

function extractOpenAiResponseText(response: OpenAI.Responses.Response): string {
  for (const output of response.output ?? []) {
    if (output.type === "message" && output.content) {
      for (const item of output.content) {
        if ("text" in item && typeof (item as { text?: string }).text === "string") {
          return (item as { text: string }).text;
        }
      }
    }
  }
  return "";
}

export type UiSchemaVisionImage = {
  mimeType: string;
  base64: string;
  label?: string;
};

async function completeOpenAI(
  apiKey: string,
  model: string,
  thinkingMode: ThinkingMode,
  systemPrompt: string,
  userPrompt: string,
  visionImages?: UiSchemaVisionImage[],
): Promise<string> {
  const client = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS });
  const reasoningEffort = getOpenAIReasoningEffort(model, thinkingMode);

  const userContent:
    | string
    | OpenAI.Responses.ResponseInputMessageContentList =
    visionImages && visionImages.length > 0 ?
      [
        ...visionImages.map(
          (img) =>
            ({
              type: "input_image" as const,
              detail: "auto" as const,
              image_url: `data:${img.mimeType};base64,${img.base64}`,
            }) satisfies OpenAI.Responses.ResponseInputImage,
        ),
        { type: "input_text" as const, text: userPrompt },
      ]
    : userPrompt;

  const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model,
    instructions: systemPrompt,
    input: [{ role: "user", content: userContent }],
    stream: false,
    max_output_tokens: 65536,
    ...(reasoningEffort !== undefined ?
      {
        reasoning: { effort: reasoningEffort, summary: "auto" as const },
      }
    : {}),
  };

  const response = await client.responses.create(params);
  const text = extractOpenAiResponseText(response);
  if (!text) throw new Error("OpenAI returned empty content");
  return text;
}

async function completeAnthropic(
  apiKey: string,
  model: string,
  thinkingMode: ThinkingMode,
  systemPrompt: string,
  userPrompt: string,
  visionImages?: UiSchemaVisionImage[],
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const isOpus46 = model === "claude-opus-4-6";
  const isSonnet46 = model === "claude-sonnet-4-6";
  const isAdaptive = isOpus46 || isSonnet46;

  const cfg = getThinkingConfig(model, thinkingMode);
  let thinking:
    | { type: "enabled"; budget_tokens: number }
    | { type: "adaptive" }
    | undefined;
  let outputConfig: { effort: "low" | "medium" | "high" | "max" } | undefined;

  if (isAdaptive && cfg.claudeEffort) {
    thinking = { type: "adaptive" };
    outputConfig = { effort: cfg.claudeEffort };
  } else if (cfg.thinkingBudget) {
    thinking = { type: "enabled", budget_tokens: cfg.thinkingBudget };
  }

  let maxTokens = isOpus46 ? 128_000 : 64_000;
  if (thinking?.type === "enabled" && thinking.budget_tokens >= maxTokens) {
    maxTokens = thinking.budget_tokens + 4096;
  }

  const claudeImageMedia = (
    m: string,
  ): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null => {
    const x = m.toLowerCase();
    if (x === "image/jpeg" || x === "image/jpg") return "image/jpeg";
    if (x === "image/png") return "image/png";
    if (x === "image/gif") return "image/gif";
    if (x === "image/webp") return "image/webp";
    return null;
  };

  const imageBlocks: Anthropic.Messages.ContentBlockParam[] = [];
  for (const img of visionImages ?? []) {
    const mt = claudeImageMedia(img.mimeType);
    if (!mt) continue;
    imageBlocks.push({
      type: "image",
      source: { type: "base64", media_type: mt, data: img.base64 },
    });
  }

  const userMessageContent:
    | string
    | Anthropic.Messages.ContentBlockParam[] =
    imageBlocks.length > 0 ?
      [...imageBlocks, { type: "text", text: userPrompt }]
    : userPrompt;

  const stream = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    thinking,
    ...(outputConfig ? { output_config: outputConfig } : {}),
    messages: [{ role: "user", content: userMessageContent }],
    stream: true,
  });

  let text = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      const d = event.delta;
      if (d.type === "text_delta") text += d.text;
    }
  }
  text = text.trim();
  if (!text) throw new Error("Anthropic returned empty content");
  return text;
}

/**
 * Build thinkingConfig for the @google/genai SDK.
 * Mirrors v3/apps/chat/src/lib/services/llm/gemini-utils.ts buildThinkingConfig.
 *
 * - Gemini 3.x models: use `thinkingLevel` (lowercase string).
 * - Older models (2.5): use `thinkingBudget` (token count).
 * - NEVER send both — the API rejects it.
 */
function buildGeminiThinkingConfig(
  model: string,
  thinkingMode: ThinkingMode,
): Record<string, unknown> {
  const cfg = getThinkingConfig(model, thinkingMode);

  if (model.includes("gemini-3")) {
    const isFlash = model.includes("flash");
    const thinkingLevel =
      cfg.thinkingLevel ??
      (thinkingMode === "fast" ? (isFlash ? "minimal" : "low") : "high");
    return { thinkingLevel, includeThoughts: true };
  }

  const isFlash = model.includes("flash");
  const maxBudget = isFlash ? 24576 : 32000;
  return {
    thinkingBudget:
      cfg.thinkingBudget ?? (thinkingMode === "fast" ? 1024 : maxBudget),
    includeThoughts: true,
  };
}

async function completeGemini(
  apiKey: string,
  model: string,
  thinkingMode: ThinkingMode,
  systemPrompt: string,
  userPrompt: string,
  visionImages?: UiSchemaVisionImage[],
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const thinkingConfig = buildGeminiThinkingConfig(model, thinkingMode);

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];
  for (const img of visionImages ?? []) {
    if (!img.mimeType.startsWith("image/")) continue;
    parts.push({
      inlineData: { mimeType: img.mimeType, data: img.base64 },
    });
  }
  parts.push({ text: userPrompt });

  const res = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      maxOutputTokens: 65536,
      systemInstruction: systemPrompt,
      thinkingConfig,
    } as Record<string, unknown>,
  });

  const text = res.text?.trim() ?? "";
  if (!text) throw new Error("Gemini returned empty content");
  return text;
}

async function completeXai(
  apiKey: string,
  model: string,
  thinkingMode: ThinkingMode,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const apiModel = getGrokApiModel(model, thinkingMode);

  const body = {
    model: apiModel,
    instructions: systemPrompt,
    input: [{ role: "user", content: userPrompt }],
    stream: false,
    max_output_tokens: 65536,
  };

  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`xAI API error ${res.status}: ${errBody.slice(0, 500)}`);
  }

  type XaiOutput = { type: string; content?: Array<{ type: string; text?: string }> };
  const data = (await res.json()) as { output?: XaiOutput[] };

  let text = "";
  for (const item of data.output ?? []) {
    if (item.type === "message") {
      for (const part of item.content ?? []) {
        if (part.type === "output_text" && part.text) text += part.text;
      }
    }
  }

  text = text.trim();
  if (!text) throw new Error("xAI returned empty content");
  return text;
}

export type CompleteUiSchemaParams = {
  model: string;
  thinkingMode: ThinkingMode;
  userPrompt: string;
  /** Use refine-oriented system prompt (user message must include current schema). */
  refine?: boolean;
  /**
   * Base64 images (vision-capable models only). Text-only models ignore these;
   * the caller should still prepend a text preamble describing references.
   */
  visionImages?: UiSchemaVisionImage[];
};

/**
 * Calls the appropriate provider; returns raw model text (JSON expected).
 */
export async function completeUiSchemaJson(
  params: CompleteUiSchemaParams,
): Promise<{ provider: LLMProvider; rawText: string }> {
  const provider = getProviderFromModelId(params.model);
  const apiKey = await getEnvApiKey(provider);
  if (!apiKey) {
    throw new Error(
      `Missing API key for ${provider}. Set the corresponding env var or configure it in Settings.`,
    );
  }

  const systemPrompt =
    params.refine ?
      buildUiSchemaRefineSystemPrompt()
    : buildUiSchemaSystemPrompt();

  const visionForModel =
    params.visionImages?.length && studioModelSupportsVision(params.model) ?
      params.visionImages
    : undefined;

  const rawText = await withTransientRetries(
    async () => {
      switch (provider) {
        case "openai":
          return completeOpenAI(
            apiKey,
            params.model,
            params.thinkingMode,
            systemPrompt,
            params.userPrompt,
            visionForModel,
          );
        case "anthropic":
          return completeAnthropic(
            apiKey,
            params.model,
            params.thinkingMode,
            systemPrompt,
            params.userPrompt,
            visionForModel,
          );
        case "google":
          return completeGemini(
            apiKey,
            params.model,
            params.thinkingMode,
            systemPrompt,
            params.userPrompt,
            visionForModel,
          );
        case "xai":
          return completeXai(
            apiKey,
            params.model,
            params.thinkingMode,
            systemPrompt,
            params.userPrompt,
          );
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    },
    { maxAttempts: 3, delaysMs: [1500, 3200, 6000] },
  );

  return { provider, rawText };
}
