"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db/pool";
import { getUser } from "@/lib/auth/anonymous-user";
import type { StudioChatMessageRow } from "@/types/studio";

type ActionError = { ok: false; error: string };
type Ok<T> = { ok: true; data: T };

function err(message: string): ActionError {
  return { ok: false, error: message };
}

export async function listStudioChatMessages(
  projectId: string,
  screenId?: string | null,
): Promise<Ok<StudioChatMessageRow[]> | ActionError> {
  const user = getUser();

  let sql = `SELECT * FROM studio_chat_messages WHERE project_id = $1 AND user_id = $2`;
  const values: unknown[] = [projectId, user.id];

  if (screenId) {
    sql += ` AND screen_id = $3`;
    values.push(screenId);
  }

  sql += ` ORDER BY created_at ASC`;

  const { rows } = await query<StudioChatMessageRow>(sql, values);
  return { ok: true, data: rows };
}

export async function createStudioChatMessage(
  projectId: string,
  role: "user" | "assistant",
  content: string,
  screenId?: string | null,
): Promise<Ok<StudioChatMessageRow> | ActionError> {
  const user = getUser();

  const row = await queryOne<StudioChatMessageRow>(
    `INSERT INTO studio_chat_messages (project_id, screen_id, user_id, role, content)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [projectId, screenId ?? null, user.id, role, content],
  );

  if (!row) return err("Insert failed");
  revalidatePath(`/project/${projectId}`);
  return { ok: true, data: row };
}
