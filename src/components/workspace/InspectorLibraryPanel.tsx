"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  applyStudioVersionSnapshot,
  createStudioVersionSnapshot,
  deleteStudioVersionSnapshot,
  listStudioVersionSnapshots,
} from "@/actions/studio/snapshots";
import {
  deleteStudioAsset,
  getStudioAssetSignedUrl,
  registerStudioAsset,
} from "@/actions/studio/assets";
import { listStudioScreens, updateStudioScreen } from "@/actions/studio/screens";
import { listStudioVariantsByProject } from "@/actions/studio/variants";
import {
  createStudioVariant,
  deleteStudioVariant,
  duplicateStudioVariant,
} from "@/actions/studio/variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ANONYMOUS_USER_ID } from "@/lib/auth/anonymous-user";
import { useEditorStore } from "@/store/editor";
import type { StudioVersionSnapshotRow } from "@/types/studio";
import {
  Camera,
  Copy,
  Layers,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";

type Props = { projectId: string };

function AssetPreview({ path, label }: { path: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getStudioAssetSignedUrl(path, 3600);
      if (!cancelled && r.ok) setSrc(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!src) {
    return (
      <div className="bg-muted/50 text-muted-foreground flex size-12 items-center justify-center rounded-md text-[0.6rem]">
        …
      </div>
    );
  }

  if (label.match(/\.(png|jpe?g|gif|webp|svg)$/i)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed URL from storage
      <img
        src={src}
        alt=""
        className="size-12 rounded-md object-cover"
      />
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="text-primary text-[0.65rem] underline"
    >
      Open
    </a>
  );
}

export function InspectorLibraryPanel({ projectId }: Props) {
  const activeScreenId = useEditorStore((s) => s.activeScreenId);
  const screens = useEditorStore((s) => s.screens);
  const prototypeLinks = useEditorStore((s) => s.prototypeLinks);
  const assets = useEditorStore((s) => s.assets);
  const variantsByScreen = useEditorStore((s) => s.variantsByScreen);
  const viewport = useEditorStore((s) => s.viewport);
  const upsertScreen = useEditorStore((s) => s.upsertScreen);
  const removeAsset = useEditorStore((s) => s.removeAsset);
  const removeVariant = useEditorStore((s) => s.removeVariant);
  const replaceAllVariantsFromServer = useEditorStore(
    (s) => s.replaceAllVariantsFromServer,
  );

  const [snapshots, setSnapshots] = useState<StudioVersionSnapshotRow[]>([]);
  const [snapLabel, setSnapLabel] = useState("Milestone");
  const [pending, startTransition] = useTransition();

  const activeVariants = useMemo(
    () =>
      activeScreenId ? (variantsByScreen[activeScreenId] ?? []) : [],
    [activeScreenId, variantsByScreen],
  );

  const refreshSnapshots = useCallback(() => {
    startTransition(async () => {
      const r = await listStudioVersionSnapshots(projectId);
      if (r.ok) setSnapshots(r.data);
    });
  }, [projectId]);

  useEffect(() => {
    refreshSnapshots();
  }, [refreshSnapshots]);

  const applyVariant = useCallback(
    (variantId: string) => {
      if (!activeScreenId) return;
      const v = activeVariants.find((x) => x.id === variantId);
      if (!v) return;
      startTransition(async () => {
        const r = await updateStudioScreen(activeScreenId, {
          ui_schema: v.ui_schema,
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        upsertScreen(r.data);
        toast.success(`Applied “${v.name}” to artboard`);
      });
    },
    [activeScreenId, activeVariants, upsertScreen],
  );

  const onUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      startTransition(async () => {
        const storagePath = `${ANONYMOUS_USER_ID}/${crypto.randomUUID()}-${file.name}`;
        const formData = new FormData();
        formData.append("file", file);
        formData.append("path", storagePath);
        try {
          const res = await fetch("/api/studio/upload", { method: "POST", body: formData });
          if (!res.ok) {
            toast.error("Upload failed");
            return;
          }
        } catch {
          toast.error("Upload failed");
          return;
        }
        const reg = await registerStudioAsset(projectId, {
          url: storagePath,
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
        });
        if (!reg.ok) {
          toast.error(reg.error);
          return;
        }
        useEditorStore.getState().upsertAsset(reg.data);
        toast.success("Asset uploaded");
      });
    },
    [projectId],
  );

  const saveSnapshot = useCallback(() => {
    startTransition(async () => {
      const label = snapLabel.trim() || "Snapshot";
      const payload = {
        version: 1,
        viewport,
        screens: screens.map((s) => ({
          id: s.id,
          name: s.name,
          ui_schema: s.ui_schema,
          sort_order: s.sort_order,
          canvas_x: s.canvas_x,
          canvas_y: s.canvas_y,
          width: s.width,
          height: s.height,
        })),
      };
      const r = await createStudioVersionSnapshot(projectId, label, payload);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Snapshot saved");
      refreshSnapshots();
    });
  }, [projectId, refreshSnapshots, screens, snapLabel, viewport]);

  const outgoingLinks =
    activeScreenId ?
      prototypeLinks.filter((l) => l.screen_id === activeScreenId)
    : [];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 text-sm">
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Wand2 className="text-[var(--workspace-accent)] size-4 shrink-0" />
          <p className="text-foreground font-semibold tracking-tight">
            Prototype links
          </p>
        </div>
        <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
          Turn on <strong className="text-foreground/90">Play</strong> in the
          toolbar, then click wired buttons on an artboard to jump to the target
          screen. Links are created when the model returns{" "}
          <code className="rounded bg-muted/80 px-1 py-px font-mono text-[0.6rem]">
            prototype_links
          </code>{" "}
          (or refetch after generation).
        </p>
        {activeScreenId ?
          outgoingLinks.length === 0 ?
            <p className="text-muted-foreground text-xs">
              No outgoing links from this artboard.
            </p>
          : <ul className="max-h-28 space-y-1 overflow-y-auto text-xs">
              {outgoingLinks.map((l) => {
                const target = screens.find((s) => s.id === l.target_screen_id);
                return (
                  <li
                    key={l.id}
                    className="text-muted-foreground flex justify-between gap-2 rounded-md border border-border/40 bg-background/40 px-2 py-1"
                  >
                    <span className="font-mono text-[0.65rem] text-foreground/90">
                      {l.source_node_id}
                    </span>
                    <span className="shrink-0">→ {target?.name ?? "…"}</span>
                  </li>
                );
              })}
            </ul>
        : <p className="text-muted-foreground text-xs">Select an artboard.</p>}
      </section>

      <section className="space-y-2 border-t border-border/30 pt-4">
        <div className="flex items-center gap-2">
          <Layers className="text-[var(--workspace-accent)] size-4 shrink-0" />
          <p className="text-foreground font-semibold tracking-tight">
            Variants
          </p>
        </div>
        <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
          Alternate UISchemas per artboard. Apply copies the variant onto the
          live screen (undo with canvas undo).
        </p>
        {activeScreenId ?
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const r = await createStudioVariant(activeScreenId);
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    useEditorStore.getState().upsertVariant(r.data);
                    toast.success("Variant created");
                  });
                }}
              >
                New variant
              </Button>
            </div>
            <ul className="max-h-40 space-y-1.5 overflow-y-auto">
              {activeVariants.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-col gap-1 rounded-lg border border-border/50 bg-background/50 px-2 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{v.name}</span>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        disabled={pending}
                        onClick={() => applyVariant(v.id)}
                      >
                        Apply
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-7"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            const r = await duplicateStudioVariant(v.id);
                            if (!r.ok) {
                              toast.error(r.error);
                              return;
                            }
                            useEditorStore.getState().upsertVariant(r.data);
                          });
                        }}
                        aria-label="Duplicate variant"
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive size-7"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            const r = await deleteStudioVariant(v.id);
                            if (!r.ok) {
                              toast.error(r.error);
                              return;
                            }
                            removeVariant(v.id, activeScreenId);
                          });
                        }}
                        aria-label="Delete variant"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        : <p className="text-muted-foreground text-xs">Select an artboard.</p>}
      </section>

      <section className="space-y-2 border-t border-border/30 pt-4">
        <div className="flex items-center gap-2">
          <Upload className="text-[var(--workspace-accent)] size-4 shrink-0" />
          <p className="text-foreground font-semibold tracking-tight">Assets</p>
        </div>
        <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
          Private bucket{" "}
          <code className="rounded bg-muted/80 px-1 font-mono text-[0.6rem]">
            studio-assets
          </code>
          . Paths are stored on the row; previews use short-lived signed URLs.
        </p>
        <div>
          <Label htmlFor="studio-asset-upload" className="sr-only">
            Upload asset
          </Label>
          <Input
            id="studio-asset-upload"
            type="file"
            className="text-muted-foreground cursor-pointer text-xs file:mr-2"
            disabled={pending}
            onChange={onUpload}
          />
        </div>
        <ul className="max-h-36 space-y-2 overflow-y-auto">
          {assets.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-2 py-2"
            >
              <AssetPreview path={a.url} label={a.filename} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{a.filename}</p>
                <p className="text-muted-foreground font-mono text-[0.6rem]">
                  {a.mime_type}
                </p>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-destructive size-7 shrink-0"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const r = await deleteStudioAsset(a.id);
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    removeAsset(a.id);
                  });
                }}
                aria-label="Delete asset"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 border-t border-border/30 pt-4">
        <div className="flex items-center gap-2">
          <Camera className="text-[var(--workspace-accent)] size-4 shrink-0" />
          <p className="text-foreground font-semibold tracking-tight">
            Snapshots
          </p>
        </div>
        <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
          Save all artboard schemas + viewport. Restore applies matching screen
          IDs from the snapshot (does not recreate deleted screens).
        </p>
        <div className="flex gap-2">
          <Input
            value={snapLabel}
            onChange={(e) => setSnapLabel(e.target.value)}
            placeholder="Label"
            className="h-8 flex-1 text-xs"
          />
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0"
            disabled={pending}
            onClick={saveSnapshot}
          >
            Save
          </Button>
        </div>
        <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
          {snapshots.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/20 px-2 py-1.5"
            >
              <span className="min-w-0 truncate font-medium">{s.label}</span>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const r = await applyStudioVersionSnapshot(s.id);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      const sc = await listStudioScreens(projectId);
                      if (sc.ok) {
                        useEditorStore.getState().setScreens(sc.data);
                      }
                      const vr = await listStudioVariantsByProject(projectId);
                      if (vr.ok) replaceAllVariantsFromServer(vr.data);
                      toast.success(`Restored ${r.data.updated} screen(s)`);
                    });
                  }}
                >
                  Restore
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive size-7"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const r = await deleteStudioVersionSnapshot(s.id);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      refreshSnapshots();
                    });
                  }}
                  aria-label="Delete snapshot"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
