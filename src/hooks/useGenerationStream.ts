"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useGenerationLog, type AgentLogEntry, type AgentLogEntryInput } from "@/store/generation-log";
import { useEditorStore } from "@/store/editor";
import type { GenerationPipelineOverrides } from "@/lib/studio/pipeline-models";

type AttachedImage = {
  base64: string;
  mimeType: string;
  filename: string;
  url?: string;
};

type GenerationStreamConfig = {
  jobId: string;
  thinkingMode: string;
  /** The target screen for this generation (used for visual indicators). */
  targetScreenId?: string | null;
  focusNodeId?: string | null;
  screenCount?: number | null;
  attachedImages?: AttachedImage[];
  /** Split UI-schema streaming vs image synthesis (see Settings → Pipeline). */
  pipeline?: GenerationPipelineOverrides;
  /** Called when a screen has been saved to DB mid-stream (progressive). */
  onScreenReady?: (info: { index: number; name: string; screenId: string }) => void;
  /** Existing project HTML for style continuity (NOT edited in place). */
  existingProjectContext?: string | null;
};

export type StreamResult = {
  ok: boolean;
  affectedScreenIds?: string[];
  /** Snapshot of log entries captured before finishGeneration clears state. */
  entries: AgentLogEntry[];
};

let streamSeq = 0;

type GenLogHandle = { addEntry: (entry: AgentLogEntryInput) => void };

function parseSseLine(
  line: string,
  genLog: GenLogHandle,
  state: { success: boolean; affectedScreenIds?: string[]; imageSkipWarned: boolean },
  config: GenerationStreamConfig,
) {
  if (!line.startsWith("data: ")) return;
  const json = line.slice(6).trim();
  if (!json || json === "[DONE]") return;
  try {
    const event = JSON.parse(json) as {
      type: string;
      message?: string;
      text?: string;
      index?: number;
      name?: string;
      screenId?: string;
      colors?: string[];
      jobId?: string;
      affectedScreenIds?: string[];
      current?: number;
      total?: number;
      prompt?: string;
      nodeId?: string;
      url?: string;
      reason?: string;
      items?: string[];
    };
    switch (event.type) {
      case "status":
        genLog.addEntry({ type: "status", message: event.message ?? "" });
        break;
      case "user_prompt":
        genLog.addEntry({ type: "user_prompt", text: typeof event.text === "string" ? event.text : "" });
        break;
      case "thinking":
        genLog.addEntry({ type: "thinking", text: event.text ?? "" });
        break;
      case "content":
        genLog.addEntry({ type: "content", text: event.text ?? "" });
        break;
      case "screen":
        genLog.addEntry({ type: "screen", index: event.index ?? 0, name: event.name ?? "Screen" });
        break;
      case "screen_ready":
        genLog.addEntry({ type: "screen", index: event.index ?? 0, name: event.name ?? "Screen" });
        if (event.screenId) {
          config.onScreenReady?.({ index: event.index ?? 0, name: event.name ?? "Screen", screenId: event.screenId });
        }
        break;
      case "palette":
        genLog.addEntry({ type: "palette", colors: event.colors ?? [] });
        break;
      case "image_progress":
        genLog.addEntry({ type: "image_progress", current: event.current ?? 0, total: event.total ?? 0, prompt: event.prompt ?? "" });
        break;
      case "image_done":
        genLog.addEntry({ type: "image_done", nodeId: event.nodeId ?? "", url: event.url ?? "" });
        if (event.nodeId && event.url) {
          useEditorStore.getState().patchImageSrc(event.nodeId, event.url);
        }
        break;
      case "image_skipped":
        genLog.addEntry({ type: "image_skipped", reason: event.reason ?? "" });
        if (!state.imageSkipWarned) {
          state.imageSkipWarned = true;
          toast.warning(event.reason || "Image generation skipped");
        }
        break;
      case "suggestions":
        genLog.addEntry({ type: "suggestions", items: event.items ?? [] });
        break;
      case "done":
        genLog.addEntry({ type: "done", jobId: event.jobId ?? "" });
        state.success = true;
        if (Array.isArray(event.affectedScreenIds) && event.affectedScreenIds.length > 0) {
          state.affectedScreenIds = event.affectedScreenIds.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          );
        }
        break;
      case "error":
        genLog.addEntry({ type: "error", message: event.message ?? "Unknown error" });
        break;
    }
  } catch {
    /* skip malformed SSE lines */
  }
}

export function useGenerationStream() {
  const genLog = useGenerationLog();
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  const startStream = useCallback(
    async (config: GenerationStreamConfig): Promise<StreamResult> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const mySeq = ++streamSeq;
      seqRef.current = mySeq;

      genLog.startGeneration(config.jobId, config.targetScreenId);

      const state: { success: boolean; affectedScreenIds?: string[]; imageSkipWarned: boolean } = { success: false, affectedScreenIds: undefined, imageSkipWarned: false };
      let capturedEntries: AgentLogEntry[] = [];

      try {
        const res = await fetch("/api/studio/generation/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          signal: controller.signal,
          body: JSON.stringify({
            jobId: config.jobId,
            thinkingMode: config.thinkingMode,
            ...(config.focusNodeId ? { focusNodeId: config.focusNodeId } : {}),
            ...(config.screenCount != null ? { screenCount: config.screenCount } : {}),
            ...(config.attachedImages?.length ? { attachedImages: config.attachedImages } : {}),
            ...(config.pipeline ? { pipeline: config.pipeline } : {}),
            ...(config.existingProjectContext ? { existingProjectContext: config.existingProjectContext } : {}),
          }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({ error: "Unknown error" }));
          genLog.addEntry({
            type: "error",
            message: (data as { error?: string }).error ?? `Failed (${res.status})`,
          });
          capturedEntries = [...useGenerationLog.getState().entries];
          if (seqRef.current === mySeq) genLog.finishGeneration();
          return { ok: false, entries: capturedEntries };
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              parseSseLine(line, genLog, state, config);
            }
          }
          // Flush any trailing data left in the buffer
          if (buffer.trim().length > 0) {
            parseSseLine(buffer, genLog, state, config);
          }
        } finally {
          reader.releaseLock();
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          genLog.addEntry({ type: "error", message: "Network error" });
        }
      } finally {
        capturedEntries = [...useGenerationLog.getState().entries];
        if (seqRef.current === mySeq) {
          genLog.finishGeneration();
        }
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }

      return { ok: state.success, affectedScreenIds: state.affectedScreenIds, entries: capturedEntries };
    },
    [genLog],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    seqRef.current = ++streamSeq;
    genLog.finishGeneration();
  }, [genLog]);

  return { startStream, cancelStream };
}
