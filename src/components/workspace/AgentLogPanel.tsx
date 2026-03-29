"use client";

import { useEffect, useRef, useState } from "react";
import { useGenerationLog, type AgentLogEntry } from "@/store/generation-log";
import { cn } from "@/lib/utils";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Monitor,
  Palette,
  AlertTriangle,
  Sparkles,
  XCircle,
} from "lucide-react";

function EntryIcon({ entry }: { entry: AgentLogEntry }) {
  switch (entry.type) {
    case "status":
      return <Sparkles className="size-3 text-[var(--workspace-accent)]" />;
    case "thinking":
      return <Brain className="size-3 text-violet-400" />;
    case "screen":
      return <Monitor className="size-3 text-emerald-400" />;
    case "palette":
      return <Palette className="size-3 text-amber-400" />;
    case "done":
      return <CheckCircle2 className="size-3 text-emerald-400" />;
    case "image_skipped":
      return <AlertTriangle className="size-3 text-amber-400" />;
    case "error":
      return <XCircle className="size-3 text-red-400" />;
    default:
      return null;
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function EntryContent({ entry }: { entry: AgentLogEntry }) {
  switch (entry.type) {
    case "status":
      return (
        <span className="text-white/92">{entry.message}</span>
      );
    case "thinking":
      return (
        <span className="text-violet-200/90 italic">
          {entry.text.length > 200
            ? `${entry.text.slice(0, 200)}…`
            : entry.text}
        </span>
      );
    case "screen":
      return (
        <span className="text-white/92">
          Screen {entry.index + 1}:{" "}
          <span className="font-medium text-emerald-300">{entry.name}</span>
        </span>
      );
    case "palette":
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="text-white/92">Palette:</span>
          {entry.colors.map((c, i) => (
            <span
              key={`${c}-${i}`}
              className="inline-block size-4 rounded-sm ring-1 ring-white/20"
              style={{ background: c }}
              title={c}
            />
          ))}
        </span>
      );
    case "done":
      return (
        <span className="font-medium text-emerald-300">
          Generation complete
        </span>
      );
    case "image_skipped":
      return (
        <span className="text-amber-300">{entry.reason}</span>
      );
    case "error":
      return (
        <span className="font-medium text-red-300">{entry.message}</span>
      );
    default:
      return null;
  }
}

export function AgentLogPanel() {
  const entries = useGenerationLog((s) => s.entries);
  const isGenerating = useGenerationLog((s) => s.isGenerating);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  if (entries.length === 0 && !isGenerating) {
    return (
      <div className="border-t border-white/[0.06] px-3 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-white/55" />
          <p className="text-[0.7rem] font-medium text-white/60">
            Agent log
          </p>
        </div>
        <p className="mt-1 text-[0.65rem] leading-relaxed text-white/50">
          Generation events will appear here when you run a prompt.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col border-t border-white/[0.06]">
      <button
        type="button"
        onClick={() => setCollapsed((p) => !p)}
        className="flex shrink-0 items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.04]"
      >
        {isGenerating ? (
          <Loader2 className="size-3.5 animate-spin text-[var(--workspace-accent)]" />
        ) : (
          <Sparkles className="size-3.5 text-[var(--workspace-accent)]" />
        )}
        <span className="flex-1 text-[0.7rem] font-semibold text-white/80">
          Agent log
        </span>
        <span className="tabular-nums text-[0.6rem] text-white/55">
          {entries.length}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-white/55 transition-transform",
            collapsed && "-rotate-90",
          )}
        />
      </button>

      {!collapsed && (
        <div
          ref={scrollRef}
          className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3"
        >
          <div className="space-y-1.5">
            {entries.map((entry, i) => (
              <div
                key={`${entry.ts}-${i}`}
                className="flex items-start gap-2 text-[0.65rem] leading-snug"
              >
                <span className="mt-0.5 shrink-0">
                  <EntryIcon entry={entry} />
                </span>
                <span className="text-muted-foreground/50 shrink-0 tabular-nums">
                  {formatTime(entry.ts)}
                </span>
                <span className="min-w-0 flex-1 break-words">
                  <EntryContent entry={entry} />
                </span>
              </div>
            ))}
            {isGenerating && (
              <div className="flex items-center gap-2 text-[0.65rem]">
                <Loader2 className="size-3 animate-spin text-[var(--workspace-accent)]" />
                <span className="animate-pulse text-white/80">
                  Working…
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
