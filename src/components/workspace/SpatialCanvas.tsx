"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Artboard } from "@/components/workspace/Artboard";
import { isKeyboardCaptureTarget } from "@/lib/client/keyboard-capture-target";
import { useEditorStore } from "@/store/editor";

const SIMPLIFY_ZOOM = 0.28;
const WORLD_PAD = 240;

type Props = {
  onPositionCommit: (screenId: string) => void;
  onDimensionsCommit?: (screenId: string) => void;
  onRequestDesktopVariant?: (screenId: string) => void;
};

export function SpatialCanvas({
  onPositionCommit,
  onDimensionsCommit,
  onRequestDesktopVariant,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const screens = useEditorStore((s) => s.screens);
  const viewport = useEditorStore((s) => s.viewport);
  const setViewport = useEditorStore((s) => s.setViewport);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  const [spaceDown, setSpaceDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        if (isKeyboardCaptureTarget(e.target)) return;
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Zoom only with Ctrl+wheel (Windows/Linux) or Cmd+wheel (macOS). Plain wheel
  // must scroll overflow inside artboards / page. React's passive wheel listeners
  // can't reliably preventDefault, so we attach a non-passive native listener.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const { panX, panY, zoom } = useEditorStore.getState().viewport;
      const delta = -e.deltaY * 0.001;
      const nextZoom = Math.min(2.5, Math.max(0.06, zoom * (1 + delta)));

      const wx = (mx - panX) / zoom;
      const wy = (my - panY) / zoom;
      const nextPanX = mx - wx * nextZoom;
      const nextPanY = my - wy * nextZoom;

      useEditorStore.getState().setViewport({
        panX: nextPanX,
        panY: nextPanY,
        zoom: nextZoom,
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const startPan = useCallback(
    (clientX: number, clientY: number, pointerId: number) => {
      setIsPanning(true);
      panRef.current = {
        pointerId,
        startX: clientX,
        startY: clientY,
        origPanX: viewport.panX,
        origPanY: viewport.panY,
      };
    },
    [viewport.panX, viewport.panY],
  );

  const onPanLayerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1 || (e.button === 0 && spaceDown)) {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        startPan(e.clientX, e.clientY, e.pointerId);
      }
    },
    [spaceDown, startPan],
  );

  const onPanLayerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const p = panRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      setViewport({
        panX: p.origPanX + dx,
        panY: p.origPanY + dy,
      });
    },
    [setViewport],
  );

  const endPan = useCallback((e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    panRef.current = null;
    setIsPanning(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  let ww = 2400;
  let wh = 1600;
  if (screens.length > 0) {
    const maxX = Math.max(...screens.map((s) => s.canvas_x + s.width));
    const maxY = Math.max(...screens.map((s) => s.canvas_y + s.height));
    ww = Math.max(2400, maxX + WORLD_PAD);
    wh = Math.max(1600, maxY + WORLD_PAD);
  }

  return (
    <div
      ref={containerRef}
      className="workspace-canvas-bg workspace-canvas-dots relative h-full min-h-[420px] w-full overflow-hidden"
      role="application"
      aria-label="Spatial canvas"
    >
      <div
        className="will-change-transform absolute left-0 top-0 z-[2]"
        style={{
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <div className="relative" style={{ width: ww, height: wh }}>
          <div
            className="absolute inset-0 z-0"
            style={{
              cursor: isPanning ? "grabbing" : spaceDown ? "grab" : "default",
            }}
            onPointerDown={onPanLayerPointerDown}
            onPointerMove={onPanLayerPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            aria-hidden
          />
          {screens.map((sc) => (
            <Artboard
              key={sc.id}
              screen={sc}
              zoom={viewport.zoom}
              simplified={viewport.zoom < SIMPLIFY_ZOOM}
              onPositionCommit={onPositionCommit}
              onDimensionsCommit={onDimensionsCommit}
              onRequestDesktopVariant={onRequestDesktopVariant}
            />
          ))}
        </div>
      </div>
      {screens.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center p-8 text-center">
          <div className="max-w-sm rounded-2xl border border-white/10 bg-black/60 px-8 py-10 backdrop-blur-xl">
            <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-white/70 uppercase">
              Empty canvas
            </p>
            <p className="mt-3 text-lg font-semibold tracking-tight text-white">
              Describe what to design
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              Type a prompt below and we&apos;ll generate your screens right here on the canvas.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
