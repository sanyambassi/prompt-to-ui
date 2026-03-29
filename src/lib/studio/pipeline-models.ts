import { getEnvApiKey } from "@/lib/llm/env-keys";
import { resolveBestImageSynthesisProvider } from "@/lib/llm/generate-image";
import { resolveAutoModelWithKeys } from "@/lib/llm/resolve-auto-model-server";
import {
  getProviderFromModelId,
  getStudioModelMeta,
  type LLMProvider,
  type StudioModelId,
} from "@/lib/llm/studio-models";

export type GenerationPipelineOverrides = {
  uiModel?: string | null;
  imageSynthesisProvider?: LLMProvider | "auto" | null;
};

function envUiModelOverride(): string | null {
  const v = process.env.STUDIO_PIPELINE_UI_MODEL?.trim();
  return v || null;
}

function envImageProviderOverride(): LLMProvider | null {
  const v = process.env.STUDIO_PIPELINE_IMAGE_SYNTHESIS_PROVIDER?.trim().toLowerCase();
  if (v === "openai" || v === "google" || v === "xai") return v;
  return null;
}

export async function resolveUiModelForPipeline(
  jobModel: string,
  request?: GenerationPipelineOverrides | null,
  thinkingMode?: string,
): Promise<string> {
  const fromRequest = request?.uiModel?.trim();
  const fromEnv = envUiModelOverride();
  const candidates = [fromRequest, fromEnv, jobModel].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );

  for (const id of candidates) {
    if (getStudioModelMeta(id)) {
      return id === "auto" ? await resolveAutoModelWithKeys(id as StudioModelId, thinkingMode) : id;
    }
  }
  return jobModel === "auto" ? await resolveAutoModelWithKeys(jobModel as StudioModelId, thinkingMode) : jobModel;
}

export async function resolveImageSynthesisProviderForPipeline(
  jobModel: string,
  request?: GenerationPipelineOverrides | null,
): Promise<LLMProvider> {
  const fromRequest = request?.imageSynthesisProvider;
  const fromEnv = envImageProviderOverride();

  const explicit: LLMProvider | null =
    fromRequest && fromRequest !== "auto" ? fromRequest : fromEnv;

  if (explicit && (await getEnvApiKey(explicit))) return explicit;

  return await resolveBestImageSynthesisProvider(getProviderFromModelId(jobModel));
}
