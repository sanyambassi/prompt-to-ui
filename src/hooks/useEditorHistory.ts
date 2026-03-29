"use client";

import { useStore } from "zustand/react";
import { useEditorStore } from "@/store/editor";

/** Reactive undo/redo availability (temporal history for partialize `screens`). */
export function useEditorHistoryAvailability() {
  const canUndo = useStore(
    useEditorStore.temporal,
    (s) => s.pastStates.length > 0,
  );
  const canRedo = useStore(
    useEditorStore.temporal,
    (s) => s.futureStates.length > 0,
  );
  return { canUndo, canRedo };
}
