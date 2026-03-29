import { query } from "@/lib/db/pool";

export type PrototypeLinkDraft = {
  source_screen_index: number;
  source_node_id: string;
  target_screen_index: number;
  trigger?: string;
  transition?: string;
};

export async function replacePrototypeLinksForScreens(
  userId: string,
  orderedScreenIds: string[],
  drafts: PrototypeLinkDraft[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = [...new Set(orderedScreenIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true };

  await query(
    `DELETE FROM studio_prototype_links WHERE user_id = $1 AND screen_id = ANY($2::uuid[])`,
    [userId, ids],
  );

  if (drafts.length === 0) return { ok: true };

  const valueSets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const d of drafts) {
    const srcIdx = d.source_screen_index;
    const tgtIdx = d.target_screen_index;
    if (
      srcIdx < 0 ||
      tgtIdx < 0 ||
      srcIdx >= orderedScreenIds.length ||
      tgtIdx >= orderedScreenIds.length
    ) {
      continue;
    }
    const screen_id = orderedScreenIds[srcIdx];
    const target_screen_id = orderedScreenIds[tgtIdx];
    if (!screen_id || !target_screen_id) continue;
    const sid = d.source_node_id.trim();
    if (!sid) continue;

    valueSets.push(
      `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`,
    );
    values.push(
      screen_id,
      userId,
      sid.slice(0, 500),
      target_screen_id,
      (d.trigger ?? "click").slice(0, 64),
      (d.transition ?? "instant").slice(0, 64),
      JSON.stringify({ duration: 200, easing: "ease-out" }),
    );
    idx += 7;
  }

  if (valueSets.length === 0) return { ok: true };

  try {
    await query(
      `INSERT INTO studio_prototype_links (screen_id, user_id, source_node_id, target_screen_id, trigger, transition, transition_config)
       VALUES ${valueSets.join(", ")}`,
      values,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { ok: true };
}
