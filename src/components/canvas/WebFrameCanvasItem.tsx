"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { CanvasItem, WebFrameCanvasItemData } from "@/store/canvas-items";
import { useCanvasItemsStore } from "@/store/canvas-items";
import { SchemaRenderer } from "@/components/renderer/SchemaRenderer";
import { migrateSchemaToLatest } from "@/lib/schema/migrate";
import type { UISchema } from "@/lib/schema/types";
import { useEditorStore } from "@/store/editor";
import { useGenerationLog } from "@/store/generation-log";
import { updateStudioScreen } from "@/actions/studio/screens";

type WebFrameItem = CanvasItem & WebFrameCanvasItemData;

type Props = {
  item: WebFrameItem;
  onDragStart: (id: string, clientX: number, clientY: number) => void;
  editable?: boolean;
};

const BROWSER_BAR_H = 36;

function BrowserChrome({ w }: { w: number }) {
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3"
      style={{ height: BROWSER_BAR_H, width: w, background: "#2a2a2e" }}
    >
      <div className="flex gap-1">
        <div className="size-[14px] rounded-sm bg-white/[0.08]" />
        <div className="size-[14px] rounded-sm bg-white/[0.08]" />
      </div>
      <div className="h-[22px] flex-1 rounded-md bg-white/[0.06]" />
    </div>
  );
}



function isEmptySchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return true;
  const s = schema as Record<string, unknown>;
  if (s.type === "html_document") {
    const html = (s.props as Record<string, unknown> | undefined)?.html;
    return typeof html !== "string" || html.trim().length < 20;
  }
  const children = s.children;
  return !Array.isArray(children) || children.length === 0;
}

function ScreenContent({ screenId, editable, interactive }: { screenId: string; editable?: boolean; interactive?: boolean }) {
  const screen = useEditorStore((s) =>
    s.screens.find((sc) => sc.id === screenId),
  );
  const isBeingGenerated = useGenerationLog(
    (s) => s.isGenerating && s.generatingScreenId === screenId,
  );

  if (!screen) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400 text-xs">
        Screen removed
      </div>
    );
  }

  if (!screen.ui_schema || isEmptySchema(screen.ui_schema)) {
    return <GeneratingPlaceholder />;
  }

  const migrated = migrateSchemaToLatest(screen.ui_schema) as UISchema;

  return (
    <div
      className="relative h-full w-full overflow-y-auto"
      style={{ background: "#ffffff" }}
      {...(editable ? { "data-live-edit-screen": screenId } : {})}
    >
      <SchemaRenderer schema={migrated} editable={editable} interactive={interactive} />
      {isBeingGenerated && <RefineOverlay />}
    </div>
  );
}

function RefineOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 2s ease-in-out infinite",
        }}
      />
      <div className="absolute inset-x-0 bottom-4 flex items-center justify-center">
        <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur-md">
          <div className="size-3.5 animate-spin rounded-full border-[1.5px] border-violet-200 border-t-violet-500" />
          <span className="text-[10px] font-medium tracking-wide text-zinc-500">UPDATING</span>
        </div>
      </div>
    </div>
  );
}

