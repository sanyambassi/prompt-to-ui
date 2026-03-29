"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db/pool";
import { MASKED_SENTINEL } from "@/lib/constants/settings";

type ActionError = { ok: false; error: string };
type Ok<T> = { ok: true; data: T };

export type AppSetting = {
  key: string;
  value: string;
  updated_at: string;
};

const SECRET_KEYS = new Set([
  "openai_api_key",
  "anthropic_api_key",
  "google_ai_api_key",
  "xai_api_key",
]);

function maskKeyValue(key: string, value: string): string {
  if (!SECRET_KEYS.has(key) || !value.trim()) return value;
  const v = value.trim();
  if (v.length <= 8) return MASKED_SENTINEL;
  return `${MASKED_SENTINEL}${v.slice(-4)}`;
}

export async function getSettings(): Promise<Ok<AppSetting[]> | ActionError> {
  try {
    const { rows } = await query<AppSetting>(
      `SELECT key, value, updated_at FROM app_settings ORDER BY key`,
    );
    const masked = rows.map((r) => ({
      ...r,
      value: maskKeyValue(r.key, r.value),
    }));
    return { ok: true, data: masked };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load settings" };
  }
}

export async function getSetting(key: string): Promise<string> {
  try {
    const row = await queryOne<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = $1`,
      [key],
    );
    return row?.value ?? "";
  } catch {
    return "";
  }
}

export async function updateSetting(
  key: string,
  value: string,
): Promise<Ok<AppSetting> | ActionError> {
  try {
    const row = await queryOne<AppSetting>(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
       RETURNING *`,
      [key, value],
    );
    if (!row) return { ok: false, error: "Update failed" };
    revalidatePath("/settings");
    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save setting" };
  }
}
