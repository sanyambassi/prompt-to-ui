"use server";

import { revalidatePath } from "next/cache";
import {
  defaultStudioModel,
  getProviderFromModelId,
} from "@/lib/llm/studio-models";
import { query, queryOne } from "@/lib/db/pool";
import { buildSetClause } from "@/lib/db/helpers";
import { getUser } from "@/lib/auth/anonymous-user";
import { normalizeStudioJobContext } from "@/lib/studio/job-context";
import type {
  StudioGenerationJobContext,
  StudioGenerationJobRow,
} from "@/types/studio";

type ActionError = { ok: false; error: string };
type Ok<T> = { ok: true; data: T };

function err(message: string): ActionError {
  return { ok: false, error: message };
}

export async function listStudioGenerationJobs(
  projectId: string,
  limit = 40,
): Promise<Ok<StudioGenerationJobRow[]> | ActionError> {
  const user = getUser();

  const cap = Math.min(100, Math.max(1, limit));
  const { rows } = await query<StudioGenerationJobRow>(
    `SELECT * FROM studio_generation_jobs
     WHERE project_id = $1 AND user_id = $2
     ORDER BY created_at DESC LIMIT $3`,
    [projectId, user.id, cap],
  );

  return { ok: true, data: rows };
}

export async function createStudioGenerationJob(
  projectId: string,
  input: Pick<StudioGenerationJobRow, "prompt"> &
    Partial<
      Pick<
        StudioGenerationJobRow,
        "screen_id" | "variant_id" | "provider" | "model"
      >
    > & {
      context?: StudioGenerationJobContext | Record<string, unknown> | null;
    },
): Promise<Ok<StudioGenerationJobRow> | ActionError> {
  const user = getUser();

  const trimmed = input.prompt.trim();
  if (trimmed.length < 3) return err("Prompt must be at least 3 characters");

  const model = (input.model?.trim() || defaultStudioModel()) as string;
  let provider: string;
  try {
    provider = getProviderFromModelId(model);
  } catch {
    return err("Invalid model id");
  }

  const context = normalizeStudioJobContext(input.context ?? {});

  const row = await queryOne<StudioGenerationJobRow>(
    `INSERT INTO studio_generation_jobs
       (project_id, user_id, screen_id, variant_id, prompt, provider, model, status, context)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
     RETURNING *`,
    [
      projectId,
      user.id,
      input.screen_id ?? null,
      input.variant_id ?? null,
      trimmed,
      provider,
      model,
      JSON.stringify(context),
    ],
  );

  if (!row) return err("Insert failed");
  revalidatePath(`/project/${projectId}`);
  return { ok: true, data: row };
}

export async function updateStudioGenerationJobStatus(
  id: string,
  patch: Partial<
    Pick<
      StudioGenerationJobRow,
      "status" | "result_schema" | "error_message" | "completed_at" | "generation_log"
    >
  >,
): Promise<Ok<StudioGenerationJobRow> | ActionError> {
  const user = getUser();

  const existing = await queryOne<{ project_id: string }>(
    `SELECT project_id FROM studio_generation_jobs WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );
  if (!existing) return err("Job not found");

  const raw = { ...patch } as Record<string, unknown>;
  if (patch.result_schema !== undefined) {
    raw.result_schema = JSON.stringify(patch.result_schema);
  }
  if (patch.generation_log !== undefined) {
    raw.generation_log = JSON.stringify(patch.generation_log);
  }

  const { clause, values } = buildSetClause(raw, 3);
  if (!clause) return err("Nothing to update");

  const row = await queryOne<StudioGenerationJobRow>(
    `UPDATE studio_generation_jobs SET ${clause} WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, user.id, ...values],
  );

  if (!row) return err("Update failed");
  if (existing.project_id) revalidatePath(`/project/${existing.project_id}`);
  return { ok: true, data: row };
}