function GeneratingPlaceholder() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#fafafa]">
      {/* Shimmer overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.6) 50%, transparent 70%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 2s ease-in-out infinite",
        }}
      />

      {/* Nav bar skeleton */}
      <div className="flex items-center justify-between px-[6%] py-[3%]">
        <div className="h-[8px] w-[18%] rounded-full bg-zinc-200" style={{ animation: "fadeSlideUp 0.6s ease both" }} />
        <div className="flex gap-[4%]">
          <div className="size-[10px] rounded-full bg-zinc-200" style={{ animation: "fadeSlideUp 0.6s ease 0.1s both" }} />
          <div className="size-[10px] rounded-full bg-zinc-200" style={{ animation: "fadeSlideUp 0.6s ease 0.15s both" }} />
        </div>
      </div>

      {/* Hero block */}
      <div className="mx-[6%] mt-[4%] rounded-xl bg-zinc-100 p-[5%]" style={{ animation: "fadeSlideUp 0.6s ease 0.2s both" }}>
        <div className="h-[10px] w-[60%] rounded-full bg-zinc-200" />
        <div className="mt-[6%] h-[8px] w-[80%] rounded-full bg-zinc-200/70" />
        <div className="mt-[4%] h-[8px] w-[50%] rounded-full bg-zinc-200/70" />
        <div className="mt-[8%] h-[28px] w-[35%] rounded-lg bg-violet-100" />
      </div>

      {/* Card grid */}
      <div className="mx-[6%] mt-[5%] grid grid-cols-2 gap-[4%]">
        {[0.35, 0.45, 0.55, 0.65].map((delay, i) => (
          <div key={i} className="rounded-lg bg-zinc-100 p-[8%]" style={{ animation: `fadeSlideUp 0.5s ease ${delay}s both` }}>
            <div className="aspect-[4/3] rounded-md bg-zinc-200/60" />
            <div className="mt-[10%] h-[6px] w-[70%] rounded-full bg-zinc-200" />
            <div className="mt-[8%] h-[6px] w-[45%] rounded-full bg-zinc-200/60" />
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="absolute inset-x-0 bottom-0 flex justify-around px-[6%] py-[3%]" style={{ animation: "fadeSlideUp 0.5s ease 0.7s both" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-[4px]">
            <div className="size-[10px] rounded-full bg-zinc-200" />
            <div className="h-[4px] w-[24px] rounded-full bg-zinc-200/60" />
          </div>
        ))}
      </div>

      {/* Generating label */}
      <div className="absolute inset-x-0 bottom-[15%] flex flex-col items-center gap-2">
        <div className="size-5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-500" />
        <span className="text-[10px] font-medium tracking-wide text-zinc-400">GENERATING</span>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes genPulse {
          0%, 100% { box-shadow: 0 0 0 1px #8b5cf6, 0 0 12px rgba(139,92,246,0.25), 0 25px 50px -12px rgba(0,0,0,0.5); }
          50% { box-shadow: 0 0 0 2px #8b5cf6, 0 0 28px rgba(139,92,246,0.45), 0 25px 50px -12px rgba(0,0,0,0.5); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export function WebFrameCanvasItem({ item, onDragStart, editable }: Props) {
  const isPhone = item.deviceType === "phone";
  const chromeH = isPhone ? 0 : BROWSER_BAR_H;
  const isSelected = useCanvasItemsStore((s) => s.selectedItemId === item.id);
  const selectItem = useCanvasItemsStore((s) => s.selectItem);

  const screen = useEditorStore((s) => s.screens.find((sc) => sc.id === item.screenId));
  const screenName = screen?.name || "Screen";
  const isBeingGenerated = useGenerationLog(
    (s) => s.isGenerating && s.generatingScreenId === item.screenId,
  );

  const setActiveScreen = useEditorStore((s) => s.setActiveScreen);
  const updateScreenLocal = useEditorStore((s) => s.updateScreenLocal);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameValueRef = useRef(renameValue);
  renameValueRef.current = renameValue;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      if (editable) return;
      e.preventDefault();
      selectItem(item.id);
      setActiveScreen(item.screenId);
      onDragStart(item.id, e.clientX, e.clientY);
    },
    [item.id, item.screenId, onDragStart, selectItem, setActiveScreen, editable],
  );

  const handleLabelClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isSelected) {
        setRenameValue(screenName);
        setIsRenaming(true);
        requestAnimationFrame(() => renameInputRef.current?.select());
      } else {
        selectItem(item.id);
        setActiveScreen(item.screenId);
      }
    },
    [item.id, item.screenId, selectItem, setActiveScreen, isSelected, screenName],
  );

  const commitRename = useCallback(() => {
    if (!isRenaming) return;
    const trimmed = renameValueRef.current.trim();
    setIsRenaming(false);
    if (!trimmed || trimmed === screenName) return;
    updateScreenLocal(item.screenId, { name: trimmed });
    void updateStudioScreen(item.screenId, { name: trimmed });
  }, [isRenaming, screenName, item.screenId, updateScreenLocal]);

  useEffect(() => {
    if (isRenaming && !isSelected) {
      commitRename();
    }
  }, [isSelected, isRenaming, commitRename]);

  return (
    <div
      className={`absolute flex flex-col ${editable ? "cursor-default select-auto" : "cursor-grab select-none active:cursor-grabbing"}`}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height + chromeH,
      }}
      onPointerDown={handlePointerDown}
    >
      {/* Selection outline — pulses when generating */}
      <div
        className="pointer-events-none absolute inset-0 z-20 transition-all"
        style={{
          borderRadius: isPhone ? 44 : 16,
          border: editable
            ? "2px solid #22c55e"
            : isBeingGenerated
              ? "2px solid #8b5cf6"
              : isSelected
                ? "2px solid #6366f1"
                : "1px solid rgba(0,0,0,0.12)",
          boxShadow: editable
            ? "0 0 0 1px #22c55e, 0 0 24px rgba(34,197,94,0.15), 0 25px 50px -12px rgba(0,0,0,0.5)"
            : isBeingGenerated
              ? "0 0 0 1px #8b5cf6, 0 25px 50px -12px rgba(0,0,0,0.5)"
              : isSelected
                ? "0 0 0 1px #6366f1, 0 25px 50px -12px rgba(0,0,0,0.5)"
                : "0 25px 50px -12px rgba(0,0,0,0.5)",
          ...(isBeingGenerated
            ? { animation: "genPulse 2s ease-in-out infinite" }
            : {}),
        }}
      />

      {/* Screen label above frame — click to select, click again to rename */}
      <div
        className="absolute z-[201] flex cursor-pointer items-center gap-2"
        style={{ bottom: "100%", left: 0, marginBottom: 8 }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleLabelClick}
      >
        <DeviceIcon type={item.deviceType} />
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="rounded border border-indigo-300 bg-white px-1.5 py-0.5 text-lg font-semibold text-zinc-800 outline-none focus:ring-2 focus:ring-indigo-400 dark:border-indigo-500 dark:bg-zinc-800 dark:text-zinc-100"
            style={{ maxWidth: item.width - 28, minWidth: 80 }}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setIsRenaming(false);
            }}
          />
        ) : (
          <span className="truncate text-lg font-semibold text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100" style={{ maxWidth: item.width - 28 }}>
            {screenName}
          </span>
        )}
      </div>

      {/* Dimensions badge (visible when selected) */}
      {isSelected && (
        <div
          className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center rounded-md bg-indigo-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow"
          style={{ top: "100%", marginTop: 6 }}
        >
          {item.width} x {item.height}
        </div>
      )}

      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          borderRadius: isPhone ? 44 : 16,
          background: isPhone ? "#000" : "rgb(24 24 27 / 0.95)",
          height: "100%",
        }}
      >
        {!isPhone && <BrowserChrome w={item.width} />}
        <div className="min-h-0 flex-1 overflow-auto">
          <ScreenContent screenId={item.screenId} editable={editable} interactive />
        </div>
      </div>
    </div>
  );
}

function DeviceIcon({ type }: { type: "phone" | "tablet" | "desktop" }) {
  const Icon = type === "phone" ? Smartphone : type === "tablet" ? Tablet : Monitor;
  return <Icon className="size-3 text-zinc-500 dark:text-zinc-400" />;
}
