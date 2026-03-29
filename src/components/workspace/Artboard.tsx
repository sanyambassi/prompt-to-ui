"use client";

import { useCallback, useMemo, useRef, useTransition } from "react";
import { SchemaElementEditPopover } from "@/components/workspace/SchemaElementEditPopover";
import { ClickHeatmapOverlay } from "@/components/renderer/ClickHeatmapOverlay";
import { toast } from "sonner";
import { updateStudioScreen } from "@/actions/studio/screens";
import { ArtboardErrorBoundary } from "@/components/renderer/ArtboardErrorBoundary";
import { SchemaRenderer } from "@/components/renderer/SchemaRenderer";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ARTBOARD_DIM_MAX,
  ARTBOARD_DIM_MIN,
  ARTBOARD_QUICK_PREVIEW_PRESETS,
  clampArtboardDimension,
} from "@/lib/studio/artboard-presets";
import { collectClickableHeatmapNodes } from "@/lib/schema/collect-clickable-heatmap-nodes";
import { supportsInlineElementEdit } from "@/lib/schema/element-edit-utils";
import { findUiSchemaNodeById } from "@/lib/schema/find-ui-schema-node";
import { migrateSchemaToLatest } from "@/lib/schema/migrate";
import { isSubstantialUiSchema } from "@/lib/schema/substantial-ui-schema";
import type { StudioScreenRow } from "@/types/studio";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Monitor, Smartphone, Tablet } from "lucide-react";

const PRESET_ICONS: Record<string, typeof Smartphone> = {
  phone: Smartphone,
  ipad: Tablet,
};

type ResizeEdge = "e" | "s" | "se";

type Props = {
  screen: StudioScreenRow;
  zoom: number;
  simplified: boolean;
  onPositionCommit: (id: string) => void;
  /** Persist width/height after a canvas resize drag. */
  onDimensionsCommit?: (id: string) => void;
  /** AI: add a wide desktop companion artboard (runs a generation job). */
  onRequestDesktopVariant?: (screenId: string) => void;
};

