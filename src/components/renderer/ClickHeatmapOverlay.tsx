"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { HeatmapTarget } from "@/lib/schema/collect-clickable-heatmap-nodes";
import { cn } from "@/lib/utils";

type MeasuredSpot = HeatmapTarget & {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Props = {
  enabled: boolean;
  targets: HeatmapTarget[];
  /** Scrollable artboard body (overflow auto). */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Direct parent of `SchemaRenderer` — used for layout-relative rects. */
  contentRef: React.RefObject<HTMLElement | null>;
  className?: string;
};

function measureSpots(
  targets: HeatmapTarget[],
  contentRoot: HTMLElement,
): MeasuredSpot[] {
  const rr = contentRoot.getBoundingClientRect();
  const spots: MeasuredSpot[] = [];

  for (const t of targets) {
    let el: Element | null = null;
    try {
      el = contentRoot.querySelector(`[data-studio-id="${CSS.escape(t.id)}"]`);
    } catch {
      continue;
    }
    if (!el || !(el instanceof HTMLElement)) continue;

    const er = el.getBoundingClientRect();
    if (er.width < 1 || er.height < 1) continue;

    spots.push({
      ...t,
      left: er.left - rr.left,
      top: er.top - rr.top,
      width: er.width,
      height: er.height,
    });
  }

  return spots;
}

function heatGradient(intensity: number): string {
  const cold = 1 - intensity;
  const hue = cold * 210;
  const sat = 85 + intensity * 10;
  const light = 52 - intensity * 8;
  const coreA = 0.42 + intensity * 0.38;
  const midA = coreA * 0.45;
  const c = `hsla(${hue}, ${sat}%, ${light}%, ${coreA})`;
  const m = `hsla(${hue}, ${sat}%, ${light + 6}%, ${midA})`;
  return `radial-gradient(circle, ${c} 0%, ${m} 38%, transparent 68%)`;
}

export function ClickHeatmapOverlay({
  enabled,
  targets,
  scrollRef,
  contentRef,
  className,
}: Props) {
  const [spots, setSpots] = useState<MeasuredSpot[]>([]);
  const spotsRef = useRef(spots);

  const remeasure = useCallback(() => {
    const content = contentRef.current;
    if (!enabled || !content) {
      if (spotsRef.current.length > 0) {
        spotsRef.current = [];
        setSpots([]);
      }
      return;
    }
    const next = measureSpots(targets, content);
    spotsRef.current = next;
    setSpots(next);
  }, [contentRef, enabled, targets]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;

    const ro = new ResizeObserver(() => {
      remeasure();
    });
    ro.observe(scroll);
    ro.observe(content);

    scroll.addEventListener("scroll", remeasure, { passive: true });
    window.addEventListener("resize", remeasure);

    return () => {
      ro.disconnect();
      scroll.removeEventListener("scroll", remeasure);
      window.removeEventListener("resize", remeasure);
    };
  }, [enabled, remeasure, scrollRef, contentRef]);

  if (!enabled || spots.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[25] overflow-visible",
        className,
      )}
      aria-hidden
    >
      {spots.map((s) => {
        const cx = s.left + s.width / 2;
        const cy = s.top + s.height / 2;
        const base = Math.max(s.width, s.height, 48);
        const diameter = Math.min(220, base * (1.1 + s.intensity * 0.35));

        return (
          <div
            key={s.id}
            className="absolute rounded-full mix-blend-multiply opacity-95 dark:mix-blend-screen dark:opacity-90"
            style={{
              left: cx - diameter / 2,
              top: cy - diameter / 2,
              width: diameter,
              height: diameter,
              background: heatGradient(s.intensity),
              filter: "blur(0.5px)",
            }}
            title={`${s.category} (${Math.round(s.intensity * 100)}% intent)`}
          />
        );
      })}
    </div>
  );
}
