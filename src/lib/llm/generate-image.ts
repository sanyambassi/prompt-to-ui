import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { getEnvApiKey } from "@/lib/llm/env-keys";
import type { LLMProvider } from "@/lib/llm/studio-models";

export type ImageGenResult = {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  revisedPrompt?: string;
};

export type OpenAIImageSize = "1024x1024" | "1024x1536" | "1536x1024";

export type GeminiImageGenConfig = {
  aspectRatio?: string;
  imageSize?: string;
};

export type GenerateImageOptions = {
  openAISize?: OpenAIImageSize;
  geminiImageConfig?: GeminiImageGenConfig;
  /** When set, replaces `prompt` for the provider call (e.g. Grok composition hints). */
  promptForProvider?: string;
};

/** OpenAI Images API model used for UI-schema image synthesis. */
export const STUDIO_OPENAI_IMAGE_MODEL = "gpt-image-1.5";

/** xAI image API model (see https://docs.x.ai/docs/guides/image-generations). */
export const STUDIO_XAI_IMAGE_MODEL = "grok-imagine-image-pro";

/** Override via `STUDIO_GEMINI_IMAGE_MODEL` (e.g. newer image-capable Gemini ids). */
export function getStudioGeminiImageModelId(): string {
  return (
    process.env.STUDIO_GEMINI_IMAGE_MODEL?.trim() ||
    "gemini-3.1-flash-image-preview"
  );
}

/** Approximate output dimensions for result metadata (actual pixels vary by model). */
function dimensionsForGeminiAspect(aspect: string): { width: number; height: number } {
  switch (aspect) {
    case "16:9":
      return { width: 1536, height: 864 };
    case "9:16":
      return { width: 864, height: 1536 };
    case "4:3":
      return { width: 1365, height: 1024 };
    case "3:4":
      return { width: 1024, height: 1365 };
    case "1:1":
    default:
      return { width: 1024, height: 1024 };
  }
}

async function generateWithOpenAI(
  apiKey: string,
  prompt: string,
  size: OpenAIImageSize = "1536x1024",
): Promise<ImageGenResult> {
  const client = new OpenAI({ apiKey, timeout: 180_000 });

  const response = await client.images.generate({
    model: STUDIO_OPENAI_IMAGE_MODEL,
    prompt,
    n: 1,
    size,
    quality: "high",
  });

  const img = response.data?.[0];
  if (!img?.b64_json) {
    throw new Error("OpenAI image generation returned empty result");
  }

  const [w, h] = size.split("x").map(Number) as [number, number];

  return {
    base64: img.b64_json,
    mimeType: "image/png",
    width: w,
    height: h,
    revisedPrompt: img.revised_prompt ?? undefined,
  };
}

async function generateWithGemini(
  apiKey: string,
  prompt: string,
  imageConfig?: GeminiImageGenConfig,
): Promise<ImageGenResult> {
  const ai = new GoogleGenAI({ apiKey });

  const aspectRatio = imageConfig?.aspectRatio ?? "16:9";
  const imageSize = imageConfig?.imageSize ?? "2K";

  const model = getStudioGeminiImageModelId();

  const isFlash = model.includes("flash");
  const searchConfig: Record<string, unknown> = isFlash
    ? { searchTypes: { webSearch: {}, imageSearch: {} } }
    : {};

  const call = (cfg: { aspectRatio: string; imageSize?: string }) =>
    ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: ["IMAGE", "TEXT"],
        tools: [{ googleSearch: searchConfig }],
        imageConfig:
          cfg.imageSize ?
            { aspectRatio: cfg.aspectRatio, imageSize: cfg.imageSize }
          : { aspectRatio: cfg.aspectRatio },
      },
    });

  let response;
  try {
    response = await call({ aspectRatio, imageSize });
  } catch {
    try {
      response = await call({ aspectRatio, imageSize: "1K" });
    } catch {
      response = await call({ aspectRatio });
    }
  }

  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts?.length) {
    throw new Error("Gemini image generation returned no candidates");
  }

  for (const part of parts) {
    if (part.inlineData) {
      const { width, height } = dimensionsForGeminiAspect(aspectRatio);
      return {
        base64: part.inlineData.data ?? "",
        mimeType: part.inlineData.mimeType || "image/png",
        width,
        height,
      };
    }
  }

  throw new Error("Gemini image generation returned no image data");
}

