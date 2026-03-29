/** Shared artboard frame sizes (px) — Layout inspector + canvas quick actions. */

export const ARTBOARD_DIM_MIN = 200;
export const ARTBOARD_DIM_MAX = 4096;

/** Clamp artboard width/height to allowed range (integers). */
export function clampArtboardDimension(n: number): number {
  if (!Number.isFinite(n)) return ARTBOARD_DIM_MIN;
  return Math.min(
    ARTBOARD_DIM_MAX,
    Math.max(ARTBOARD_DIM_MIN, Math.round(n)),
  );
}

export type ArtboardSizePreset = {
  key: string;
  label: string;
  w: number;
  h: number;
};

/** Full list for the Layout inspector. */
export const ARTBOARD_SIZE_PRESETS: ArtboardSizePreset[] = [
  { key: "phone", label: "Phone", w: 390, h: 844 },
  { key: "android", label: "Android", w: 412, h: 915 },
  { key: "ipad", label: "iPad", w: 834, h: 1194 },
  { key: "laptop", label: "Laptop", w: 1280, h: 800 },
  { key: "wide", label: "Wide", w: 1440, h: 900 },
];

/** Subset for the floating canvas toolbar (common preview sizes). */
export const ARTBOARD_QUICK_PREVIEW_PRESETS: ArtboardSizePreset[] = [
  { key: "phone", label: "Phone", w: 390, h: 844 },
  { key: "ipad", label: "iPad", w: 834, h: 1194 },
];

/** New artboard dimensions when generating a desktop companion screen. */
export const DESKTOP_COMPANION_ARTBOARD = { width: 1280, height: 800 } as const;

export const DESKTOP_VARIANT_JOB_PROMPT = `Add a desktop / large-viewport companion artboard for this screen.

Output requirements:
- Return exactly 2 objects in the top-level "screens" array.
- screens[0]: The current mobile/small artboard — keep the same information, copy, hierarchy, and visual identity. Only fix clear inconsistencies.
- screens[1]: A NEW artboard optimized for wide desktop (~1280px): use patterns like a persistent sidebar or top navigation, multi-column content, and generous spacing. Reuse the same product content and brand styling as screens[0].

Name screens[1] clearly (e.g. append "— Desktop" to the current screen name).`;
