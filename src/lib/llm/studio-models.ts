/**
 * Studio UI generation models — aligned with v3 chat MODEL_CONFIG subset.
 * @see v3/apps/chat/src/types/index.ts (MODEL_CONFIG)
 */

export type LLMProvider = "openai" | "anthropic" | "google" | "xai";

export type StudioModelId =
  | "auto"
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "claude-sonnet-4-6"
  | "claude-opus-4-6"
  | "gemini-3.1-pro-preview"
  | "gemini-3.1-flash-lite-preview"
  | "grok-4.1"
  | "grok-4.2-beta";

export type ImageModelId =
  | "gpt-image-1.5"
  | "gemini-3.1-flash-image-preview"
  | "grok-imagine-image-pro";

export type StudioModelMeta = {
  id: StudioModelId;
  name: string;
  provider: LLMProvider;
  requiresThinking: boolean;
  supportsVision: boolean;
};

export type ImageModelMeta = {
  id: ImageModelId;
  name: string;
  provider: LLMProvider;
};

export const IMAGE_MODELS: ImageModelMeta[] = [
  { id: "gpt-image-1.5", name: "GPT Image 1.5 (high)", provider: "openai" },
  {
    id: "gemini-3.1-flash-image-preview",
    name: "Gemini image (override: STUDIO_GEMINI_IMAGE_MODEL)",
    provider: "google",
  },
  { id: "grok-imagine-image-pro", name: "Grok Imagine (image-pro)", provider: "xai" },
];

export const STUDIO_MODELS: StudioModelMeta[] = [
  { id: "auto", name: "Auto", provider: "openai", requiresThinking: false, supportsVision: true },
  { id: "gpt-5.4", name: "GPT-5.4", provider: "openai", requiresThinking: false, supportsVision: true },
  { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "openai", requiresThinking: false, supportsVision: true },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    requiresThinking: true,
    supportsVision: true,
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "anthropic",
    requiresThinking: true,
    supportsVision: true,
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    provider: "google",
    requiresThinking: true,
    supportsVision: true,
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite",
    provider: "google",
    requiresThinking: false,
    supportsVision: true,
  },
  { id: "grok-4.1", name: "Grok 4.1", provider: "xai", requiresThinking: false, supportsVision: false },
  { id: "grok-4.2-beta", name: "Grok 4.2 Beta", provider: "xai", requiresThinking: false, supportsVision: false },
];

const byId = new Map(STUDIO_MODELS.map((m) => [m.id, m]));

export function getStudioModelMeta(modelId: string) {
  return byId.get(modelId as StudioModelId);
}

export function getProviderFromModelId(model: string): LLMProvider {
  const meta = getStudioModelMeta(model);
  if (meta) return meta.provider;
  if (model.startsWith("gpt-") || model.includes("gpt")) return "openai";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("grok-")) return "xai";
  throw new Error(`Unknown model: ${model}`);
}

export function modelRequiresThinking(modelId: string): boolean {
  return getStudioModelMeta(modelId)?.requiresThinking ?? false;
}

export function defaultStudioModel(): StudioModelId {
  return "auto";
}

const CONCRETE_MODELS = STUDIO_MODELS.filter((m) => m.id !== "auto");

/**
 * Resolve "auto" to a random concrete model. Returns the ID unchanged if not "auto".
 * Client-safe (no DB access). For key-aware resolution use resolveAutoModelWithKeys.
 */
export function resolveAutoModel(
  id: StudioModelId,
  thinkingMode?: string,
): StudioModelId {
  if (id !== "auto") return id;
  let pool = CONCRETE_MODELS;
  if (thinkingMode === "fast") {
    pool = pool.filter((m) => !m.requiresThinking);
  }
  if (pool.length === 0) pool = CONCRETE_MODELS;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick.id;
}


export function studioModelSupportsVision(modelId: string): boolean {
  return getStudioModelMeta(modelId)?.supportsVision ?? false;
}

const imageById = new Map(IMAGE_MODELS.map((m) => [m.id, m]));

export function getImageModelMeta(modelId: string): ImageModelMeta | undefined {
  return imageById.get(modelId as ImageModelId);
}

export function defaultImageModel(): ImageModelId {
  return "gemini-3.1-flash-image-preview";
}
