"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createStudioScreen,
  deleteStudioScreen,
  updateStudioScreen,
} from "@/actions/studio/screens";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { LayoutTemplate, MoreVertical, Plus, Smartphone } from "lucide-react";

export function ScreensSidebar({ projectId }: { projectId: string }) {
  const screens = useEditorStore((s) => s.screens);
  const activeScreenId = useEditorStore((s) => s.activeScreenId);
  const setActiveScreen = useEditorStore((s) => s.setActiveScreen);
  const upsertScreen = useEditorStore((s) => s.upsertScreen);
  const removeScreen = useEditorStore((s) => s.removeScreen);
  const [pending, startTransition] = useTransition();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const addScreen = () => {
    startTransition(async () => {
      let canvas_x = 1000;
      let canvas_y = 80;
      let sort_order = 0;
      if (screens.length > 0) {
        const last = screens[screens.length - 1];
        canvas_x = last.canvas_x + (last.width ?? 1280) + 80;
        canvas_y = last.canvas_y;
        sort_order = last.sort_order + 1;
      }
      const r = await createStudioScreen(projectId, {
        name: `Screen ${screens.length + 1}`,
        canvas_x,
        canvas_y,
        sort_order,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      upsertScreen(r.data);
      setActiveScreen(r.data.id);
      toast.success("Screen added");
    });
  };

  const saveRename = (id: string) => {
    const sc = screens.find((s) => s.id === id);
    if (!sc) {
      setEditingId(null);
      return;
    }
    const trimmed = editDraft.trim();
    if (!trimmed) {
      setEditDraft(sc.name);
      setEditingId(null);
      return;
    }
    if (trimmed === sc.name) {
      setEditingId(null);
      return;
    }
    startTransition(async () => {
      const r = await updateStudioScreen(id, { name: trimmed });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      upsertScreen(r.data);
      setEditingId(null);
      toast.success("Screen renamed");
    });
  };

  const startRename = (sc: { id: string; name: string }) => {
    setEditingId(sc.id);
    setEditDraft(sc.name);
  };

  const remove = (sc: { id: string; name: string }) => {
    if (
      !confirm(
        `Delete screen “${sc.name}”? This removes the artboard from the canvas.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await deleteStudioScreen(sc.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      removeScreen(sc.id);
      toast.success("Screen deleted");
    });
  };

  return (
    <aside className="flex h-full min-h-0 min-w-0 w-full shrink-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <span className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-wider text-white/70 uppercase">
          <LayoutTemplate className="size-3.5" strokeWidth={2} />
          Screens
        </span>
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-50"
          disabled={pending}
          onClick={addScreen}
        >
          <Plus className="size-3.5" strokeWidth={2.5} />
          New
        </button>
      </div>
      <ul
        className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden overscroll-y-contain p-2 [-webkit-overflow-scrolling:touch]"
        aria-label="Screens list"
      >
        {screens.map((sc, i) => {
          const active = activeScreenId === sc.id;
          const editing = editingId === sc.id;

          return (
            <li key={sc.id}>
              <div
                className={cn(
                  "flex items-center gap-1 rounded-lg p-1 transition-colors",
                  "hover:bg-white/[0.04]",
                  active && "bg-white/[0.08]",
                )}
              >
                {editing ?
                  <>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-[0.6rem] font-bold tabular-nums text-white/70">
                      {i + 1}
                    </span>
                    <Input
                      ref={editInputRef}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onBlur={() => saveRename(sc.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveRename(sc.id);
                        }
                        if (e.key === "Escape") {
                          setEditDraft(sc.name);
                          setEditingId(null);
                        }
                      }}
                      className="h-7 min-w-0 flex-1 border-white/10 bg-white/[0.05] text-sm font-medium text-white"
                      aria-label="Screen name"
                    />
                  </>
                : <>
                    <button
                      type="button"
                      onClick={() => setActiveScreen(sc.id)}
                      className="group flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 text-left"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[0.6rem] font-bold tabular-nums text-white/70">
                        {i + 1}
                      </span>
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <Smartphone
                          className={cn(
                            "size-3 shrink-0",
                            active ? "text-white/70" : "text-white/55",
                          )}
                          strokeWidth={2}
                        />
                        <span
                          className={cn(
                            "truncate text-xs",
                            active
                              ? "font-semibold text-white"
                              : "font-medium text-white/60",
                          )}
                        >
                          {sc.name}
                        </span>
                      </span>
                    </button>
                  </>
                }
                <DropdownMenu>
                  <DropdownMenuTrigger
                    type="button"
                    className="size-7 shrink-0 rounded-md p-0 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/90"
                    aria-label={`Actions for ${sc.name}`}
                  >
                    <MoreVertical className="mx-auto size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-40">
                    <DropdownMenuItem
                      onClick={() => {
                        setActiveScreen(sc.id);
                        startRename(sc);
                      }}
                    >
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={pending}
                      onClick={() => remove(sc)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
        {screens.length === 0 && (
          <li className="px-1 pt-2">
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs leading-relaxed text-white/60">
              No screens yet. Click <span className="font-medium text-white/60">New</span> to add one.
            </p>
          </li>
        )}
      </ul>
    </aside>
  );
}
