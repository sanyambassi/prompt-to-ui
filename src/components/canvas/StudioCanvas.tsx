"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  TransformWrapper,
  TransformComponent,
  useTransformContext,
} from "react-zoom-pan-pinch";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { useCanvasItemsStore, type CanvasItem } from "@/store/canvas-items";
import { ImageCanvasItem } from "@/components/canvas/ImageCanvasItem";
import { WebFrameCanvasItem } from "@/components/canvas/WebFrameCanvasItem";
import {
  CanvasItemToolbar,
  type DevicePreset,
} from "@/components/canvas/CanvasItemToolbar";
import { useCanvasStudioActions } from "@/context/canvas-studio-actions-context";
import { useEditorStore } from "@/store/editor";
import { useGenerationLog } from "@/store/generation-log";
import { isStyleGuideScreenRow } from "@/lib/studio/screen-display-order";

const CANVAS_W = 12000;
const CANVAS_H = 6000;

const INITIAL_SCALE = 0.55;

type DragState = {
  id: string;
  startX: number;
  startY: number;
  itemX: number;
  itemY: number;
};

function useSelectedItemScreenRect(
  wrapperRef: React.RefObject<HTMLDivElement | null>,
) {
  const selectedItemId = useCanvasItemsStore((s) => s.selectedItemId);
  const items = useCanvasItemsStore((s) => s.items);
  const ctx = useTransformContext();
  const [rect, setRect] = useState<{ top: number; left: number; width: number; centerX: number } | null>(null);
  const rectRef = useRef(rect);

  const compute = useCallback(() => {
    if (!selectedItemId || !wrapperRef.current) {
      if (rectRef.current !== null) {
        rectRef.current = null;
        setRect(null);
      }
      return;
    }
    const item = items.find((i) => i.id === selectedItemId);
    if (!item) {
      if (rectRef.current !== null) {
        rectRef.current = null;
        setRect(null);
      }
      return;
    }

    const { positionX, positionY, scale } = ctx.transformState;
    const wrapperRect = wrapperRef.current.getBoundingClientRect();

    const screenX = wrapperRect.left + positionX + item.x * scale;
    const screenY = wrapperRect.top + positionY + item.y * scale;
    const screenW = item.width * scale;

    const next = { top: screenY, left: screenX, width: screenW, centerX: screenX + screenW / 2 };
    rectRef.current = next;
    setRect(next);
  }, [selectedItemId, items, ctx, wrapperRef]);

  useEffect(() => {
    const id = setInterval(compute, 50);
    return () => clearInterval(id);
  }, [compute]);

  return rect;
}

