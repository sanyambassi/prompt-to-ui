/**
 * Maps thinking modes to provider-specific options (aligned with v3 chat app).
 * @see v3/apps/chat/src/lib/services/llm/thinking-mode.ts
 */

export type ThinkingMode =
  | "auto"
  | "fast"
  | "think"
  | "sync-neurons"
  | "go-all-in";

const AUTO_THINKING_POOL: ThinkingMode[] = ["fast", "think"];

/** Resolve "auto" to a random concrete thinking mode (only fast/think — never extended or max). */
export function resolveAutoThinking(mode: ThinkingMode): ThinkingMode {
  if (mode !== "auto") return mode;
  return AUTO_THINKING_POOL[
    Math.floor(Math.random() * AUTO_THINKING_POOL.length)
  ];
}

export function defaultThinkingMode(): ThinkingMode {
  return "auto";
}

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export interface ThinkingConfig {
  reasoningEffort?: ReasoningEffort;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  thinkingBudget?: number;
  claudeEffort?: "low" | "medium" | "high" | "max";
  useThinkingModel?: boolean;
}

const ADAPTIVE_CLAUDE_MODELS = ["claude-opus-4-6", "claude-sonnet-4-6"];
const isAdaptiveClaude = (model: string) => ADAPTIVE_CLAUDE_MODELS.includes(model);

export function getThinkingConfig(
  model: string,
  thinkingMode: ThinkingMode,
): ThinkingConfig {
  const resolved = thinkingMode === "auto" ? resolveAutoThinking(thinkingMode) : thinkingMode;
  const isGPT54 = model.startsWith("gpt-5.4") && !model.startsWith("gpt-5.4-pro");
  const isGPT54Pro = model.startsWith("gpt-5.4-pro");
  const isGPT53Codex = model.startsWith("gpt-5.3-codex");
  const isGemini31Pro = model.startsWith("gemini-3.1-pro");
  const isGemini3Flash = model.startsWith("gemini-3-flash");
  const isGeminiFlashLite = model.startsWith("gemini-3.1-flash-lite");
  const isClaude = model.startsWith("claude-");
  const isGrok4 =
    model.startsWith("grok-4") ||
    model.startsWith("grok-4.1") ||
    model.startsWith("grok-4.2");

  if (resolved === "fast") {
    if (isGPT54) return { reasoningEffort: "none" };
    if (isGemini3Flash || isGeminiFlashLite) return { thinkingLevel: "minimal" };
    if (isGrok4) return { useThinkingModel: false };
    if (isClaude && isAdaptiveClaude(model)) return { claudeEffort: "low" };
    return {};
  }

  if (resolved === "think") {
    if (isGPT54 || isGPT54Pro || isGPT53Codex) return { reasoningEffort: "medium" };
    if (isGemini31Pro || isGemini3Flash || isGeminiFlashLite) {
      return { thinkingLevel: "low" };
    }
    if (isClaude) {
      if (isAdaptiveClaude(model)) return { claudeEffort: "medium" };
      return { thinkingBudget: 8000 };
    }
    if (isGrok4) return { useThinkingModel: true };
    return {};
  }

  if (resolved === "sync-neurons") {
    if (isGPT54 || isGPT54Pro || isGPT53Codex) return { reasoningEffort: "high" };
    if (isGemini31Pro || isGemini3Flash || isGeminiFlashLite) {
      return { thinkingLevel: "medium" };
    }
    if (isClaude) {
      if (isAdaptiveClaude(model)) return { claudeEffort: "high" };
      return { thinkingBudget: 32000 };
    }
    if (isGrok4) return { useThinkingModel: true };
    return {};
  }

  if (resolved === "go-all-in") {
    if (isGPT54 || isGPT54Pro || isGPT53Codex) return { reasoningEffort: "xhigh" };
    if (isGemini31Pro || isGemini3Flash || isGeminiFlashLite) {
      return { thinkingLevel: "high" };
    }
    if (isClaude) {
      if (isAdaptiveClaude(model)) return { claudeEffort: "max" };
      return { thinkingBudget: 63000 };
    }
    if (isGrok4) return { useThinkingModel: true };
    return {};
  }

  return {};
}

export function isThinkingEnabled(thinkingMode: ThinkingMode): boolean {
  return thinkingMode !== "fast" && thinkingMode !== "auto";
}