export async function saveGenerationLog(
  jobId: string,
  log: Record<string, unknown>[],
  options?: { mirrorToScreenIds?: string[] },
): Promise<Ok<null> | ActionError> {
  const user = getUser();

  await query(
    `UPDATE studio_generation_jobs SET generation_log = $3 WHERE id = $1 AND user_id = $2`,
    [jobId, user.id, JSON.stringify(log)],
  );

  const jobRow = await queryOne<{ screen_id: string | null; project_id: string }>(
    `SELECT screen_id, project_id FROM studio_generation_jobs WHERE id = $1 AND user_id = $2`,
    [jobId, user.id],
  );

  if (jobRow?.screen_id && jobRow.project_id) {
    const now = new Date().toISOString();
    const extras = (options?.mirrorToScreenIds ?? []).filter(
      (id): id is string =>
        typeof id === "string" && id.length > 0 && id !== jobRow.screen_id,
    );
    const screenIds = [...new Set([jobRow.screen_id, ...extras])];
    for (const sid of screenIds) {
      await query(
        `UPDATE studio_screens
         SET last_generation_log = $4, last_generation_log_at = $5, last_generation_log_job_id = $3
         WHERE id = $1 AND project_id = $6 AND user_id = $2`,
        [sid, user.id, jobId, JSON.stringify(log), now, jobRow.project_id],
      );
    }
    revalidatePath(`/project/${jobRow.project_id}`);
  }

  return { ok: true, data: null };
}

export type ScreenGenerationLogPayload = {
  jobId: string | null;
  entries: Record<string, unknown>[];
  userPrompt?: string | null;
};

export async function getScreenGenerationLog(
  screenId: string,
): Promise<Ok<ScreenGenerationLogPayload | null> | ActionError> {
  const user = getUser();

  const screen = await queryOne<{
    last_generation_log: unknown;
    last_generation_log_job_id: string | null;
  }>(
    `SELECT last_generation_log, last_generation_log_job_id FROM studio_screens WHERE id = $1 AND user_id = $2`,
    [screenId, user.id],
  );

  if (!screen) return err("Screen not found");

  const cached = screen.last_generation_log;
  if (Array.isArray(cached) && cached.length > 0) {
    const jid = typeof screen.last_generation_log_job_id === "string"
      ? screen.last_generation_log_job_id
      : null;
    let userPrompt: string | null = null;
    if (jid) {
      const jobPromptRow = await queryOne<{ prompt: string }>(
        `SELECT prompt FROM studio_generation_jobs WHERE id = $1 AND user_id = $2`,
        [jid, user.id],
      );
      const p = jobPromptRow?.prompt;
      userPrompt = typeof p === "string" && p.trim().length > 0 ? p.trim() : null;
    }
    return {
      ok: true,
      data: { jobId: jid, entries: cached as Record<string, unknown>[], userPrompt },
    };
  }

  const job = await queryOne<{ id: string; generation_log: unknown; prompt: string }>(
    `SELECT id, generation_log, prompt FROM studio_generation_jobs
     WHERE screen_id = $1 AND user_id = $2 AND status IN ('success', 'error') AND generation_log IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [screenId, user.id],
  );

  if (!job?.generation_log || !Array.isArray(job.generation_log)) {
    return { ok: true, data: null };
  }

  const jp = job.prompt;
  const userPrompt = typeof jp === "string" && jp.trim().length > 0 ? jp.trim() : null;

  return {
    ok: true,
    data: {
      jobId: typeof job.id === "string" ? job.id : null,
      entries: job.generation_log as Record<string, unknown>[],
      userPrompt,
    },
  };
}

export async function getLatestCompletedJobWithLog(
  projectId: string,
): Promise<Ok<StudioGenerationJobRow | null> | ActionError> {
  const user = getUser();

  const row = await queryOne<StudioGenerationJobRow>(
    `SELECT * FROM studio_generation_jobs
     WHERE project_id = $1 AND user_id = $2 AND status IN ('success', 'error') AND generation_log IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [projectId, user.id],
  );

  return { ok: true, data: row ?? null };
}

export async function getStudioGenerationJob(
  id: string,
): Promise<Ok<StudioGenerationJobRow> | ActionError> {
  const user = getUser();

  const row = await queryOne<StudioGenerationJobRow>(
    `SELECT * FROM studio_generation_jobs WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );

  if (!row) return err("Job not found");
  return { ok: true, data: row };
}
