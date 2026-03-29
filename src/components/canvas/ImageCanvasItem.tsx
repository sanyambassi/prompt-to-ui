"use client";

import { useCallback } from "react";
import { ImageIcon } from "lucide-react";
import type { CanvasItem, ImageCanvasItemData } from "@/store/canvas-items";
import { useCanvasItemsStore } from "@/store/canvas-items";

type ImageItem = CanvasItem & ImageCanvasItemData;

type Props = {
  item: ImageItem;
  onDragStart: (id: string, clientX: number, clientY: number) => void;
};

export function ImageCanvasItem({ item, onDragStart }: Props) {
  const isSelected = useCanvasItemsStore((s) => s.selectedItemId === item.id);
  const selectItem = useCanvasItemsStore((s) => s.selectItem);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      selectItem(item.id);
      onDragStart(item.id, e.clientX, e.clientY);
    },
    [item.id, onDragStart, selectItem],
  );

  return (
    <div
      className="absolute cursor-grab select-none active:cursor-grabbing"
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
      }}
      onPointerDown={handlePointerDown}
    >
      {/* Selection outline */}
      <div
        className="pointer-events-none absolute inset-0 z-20 transition-all"
        style={{
          borderRadius: 24,
          border: isSelected ? "2px solid #6366f1" : "1px solid rgba(0,0,0,0.12)",
          boxShadow: isSelected
            ? "0 0 0 1px #6366f1, 0 25px 50px -12px rgba(0,0,0,0.5)"
            : "0 25px 50px -12px rgba(0,0,0,0.5)",
        }}
      />

      {/* Label above frame */}
      <div
        className="pointer-events-none absolute flex items-center gap-1.5"
        style={{ bottom: "100%", left: 0, marginBottom: 6 }}
      >
        <ImageIcon className="size-3 text-zinc-500" />
        <span className="truncate text-[11px] font-medium text-zinc-600" style={{ maxWidth: item.width - 24 }}>
          {item.prompt || "Image"}
        </span>
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
        className="overflow-hidden"
        style={{
          borderRadius: 24,
          background: "rgb(24 24 27 / 0.95)",
          height: "100%",
        }}
      >
        {item.loading ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-900 to-zinc-800">
            <div className="size-10 animate-spin rounded-full border-[3px] border-white/10 border-t-white/60" />
            <span className="text-xs text-zinc-300">Generating...</span>
          </div>
        ) : item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.prompt}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-100 px-4 text-center">
            <div className="text-2xl">🖼</div>
            <p className="text-xs leading-relaxed text-zinc-300">
              {item.prompt || "No image"}
            </p>
          </div>
        )}

        {item.prompt && !item.loading && (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 truncate px-3 pb-2.5 pt-6 text-[11px] text-white/90"
            style={{
              background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
              borderRadius: "0 0 24px 24px",
            }}
          >
            {item.prompt}
          </div>
        )}
      </div>
    </div>
  );
}
