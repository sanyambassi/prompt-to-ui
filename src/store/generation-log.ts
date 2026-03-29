import { create } from "zustand";

/** Coerce JSON from the DB / older saves into valid log rows for the UI. */
export function normalizeHistoryEntries(raw: unknown): AgentLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentLogEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = o.type;
    const ts = typeof o.ts === "number" && Number.isFinite(o.ts) ? o.ts : Date.now();

    if (type === "user_prompt" && typeof o.text === "string") {
      out.push({ type: "user_prompt", text: o.text, ts });
      continue;
    }
    if (type === "status" && typeof o.message === "string") {
      out.push({ type: "status", message: o.message, ts });
      continue;
    }
    if (type === "thinking" && typeof o.text === "string") {
      out.push({ type: "thinking", text: o.text, ts });
      continue;
    }
    if (type === "content" && typeof o.text === "string") {
      out.push({ type: "content", text: o.text, ts });
      continue;
    }
    if (
      type === "screen" &&
      typeof o.index === "number" &&
      typeof o.name === "string"
    ) {
      out.push({ type: "screen", index: o.index, name: o.name, ts });
      continue;
    }
    if (type === "palette" && Array.isArray(o.colors)) {
      const colors = o.colors.filter((c): c is string => typeof c === "string");
      out.push({ type: "palette", colors, ts });
      continue;
    }
    if (
      type === "image_progress" &&
      typeof o.current === "number" &&
      typeof o.total === "number" &&
      typeof o.prompt === "string"
    ) {
      out.push({
        type: "image_progress",
        current: o.current,
        total: o.total,
        prompt: o.prompt,
        ts,
      });
      continue;
    }
    if (
      type === "image_done" &&
      typeof o.nodeId === "string" &&
      typeof o.url === "string"
    ) {
      out.push({ type: "image_done", nodeId: o.nodeId, url: o.url, ts });
      continue;
    }
    if (type === "image_skipped" && typeof o.reason === "string") {
      out.push({ type: "image_skipped", reason: o.reason, ts });
      continue;
    }
    if (type === "suggestions" && Array.isArray(o.items)) {
      const items = o.items.filter((x): x is string => typeof x === "string");
      if (items.length > 0) out.push({ type: "suggestions", items, ts });
      continue;
    }
    if (type === "done") {
      const jobId = typeof o.jobId === "string" ? o.jobId : "";
      out.push({ type: "done", jobId, ts });
      continue;
    }
    if (type === "error" && typeof o.message === "string") {
      out.push({ type: "error", message: o.message, ts });
      continue;
    }

    /* Unknown shape — still show something human-readable */
    const preview = JSON.stringify(o).slice(0, 180);
    out.push({
      type: "status",
      message:
        preview.length >= 180 ? `${preview}…` : preview || "Unrecognized log entry",
      ts,
    });
  }
  return out;
}

export type AgentLogEntry =
  | { type: "user_prompt"; text: string; ts: number }
  | { type: "status"; message: string; ts: number }
  | { type: "thinking"; text: string; ts: number }
  | { type: "content"; text: string; ts: number }
  | { type: "screen"; index: number; name: string; ts: number }
  | { type: "palette"; colors: string[]; ts: number }
  | { type: "image_progress"; current: number; total: number; prompt: string; ts: number }
  | { type: "image_done"; nodeId: string; url: string; ts: number }
  | { type: "image_skipped"; reason: string; ts: number }
  | { type: "suggestions"; items: string[]; ts: number }
  | { type: "done"; jobId: string; ts: number }
  | { type: "error"; message: string; ts: number };

type GenerationLogState = {
  entries: AgentLogEntry[];
  isGenerating: boolean;
  currentJobId: string | null;
  /** The screen being actively generated/refined — used for visual indicators. */
  generatingScreenId: string | null;
  suggestions: string[];
};

export type AgentLogEntryInput =
  | { type: "user_prompt"; text: string }
  | { type: "status"; message: string }
  | { type: "thinking"; text: string }
  | { type: "content"; text: string }
  | { type: "screen"; index: number; name: string }
  | { type: "palette"; colors: string[] }
  | { type: "image_progress"; current: number; total: number; prompt: string }
  | { type: "image_done"; nodeId: string; url: string }
  | { type: "image_skipped"; reason: string }
  | { type: "suggestions"; items: string[] }
  | { type: "done"; jobId: string }
  | { type: "error"; message: string };

type GenerationLogActions = {
  startGeneration: (jobId: string, screenId?: string | null) => void;
  addEntry: (entry: AgentLogEntryInput) => void;
  finishGeneration: () => void;
  clear: () => void;
  /** `entries` may be raw JSON from the DB — normalized on load. */
  loadFromHistory: (
    jobId: string | null,
    entries: unknown,
    options?: { userPromptFallback?: string | null },
  ) => void;
};

export const useGenerationLog = create<
  GenerationLogState & GenerationLogActions
>((set) => ({
  entries: [],
  isGenerating: false,
  currentJobId: null,
  generatingScreenId: null,
  suggestions: [],

  startGeneration: (jobId, screenId) =>
    set({
      entries: [],
      isGenerating: true,
      currentJobId: jobId,
      generatingScreenId: screenId ?? null,
      suggestions: [],
    }),

  addEntry: (entry) =>
    set((s) => {
      const newEntry = { ...entry, ts: Date.now() } as AgentLogEntry;
      const updates: Partial<GenerationLogState> = {
        entries: [...s.entries, newEntry],
      };
      if (entry.type === "suggestions") {
        updates.suggestions = entry.items;
      }
      return updates;
    }),

  finishGeneration: () => set({ isGenerating: false, currentJobId: null, generatingScreenId: null }),

  clear: () =>
    set({ entries: [], isGenerating: false, currentJobId: null, generatingScreenId: null, suggestions: [] }),

  loadFromHistory: (
    jobId,
    entries,
    options?: { userPromptFallback?: string | null },
  ) => {
    let normalized = normalizeHistoryEntries(entries);
    const hasUserPrompt = normalized.some((e) => e.type === "user_prompt");
    const fallback = options?.userPromptFallback?.trim();
    if (!hasUserPrompt && fallback && fallback.length > 0) {
      normalized = [
        { type: "user_prompt", text: fallback, ts: Date.now() - 86400000 },
        ...normalized,
      ];
    }
    const suggestionEntries = normalized.filter(
      (e): e is AgentLogEntry & { type: "suggestions" } => e.type === "suggestions",
    );
    const suggestions = suggestionEntries.length > 0
      ? suggestionEntries[suggestionEntries.length - 1].items
      : [];
    set({
      entries: normalized,
      isGenerating: false,
      currentJobId: jobId ?? null,
      generatingScreenId: null,
      suggestions,
    });
  },
}));
