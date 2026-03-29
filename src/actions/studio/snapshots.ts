"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db/pool";
import { getUser } from "@/lib/auth/anonymous-user";
import type { StudioVersionSnapshotRow } from "@/types/studio";

type ActionError = { ok: false; error: string };
type Ok<T> = { ok: true; data: T };

function err(message: string): ActionError {
  return { ok: false, error: message };
}

export async function listStudioVersionSnapshots(
  projectId: string,
): Promise<Ok<StudioVersionSnapshotRow[]> | ActionError> {
  const user = getUser();

  const { rows } = await query<StudioVersionSnapshotRow>(
    `SELECT * FROM studio_version_snapshots WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
    [projectId, user.id],
  );

  return { ok: true, data: rows };
}

export async function createStudioVersionSnapshot(
  projectId: string,
  label: string,
  payload: Record<string, unknown>,
): Promise<Ok<StudioVersionSnapshotRow> | ActionError> {
  const user = getUser();

  const trimmed = label.trim().slice(0, 200);
  if (!trimmed) return err("Label required");

  const row = await queryOne<StudioVersionSnapshotRow>(
    `INSERT INTO studio_version_snapshots (project_id, user_id, label, payload)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [projectId, user.id, trimmed, JSON.stringify(payload)],
  );

  if (!row) return err("Insert failed");
  revalidatePath(`/project/${projectId}`);
  return { ok: true, data: row };
}

export async function applyStudioVersionSnapshot(
  id: string,
): Promise<Ok<{ updated: number }> | ActionError> {
  const user = getUser();

  const snap = await queryOne<StudioVersionSnapshotRow>(
    `SELECT * FROM studio_version_snapshots WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );
  if (!snap) return err("Snapshot not found");

  const payload = snap.payload as Record<string, unknown>;
  const screensRaw = payload.screens;
  if (!Array.isArray(screensRaw)) return err("Invalid snapshot payload");

  let updated = 0;
  for (const row of screensRaw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const sid = typeof o.id === "string" ? o.id : null;
    const schema = o.ui_schema;
    if (!sid || schema == null) continue;

    const { rowCount } = await query(
      `UPDATE studio_screens SET ui_schema = $3 WHERE id = $1 AND user_id = $2`,
      [sid, user.id, JSON.stringify(schema)],
    );

    if (rowCount) updated += 1;
  }

  revalidatePath(`/project/${snap.project_id}`);
  return { ok: true, data: { updated } };
}

export async function deleteStudioVersionSnapshot(
  id: string,
): Promise<Ok<void> | ActionError> {
  const user = getUser();

  const row = await queryOne<{ project_id: string }>(
    `SELECT project_id FROM studio_version_snapshots WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  await query(
    `DELETE FROM studio_version_snapshots WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  if (row?.project_id) revalidatePath(`/project/${row.project_id}`);
  return { ok: true, data: undefined };
}
