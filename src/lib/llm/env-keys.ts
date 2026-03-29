import type { LLMProvider } from "@/lib/llm/studio-models";

const DB_KEY_MAP: Record<string, string> = {
  openai: "openai_api_key",
  anthropic: "anthropic_api_key",
  google: "google_ai_api_key",
  xai: "xai_api_key",
};

let dbKeyCache: Record<string, string> = {};
let dbKeyCacheTime = 0;
const CACHE_TTL_MS = 30_000;

async function loadDbKeys(): Promise<Record<string, string>> {
  if (Date.now() - dbKeyCacheTime < CACHE_TTL_MS) return dbKeyCache;
  try {
    const { default: pool } = await import("@/lib/db/pool");
    const result = await pool.query(
      `SELECT key, value FROM app_settings WHERE key = ANY($1)`,
      [Object.values(DB_KEY_MAP)],
    );
    const map: Record<string, string> = {};
    for (const row of result.rows as { key: string; value: string }[]) {
      map[row.key] = row.value;
    }
    dbKeyCache = map;
    dbKeyCacheTime = Date.now();
    return map;
  } catch {
    return dbKeyCache;
  }
}

/**
 * Resolve API key from the DB `app_settings` table.
 * All keys are managed via the Settings UI (/settings); no env-var or
 * client-side fallback.
 */
export async function getEnvApiKey(
  provider: LLMProvider,
): Promise<string | null> {
  const dbKeys = await loadDbKeys();
  const dbKeyName = DB_KEY_MAP[provider];
  if (dbKeyName && dbKeys[dbKeyName]?.trim()) {
    return dbKeys[dbKeyName].trim();
  }

  return null;
}
