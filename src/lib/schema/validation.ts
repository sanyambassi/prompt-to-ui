import { z } from "zod";
import type { UISchema } from "./types";

/**
 * Lenient number: accepts a real number or a numeric string (e.g. "16"),
 * strips CSS units like "16px"/"1rem", and silently falls back to undefined
 * for anything truly non-numeric (e.g. "auto").
 */
const lenientNum = z
  .unknown()
  .transform((v) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  })
  .pipe(z.number().optional());

const lenientInt = lenientNum.pipe(
  z.number().int().optional(),
);

const VALID_MODES = ["stack", "grid", "flex-row", "flex-column", "absolute"] as const;
type LayoutMode = (typeof VALID_MODES)[number];

const MODE_ALIASES: Record<string, LayoutMode> = {
  stack: "stack",
  vertical: "stack",
  column: "flex-column",
  "flex-col": "flex-column",
  flexcolumn: "flex-column",
  "flex-column": "flex-column",
  row: "flex-row",
  horizontal: "flex-row",
  "flex-row": "flex-row",
  flexrow: "flex-row",
  flex: "flex-row",
  grid: "grid",
  absolute: "absolute",
  fixed: "absolute",
  relative: "stack",
  block: "stack",
};

const lenientMode = z.unknown().transform((v): LayoutMode => {
  if (typeof v === "string") {
    const key = v.toLowerCase().trim();
    if (MODE_ALIASES[key]) return MODE_ALIASES[key];
  }
  return "stack";
}).pipe(z.enum(VALID_MODES));

const layoutSchema = z.object({
  mode: lenientMode,
  gap: lenientNum.optional(),
  columns: lenientInt.optional(),
  padding: lenientNum.optional(),
  x: lenientNum.optional(),
  y: lenientNum.optional(),
});

const recordUnknown = z
  .unknown()
  .transform((v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    return {};
  })
  .pipe(z.record(z.string(), z.unknown()));

export const uischemaZodSchema: z.ZodType<UISchema> = z.lazy(() =>
  z.object({
    schema_version: z
      .unknown()
      .transform((v) => {
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string") {
          const n = parseInt(v, 10);
          if (Number.isFinite(n)) return n;
        }
        return 1;
      })
      .pipe(z.number()),
    id: z.string().min(1),
    type: z.string().min(1),
    props: recordUnknown.optional(),
    style: recordUnknown.optional(),
    layout: layoutSchema.optional(),
    children: z.array(uischemaZodSchema).optional(),
    interactions: recordUnknown.optional(),
  }),
);

export type ParseUISchemaResult =
  | { success: true; data: UISchema }
  | { success: false; error: z.ZodError };

export function parseUISchema(raw: unknown): ParseUISchemaResult {
  const r = uischemaZodSchema.safeParse(raw);
  if (r.success) return { success: true, data: r.data };
  return { success: false, error: r.error };
}

export function assertUISchema(raw: unknown): UISchema {
  return uischemaZodSchema.parse(raw);
}
