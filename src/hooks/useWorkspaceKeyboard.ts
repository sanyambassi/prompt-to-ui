"use client";

import { useEffect } from "react";
import { isKeyboardCaptureTarget } from "@/lib/client/keyboard-capture-target";
import { editorRedo, editorUndo, useEditorStore } from "@/store/editor";

type Options = {
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  enabled: boolean;
};

export function useWorkspaceKeyboard({
  onFitView,
  onZoomIn,
  onZoomOut,
  enabled,
}: Options) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isKeyboardCaptureTarget(e.target)) {
        useEditorStore.getState().setSelectedSchemaNodeId(null);
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (isKeyboardCaptureTarget(e.target)) return;

      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        editorUndo();
        return;
      }
      if (key === "z" && e.shiftKey) {
        e.preventDefault();
        editorRedo();
        return;
      }
      if (key === "0" || key === ")") {
        e.preventDefault();
        onFitView();
        return;
      }
      if (key === "=" || key === "+") {
        e.preventDefault();
        onZoomIn();
        return;
      }
      if (key === "-" || key === "_") {
        e.preventDefault();
        onZoomOut();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onFitView, onZoomIn, onZoomOut]);
}