async function generateWithGrok(
  apiKey: string,
  prompt: string,
): Promise<ImageGenResult> {
  const response = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: STUDIO_XAI_IMAGE_MODEL,
      prompt,
      n: 1,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg =
      (errorData as { error?: { message?: string } }).error?.message ??
      `Grok image API error: ${response.status}`;
    throw new Error(msg);
  }

  const data = (await response.json()) as {
    data?: { b64_json?: string; url?: string; revised_prompt?: string }[];
  };

  const first = data.data?.[0];
  if (!first) {
    throw new Error("Grok image generation returned empty result");
  }

  let base64 = first.b64_json;
  if (!base64 && first.url) {
    const imgRes = await fetch(first.url);
    if (!imgRes.ok) throw new Error("Failed to fetch Grok image URL");
    const buf = await imgRes.arrayBuffer();
    base64 = Buffer.from(buf).toString("base64");
  }

  if (!base64) {
    throw new Error("Grok image generation returned no image data");
  }

  return {
    base64,
    mimeType: "image/png",
    width: 1024,
    height: 1024,
    revisedPrompt: first.revised_prompt ?? undefined,
  };
}

/**
 * When the resolved provider is still `anthropic` (should be rare), remap to an
 * image-capable backend — same order as Claude UI models: Grok → OpenAI → Gemini.
 */
async function resolveImageProviderForAnthropic(): Promise<LLMProvider> {
  if (await getEnvApiKey("xai")) return "xai";
  if (await getEnvApiKey("openai")) return "openai";
  if (await getEnvApiKey("google")) return "google";
  return "openai";
}

async function firstImageProviderWithKey(
  order: LLMProvider[],
): Promise<LLMProvider> {
  for (const p of order) {
    if (await getEnvApiKey(p)) return p;
  }
  return order[0] ?? "openai";
}

/**
 * Auto image synthesis: align with the **UI/chat model’s provider**, then fall
 * back to other keys if that provider has no key.
 *
 * - OpenAI chat → OpenAI images, then Google, then xAI
 * - Google chat → Gemini images, then OpenAI, then xAI
 * - xAI chat → xAI images, then OpenAI, then Google
 * - Anthropic (Claude) chat → xAI, then OpenAI, then Google
 *
 * Env `STUDIO_PIPELINE_IMAGE_SYNTHESIS_PROVIDER` / Settings still override when set.
 */
export async function resolveBestImageSynthesisProvider(
  textModelProvider: LLMProvider,
): Promise<LLMProvider> {
  switch (textModelProvider) {
    case "openai":
      return await firstImageProviderWithKey(["openai", "google", "xai"]);
    case "google":
      return await firstImageProviderWithKey(["google", "openai", "xai"]);
    case "xai":
      return await firstImageProviderWithKey(["xai", "openai", "google"]);
    case "anthropic":
      return await firstImageProviderWithKey(["xai", "openai", "google"]);
    default:
      return await firstImageProviderWithKey(["openai", "google", "xai"]);
  }
}

export async function generateImage(
  provider: LLMProvider,
  prompt: string,
  sizeOrOptions?:
    | OpenAIImageSize
    | GenerateImageOptions,
): Promise<ImageGenResult> {
  const options: GenerateImageOptions | undefined =
    typeof sizeOrOptions === "string" ?
      { openAISize: sizeOrOptions }
    : sizeOrOptions;

  const effectiveProvider =
    provider === "anthropic" ?
      await resolveImageProviderForAnthropic()
    : provider;

  const apiKey = await getEnvApiKey(effectiveProvider);
  if (!apiKey) {
    throw new Error(
      `No API key available for ${effectiveProvider} image generation. Add one in Settings.`,
    );
  }

  const text =
    options?.promptForProvider?.trim() || prompt;

  switch (effectiveProvider) {
    case "openai":
      return generateWithOpenAI(
        apiKey,
        text,
        options?.openAISize ?? "1536x1024",
      );
    case "google":
      return generateWithGemini(apiKey, text, options?.geminiImageConfig);
    case "xai":
      return generateWithGrok(apiKey, text);
    case "anthropic":
      throw new Error(
        "Anthropic does not support image generation. Configure an OpenAI, Google, or xAI key.",
      );
    default:
      throw new Error(
        `Image generation not supported for provider: ${effectiveProvider}`,
      );
  }
}
