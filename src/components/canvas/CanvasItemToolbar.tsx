"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  Code,
  Download,
  ExternalLink,
  FileCode,
  Monitor,
  Pencil,
  RefreshCw,
  Smartphone,
  Tablet,
  Trash2,
  Wand2,
} from "lucide-react";
import { LiveEditToolbar } from "@/components/canvas/LiveEditToolbar";
import { useCanvasItemsStore, type CanvasItem } from "@/store/canvas-items";
import { useEditorStore } from "@/store/editor";
import { updateStudioScreen, deleteStudioScreen } from "@/actions/studio/screens";
import { buildStaticExportBundle } from "@/lib/schema/export-static-bundle";
import type { UISchema } from "@/lib/schema/types";

export type DevicePreset = {
  key: string;
  label: string;
  icon: typeof Monitor;
  width: number;
  height: number;
  deviceType: "phone" | "tablet" | "desktop";
};

const DEVICE_PRESETS: DevicePreset[] = [
  { key: "iphone", label: "Mobile", icon: Smartphone, width: 390, height: 844, deviceType: "phone" },
  { key: "tablet", label: "Tablet", icon: Tablet, width: 768, height: 1024, deviceType: "tablet" },
  { key: "desktop", label: "Desktop", icon: Monitor, width: 1280, height: 800, deviceType: "desktop" },
  { key: "wide", label: "Wide", icon: Monitor, width: 1920, height: 1080, deviceType: "desktop" },
];

type DropdownId = "generate" | "preview" | "more" | null;

type Props = {
  item: CanvasItem;
  onLiveEdit?: () => void;
  isLiveEditing?: boolean;
  /** When live-editing, the screenId of the screen being edited. */
  liveEditScreenId?: string | null;
  onRegenerate?: () => void;
  /** Generate → frame size: new LLM run on a new artboard at this size (not a simple resize). */
  onGenerateAtSize?: (preset: DevicePreset) => void;
};

