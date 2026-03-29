import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LLMProvider } from "@/lib/llm/studio-models";
import type { GenerationPipelineOverrides } from "@/lib/studio/pipeline-models";

export type PipelineImageSynthesisPreference = "auto" | LLMProvider;

type SettingsState = {
  pipelineUiModel: string;
  pipelineImageSynthesis: PipelineImageSynthesisPreference;
};

type SettingsActions = {
  setPipelineUiModel: (modelId: string) => void;
  setPipelineImageSynthesis: (p: PipelineImageSynthesisPreference) => void;
  getGenerationPipelineBody: () => GenerationPipelineOverrides | undefined;
};

const EMPTY: SettingsState = {
  pipelineUiModel: "",
  pipelineImageSynthesis: "auto",
};

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      setPipelineUiModel: (modelId) => set({ pipelineUiModel: modelId }),

      setPipelineImageSynthesis: (p) => set({ pipelineImageSynthesis: p }),

      getGenerationPipelineBody: () => {
        const s = get();
        const ui = s.pipelineUiModel.trim();
        const img = s.pipelineImageSynthesis;
        if (!ui && img === "auto") return undefined;
        const out: GenerationPipelineOverrides = {};
        if (ui) out.uiModel = ui;
        if (img !== "auto") out.imageSynthesisProvider = img;
        return Object.keys(out).length > 0 ? out : undefined;
      },
    }),
    { name: "ptu-settings" },
  ),
);
