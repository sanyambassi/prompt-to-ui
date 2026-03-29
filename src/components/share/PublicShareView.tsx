"use client";

import { useCallback, useMemo, useState } from "react";
import { SchemaRenderer } from "@/components/renderer/SchemaRenderer";
import { sortScreensForDisplay } from "@/lib/studio/screen-display-order";
import { cn } from "@/lib/utils";
import type {
  StudioProjectRow,
  StudioPrototypeLinkRow,
  StudioScreenRow,
} from "@/types/studio";

type Props = {
  project: StudioProjectRow;
  screens: StudioScreenRow[];
  prototypeLinks: StudioPrototypeLinkRow[];
};

export function PublicShareView({ project, screens, prototypeLinks }: Props) {
  const sorted = useMemo(() => sortScreensForDisplay(screens), [screens]);
  const [activeId, setActiveId] = useState(sorted[0]?.id ?? null);

  const active = sorted.find((s) => s.id === activeId) ?? sorted[0];

  const onNavigate = useCallback(
    (targetScreenId: string) => {
      if (sorted.some((s) => s.id === targetScreenId)) {
        setActiveId(targetScreenId);
      }
    },
    [sorted],
  );

  if (!active) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        This project has no screens to display.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap gap-2 border-b border-border/40 pb-3">
        {sorted.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveId(s.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              s.id === active.id ?
                "border-[var(--workspace-accent)]/50 bg-[var(--workspace-accent-soft)] text-foreground"
              : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div
        className="border-border/50 bg-background/40 mx-auto w-full max-w-5xl overflow-auto rounded-xl border shadow-sm"
        style={{
          width: Math.min(active.width, 1200),
          minHeight: Math.min(active.height, 900),
          maxWidth: "100%",
        }}
      >
        <SchemaRenderer
          schema={active.ui_schema}
          className="min-h-[480px]"
          prototype={{
            enabled: true,
            screenId: active.id,
            links: prototypeLinks.filter((l) => l.screen_id === active.id),
            onNavigateToScreen: onNavigate,
          }}
        />
      </div>
    </div>
  );
}
