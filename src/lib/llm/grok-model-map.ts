/**
 * xAI Grok logical id → API model id (reasoning vs non-reasoning).
 * @see v3/apps/chat/src/lib/services/llm/grok-utils.ts
 */

import { getThinkingConfig, type ThinkingMode } from "@/lib/llm/thinking-mode";

const GROK_MODELS = {
  "grok-4": {
    reasoning: "grok-4-fast-reasoning",
    nonReasoning: "grok-4-fast-non-reasoning",
  },
  "grok-4.1": {
    reasoning: "grok-4-1-fast-reasoning",
    nonReasoning: "grok-4-1-fast-non-reasoning",
  },
  "grok-4.2-beta": {
    reasoning: "grok-4.20-beta-0309-reasoning",
    nonReasoning: "grok-4.20-beta-0309-non-reasoning",
  },
} as const;

export type GrokLogicalModel = keyof typeof GROK_MODELS;

export function getGrokApiModel(
  model: string,
  thinkingMode: ThinkingMode,
): string {
  if (model.includes("-reasoning") || model.includes("-non-reasoning")) {
    return model;
  }

  const thinkingConfig = getThinkingConfig(model, thinkingMode);
  const useThinkingModel =
    thinkingConfig.useThinkingModel ?? thinkingMode !== "fast";

  const cfg = GROK_MODELS[model as GrokLogicalModel];
  if (cfg) {
    return useThinkingModel ? cfg.reasoning : cfg.nonReasoning;
  }

  return useThinkingModel ?
      "grok-4-fast-reasoning"
    : "grok-4-fast-non-reasoning";
}
