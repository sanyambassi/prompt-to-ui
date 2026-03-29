"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db/pool";
import { getUser } from "@/lib/auth/anonymous-user";
import type { StudioAssetRow } from "@/types/studio";

type ActionError = { ok: false; error: string };
type Ok<T> = { ok: true; data: T };

function err(message: string): ActionError {
  return { ok: false, error: message };
}

export async function listStudioAssets(
  projectId: string,
): Promise<Ok<StudioAssetRow[]> | ActionError> {
  const user = getUser();

  const { rows } = await query<StudioAssetRow>(
    `SELECT * FROM studio_assets WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
    [projectId, user.id],
  );

  return { ok: true, data: rows };
}

export async function registerStudioAsset(
  projectId: string,
  input: Pick<StudioAssetRow, "url" | "filename" | "mime_type">,
): Promise<Ok<StudioAssetRow> | ActionError> {
  const user = getUser();

  const row = await queryOne<StudioAssetRow>(
    `INSERT INTO studio_assets (project_id, user_id, url, filename, mime_type)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [projectId, user.id, input.url, input.filename, input.mime_type],
  );

  if (!row) return err("Insert failed");
  revalidatePath(`/project/${projectId}`);
  return { ok: true, data: row };
}

/**
 * For local filesystem storage, returns the direct URL path.
 * Signed URLs are not needed in the open-source version.
 */
export async function getStudioAssetSignedUrl(
  storedPath: string,
  _expiresSec = 3600,
): Promise<Ok<string> | ActionError> {
  const path = storedPath.trim();
  if (!path || path.includes("..")) return err("Invalid path");

  return { ok: true, data: `/uploads/${path}` };
}

export async function deleteStudioAsset(
  id: string,
): Promise<Ok<void> | ActionError> {
  const user = getUser();

  const row = await queryOne<{ project_id: string }>(
    `SELECT project_id FROM studio_assets WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  await query(
    `DELETE FROM studio_assets WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  if (row?.project_id) revalidatePath(`/project/${row.project_id}`);
  return { ok: true, data: undefined };
}