function CanvasContent(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: { wrapperRef: React.RefObject<HTMLDivElement | null> },
) {
  const items = useCanvasItemsStore((s) => s.items);
  const moveItem = useCanvasItemsStore((s) => s.moveItem);
  const studioActions = useCanvasStudioActions();
  const bringToFront = useCanvasItemsStore((s) => s.bringToFront);
  const selectItem = useCanvasItemsStore((s) => s.selectItem);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const dragActiveRef = useRef(false);

  const DRAG_THRESHOLD = 5;

  const ctx = useTransformContext();

  const handleDragStart = useCallback(
    (id: string, clientX: number, clientY: number) => {
      const item = useCanvasItemsStore
        .getState()
        .items.find((i) => i.id === id);
      if (!item) return;
      bringToFront(id);
      dragRef.current = {
        id,
        startX: clientX,
        startY: clientY,
        itemX: item.x,
        itemY: item.y,
      };
      dragActiveRef.current = false;
      setIsDragging(true);
    },
    [bringToFront],
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const { id, startX, startY, itemX, itemY } = dragRef.current;
      const rawDx = e.clientX - startX;
      const rawDy = e.clientY - startY;

      if (!dragActiveRef.current) {
        if (Math.abs(rawDx) < DRAG_THRESHOLD && Math.abs(rawDy) < DRAG_THRESHOLD) return;
        dragActiveRef.current = true;
      }

      const scale = ctx.transformState.scale || 1;
      const dx = rawDx / scale;
      const dy = rawDy / scale;
      moveItem(id, Math.round(itemX + dx), Math.round(itemY + dy));
    };

    const onUp = () => {
      dragRef.current = null;
      dragActiveRef.current = false;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDragging, moveItem, ctx]);

  const handleCanvasClick = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-canvas-item]")) return;
      selectItem(null);
    },
    [selectItem],
  );

  return (
    <>
      {isDragging &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              cursor: "grabbing",
            }}
          />,
          document.body,
        )}
      <div
        className="ptu-canvas-surface relative"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
        }}
        onPointerDown={handleCanvasClick}
      >
        {items.map((item) => (
          <div key={item.id} data-canvas-item>
            {item.type === "image" ? (
              <ImageCanvasItem item={item} onDragStart={handleDragStart} />
            ) : (
              <WebFrameCanvasItem
                item={item}
                onDragStart={handleDragStart}
                editable={
                  item.type === "webframe" &&
                  (item as CanvasItem & { screenId: string }).screenId === studioActions?.liveEditScreenId
                }
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function FloatingToolbar({
  wrapperRef,
}: {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const selectedItemId = useCanvasItemsStore((s) => s.selectedItemId);
  const items = useCanvasItemsStore((s) => s.items);
  const screens = useEditorStore((s) => s.screens);
  const isGenerating = useGenerationLog((s) => s.isGenerating);
  const rect = useSelectedItemScreenRect(wrapperRef);
  const studioActions = useCanvasStudioActions();

  if (!selectedItemId || !rect || isGenerating) return null;

  const item = items.find((i) => i.id === selectedItemId);
  if (!item) return null;

  if (item.type === "webframe") {
    const wf = item as CanvasItem & { type: "webframe"; screenId: string };
    const screen = screens.find((sc) => sc.id === wf.screenId);
    if (screen && isStyleGuideScreenRow(screen)) return null;
  }

  const onRegenerate =
    item.type === "webframe" ?
      () => {
        const sid = (item as CanvasItem & { screenId: string }).screenId;
        studioActions?.regenerateScreen(sid);
      }
    : undefined;

  const onGenerateAtSize =
    item.type === "webframe" && studioActions?.generateNewScreenAtSize ?
      (preset: DevicePreset) => {
        studioActions.generateNewScreenAtSize({
          width: preset.width,
          height: preset.height,
          deviceType: preset.deviceType,
          label: `${preset.label} (${preset.width}×${preset.height})`,
        });
      }
    : undefined;

  const onLiveEdit =
    item.type === "webframe" && studioActions?.liveEditScreen ?
      () => {
        const sid = (item as CanvasItem & { screenId: string }).screenId;
        studioActions.liveEditScreen(sid);
      }
    : undefined;

  const isLiveEditing = item.type === "webframe" &&
    (item as CanvasItem & { screenId: string }).screenId === studioActions?.liveEditScreenId;

  return createPortal(
    <div
      className="pointer-events-auto fixed z-[200]"
      style={{
        top: Math.max(8, rect.top - 52),
        left: rect.centerX,
        transform: "translateX(-50%)",
      }}
    >
      <CanvasItemToolbar
        item={item}
        onLiveEdit={onLiveEdit}
        isLiveEditing={isLiveEditing}
        liveEditScreenId={isLiveEditing ? studioActions?.liveEditScreenId : undefined}
        onRegenerate={onRegenerate}
        onGenerateAtSize={onGenerateAtSize}
      />
    </div>,
    document.body,
  );
}

export function StudioCanvas() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const contentElRef = useRef<HTMLDivElement | null>(null);

  /**
   * Use CSS `zoom` instead of `transform: scale()` for the canvas scaling.
   * CSS zoom re-rasterizes text/iframes at the display resolution → crisp text
   * at any zoom level. `transform: scale()` rasterizes once then scales the
   * bitmap → blurry text, especially in iframes.
   */
  const customTransform = useCallback(
    (x: number, y: number, scale: number) => {
      if (contentElRef.current) {
        contentElRef.current.style.zoom = String(scale);
      }
      return `translate(${x / scale}px, ${y / scale}px)`;
    },
    [],
  );

  const handleInit = useCallback((ref: ReactZoomPanPinchRef) => {
    contentElRef.current = ref.instance.contentComponent ?? null;
    if (contentElRef.current) {
      contentElRef.current.style.zoom = String(ref.state.scale);
    }
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="ptu-canvas-viewport"
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <TransformWrapper
        initialScale={INITIAL_SCALE}
        minScale={0.1}
        maxScale={8}
        limitToBounds={false}
        wheel={{ step: 0.08 }}
        panning={{ velocityDisabled: false }}
        customTransform={customTransform}
        onInit={handleInit}
      >
        <TransformComponent
          wrapperClass="ptu-canvas-viewport"
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{ width: CANVAS_W, height: CANVAS_H }}
        >
          <CanvasContent wrapperRef={wrapperRef} />
        </TransformComponent>
        <FloatingToolbar wrapperRef={wrapperRef} />
      </TransformWrapper>
    </div>
  );
}
