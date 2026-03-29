import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import {
  buildHtmlPrototypeRefineSystemPrompt,
  buildHtmlPrototypeSystemPrompt,
} from "@/lib/prompts/html-prototype-generation";
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
import {
  getThinkingConfig,
  type ThinkingMode,
} from "@/lib/llm/thinking-mode";
import type { UiSchemaVisionImage } from "@/lib/llm/complete-ui-schema";

const OPENAI_TIMEOUT_MS = 900_000;

export type StreamEvent =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string };

export type StreamCallback = (event: StreamEvent) => void;

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

async function streamAnthropic(
  apiKey: string,
  model: string,
  thinkingMode: ThinkingMode,
  systemPrompt: string,
  userPrompt: string,
  onEvent: StreamCallback,
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
    imageBlocks.length > 0
      ? [...imageBlocks, { type: "text", text: userPrompt }]
      : userPrompt;

  const webSearchVersion = isAdaptive ? "web_search_20260209" : "web_search_20250305";
  const tools: Record<string, unknown>[] = [
    { type: webSearchVersion, name: "web_search", max_uses: 10 },
  ];

  const stream = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    thinking,
    ...(outputConfig ? { output_config: outputConfig } : {}),
    tools: tools as unknown as Anthropic.Messages.Tool[],
    messages: [{ role: "user", content: userMessageContent }],
    stream: true,
  });

  let text = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      const d = event.delta;
      if (d.type === "thinking_delta") {
        onEvent({ type: "thinking", text: (d as { thinking: string }).thinking });
      } else if (d.type === "text_delta") {
        text += d.text;
        onEvent({ type: "text", text: d.text });
      }
    }
  }

  text = text.trim();
  if (!text) throw new Error("Anthropic returned empty content");
  return text;
}

async function streamGemini(
  apiKey: string,
  model: string,
  thinkingMode: ThinkingMode,
  systemPrompt: string,
  userPrompt: string,
  onEvent: StreamCallback,
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

  const stream = await ai.models.generateContentStream({
    model,
    contents: [{ role: "user", parts }],
    config: {
      maxOutputTokens: 65536,
      systemInstruction: systemPrompt,
      thinkingConfig,
      tools: [{ googleSearch: {} }],
    } as Record<string, unknown>,
  });

  let text = "";
  for await (const chunk of stream) {
    for (const candidate of chunk.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if ((part as { thought?: boolean }).thought && (part as { text?: string }).text) {
          onEvent({ type: "thinking", text: (part as { text: string }).text });
        } else if ((part as { text?: string }).text) {
          text += (part as { text: string }).text;
          onEvent({ type: "text", text: (part as { text: string }).text });
        }
      }
    }
  }

  text = text.trim();
  if (!text) throw new Error("Gemini returned empty content");
  return text;
}

function extractOpenAiStreamText(chunk: OpenAI.Responses.ResponseStreamEvent): {
  text?: string;
  reasoning?: string;
} {
  const t = chunk.type as string;
  if (t === "response.output_item.added") return {};
  if (t === "response.content_part.delta" || t === "response.output_text.delta") {
    const d = chunk as unknown as { delta?: string; text?: string };
    const txt = d.delta ?? d.text;
    if (typeof txt === "string") return { text: txt };
  }
  if (t === "response.reasoning_summary_part.delta" || t === "response.reasoning_summary_text.delta") {
    const d = chunk as unknown as { delta?: string; text?: string };
    const txt = d.delta ?? d.text;
    if (typeof txt === "string") return { reasoning: txt };
  }
  return {};
}

async function streamOpenAI(
  apiKey: string,
  model: string,
  thinkingMode: ThinkingMode,
  systemPrompt: string,
  userPrompt: string,
  onEvent: StreamCallback,
  visionImages?: UiSchemaVisionImage[],
): Promise<string> {
  const client = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS });
  const reasoningEffort = getOpenAIReasoningEffort(model, thinkingMode);

  const userContent:
    | string
    | OpenAI.Responses.ResponseInputMessageContentList =
    visionImages && visionImages.length > 0
      ? [
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

  const stream = await client.responses.create({
    model,
    instructions: systemPrompt,
    input: [{ role: "user", content: userContent }],
    tools: [{ type: "web_search" as const }],
    stream: true,
    max_output_tokens: 65536,
    ...(reasoningEffort !== undefined
      ? { reasoning: { effort: reasoningEffort, summary: "auto" as const } }
      : {}),
  });

  let text = "";
  for await (const event of stream) {
    const { text: t, reasoning } = extractOpenAiStreamText(event);
    if (reasoning) {
      onEvent({ type: "thinking", text: reasoning });
    }
    if (t) {
      text += t;
      onEvent({ type: "text", text: t });
    }
  }

  text = text.trim();
  if (!text) throw new Error("OpenAI returned empty content");
  return text;
}

