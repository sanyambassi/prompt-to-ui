import { z } from "zod";
import { LLM_MAX_SCREENS_PER_JOB } from "@/lib/schema/llm-screens-envelope";

const MAX_HTML_CHARS = 1_200_000;

const screenEntryZ = z.object({
  name: z.string(),
  html: z.string().min(8).max(MAX_HTML_CHARS),
});

const envelopeZ = z.object({
  screens: z.array(screenEntryZ).min(1).max(LLM_MAX_SCREENS_PER_JOB),
  project_title: z.string().max(120).optional(),
  suggestions: z.array(z.string().max(200)).max(6).optional(),
  /** DESIGN.md markdown — the canonical design system produced by the LLM. */
  design_md: z.string().max(50_000).optional(),
});

export type HtmlScreenEntry = z.infer<typeof screenEntryZ>;

/* ── Incremental / progressive screen extraction ── */

/**
 * Extract fully-completed screen entries from a partial JSON stream.
 *
 * The model outputs `{ "screens": [ {name,html}, {name,html}, ... ], ... }`.
 * This function scans the accumulated text for complete screen objects
 * beyond `alreadyYielded` without waiting for the closing `]` or `}`.
 *
 * It uses a state machine that tracks whether we're inside a JSON string
 * (handling escaped quotes) to correctly count brace depth — critical
 * because HTML strings contain `{`, `}`, and `"` characters.
 */
export function extractCompletedScreensFromPartial(
  text: string,
  alreadyYielded: number,
): { screens: HtmlScreenEntry[]; consumedCount: number } {
  const screensKeyIdx = text.indexOf('"screens"');
  if (screensKeyIdx === -1) return { screens: [], consumedCount: alreadyYielded };

  let arrStart = text.indexOf("[", screensKeyIdx);
  if (arrStart === -1) return { screens: [], consumedCount: alreadyYielded };
  arrStart += 1;

  const results: HtmlScreenEntry[] = [];
  let pos = arrStart;
  let screenCount = 0;

  while (pos < text.length) {
    // Skip whitespace and commas between entries
    while (pos < text.length && /[\s,]/.test(text[pos])) pos++;
    if (pos >= text.length || text[pos] === "]") break;
    if (text[pos] !== "{") break;

    const objStart = pos;
    // Track brace depth, respecting JSON string boundaries
    let depth = 0;
    let inString = false;
    let escaped = false;
    let objEnd = -1;

    for (let i = pos; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        if (inString) escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          objEnd = i + 1;
          break;
        }
      }
    }

    if (objEnd === -1) break; // incomplete object — stop

    screenCount++;
    if (screenCount > alreadyYielded) {
      try {
        const raw = JSON.parse(text.slice(objStart, objEnd)) as Record<string, unknown>;
        const name = typeof raw.name === "string" ? raw.name.trim() : "";
        const html = typeof raw.html === "string" ? raw.html : "";
        if (name && html.length >= 8) {
          results.push({ name, html });
        }
      } catch {
        // malformed — skip this entry
      }
    }
    pos = objEnd;
  }

  return { screens: results, consumedCount: alreadyYielded + results.length };
}

export function parseHtmlScreensEnvelope(
  raw: unknown,
  defaultName = "Screen",
):
  | {
      ok: true;
      screens: HtmlScreenEntry[];
      project_title?: string;
      suggestions?: string[];
      design_md?: string;
    }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid JSON root" };
  }

  const o = raw as Record<string, unknown>;

  if (typeof o.html === "string" && o.html.length > 8 && !Array.isArray(o.screens)) {
    raw = {
      screens: [{ name: defaultName, html: o.html }],
      project_title: o.project_title,
      suggestions: o.suggestions,
    };
  }

  const env = envelopeZ.safeParse(raw);
  if (!env.success) {
    const msg = env.error.issues[0]?.message ?? env.error.message;
    return { ok: false, error: msg };
  }

  const suggestions = env.data.suggestions
    ?.filter((s) => s.trim().length > 0)
    .slice(0, 4);
  const pt = env.data.project_title?.trim();
  const dm = env.data.design_md?.trim();

  return {
    ok: true,
    screens: env.data.screens.map((s) => ({
      name: s.name.trim() || defaultName,
      html: s.html,
    })),
    ...(pt ? { project_title: pt.slice(0, 120) } : {}),
    ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
    ...(dm && dm.length > 0 ? { design_md: dm } : {}),
  };
}
