"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db/pool";
import { jsonOrNull } from "@/lib/db/helpers";
import { getUser } from "@/lib/auth/anonymous-user";
import type { UISchema } from "@/lib/schema/types";
import type { StudioVariantRow } from "@/types/studio";

type ActionError = { ok: false; error: string };
type Ok<T> = { ok: true; data: T };

function err(message: string): ActionError {
  return { ok: false, error: message };
}

async function projectIdForScreen(screenId: string, userId: string) {
  const row = await queryOne<{ project_id: string }>(
    `SELECT project_id FROM studio_screens WHERE id = $1 AND user_id = $2`,
    [screenId, userId],
  );
  return row?.project_id;
}

export async function listStudioVariantsByProject(
  projectId: string,
): Promise<Ok<StudioVariantRow[]> | ActionError> {
  const user = getUser();

  const { rows } = await query<StudioVariantRow>(
    `SELECT * FROM studio_variants WHERE project_id = $1 AND user_id = $2 ORDER BY created_at ASC`,
    [projectId, user.id],
  );

  return { ok: true, data: rows };
}

export async function listStudioVariants(
  screenId: string,
): Promise<Ok<StudioVariantRow[]> | ActionError> {
  const user = getUser();

  const { rows } = await query<StudioVariantRow>(
    `SELECT * FROM studio_variants WHERE screen_id = $1 AND user_id = $2 ORDER BY created_at ASC`,
    [screenId, user.id],
  );

  return { ok: true, data: rows };
}

export async function createStudioVariant(
  screenId: string,
  input?: Partial<Pick<StudioVariantRow, "name" | "ui_schema" | "is_original">>,
): Promise<Ok<StudioVariantRow> | ActionError> {
  const user = getUser();

  const projectId = await projectIdForScreen(screenId, user.id);
  if (!projectId) return err("Screen not found");

  const uiSchema = input?.ui_schema ?? { schema_version: 1, id: "root", type: "page" };

  const row = await queryOne<StudioVariantRow>(
    `INSERT INTO studio_variants (project_id, screen_id, user_id, name, ui_schema, is_original)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      projectId,
      screenId,
      user.id,
      input?.name ?? "Variant",
      JSON.stringify(uiSchema),
      input?.is_original ?? false,
    ],
  );

  if (!row) return err("Insert failed");
  revalidatePath(`/project/${projectId}`);
  return { ok: true, data: row };
}

export async function duplicateStudioVariant(
  id: string,
): Promise<Ok<StudioVariantRow> | ActionError> {
  const user = getUser();

  const src = await queryOne<StudioVariantRow>(
    `SELECT * FROM studio_variants WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );
  if (!src) return err("Not found");

  const projectId = await projectIdForScreen(src.screen_id, user.id);
  if (!projectId) return err("Screen not found");

  const row = await queryOne<StudioVariantRow>(
    `INSERT INTO studio_variants (project_id, screen_id, user_id, name, ui_schema, is_original)
     VALUES ($1, $2, $3, $4, $5, false) RETURNING *`,
    [
      projectId,
      src.screen_id,
      user.id,
      `${src.name} (copy)`,
      jsonOrNull(src.ui_schema),
    ],
  );

  if (!row) return err("Insert failed");
  revalidatePath(`/project/${projectId}`);
  return { ok: true, data: row };
}

export async function renameStudioVariant(
  id: string,
  name: string,
): Promise<Ok<StudioVariantRow> | ActionError> {
  const user = getUser();

  const existing = await queryOne<{ screen_id: string }>(
    `SELECT screen_id FROM studio_variants WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  const row = await queryOne<StudioVariantRow>(
    `UPDATE studio_variants SET name = $3 WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, user.id, name],
  );

  if (!row) return err("Update failed");
  if (existing?.screen_id) {
    const pid = await projectIdForScreen(existing.screen_id, user.id);
    if (pid) revalidatePath(`/project/${pid}`);
  }
  return { ok: true, data: row };
}

export async function deleteStudioVariant(
  id: string,
): Promise<Ok<void> | ActionError> {
  const user = getUser();

  const existing = await queryOne<{ screen_id: string }>(
    `SELECT screen_id FROM studio_variants WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  await query(
    `DELETE FROM studio_variants WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  if (existing?.screen_id) {
    const pid = await projectIdForScreen(existing.screen_id, user.id);
    if (pid) revalidatePath(`/project/${pid}`);
  }
  return { ok: true, data: undefined };
}

export async function setStudioVariantSchema(
  id: string,
  ui_schema: UISchema,
): Promise<Ok<StudioVariantRow> | ActionError> {
  const user = getUser();

  const existing = await queryOne<{ screen_id: string }>(
    `SELECT screen_id FROM studio_variants WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  const row = await queryOne<StudioVariantRow>(
    `UPDATE studio_variants SET ui_schema = $3 WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, user.id, JSON.stringify(ui_schema)],
  );

  if (!row) return err("Update failed");
  if (existing?.screen_id) {
    const pid = await projectIdForScreen(existing.screen_id, user.id);
    if (pid) revalidatePath(`/project/${pid}`);
  }
  return { ok: true, data: row };
}
