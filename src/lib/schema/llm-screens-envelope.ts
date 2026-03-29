import { z } from "zod";
import type { UISchema } from "@/lib/schema/types";
import { parseUISchema } from "@/lib/schema/validation";

/** Max artboards the model may return in one generation (safety cap only). */
export const LLM_MAX_SCREENS_PER_JOB = 48;

const screenEntryZ = z.object({
  name: z.string(),
  ui_schema: z.unknown(),
});

const prototypeLinkZ = z.object({
  source_screen_index: z.number().int().min(0).max(LLM_MAX_SCREENS_PER_JOB - 1),
  source_node_id: z.string().min(1),
  target_screen_index: z.number().int().min(0).max(LLM_MAX_SCREENS_PER_JOB - 1),
  trigger: z.string().max(64).optional(),
  transition: z.string().max(64).optional(),
});

const envelopeZ = z.object({
  screens: z
    .array(screenEntryZ)
    .min(1)
    .max(LLM_MAX_SCREENS_PER_JOB),
  prototype_links: z.array(prototypeLinkZ).max(200).optional(),
  /** Short product / project name for the studio header (optional). */
  project_title: z.string().max(120).optional(),
  /** Model-generated follow-up suggestions (3-4 items). */
  suggestions: z.array(z.string().max(200)).max(6).optional(),
});

export type LlmScreenEntry = {
  name: string;
  ui_schema: UISchema;
};

export type LlmPrototypeLinkDraft = z.infer<typeof prototypeLinkZ>;

function isLikelySingleUiSchemaRoot(o: Record<string, unknown>): boolean {
  if (Array.isArray(o.screens)) return false;
  return o.type === "page" && typeof o.id === "string";
}

function parseLegacyPrototypeLinks(
  o: Record<string, unknown>,
): LlmPrototypeLinkDraft[] {
  const pl = o.prototype_links;
  if (!Array.isArray(pl)) return [];
  const r = z.array(prototypeLinkZ).safeParse(pl);
  return r.success ? r.data : [];
}

/**
 * Parses model JSON: either legacy single UISchema root or `{ screens: [{ name, ui_schema }] }`.
 */
export function parseLlmScreensEnvelope(
  raw: unknown,
  defaultName = "Screen",
):
  | {
      ok: true;
      screens: LlmScreenEntry[];
      prototype_links: LlmPrototypeLinkDraft[];
      project_title?: string;
      suggestions?: string[];
    }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid JSON root" };
  }

  // If the model returned an array of screens directly, wrap it
  if (Array.isArray(raw)) {
    raw = { screens: raw };
  }

  const o = raw as Record<string, unknown>;

  if (isLikelySingleUiSchemaRoot(o)) {
    const parsed = parseUISchema(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid UISchema";
      return { ok: false, error: msg };
    }
    return {
      ok: true,
      screens: [{ name: defaultName, ui_schema: parsed.data }],
      prototype_links: parseLegacyPrototypeLinks(o),
    };
  }

  const env = envelopeZ.safeParse(raw);
  if (!env.success) {
    const msg = env.error.issues[0]?.message ?? env.error.message;
    return { ok: false, error: msg };
  }

  const out: LlmScreenEntry[] = [];
  for (let i = 0; i < env.data.screens.length; i++) {
    const entry = env.data.screens[i];
    const name = entry.name.trim() || `Screen ${i + 1}`;
    const parsed = parseUISchema(entry.ui_schema);
    if (!parsed.success) {
      const msg =
        parsed.error.issues[0]?.message ?? `Screen ${i + 1}: invalid UISchema`;
      return { ok: false, error: msg };
    }
    out.push({ name: name.slice(0, 200), ui_schema: parsed.data });
  }

  const prototype_links = env.data.prototype_links ?? [];
  const pt = env.data.project_title?.trim();
  const suggestions = env.data.suggestions?.filter((s) => s.trim().length > 0).slice(0, 4);

  return {
    ok: true,
    screens: out,
    prototype_links,
    ...(pt ? { project_title: pt.slice(0, 120) } : {}),
    ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
  };
}
