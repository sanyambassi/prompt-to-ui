import type { UISchema } from "./types";

const COLOR_RE = /^#([0-9a-f]{3,8})$/i;
const RGB_RE = /^rgba?\(\s*\d/;
const HSL_RE = /^hsla?\(\s*\d/;
const OKLCH_RE = /^oklch\(/i;

function isColor(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return (
    COLOR_RE.test(v) ||
    RGB_RE.test(v) ||
    HSL_RE.test(v) ||
    OKLCH_RE.test(v)
  );
}

function collectColors(node: UISchema, out: Set<string>): void {
  const style = node.style;
  if (style && typeof style === "object") {
    for (const key of [
      "color",
      "backgroundColor",
      "background",
      "borderColor",
      "fill",
      "stroke",
    ]) {
      const val = style[key];
      if (isColor(val)) out.add(val.trim());
    }
  }

  for (const child of node.children ?? []) {
    collectColors(child, out);
  }
}

/**
 * Walk a UISchema tree and return unique CSS color values found in style props.
 */
export function extractPalette(schema: UISchema): string[] {
  const colors = new Set<string>();
  collectColors(schema, colors);
  return [...colors];
}
