import type { CanvasItem } from "@/store/canvas-items";
import type { StudioScreenRow } from "@/types/studio";
import { sortScreensForDisplay } from "@/lib/studio/screen-display-order";

const GAP = 80;
const START_X = 400;
const START_Y = 200;

/**
 * Packs every canvas item into a single horizontal row: webframes follow sidebar/display order
 * (style guides first), then any webframes without a matching screen row, then images.
 */
export function gatherCanvasItemsInHorizontalRow(
  items: CanvasItem[],
  screens: StudioScreenRow[],
): CanvasItem[] {
  if (items.length === 0) return items;

  const screenIds = new Set(screens.map((s) => s.id));
  const webframes = items.filter(
    (i): i is CanvasItem & { type: "webframe"; screenId: string } =>
      i.type === "webframe",
  );
  const images = items.filter((i) => i.type === "image");

  const wfByScreenId = new Map<string, (typeof webframes)[number]>();
  for (const wf of webframes) {
    wfByScreenId.set(wf.screenId, wf);
  }

  const linkedRows = screens.filter((s) => wfByScreenId.has(s.id));
  const orderedLinked = sortScreensForDisplay(linkedRows).map(
    (s) => wfByScreenId.get(s.id)!,
  );

  const orphanWfs = webframes
    .filter((wf) => !screenIds.has(wf.screenId))
    .sort((a, b) => a.id.localeCompare(b.id));

  const imagesSorted = [...images].sort(
    (a, b) => a.x - b.x || a.id.localeCompare(b.id),
  );

  const sequence = [...orderedLinked, ...orphanWfs, ...imagesSorted];

  let x = START_X;
  const placed: CanvasItem[] = [];
  for (const item of sequence) {
    const w =
      item.width && item.width > 0
        ? item.width
        : item.type === "webframe"
          ? 1280
          : 320;
    placed.push({ ...item, x, y: START_Y });
    x += w + GAP;
  }

  return placed;
}
