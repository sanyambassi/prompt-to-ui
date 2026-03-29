import type { StudioScreenRow } from "@/types/studio";

const DESIGN_SYSTEM_NAME_RE = /design\s*system/i;

export function isDesignSystemScreenName(name: string): boolean {
  return DESIGN_SYSTEM_NAME_RE.test(name);
}

/** Legacy small DS card size (older pipeline). New DS uses desktop artboard; detect by name. */
export function isLegacyDesignSystemCardSize(
  width: number | undefined,
  height: number | undefined,
): boolean {
  return (width ?? 0) === 680 && (height ?? 0) === 520;
}

/** Sidebar / canvas placement: name match, or legacy 680×520 card. */
export function isStyleGuideScreenRow(s: StudioScreenRow): boolean {
  return (
    isDesignSystemScreenName(s.name) || isLegacyDesignSystemCardSize(s.width, s.height)
  );
}

/**
 * Put design-system artboards first in lists and as the default active screen on load.
 * Tie-break with sort_order so behavior stays stable.
 */
export function compareScreensDisplayOrder(
  a: StudioScreenRow,
  b: StudioScreenRow,
): number {
  const aDs = isStyleGuideScreenRow(a);
  const bDs = isStyleGuideScreenRow(b);
  if (aDs !== bDs) return aDs ? -1 : 1;
  const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (orderDiff !== 0) return orderDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortScreensForDisplay<T extends StudioScreenRow>(screens: T[]): T[] {
  return [...screens].sort(compareScreensDisplayOrder);
}
