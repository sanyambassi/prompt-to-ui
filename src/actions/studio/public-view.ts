"use server";

import { query, queryOne } from "@/lib/db/pool";
import type {
  StudioProjectRow,
  StudioPrototypeLinkRow,
  StudioScreenRow,
} from "@/types/studio";

export type StudioSharePayload = {
  project: StudioProjectRow;
  screens: StudioScreenRow[];
  prototypeLinks: StudioPrototypeLinkRow[];
};

export async function getStudioSharePayloadByToken(
  token: string,
): Promise<{ ok: true; data: StudioSharePayload } | { ok: false; error: string }> {
  const t = token?.trim();
  if (!t || t.length < 6) return { ok: false, error: "Invalid link" };

  const project = await queryOne<StudioProjectRow>(
    `SELECT * FROM studio_projects WHERE share_token = $1 AND is_public = true`,
    [t],
  );

  if (!project) return { ok: false, error: "Not found" };

  const pid = project.id;

  const { rows: screens } = await query<StudioScreenRow>(
    `SELECT * FROM studio_screens WHERE project_id = $1 ORDER BY sort_order ASC`,
    [pid],
  );

  const screenIds = screens.map((s) => s.id);

  let prototypeLinks: StudioPrototypeLinkRow[] = [];
  if (screenIds.length > 0) {
    const { rows: pl } = await query<StudioPrototypeLinkRow>(
      `SELECT * FROM studio_prototype_links WHERE screen_id = ANY($1::uuid[])`,
      [screenIds],
    );
    prototypeLinks = pl;
  }

  return {
    ok: true,
    data: {
      project,
      screens,
      prototypeLinks,
    },
  };
}
