"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { Monitor, Sparkles } from "lucide-react";

export function MobileWorkspaceGate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="hidden h-full min-h-0 flex-1 flex-col md:flex">
        {children}
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16 text-center md:hidden">
        <div
          className="pointer-events-none absolute -top-24 left-1/2 size-[min(120vw,28rem)] -translate-x-1/2 rounded-full bg-[var(--workspace-accent-soft)] blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 size-64 translate-x-1/4 translate-y-1/4 rounded-full bg-indigo-500/15 blur-3xl dark:bg-indigo-400/10"
          aria-hidden
        />
        <div className="relative z-[1] flex max-w-sm flex-col items-center gap-5">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--workspace-accent)] to-indigo-600 shadow-xl shadow-[var(--workspace-accent-soft)]">
            <Monitor
              className="size-8 text-white dark:text-[oklch(0.12_0.04_285)]"
              strokeWidth={1.75}
            />
          </span>
          <div className="space-y-2">
            <p className="flex items-center justify-center gap-2 text-xl font-bold tracking-tight">
              <Sparkles
                className="size-5 text-[var(--workspace-accent)]"
                strokeWidth={2}
              />
              Studio on desktop
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The spatial canvas is tuned for large screens — pan, zoom, and
              arrange artboards with precision. Your work is saved; open this
              project on a computer to continue.
            </p>
          </div>
          <Link
            href="/"
            className={cn(
              buttonVariants({ size: "lg" }),
              "rounded-full bg-[var(--workspace-accent)] px-8 text-white shadow-lg shadow-[var(--workspace-accent-soft)] hover:opacity-90 dark:text-[oklch(0.12_0.04_285)]",
            )}
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </>
  );
}
