import type { UISchema } from "@/lib/schema/types";

/** Node types where we expose inline text / placeholder editing. */
export const INLINE_EDITABLE_TYPES = new Set([
  "heading",
  "text",
  "paragraph",
  "button",
  "badge",
  "link",
  "input",
  "textarea",
]);

export function supportsInlineElementEdit(node: UISchema | null): boolean {
  return !!node && INLINE_EDITABLE_TYPES.has(node.type);
}

export type EditableTextField = "text" | "label" | "placeholder";

export function getEditableTextState(node: UISchema): {
  field: EditableTextField;
  value: string;
} {
  const p = node.props ?? {};
  if (node.type === "input" || node.type === "textarea") {
    return {
      field: "placeholder",
      value: typeof p.placeholder === "string" ? p.placeholder : "",
    };
  }
  if (typeof p.text === "string") return { field: "text", value: p.text };
  if (typeof p.label === "string") return { field: "label", value: p.label };
  return { field: "text", value: "" };
}

const FONT_SIZES = [
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
] as const;

const FONT_WEIGHTS = [
  "normal",
  "medium",
  "semibold",
  "bold",
] as const;

export type StudioFontSize = (typeof FONT_SIZES)[number];
export type StudioFontWeight = (typeof FONT_WEIGHTS)[number];

export function fontSizeOptions(): readonly StudioFontSize[] {
  return FONT_SIZES;
}

export function fontWeightOptions(): readonly StudioFontWeight[] {
  return FONT_WEIGHTS;
}

function isHexLike(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s.trim());
}

/** Resolve a usable hex for <input type="color"> (defaults if not hex). */
export function normalizeColorForPicker(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && isHexLike(raw)) {
    const h = raw.trim();
    if (h.length === 4) {
      const r = h[1];
      const g = h[2];
      const b = h[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return h.slice(0, 7);
  }
  return fallback;
}

export function readTypographyAndColors(style: Record<string, unknown> | undefined): {
  fontSize: StudioFontSize;
  fontWeight: StudioFontWeight;
  textColor: string;
  fillColor: string;
} {
  const st = style ?? {};
  const fs = st.fontSize;
  const fw = st.fontWeight;
  const fontSize =
    typeof fs === "string" && (FONT_SIZES as readonly string[]).includes(fs) ?
      (fs as StudioFontSize)
    : "sm";
  const fontWeight =
    typeof fw === "string" && (FONT_WEIGHTS as readonly string[]).includes(fw) ?
      (fw as StudioFontWeight)
    : "normal";

  const textRaw = st.color ?? st.textColor;
  const fillRaw = st.backgroundColor ?? st.bg;

  return {
    fontSize,
    fontWeight,
    textColor: normalizeColorForPicker(textRaw, "#1a1a1a"),
    fillColor: normalizeColorForPicker(fillRaw, "#ffffff"),
  };
}

/** Preset swatches for quick picks (hex). */
export const COLOR_PRESET_SWATCHES: { label: string; hex: string }[] = [
  { label: "Ink", hex: "#0f172a" },
  { label: "Slate", hex: "#64748b" },
  { label: "White", hex: "#ffffff" },
  { label: "Accent", hex: "#6366f1" },
  { label: "Sky", hex: "#0ea5e9" },
  { label: "Emerald", hex: "#10b981" },
  { label: "Amber", hex: "#f59e0b" },
  { label: "Rose", hex: "#f43f5e" },
];
