import type { ColorSchemeContext, StudioGenerationJobContext } from "@/types/studio";

const MAX_URLS = 5;
const MAX_ASSET_IDS = 8;

/** Single URL from user input (allows domain without scheme → https). */
export function tryParseReferenceUrl(raw: string): string | null {
  const t = raw.trim();
  if (t.length < 4) return null;
  try {
    let s = t;
    if (!/^https?:\/\//i.test(s)) {
      s = `https://${s}`;
    }
    const parsed = new URL(s);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!parsed.hostname || parsed.hostname.length < 1) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export const STUDIO_MAX_REFERENCE_URLS = MAX_URLS;

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

/** Normalize user-provided job context for insert / LLM resolution. */
export function normalizeStudioJobContext(
  raw: unknown,
): StudioGenerationJobContext {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;

  const urlsRaw = o.reference_urls;
  const urls: string[] = [];
  if (Array.isArray(urlsRaw)) {
    for (const u of urlsRaw) {
      if (typeof u !== "string" || urls.length >= MAX_URLS) continue;
      const normalized = tryParseReferenceUrl(u);
      if (normalized) urls.push(normalized);
    }
  }

  const idsRaw = o.inspiration_asset_ids;
  const inspiration_asset_ids: string[] = [];
  if (Array.isArray(idsRaw)) {
    for (const id of idsRaw) {
      if (typeof id !== "string") continue;
      const t = id.trim();
      if (!isUuid(t) || inspiration_asset_ids.length >= MAX_ASSET_IDS) continue;
      inspiration_asset_ids.push(t);
    }
  }

  const out: StudioGenerationJobContext = {};
  if (urls.length > 0) out.reference_urls = urls;
  if (inspiration_asset_ids.length > 0) {
    out.inspiration_asset_ids = inspiration_asset_ids;
  }

  const csRaw = o.color_scheme;
  if (csRaw && typeof csRaw === "object") {
    const cs = csRaw as Record<string, unknown>;
    if (
      typeof cs.name === "string" &&
      (cs.mode === "light" || cs.mode === "dark") &&
      cs.colors && typeof cs.colors === "object" &&
      cs.fonts && typeof cs.fonts === "object"
    ) {
      out.color_scheme = cs as unknown as ColorSchemeContext;
    }
  }

  return out;
}