export function CanvasItemToolbar({
  item,
  onLiveEdit,
  isLiveEditing,
  liveEditScreenId,
  onRegenerate,
  onGenerateAtSize,
}: Props) {
  const [openMenu, setOpenMenu] = useState<DropdownId>(null);

  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const toggleMenu = useCallback(
    (id: DropdownId) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setOpenMenu((prev) => (prev === id ? null : id));
    },
    [],
  );

  const isWebframe = item.type === "webframe";
  const screenId = isWebframe ? (item as CanvasItem & { screenId: string }).screenId : null;

  const handleResize = useCallback(
    async (preset: DevicePreset) => {
      closeMenu();
      if (!screenId) return;
      const prevScreen = useEditorStore.getState().screens.find((s) => s.id === screenId);
      const prevItem = useCanvasItemsStore.getState().items.find((i) => i.id === item.id);
      useCanvasItemsStore.getState().updateItem(item.id, {
        width: preset.width,
        height: preset.height,
        deviceType: preset.deviceType,
      } as Partial<CanvasItem>);
      useEditorStore.getState().updateScreenLocal(screenId, {
        width: preset.width,
        height: preset.height,
      });
      const res = await updateStudioScreen(screenId, {
        width: preset.width,
        height: preset.height,
      });
      if (!res.ok) {
        if (prevItem) useCanvasItemsStore.getState().updateItem(item.id, { width: prevItem.width, height: prevItem.height } as Partial<CanvasItem>);
        if (prevScreen) useEditorStore.getState().updateScreenLocal(screenId, { width: prevScreen.width, height: prevScreen.height });
        toast.error(res.error ?? "Resize failed");
        return;
      }
      toast.success(`Resized to ${preset.label} (${preset.width}×${preset.height})`);
    },
    [item.id, screenId, closeMenu],
  );

  const handleExportHtml = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      closeMenu();
      if (!screenId) return;
      const screen = useEditorStore.getState().screens.find((sc) => sc.id === screenId);
      if (!screen?.ui_schema) { toast.error("No content to export"); return; }
      const bundle = buildStaticExportBundle(screen.ui_schema as UISchema, {
        title: screen.name || "Screen",
        screenWidth: screen.width,
        screenHeight: screen.height,
      });
      const blob = new Blob([bundle.html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(screen.name || "screen").replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("HTML exported");
    },
    [screenId, closeMenu],
  );

  const handleExportJson = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      closeMenu();
      if (!screenId) return;
      const screen = useEditorStore.getState().screens.find((sc) => sc.id === screenId);
      if (!screen?.ui_schema) { toast.error("No content to export"); return; }
      const blob = new Blob([JSON.stringify(screen.ui_schema, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(screen.name || "screen").replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON exported");
    },
    [screenId, closeMenu],
  );

  const handleDownloadImage = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      closeMenu();
      if (item.type !== "image") return;
      const imgItem = item as CanvasItem & { imageUrl: string; prompt: string };
      if (!imgItem.imageUrl) return;
      try {
        const res = await fetch(imgItem.imageUrl);
        const blob = await res.blob();
        const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
        const name = (imgItem.prompt || "image").replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Image saved");
      } catch {
        toast.error("Failed to save image");
      }
    },
    [item, closeMenu],
  );

  const handlePreviewNewTab = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      closeMenu();
      if (!screenId) return;
      const screen = useEditorStore.getState().screens.find((sc) => sc.id === screenId);
      if (!screen?.ui_schema) { toast.error("No content to preview"); return; }
      const bundle = buildStaticExportBundle(screen.ui_schema as UISchema, {
        title: screen.name || "Preview",
        screenWidth: screen.width,
        screenHeight: screen.height,
      });
      const blob = new Blob([bundle.html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    [screenId, closeMenu],
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      closeMenu();
      useCanvasItemsStore.getState().removeItem(item.id);
      useCanvasItemsStore.getState().selectItem(null);
      if (screenId) {
        useEditorStore.getState().removeScreen(screenId);
        const res = await deleteStudioScreen(screenId);
        if (!res.ok) toast.error(res.error ?? "Failed to delete screen");
        else toast.success("Screen deleted");
      } else {
        toast.success("Removed from canvas");
      }
    },
    [item.id, screenId, closeMenu],
  );

  const btnBase =
    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors";
  const btnDefault = `${btnBase} text-zinc-700 hover:bg-zinc-100`;
  const btnActive = `${btnBase} bg-zinc-100 text-zinc-900`;

  if (isLiveEditing && liveEditScreenId) {
    return (
      <LiveEditToolbar
        screenId={liveEditScreenId}
        onDone={() => onLiveEdit?.()}
      />
    );
  }

  return (
    <>
      {openMenu && (
        <div
          className="fixed inset-0 z-[99]"
          onClick={closeMenu}
          onPointerDown={(e) => e.stopPropagation()}
        />
      )}

      <div
        className="flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-white px-1 py-0.5 shadow-2xl shadow-zinc-300/60 backdrop-blur-2xl max-w-[calc(100vw-16px)] overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Generate */}
        {isWebframe && (
          <div className="relative">
            <button
              type="button"
              onClick={toggleMenu("generate")}
              className={openMenu === "generate" ? btnActive : btnDefault}
            >
              <Wand2 className="size-3.5" />
              Generate
              <ChevronDown className="size-3 opacity-50" />
            </button>
            {openMenu === "generate" && (
              <div className="absolute left-0 top-full z-[100] mt-1.5 min-w-[13.5rem] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl backdrop-blur-2xl">
                <ToolbarMenuItem
                  icon={<RefreshCw className="size-3.5" />}
                  label="Regenerate"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeMenu();
                    onRegenerate?.();
                  }}
                />
                <div className="my-1 border-t border-zinc-100" />
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  New screen at size
                </p>
                {DEVICE_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <ToolbarMenuItem
                      key={preset.key}
                      icon={<Icon className="size-3.5" />}
                      label={`${preset.label} (${preset.width}×${preset.height})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeMenu();
                        onGenerateAtSize?.(preset);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Live edit (webframe only) */}
        {isWebframe && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLiveEdit?.();
            }}
            className={isLiveEditing ? `${btnBase} bg-green-100 text-green-700` : btnDefault}
          >
            <Pencil className="size-3.5" />
            {isLiveEditing ? "Editing" : "Edit"}
          </button>
        )}

        {/* Preview */}
        <div className="relative">
          <button
            type="button"
            onClick={toggleMenu("preview")}
            className={openMenu === "preview" ? btnActive : btnDefault}
          >
            <ExternalLink className="size-3.5" />
            Preview
            <ChevronDown className="size-3 opacity-50" />
          </button>
          {openMenu === "preview" && (
            <div className="absolute left-0 top-full z-[100] mt-1.5 w-52 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl backdrop-blur-2xl">
              {isWebframe && (
                <ToolbarMenuItem
                  icon={<ExternalLink className="size-3.5" />}
                  label="Open in new tab"
                  onClick={handlePreviewNewTab}
                />
              )}
              {isWebframe && (
                <>
                  <div className="my-1 border-t border-zinc-200" />
                  {DEVICE_PRESETS.map((p) => {
                    const Icon = p.icon;
                    const isActive = item.width === p.width && item.height === p.height;
                    return (
                      <ToolbarMenuItem
                        key={p.key}
                        icon={<Icon className="size-3.5" />}
                        label={p.label}
                        suffix={`${p.width}×${p.height}`}
                        active={isActive}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleResize(p);
                        }}
                      />
                    );
                  })}
                </>
              )}
              {item.type === "image" && (
                <ToolbarMenuItem
                  icon={<ExternalLink className="size-3.5" />}
                  label="Open image"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeMenu();
                    const imgItem = item as CanvasItem & { imageUrl: string };
                    if (imgItem.imageUrl) window.open(imgItem.imageUrl, "_blank");
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* More */}
        <div className="relative">
          <button
            type="button"
            onClick={toggleMenu("more")}
            className={openMenu === "more" ? btnActive : btnDefault}
          >
            More
            <ChevronDown className="size-3 opacity-50" />
          </button>
          {openMenu === "more" && (
            <div className="absolute right-0 top-full z-[100] mt-1.5 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl backdrop-blur-2xl">
              {isWebframe && (
                <>
                  <ToolbarMenuItem
                    icon={<Code className="size-3.5" />}
                    label="View code"
                    onClick={handleExportJson}
                  />
                  <ToolbarMenuItem
                    icon={<FileCode className="size-3.5" />}
                    label="Export HTML"
                    onClick={handleExportHtml}
                  />
                </>
              )}
              <ToolbarMenuItem
                icon={<Download className="size-3.5" />}
                label="Download"
                onClick={item.type === "image" ? handleDownloadImage : handleExportHtml}
              />
              <div className="my-1 border-t border-zinc-200" />
              <ToolbarMenuItem
                icon={<Trash2 className="size-3.5" />}
                label="Delete"
                danger
                onClick={handleDelete}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ToolbarMenuItem({
  icon,
  label,
  suffix,
  active,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  suffix?: string;
  active?: boolean;
  danger?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors ${
        danger
          ? "text-red-400 hover:bg-red-500/10"
          : active
            ? "bg-violet-500/15 text-violet-300"
            : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {suffix && <span className="text-[11px] text-zinc-400">{suffix}</span>}
    </button>
  );
}
