"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db/pool";
import { buildSetClause, jsonOrNull } from "@/lib/db/helpers";
import { getUser } from "@/lib/auth/anonymous-user";
import type { UISchema } from "@/lib/schema/types";
import type { StudioScreenRow } from "@/types/studio";

type ActionError = { ok: false; error: string };
type Ok<T> = { ok: true; data: T };

function err(message: string): ActionError {
  return { ok: false, error: message };
}

export async function listStudioScreens(
  projectId: string,
): Promise<Ok<StudioScreenRow[]> | ActionError> {
  const user = getUser();

  const { rows } = await query<StudioScreenRow>(
    `SELECT * FROM studio_screens WHERE project_id = $1 AND user_id = $2 ORDER BY sort_order ASC`,
    [projectId, user.id],
  );

  return { ok: true, data: rows };
}

export async function createStudioScreen(
  projectId: string,
  input?: Partial<
    Pick<StudioScreenRow, "name" | "ui_schema" | "sort_order" | "canvas_x" | "canvas_y" | "width" | "height">
  >,
): Promise<Ok<StudioScreenRow> | ActionError> {
  const user = getUser();

  const project = await queryOne<{ id: string }>(
    `SELECT id FROM studio_projects WHERE id = $1 AND user_id = $2`,
    [projectId, user.id],
  );
  if (!project) return err("Project not found");

  const uiSchema = input?.ui_schema ?? { schema_version: 1, id: "root", type: "page" };

  const row = await queryOne<StudioScreenRow>(
    `INSERT INTO studio_screens (project_id, user_id, name, ui_schema, sort_order, canvas_x, canvas_y, width, height)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      projectId,
      user.id,
      input?.name ?? "Screen",
      JSON.stringify(uiSchema),
      input?.sort_order ?? 0,
      input?.canvas_x ?? 0,
      input?.canvas_y ?? 0,
      input?.width ?? 1280,
      input?.height ?? 800,
    ],
  );

  if (!row) return err("Insert failed");
  revalidatePath(`/project/${projectId}`);
  return { ok: true, data: row };
}

export async function updateStudioScreen(
  id: string,
  patch: Partial<
    Pick<
      StudioScreenRow,
      | "name"
      | "ui_schema"
      | "thumbnail_url"
      | "sort_order"
      | "canvas_x"
      | "canvas_y"
      | "width"
      | "height"
    >
  >,
): Promise<Ok<StudioScreenRow> | ActionError> {
  const user = getUser();

  const existing = await queryOne<{ project_id: string }>(
    `SELECT project_id FROM studio_screens WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );
  if (!existing) return err("Not found");

  const raw = { ...patch } as Record<string, unknown>;
  if (patch.ui_schema !== undefined) {
    raw.ui_schema = JSON.stringify(patch.ui_schema);
  }

  const { clause, values } = buildSetClause(raw, 3);
  if (!clause) return err("Nothing to update");

  const row = await queryOne<StudioScreenRow>(
    `UPDATE studio_screens SET ${clause} WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, user.id, ...values],
  );

  if (!row) return err("Update failed");
  revalidatePath(`/project/${existing.project_id}`);
  return { ok: true, data: row };
}

export async function deleteStudioScreen(
  id: string,
): Promise<Ok<void> | ActionError> {
  const user = getUser();

  const row = await queryOne<{ project_id: string }>(
    `SELECT project_id FROM studio_screens WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  await query(
    `DELETE FROM studio_screens WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  if (row?.project_id) revalidatePath(`/project/${row.project_id}`);
  return { ok: true, data: undefined };
}

export async function reorderStudioScreens(
  projectId: string,
  orderedIds: string[],
): Promise<Ok<void> | ActionError> {
  const user = getUser();

  for (let i = 0; i < orderedIds.length; i++) {
    await query(
      `UPDATE studio_screens SET sort_order = $3 WHERE id = $1 AND project_id = $4 AND user_id = $2`,
      [orderedIds[i], user.id, i, projectId],
    );
  }

  revalidatePath(`/project/${projectId}`);
  return { ok: true, data: undefined };
}

export async function updateStudioScreenPosition(
  id: string,
  canvas_x: number,
  canvas_y: number,
): Promise<Ok<StudioScreenRow> | ActionError> {
  return updateStudioScreen(id, { canvas_x, canvas_y });
}

export async function updateStudioScreenSchema(
  id: string,
  ui_schema: UISchema,
): Promise<Ok<StudioScreenRow> | ActionError> {
  return updateStudioScreen(id, { ui_schema });
}
