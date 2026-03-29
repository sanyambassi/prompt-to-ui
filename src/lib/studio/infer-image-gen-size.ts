import type { ImageNode } from "@/lib/schema/walk-image-nodes";

export type OpenAIImageSize = "1024x1024" | "1024x1536" | "1536x1024";

/**
 * Map layout hints to OpenAI Images API sizes (gpt-image-1.5).
 * Defaults to wide landscape for generic heroes when dimensions are unknown.
 */
export function inferOpenAIImageSize(node: ImageNode): OpenAIImageSize {
  if (node.nodeType === "avatar") return "1024x1024";

  const w = node.styleWidth;
  const h = node.styleHeight;

  if (w && h && w > 0 && h > 0) {
    const ratio = w / h;
    if (ratio >= 1.2) return "1536x1024";
    if (ratio <= 0.85) return "1024x1536";
    return "1024x1024";
  }

  if (w && w >= 480 && (h === undefined || h <= w)) return "1536x1024";
  if (h && h >= 480 && (w === undefined || h >= w)) return "1024x1536";

  return "1536x1024";
}

export type GeminiImageSynthesisConfig = {
  aspectRatio: string;
  imageSize: string;
};

/** Gemini imageConfig: high resolution + aspect from artboard node. */
export function inferGeminiImageSynthesisConfig(
  node: ImageNode,
): GeminiImageSynthesisConfig {
  if (node.nodeType === "avatar") {
    return { aspectRatio: "1:1", imageSize: "2K" };
  }

  const w = node.styleWidth;
  const h = node.styleHeight;

  if (w && h && w > 0 && h > 0) {
    const r = w / h;
    if (r >= 1.45) return { aspectRatio: "16:9", imageSize: "2K" };
    if (r <= 0.69) return { aspectRatio: "9:16", imageSize: "2K" };
    if (r >= 1.05) return { aspectRatio: "4:3", imageSize: "2K" };
    if (r <= 0.95) return { aspectRatio: "3:4", imageSize: "2K" };
    return { aspectRatio: "1:1", imageSize: "2K" };
  }

  if (w && w >= 480 && (h === undefined || h <= w)) {
    return { aspectRatio: "16:9", imageSize: "2K" };
  }
  if (h && h >= 480 && (w === undefined || h > w)) {
    return { aspectRatio: "3:4", imageSize: "2K" };
  }

  return { aspectRatio: "16:9", imageSize: "2K" };
}

/** Grok has no explicit size API — bias the prompt toward the intended frame. */
export function appendGrokCompositionHint(
  prompt: string,
  node: ImageNode,
): string {
  const size = inferOpenAIImageSize(node);
  const hint =
    size === "1536x1024" ?
      "Composition: wide horizontal 16:9 landscape frame, cinematic, edge-to-edge."
    : size === "1024x1536" ?
      "Composition: vertical 3:4 or 9:16 portrait frame, full-bleed."
    : "Composition: square 1:1 frame, centered subject, premium product shot.";
  return `${prompt.trim()}\n\n${hint}`;
}
