import {
  getThinkingConfig,
  type ReasoningEffort,
  type ThinkingMode,
} from "@/lib/llm/thinking-mode";

const REASONING_EFFORT_MODELS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-pro",
  "gpt-5.3-codex",
];
const PRO_MODELS = ["gpt-5.4-pro"];
const CODEX_MODELS = ["gpt-5.3-codex"];

export function getOpenAIReasoningEffort(
  model: string,
  thinkingMode: ThinkingMode,
): ReasoningEffort | undefined {
  const supportsEffort = REASONING_EFFORT_MODELS.some((m) => model.startsWith(m));
  if (!supportsEffort) return undefined;

  const isProModel = PRO_MODELS.some((m) => model.startsWith(m));
  const isCodexModel = CODEX_MODELS.some((m) => model.startsWith(m));

  const thinkingConfig = getThinkingConfig(model, thinkingMode);
  const effort = thinkingConfig.reasoningEffort;

  if (effort !== undefined) {
    if (isProModel && (effort === "none" || effort === "low")) return "medium";
    if (isCodexModel && effort === "none") return "low";
    return effort;
  }

  if (isProModel) return "medium";
  if (isCodexModel) return "low";
  return "none";
}