async function streamXai(
  apiKey: string,
  model: string,
  thinkingMode: ThinkingMode,
  systemPrompt: string,
  userPrompt: string,
  onEvent: StreamCallback,
): Promise<string> {
  const apiModel = getGrokApiModel(model, thinkingMode);

  const isThinkingEnabled = thinkingMode !== "fast";

  const body: Record<string, unknown> = {
    model: apiModel,
    instructions: systemPrompt,
    input: [{ role: "user", content: userPrompt }],
    tools: [{ type: "web_search", enable_image_understanding: true }],
    stream: true,
    max_output_tokens: 65536,
  };
  if (isThinkingEnabled) {
    body.include = ["reasoning.encrypted_content"];
  }

  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`xAI API error ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (!json || json === "[DONE]") continue;
        try {
          const event = JSON.parse(json) as {
            type?: string;
            delta?: string;
            text?: string;
            item?: { type?: string };
          };
          const t = event.type ?? "";

          if (t === "response.output_item.added" && event.item?.type === "reasoning") {
            onEvent({ type: "thinking", text: "" });
          } else if (t === "response.output_text.delta") {
            const delta = event.delta ?? event.text ?? "";
            if (delta) {
              text += delta;
              onEvent({ type: "text", text: delta });
            }
          } else if (
            t === "response.reasoning_summary_part.delta" ||
            t === "response.reasoning_summary_text.delta"
          ) {
            const delta = event.delta ?? event.text ?? "";
            if (delta) onEvent({ type: "thinking", text: delta });
          }
        } catch {
          /* skip malformed SSE */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  text = text.trim();
  if (!text) throw new Error("xAI returned empty content");
  return text;
}

export type PrototypeFormat = "ui_schema" | "html_document";

export type StreamingCompleteParams = {
  model: string;
  thinkingMode: ThinkingMode;
  userPrompt: string;
  refine?: boolean;
  /** When `html_document`, system prompt asks for full HTML per screen (still JSON envelope). */
  prototypeFormat?: PrototypeFormat;
  visionImages?: UiSchemaVisionImage[];
  onEvent: StreamCallback;
};

export async function streamUiSchemaJson(
  params: StreamingCompleteParams,
): Promise<{ provider: LLMProvider; rawText: string }> {
  const provider = getProviderFromModelId(params.model);
  const apiKey = await getEnvApiKey(provider);
  if (!apiKey) {
    throw new Error(
      `Missing API key for ${provider}. Set the corresponding env var or configure it in Settings.`,
    );
  }

  const fmt = params.prototypeFormat ?? "ui_schema";
  const systemPrompt =
    fmt === "html_document" ?
      params.refine ?
        buildHtmlPrototypeRefineSystemPrompt()
      : buildHtmlPrototypeSystemPrompt()
    : params.refine ?
      buildUiSchemaRefineSystemPrompt()
    : buildUiSchemaSystemPrompt();

  const visionForModel =
    params.visionImages?.length && studioModelSupportsVision(params.model)
      ? params.visionImages
      : undefined;

  let rawText: string;

  switch (provider) {
    case "openai":
      rawText = await streamOpenAI(
        apiKey,
        params.model,
        params.thinkingMode,
        systemPrompt,
        params.userPrompt,
        params.onEvent,
        visionForModel,
      );
      break;
    case "anthropic":
      rawText = await streamAnthropic(
        apiKey,
        params.model,
        params.thinkingMode,
        systemPrompt,
        params.userPrompt,
        params.onEvent,
        visionForModel,
      );
      break;
    case "google":
      rawText = await streamGemini(
        apiKey,
        params.model,
        params.thinkingMode,
        systemPrompt,
        params.userPrompt,
        params.onEvent,
        visionForModel,
      );
      break;
    case "xai":
      rawText = await streamXai(
        apiKey,
        params.model,
        params.thinkingMode,
        systemPrompt,
        params.userPrompt,
        params.onEvent,
      );
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  return { provider, rawText };
}
