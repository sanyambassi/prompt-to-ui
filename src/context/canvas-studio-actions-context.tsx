"use client";

import { createContext, useContext } from "react";

export type GenerateNewScreenSizePayload = {
  width: number;
  height: number;
  deviceType: "phone" | "tablet" | "desktop";
  /** Device label for toasts, e.g. "Mobile (390×844)" */
  label: string;
};

export type CanvasStudioActionsValue = {
  regenerateScreen: (screenId: string) => void;
  regenerateProject: () => void;
  /** Create a new artboard at the given size and run the main prompt through the LLM. */
  generateNewScreenAtSize: (payload: GenerateNewScreenSizePayload) => void;
  /** Focus the prompt bar for in-place editing of a specific screen. */
  editScreen: (screenId: string) => void;
  /** Toggle live WYSIWYG editing inside the iframe for a screen. */
  liveEditScreen: (screenId: string) => void;
  /** Screen ID currently in live-edit mode (null = none). */
  liveEditScreenId: string | null;
  /** Stop live-editing and save. */
  stopLiveEdit: () => void;
};

export const CanvasStudioActionsContext =
  createContext<CanvasStudioActionsValue | null>(null);

export function useCanvasStudioActions(): CanvasStudioActionsValue | null {
  return useContext(CanvasStudioActionsContext);
}