export function Artboard({
  screen,
  zoom,
  simplified,
  onPositionCommit,
  onDimensionsCommit,
  onRequestDesktopVariant,
}: Props) {
  const activeScreenId = useEditorStore((s) => s.activeScreenId);
  const prototypeMode = useEditorStore((s) => s.prototypeMode);
  const prototypeLinks = useEditorStore((s) => s.prototypeLinks);
  const heatmapMode = useEditorStore((s) => s.heatmapMode);
  const selectedSchemaNodeId = useEditorStore((s) => s.selectedSchemaNodeId);
  const setActiveScreen = useEditorStore((s) => s.setActiveScreen);
  const setSelectedSchemaNodeId = useEditorStore(
    (s) => s.setSelectedSchemaNodeId,
  );
  const updateScreenLocal = useEditorStore((s) => s.updateScreenLocal);
  const upsertScreen = useEditorStore((s) => s.upsertScreen);

  const [sizePending, startSizeTransition] = useTransition();

  const selected = activeScreenId === screen.id;

  const hasUiContent = useMemo(
    () => isSubstantialUiSchema(screen.ui_schema),
    [screen.ui_schema],
  );

  const heatmapTargets = useMemo(
    () =>
      collectClickableHeatmapNodes(
        screen.ui_schema,
        screen.id,
        prototypeLinks,
      ),
    [prototypeLinks, screen.id, screen.ui_schema],
  );

  /** Open floating text/style editor only for supported leaf nodes. */
  const inlineElementEditorId = useMemo(() => {
    if (!selected || simplified || prototypeMode || !selectedSchemaNodeId) {
      return null;
    }
    const root = migrateSchemaToLatest(screen.ui_schema);
    const n = findUiSchemaNodeById(root, selectedSchemaNodeId);
    if (!n || !supportsInlineElementEdit(n)) return null;
    return selectedSchemaNodeId;
  }, [
    selected,
    simplified,
    prototypeMode,
    selectedSchemaNodeId,
    screen.ui_schema,
  ]);

  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const heatmapContentRef = useRef<HTMLDivElement>(null);

  const applyPresetSize = useCallback(
    (w: number, h: number) => {
      const cw = clampArtboardDimension(w);
      const ch = clampArtboardDimension(h);
      if (cw !== Math.round(w) || ch !== Math.round(h)) {
        toast.error(`Use ${ARTBOARD_DIM_MIN}–${ARTBOARD_DIM_MAX}px per side`);
        return;
      }
      if (cw === screen.width && ch === screen.height) return;
      startSizeTransition(() => {
        updateStudioScreen(screen.id, { width: cw, height: ch }).then((r) => {
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          upsertScreen(r.data);
          toast.success(`Preview frame ${cw}×${ch}px`);
        });
      });
    },
    [screen.height, screen.id, screen.width, upsertScreen],
  );


  const drag = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const onTitlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      setActiveScreen(screen.id);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const sc = useEditorStore.getState().screens.find((s) => s.id === screen.id);
      if (!sc) return;
      drag.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: sc.canvas_x,
        origY: sc.canvas_y,
      };
    },
    [screen.id, setActiveScreen],
  );

  const onTitlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dx = (e.clientX - d.startClientX) / zoom;
      const dy = (e.clientY - d.startClientY) / zoom;
      updateScreenLocal(screen.id, {
        canvas_x: d.origX + dx,
        canvas_y: d.origY + dy,
      });
    },
    [screen.id, updateScreenLocal, zoom],
  );

  const endTitleDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      onPositionCommit(screen.id);
    },
    [onPositionCommit, screen.id],
  );

  const resize = useRef<{
    pointerId: number;
    edge: ResizeEdge;
    startClientX: number;
    startClientY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const beginResize = useCallback(
    (edge: ResizeEdge) => (e: React.PointerEvent) => {
      if (e.button !== 0 || !onDimensionsCommit) return;
      e.stopPropagation();
      e.preventDefault();
      setActiveScreen(screen.id);
      const sc = useEditorStore.getState().screens.find((s) => s.id === screen.id);
      if (!sc) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      resize.current = {
        pointerId: e.pointerId,
        edge,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origW: sc.width,
        origH: sc.height,
      };
    },
    [onDimensionsCommit, screen.id, setActiveScreen],
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const r = resize.current;
      if (!r || e.pointerId !== r.pointerId) return;
      const dx = (e.clientX - r.startClientX) / zoom;
      const dy = (e.clientY - r.startClientY) / zoom;
      let w = r.origW;
      let h = r.origH;
      if (r.edge === "e" || r.edge === "se") w = r.origW + dx;
      if (r.edge === "s" || r.edge === "se") h = r.origH + dy;
      updateScreenLocal(screen.id, {
        width: clampArtboardDimension(w),
        height: clampArtboardDimension(h),
      });
    },
    [screen.id, updateScreenLocal, zoom],
  );

  const endResize = useCallback(
    (e: React.PointerEvent) => {
      const r = resize.current;
      if (!r || e.pointerId !== r.pointerId) return;
      resize.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      onDimensionsCommit?.(screen.id);
    },
    [onDimensionsCommit, screen.id],
  );

  const onBodyPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 0) setActiveScreen(screen.id);
    },
    [screen.id, setActiveScreen],
  );

  const showResizeHandles = selected && !!onDimensionsCommit;
  const isPhone = screen.width <= 500;

  return (
    <div
      className="pointer-events-auto absolute z-20"
      style={{
        left: screen.canvas_x,
        top: screen.canvas_y,
        width: screen.width,
      }}
    >
      {/* Floating label above the screen */}
      <div
        className={cn(
          "mb-2 flex cursor-grab items-center gap-2 active:cursor-grabbing",
        )}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={endTitleDrag}
        onPointerCancel={endTitleDrag}
      >
        <span className="flex items-center gap-1.5">
          {isPhone ? (
            <Smartphone className="size-3 text-white/60" />
          ) : (
            <Monitor className="size-3 text-white/60" />
          )}
          <span className="max-w-[200px] truncate text-xs font-medium text-white/70">
            {screen.name}
          </span>
        </span>
        <span className="font-mono text-[0.6rem] text-white/55">
          {screen.width}×{screen.height}
        </span>
      </div>

      {/* The screen frame */}
      <div
        className={cn(
          "relative overflow-hidden bg-white shadow-2xl shadow-black/60 transition-shadow duration-200",
          isPhone ? "rounded-[2rem]" : "rounded-lg",
          selected
            ? "ring-2 ring-[var(--workspace-accent)] shadow-[0_8px_60px_rgba(120,80,255,0.25)]"
            : "ring-1 ring-white/10 hover:ring-white/20",
        )}
        style={{ height: screen.height }}
        onPointerDown={onBodyPointerDown}
      >
        {/* Phone notch */}
        {isPhone && (
          <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2">
            <div className="h-[30px] w-[120px] rounded-b-2xl bg-black" />
          </div>
        )}

        <div
          ref={scrollBodyRef}
          className="relative h-full w-full overflow-auto"
        >
          {simplified ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-white/5 p-6 text-center">
              <span className="text-xs font-medium text-white/70">
                {screen.name}
              </span>
              <span className="text-[0.6rem] text-white/55">Zoom to preview</span>
            </div>
          ) : (
            <div ref={heatmapContentRef} className="relative min-h-full bg-white">
              <ArtboardErrorBoundary schemaHint={screen.ui_schema}>
                <SchemaRenderer
                  schema={screen.ui_schema}
                  className="min-h-full"
                  selection={
                    selected ?
                      {
                        enabled: true,
                        selectedNodeId: selectedSchemaNodeId,
                        onSelectNode: setSelectedSchemaNodeId,
                      }
                    : undefined
                  }
                  prototype={
                    prototypeMode ?
                      {
                        enabled: true,
                        screenId: screen.id,
                        links: prototypeLinks,
                        onNavigateToScreen: setActiveScreen,
                      }
                    : undefined
                  }
                />
              </ArtboardErrorBoundary>
              <ClickHeatmapOverlay
                enabled={heatmapMode && heatmapTargets.length > 0}
                targets={heatmapTargets}
                scrollRef={scrollBodyRef}
                contentRef={heatmapContentRef}
              />
              {inlineElementEditorId ?
                <SchemaElementEditPopover
                  key={inlineElementEditorId}
                  screen={screen}
                  selectedNodeId={inlineElementEditorId}
                  scrollContainerRef={scrollBodyRef}
                  editEnabled={!prototypeMode}
                />
              : null}
            </div>
          )}
        </div>
      </div>

      {/* Resize handles (only when selected) */}
      {showResizeHandles && (
        <>
          <div
            className="absolute right-0 top-8 bottom-0 z-[38] w-2 cursor-ew-resize touch-none hover:bg-[var(--workspace-accent)]/20"
            style={{ top: "2rem", bottom: 0 }}
            onPointerDown={beginResize("e")}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
          <div
            className="absolute bottom-0 left-0 right-2 z-[38] h-2 cursor-ns-resize touch-none hover:bg-[var(--workspace-accent)]/20"
            onPointerDown={beginResize("s")}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
          <div
            className="absolute bottom-0 right-0 z-[39] size-3 cursor-nwse-resize touch-none rounded-tl-sm bg-[var(--workspace-accent)]/60 hover:bg-[var(--workspace-accent)]"
            onPointerDown={beginResize("se")}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
        </>
      )}

      {/* Quick preset buttons below the screen (only when selected) */}
      {selected && !simplified && (
        <div
          className="mt-2 flex items-center justify-center gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {ARTBOARD_QUICK_PREVIEW_PRESETS.map((p) => {
            const Icon = PRESET_ICONS[p.key] ?? Smartphone;
            const active = screen.width === p.w && screen.height === p.h;
            return (
              <Tooltip key={p.key}>
                <TooltipTrigger
                  delay={300}
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={sizePending}
                      className={cn(
                        "size-7 rounded-full",
                        active
                          ? "bg-[var(--workspace-accent)] text-white"
                          : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white/90",
                      )}
                      aria-label={`${p.label} frame ${p.w}×${p.h}`}
                      aria-pressed={active}
                      onClick={() => applyPresetSize(p.w, p.h)}
                    >
                      <Icon className="size-3" />
                    </Button>
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  {p.label} ({p.w}×{p.h})
                </TooltipContent>
              </Tooltip>
            );
          })}
          {onRequestDesktopVariant && (
            <Tooltip>
              <TooltipTrigger
                delay={300}
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white/90"
                    disabled={!hasUiContent || sizePending}
                    aria-label="Generate desktop artboard with AI"
                    onClick={() => onRequestDesktopVariant(screen.id)}
                  >
                    <Monitor className="size-3" />
                  </Button>
                }
              />
              <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                {hasUiContent
                  ? "Generate a desktop companion"
                  : "Add UI first, then generate desktop"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
