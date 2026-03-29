"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db/pool";
import { buildSetClause, jsonOrNull } from "@/lib/db/helpers";
import { getUser } from "@/lib/auth/anonymous-user";
import type { StudioPrototypeLinkRow } from "@/types/studio";

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

export async function listStudioPrototypeLinksByProject(
  projectId: string,
): Promise<Ok<StudioPrototypeLinkRow[]> | ActionError> {
  const user = getUser();

  const { rows: screens } = await query<{ id: string }>(
    `SELECT id FROM studio_screens WHERE project_id = $1 AND user_id = $2`,
    [projectId, user.id],
  );

  const ids = screens.map((r) => r.id).filter(Boolean);
  if (ids.length === 0) return { ok: true, data: [] };

  const { rows } = await query<StudioPrototypeLinkRow>(
    `SELECT * FROM studio_prototype_links WHERE user_id = $1 AND screen_id = ANY($2::uuid[])`,
    [user.id, ids],
  );

  return { ok: true, data: rows };
}

export async function listStudioPrototypeLinks(
  screenId: string,
): Promise<Ok<StudioPrototypeLinkRow[]> | ActionError> {
  const user = getUser();

  const { rows } = await query<StudioPrototypeLinkRow>(
    `SELECT * FROM studio_prototype_links WHERE screen_id = $1 AND user_id = $2`,
    [screenId, user.id],
  );

  return { ok: true, data: rows };
}

export async function createStudioPrototypeLink(
  screenId: string,
  input: Pick<
    StudioPrototypeLinkRow,
    "source_node_id" | "target_screen_id" | "trigger" | "transition"
  > &
    Partial<Pick<StudioPrototypeLinkRow, "transition_config">>,
): Promise<Ok<StudioPrototypeLinkRow> | ActionError> {
  const user = getUser();

  const projectId = await projectIdForScreen(screenId, user.id);
  if (!projectId) return err("Screen not found");

  const tc = input.transition_config ?? { duration: 200, easing: "ease-out" };

  const row = await queryOne<StudioPrototypeLinkRow>(
    `INSERT INTO studio_prototype_links (screen_id, user_id, source_node_id, target_screen_id, trigger, transition, transition_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      screenId,
      user.id,
      input.source_node_id,
      input.target_screen_id,
      input.trigger,
      input.transition,
      JSON.stringify(tc),
    ],
  );

  if (!row) return err("Insert failed");
  revalidatePath(`/project/${projectId}`);
  return { ok: true, data: row };
}

export async function updateStudioPrototypeLink(
  id: string,
  patch: Partial<
    Pick<
      StudioPrototypeLinkRow,
      | "source_node_id"
      | "target_screen_id"
      | "trigger"
      | "transition"
      | "transition_config"
    >
  >,
): Promise<Ok<StudioPrototypeLinkRow> | ActionError> {
  const user = getUser();

  const existing = await queryOne<{ screen_id: string }>(
    `SELECT screen_id FROM studio_prototype_links WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  const raw = { ...patch } as Record<string, unknown>;
  if (patch.transition_config !== undefined) {
    raw.transition_config = JSON.stringify(patch.transition_config);
  }

  const { clause, values } = buildSetClause(raw, 3);
  if (!clause) return err("Nothing to update");

  const row = await queryOne<StudioPrototypeLinkRow>(
    `UPDATE studio_prototype_links SET ${clause} WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, user.id, ...values],
  );

  if (!row) return err("Update failed");
  if (existing?.screen_id) {
    const pid = await projectIdForScreen(existing.screen_id, user.id);
    if (pid) revalidatePath(`/project/${pid}`);
  }
  return { ok: true, data: row };
}

export async function deleteStudioPrototypeLink(
  id: string,
): Promise<Ok<void> | ActionError> {
  const user = getUser();

  const existing = await queryOne<{ screen_id: string }>(
    `SELECT screen_id FROM studio_prototype_links WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  await query(
    `DELETE FROM studio_prototype_links WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  if (existing?.screen_id) {
    const pid = await projectIdForScreen(existing.screen_id, user.id);
    if (pid) revalidatePath(`/project/${pid}`);
  }
  return { ok: true, data: undefined };
}
