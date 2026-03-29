"use server";

import { listStudioChatMessages } from "@/actions/studio/chat-messages";
import { query, queryOne } from "@/lib/db/pool";
import { getUser } from "@/lib/auth/anonymous-user";

type ActionError = { ok: false; error: string };
type Ok<T> = { ok: true; data: T };

function err(message: string): ActionError {
  return { ok: false, error: message };
}

export async function getRegenerationPromptForScreen(
  projectId: string,
  screenId: string,
): Promise<Ok<{ prompt: string }> | ActionError> {
  const user = getUser();

  const chat = await listStudioChatMessages(projectId, screenId);
  if (chat.ok) {
    const users = chat.data.filter((m) => m.role === "user");
    const last = users[users.length - 1];
    const t = last?.content?.trim() ?? "";
    if (t.length >= 3) {
      return { ok: true, data: { prompt: t } };
    }
  }

  const job = await queryOne<{ prompt: string }>(
    `SELECT prompt FROM studio_generation_jobs
     WHERE project_id = $1 AND screen_id = $2 AND user_id = $3 AND status IN ('success', 'error')
     ORDER BY created_at DESC LIMIT 1`,
    [projectId, screenId, user.id],
  );

  const jp = typeof job?.prompt === "string" ? job.prompt.trim() : "";
  if (jp.length >= 3) {
    return { ok: true, data: { prompt: jp } };
  }

  const fallbackPrompt =
    "Regenerate this artboard end-to-end with the same core product intent. " +
    "Elevate visual polish, typography, spacing, color system depth, imagery, and interaction affordances to an exceptional, production-grade level. " +
    "Preserve information hierarchy and copy direction unless a change is clearly better for clarity or UX.";
  return { ok: true, data: { prompt: fallbackPrompt } };
}
