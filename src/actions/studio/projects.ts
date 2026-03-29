"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db/pool";
import { buildSetClause, jsonOrNull } from "@/lib/db/helpers";
import { getUser } from "@/lib/auth/anonymous-user";
import type { StudioProjectRow } from "@/types/studio";

type ActionError = { ok: false; error: string };
type Ok<T> = { ok: true; data: T };

function err(message: string): ActionError {
  return { ok: false, error: message };
}

export async function listStudioProjects(): Promise<
  Ok<StudioProjectRow[]> | ActionError
> {
  const user = getUser();

  const { rows } = await query<StudioProjectRow>(
    `SELECT * FROM studio_projects WHERE user_id = $1 ORDER BY updated_at DESC`,
    [user.id],
  );

  return { ok: true, data: rows };
}

export async function getStudioProject(
  id: string,
): Promise<Ok<StudioProjectRow> | ActionError> {
  const user = getUser();

  const row = await queryOne<StudioProjectRow>(
    `SELECT * FROM studio_projects WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  if (!row) return err("Not found");
  return { ok: true, data: row };
}

export async function createStudioProject(
  name = "Untitled Project",
): Promise<Ok<StudioProjectRow> | ActionError> {
  const user = getUser();

  const row = await queryOne<StudioProjectRow>(
    `INSERT INTO studio_projects (user_id, name) VALUES ($1, $2) RETURNING *`,
    [user.id, name],
  );

  if (!row) return err("Insert failed");
  revalidatePath("/");
  return { ok: true, data: row };
}

export async function updateStudioProject(
  id: string,
  patch: Partial<
    Pick<
      StudioProjectRow,
      | "name"
      | "thumbnail_url"
      | "theme_config"
      | "canvas_viewport"
      | "canvas_document"
      | "is_public"
    >
  >,
): Promise<Ok<StudioProjectRow> | ActionError> {
  const user = getUser();

  const { clause, values } = buildSetClause(
    patch as Record<string, unknown>,
    3,
  );
  if (!clause) return err("Nothing to update");

  const row = await queryOne<StudioProjectRow>(
    `UPDATE studio_projects SET ${clause} WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, user.id, ...values],
  );

  if (!row) return err("Not found");
  revalidatePath("/");
  revalidatePath(`/project/${id}`);
  return { ok: true, data: row };
}

export async function deleteStudioProject(
  id: string,
): Promise<Ok<void> | ActionError> {
  const user = getUser();

  await query(
    `DELETE FROM studio_projects WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  revalidatePath("/");
  return { ok: true, data: undefined };
}

export async function toggleStudioProjectPublic(
  id: string,
  is_public: boolean,
): Promise<Ok<StudioProjectRow> | ActionError> {
  return updateStudioProject(id, { is_public });
}

export async function ensureStudioProjectShareToken(
  id: string,
): Promise<Ok<StudioProjectRow> | ActionError> {
  const user = getUser();

  const existing = await getStudioProject(id);
  if (!existing.ok) return existing;
  if (existing.data.share_token) return existing;

  const token = randomBytes(12).toString("base64url").slice(0, 20);
  const row = await queryOne<StudioProjectRow>(
    `UPDATE studio_projects SET share_token = $3 WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, user.id, token],
  );

  if (!row) return err("Not found");
  revalidatePath("/");
  revalidatePath(`/project/${id}`);
  return { ok: true, data: row };
}

export async function duplicateStudioProject(
  id: string,
): Promise<Ok<StudioProjectRow> | ActionError> {
  const user = getUser();

  const project = await queryOne<StudioProjectRow>(
    `SELECT * FROM studio_projects WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );
  if (!project) return err("Not found");

  const newProject = await queryOne<StudioProjectRow>(
    `INSERT INTO studio_projects (user_id, name, theme_config, canvas_viewport, canvas_document, design_md, is_public, share_token)
     VALUES ($1, $2, $3, $4, $5, $6, false, NULL) RETURNING *`,
    [
      user.id,
      `${project.name} (Copy)`,
      jsonOrNull(project.theme_config),
      jsonOrNull(project.canvas_viewport),
      jsonOrNull(project.canvas_document),
      project.design_md,
    ],
  );

  if (!newProject) return err("Failed to copy project");
  const newProjectId = newProject.id;

  async function rollback() {
    await query(`DELETE FROM studio_projects WHERE id = $1`, [newProjectId]);
  }

  const { rows: screens } = await query<StudioProjectRow & Record<string, unknown>>(
    `SELECT * FROM studio_screens WHERE project_id = $1 AND user_id = $2 ORDER BY sort_order ASC`,
    [id, user.id],
  );

  const idMap = new Map<string, string>();

  for (const s of screens) {
    const ns = await queryOne<{ id: string }>(
      `INSERT INTO studio_screens (project_id, user_id, name, ui_schema, thumbnail_url, sort_order, canvas_x, canvas_y, width, height)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        newProjectId,
        user.id,
        s.name,
        jsonOrNull(s.ui_schema),
        s.thumbnail_url,
        s.sort_order,
        (s.canvas_x as number) + 48,
        (s.canvas_y as number) + 48,
        s.width,
        s.height,
      ],
    );
    if (!ns) {
      await rollback();
      return err("Failed to copy screen");
    }
    idMap.set(s.id as string, ns.id);
  }

  const oldScreenIds = [...idMap.keys()];
  if (oldScreenIds.length > 0) {
    const { rows: variants } = await query<Record<string, unknown>>(
      `SELECT * FROM studio_variants WHERE screen_id = ANY($1::uuid[]) AND user_id = $2`,
      [oldScreenIds, user.id],
    );

    for (const v of variants) {
      const newSid = idMap.get(v.screen_id as string);
      if (!newSid) continue;
      const { rowCount } = await query(
        `INSERT INTO studio_variants (project_id, screen_id, user_id, name, ui_schema, is_original)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newProjectId, newSid, user.id, v.name, jsonOrNull(v.ui_schema), v.is_original],
      );
      if (!rowCount) {
        await rollback();
        return err("Failed to copy variant");
      }
    }

    const { rows: links } = await query<Record<string, unknown>>(
      `SELECT * FROM studio_prototype_links WHERE screen_id = ANY($1::uuid[]) AND user_id = $2`,
      [oldScreenIds, user.id],
    );

    for (const l of links) {
      const ns = idMap.get(l.screen_id as string);
      const nt = idMap.get(l.target_screen_id as string);
      if (!ns || !nt) continue;
      const { rowCount } = await query(
        `INSERT INTO studio_prototype_links (screen_id, user_id, source_node_id, target_screen_id, trigger, transition, transition_config)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [ns, user.id, l.source_node_id, nt, l.trigger, l.transition, jsonOrNull(l.transition_config)],
      );
      if (!rowCount) {
        await rollback();
        return err("Failed to copy link");
      }
    }
  }

  const { rows: assets } = await query<Record<string, unknown>>(
    `SELECT * FROM studio_assets WHERE project_id = $1 AND user_id = $2`,
    [id, user.id],
  );

  for (const a of assets) {
    const { rowCount } = await query(
      `INSERT INTO studio_assets (project_id, user_id, url, filename, mime_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [newProjectId, user.id, a.url, a.filename, a.mime_type],
    );
    if (!rowCount) {
      await rollback();
      return err("Failed to copy asset");
    }
  }

  revalidatePath("/");
  return { ok: true, data: newProject };
}
