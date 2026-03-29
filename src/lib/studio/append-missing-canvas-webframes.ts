import type { CanvasItem } from "@/store/canvas-items";
import type { StudioScreenRow } from "@/types/studio";
import {
  isStyleGuideScreenRow,
  sortScreensForDisplay,
} from "@/lib/studio/screen-display-order";

const GAP = 80;
const FIRST_ROW_Y = 200;
/** Offset far enough right so the first artboard clears the 340px generation sidebar at default zoom (0.55). */
const DEFAULT_FIRST_X = 700;

function inferDeviceTypeFromWidth(widthPx: number): "phone" | "tablet" | "desktop" {
  if (widthPx <= 500) return "phone";
  if (widthPx <= 1024) return "tablet";
  return "desktop";
}

function maxRightEdge(items: CanvasItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.x + (item.width || 0)), 0);
}

/**
 * Adds webframe canvas items for studio screens that do not yet have one.
 * All new screens (including Design System) extend to the **right** of the
 * rightmost occupied edge, with DS screens placed first so they appear
 * immediately to the right of existing content.
 */
export function appendMissingWebframeItems(
  currentItems: CanvasItem[],
  screens: StudioScreenRow[],
): CanvasItem[] {
  const validScreenIds = new Set(screens.map((s) => s.id));

  // Prune orphaned webframes + dedupe (keep one webframe per screenId, prefer canonical `wf-${screenId}` id)
  const validItems = currentItems.filter(
    (i) => i.type !== "webframe" || !("screenId" in i) || validScreenIds.has(i.screenId as string),
  );
  const winnerByScreen = new Map<string, CanvasItem>();
  for (const i of validItems) {
    if (i.type !== "webframe" || !("screenId" in i)) continue;
    const wf = i as CanvasItem & { screenId: string };
    const cur = winnerByScreen.get(wf.screenId);
    if (!cur || (wf.id === `wf-${wf.screenId}` && cur.id !== `wf-${wf.screenId}`)) {
      winnerByScreen.set(wf.screenId, wf);
    }
  }
  const pruned = validItems.filter((i) => {
    if (i.type !== "webframe" || !("screenId" in i)) return true;
    const wf = i as CanvasItem & { screenId: string };
    return winnerByScreen.get(wf.screenId)?.id === wf.id;
  });

  const existingWfScreenIds = new Set(
    pruned
      .filter((i): i is CanvasItem & { screenId: string } => i.type === "webframe")
      .map((i) => i.screenId),
  );
  const missing = screens.filter((s) => !existingWfScreenIds.has(s.id));
  if (missing.length === 0) return pruned;

  // DS first, then product screens — all placed to the right
  const ds = sortScreensForDisplay(missing.filter((s) => isStyleGuideScreenRow(s)));
  const rest = sortScreensForDisplay(missing.filter((s) => !isStyleGuideScreenRow(s)));
  const ordered = [...ds, ...rest];

  const newItems: CanvasItem[] = [];

  let rightX = maxRightEdge(pruned);
  if (rightX === 0) rightX = DEFAULT_FIRST_X;
  else rightX += GAP;

  for (const s of ordered) {
    const w = s.width || 1280;
    const h = s.height || 800;
    newItems.push({
      id: `wf-${s.id}`,
      type: "webframe",
      x: rightX,
      y: FIRST_ROW_Y,
      width: w,
      height: h,
      screenId: s.id,
      deviceType: inferDeviceTypeFromWidth(w),
    });
    rightX += w + GAP;
  }

  return [...pruned, ...newItems];
}
