import { getEnvApiKey } from "@/lib/llm/env-keys";
import {
  STUDIO_MODELS,
  type LLMProvider,
  type StudioModelId,
} from "@/lib/llm/studio-models";

const CONCRETE_MODELS = STUDIO_MODELS.filter((m) => m.id !== "auto");

/**
 * Server-only: resolve "auto" considering which providers have API keys configured.
 * Falls back to random if no keys found.
 */
export async function resolveAutoModelWithKeys(
  id: StudioModelId,
  thinkingMode?: string,
): Promise<StudioModelId> {
  if (id !== "auto") return id;
  let pool = CONCRETE_MODELS;
  if (thinkingMode === "fast") {
    pool = pool.filter((m) => !m.requiresThinking);
  }
  if (pool.length === 0) pool = CONCRETE_MODELS;

  const providers = new Set<LLMProvider>();
  for (const p of ["openai", "anthropic", "google", "xai"] as LLMProvider[]) {
    if (await getEnvApiKey(p)) providers.add(p);
  }
  if (providers.size > 0) {
    const keyed = pool.filter((m) => providers.has(m.provider));
    if (keyed.length > 0) pool = keyed;
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick.id;
}
