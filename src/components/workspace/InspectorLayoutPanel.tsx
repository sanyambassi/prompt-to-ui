"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateStudioScreen } from "@/actions/studio/screens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ARTBOARD_DIM_MAX,
  ARTBOARD_DIM_MIN,
  ARTBOARD_SIZE_PRESETS,
  clampArtboardDimension,
} from "@/lib/studio/artboard-presets";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { LayoutGrid } from "lucide-react";

type FieldsProps = {
  width: number;
  height: number;
  pending: boolean;
  onCommit: (w: number, h: number) => void;
};

/** Remount via `key` when server dimensions change — avoids sync effects. */
function LayoutDimensionFields({
  width,
  height,
  pending,
  onCommit,
}: FieldsProps) {
  const [wDraft, setWDraft] = useState(() => String(width));
  const [hDraft, setHDraft] = useState(() => String(height));

  const apply = useCallback(() => {
    onCommit(parseInt(wDraft, 10), parseInt(hDraft, 10));
  }, [hDraft, onCommit, wDraft]);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-[0.65rem] font-semibold tracking-wider uppercase">
        Custom size
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="artboard-w" className="text-xs">
            Width (px)
          </Label>
          <Input
            id="artboard-w"
            inputMode="numeric"
            value={wDraft}
            onChange={(e) => setWDraft(e.target.value.replace(/\D/g, ""))}
            onBlur={apply}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
            className="font-mono text-sm tabular-nums"
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="artboard-h" className="text-xs">
            Height (px)
          </Label>
          <Input
            id="artboard-h"
            inputMode="numeric"
            value={hDraft}
            onChange={(e) => setHDraft(e.target.value.replace(/\D/g, ""))}
            onBlur={apply}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
            className="font-mono text-sm tabular-nums"
            disabled={pending}
          />
        </div>
      </div>
      <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
        Changes save on blur or Enter. Range {ARTBOARD_DIM_MIN}–
        {ARTBOARD_DIM_MAX}px. On the canvas, select a screen and drag the
        right, bottom, or corner resize handles.
      </p>
    </div>
  );
}

export function InspectorLayoutPanel() {
  const screens = useEditorStore((s) => s.screens);
  const activeScreenId = useEditorStore((s) => s.activeScreenId);
  const upsertScreen = useEditorStore((s) => s.upsertScreen);

  const screen =
    activeScreenId ?
      screens.find((x) => x.id === activeScreenId)
    : undefined;

  const [pending, startTransition] = useTransition();

  const commitDimensions = useCallback(
    (w: number, h: number) => {
      const id = activeScreenId;
      if (!id) return;
      const s = useEditorStore.getState().screens.find((x) => x.id === id);
      if (!s) return;
      const cw = clampArtboardDimension(w);
      const ch = clampArtboardDimension(h);
      if (cw !== Math.round(w) || ch !== Math.round(h)) {
        toast.error(`Use ${ARTBOARD_DIM_MIN}–${ARTBOARD_DIM_MAX}px per side`);
        return;
      }
      if (cw === s.width && ch === s.height) return;

      startTransition(async () => {
        const r = await updateStudioScreen(id, { width: cw, height: ch });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        upsertScreen(r.data);
        toast.success("Artboard size updated");
      });
    },
    [activeScreenId, upsertScreen],
  );

  if (!screen) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-8 text-center text-sm">
        <LayoutGrid
          className="text-[var(--workspace-accent)]/50 size-10"
          strokeWidth={1.25}
        />
        <p className="max-w-[220px] leading-relaxed">
          Select a screen in the left panel to edit its artboard size.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-muted-foreground text-[0.65rem] font-semibold tracking-wider uppercase">
          Presets
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ARTBOARD_SIZE_PRESETS.map((p) => (
            <Button
              key={p.key}
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              className={cn(
                "h-8 rounded-full border-border/60 text-xs font-medium",
                screen.width === p.w && screen.height === p.h &&
                  "border-[var(--workspace-accent)] bg-[var(--workspace-accent-soft)] text-[var(--workspace-accent)]",
              )}
              onClick={() => commitDimensions(p.w, p.h)}
            >
              {p.label}
              <span className="text-muted-foreground ml-1 font-normal tabular-nums">
                {p.w}×{p.h}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <LayoutDimensionFields
        key={`${screen.id}-${screen.width}-${screen.height}`}
        width={screen.width}
        height={screen.height}
        pending={pending}
        onCommit={commitDimensions}
      />
    </div>
  );
}
