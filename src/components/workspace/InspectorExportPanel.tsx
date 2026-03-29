"use client";

import { useCallback, useMemo, useTransition } from "react";
import { toast } from "sonner";
import {
  ensureStudioProjectShareToken,
  toggleStudioProjectPublic,
} from "@/actions/studio/projects";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { buildStaticExportBundle } from "@/lib/schema/export-static-bundle";
import { useEditorStore } from "@/store/editor";
import { Copy, Download, FileCode, FileJson, Link2, Share2 } from "lucide-react";

type Props = {
  projectId: string;
};

function slugify(name: string) {
  const s = name.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_|_$/g, "");
  return s.slice(0, 48) || "screen";
}

export function InspectorExportPanel({ projectId }: Props) {
  const screens = useEditorStore((s) => s.screens);
  const activeScreenId = useEditorStore((s) => s.activeScreenId);
  const projectRow = useEditorStore((s) => s.projectRow);
  const setProjectRow = useEditorStore((s) => s.setProjectRow);
  const [, startShareTransition] = useTransition();

  const active = useMemo(
    () => screens.find((s) => s.id === activeScreenId),
    [screens, activeScreenId],
  );

  const singleJson = useMemo(() => {
    if (!active) return "";
    return JSON.stringify(active.ui_schema, null, 2);
  }, [active]);

  /** CSS/JS paths embedded in the HTML match these download filenames. */
  const staticBundle = useMemo(() => {
    if (!active) return null;
    const base = `${slugify(active.name)}-${active.id.slice(0, 8)}`;
    const cssFile = `${base}.css`;
    const jsFile = `${base}.js`;
    const { html, css, js, isStandaloneHtmlDocument } = buildStaticExportBundle(
      active.ui_schema,
      {
        title: active.name,
        cssFile,
        jsFile,
        screenWidth: active.width,
        screenHeight: active.height,
      },
    );
    return {
      html,
      css,
      js,
      htmlFile: `${base}.html`,
      cssFile,
      jsFile,
      isStandaloneHtmlDocument: !!isStandaloneHtmlDocument,
    };
  }, [active]);

  const projectJson = useMemo(() => {
    const payload = {
      project_id: projectId,
      exported_at: new Date().toISOString(),
      screens: screens.map((s) => ({
        id: s.id,
        name: s.name,
        ui_schema: s.ui_schema,
      })),
    };
    return JSON.stringify(payload, null, 2);
  }, [projectId, screens]);

  const downloadText = useCallback(
    (filename: string, content: string, mime = "text/plain;charset=utf-8") => {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    },
    [],
  );

  const copyText = useCallback(async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }, []);

  const shareBaseUrl = useMemo(() => {
    const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim();
    if (env) return env;
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }, []);

  const shareUrl = useMemo(() => {
    const tok = projectRow?.share_token;
    if (!tok || !shareBaseUrl) return "";
    return `${shareBaseUrl}/view/${tok}`;
  }, [projectRow?.share_token, shareBaseUrl]);

  const setPublic = useCallback(
    (is_public: boolean) => {
      startShareTransition(async () => {
        const r = await toggleStudioProjectPublic(projectId, is_public);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setProjectRow(r.data);
        toast.success(is_public ? "Project is public" : "Project is private");
      });
    },
    [projectId, setProjectRow],
  );

  const copyShareLink = useCallback(() => {
    startShareTransition(async () => {
      const ensured = await ensureStudioProjectShareToken(projectId);
      if (!ensured.ok) {
        toast.error(ensured.error);
        return;
      }
      setProjectRow(ensured.data);
      const tok = ensured.data.share_token;
      if (!tok) {
        toast.error("No share token");
        return;
      }
      const base =
        shareBaseUrl ||
        (typeof window !== "undefined" ? window.location.origin : "");
      const url = `${base}/view/${tok}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied");
      } catch {
        toast.error("Could not copy link");
      }
    });
  }, [projectId, setProjectRow, shareBaseUrl]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <FileJson className="text-[var(--workspace-accent)] size-4 shrink-0" />
        <p className="text-foreground text-sm font-semibold tracking-tight">
          Export UISchema
        </p>
      </div>
      <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
        <strong className="text-foreground/90">JSON</strong> is the source of
        truth the AI and <code>SchemaRenderer</code> use.{" "}
        <strong className="text-foreground/90">HTML + CSS + JS</strong> is a
        static preview you can open in a browser: save the three files with the
        names shown (they must match the paths in the HTML).
      </p>

      {!active ?
        <p className="text-muted-foreground text-xs leading-relaxed">
          Select a screen on the canvas to enable single-screen export.
        </p>
      : <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3">
          <div>
            <Label className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Selected screen
            </Label>
            <p className="text-foreground mt-1 text-sm font-medium">
              {active.name}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start gap-2"
              onClick={() =>
                copyText(singleJson, "UISchema copied to clipboard")
              }
            >
              <Copy className="size-3.5" />
              Copy JSON
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start gap-2"
              onClick={() =>
                downloadText(
                  `${slugify(active.name)}-${active.id.slice(0, 8)}.json`,
                  singleJson,
                  "application/json;charset=utf-8",
                )
              }
            >
              <Download className="size-3.5" />
              Download .json
            </Button>
          </div>

          {staticBundle ?
            <div className="space-y-2 border-t border-border/40 pt-3">
              <div className="flex items-center gap-2">
                <FileCode className="text-[var(--workspace-accent)] size-4 shrink-0" />
                <p className="text-foreground text-xs font-semibold tracking-tight">
                  Static web bundle
                </p>
              </div>
              <p className="text-muted-foreground text-[0.65rem] leading-snug">
                {staticBundle.isStandaloneHtmlDocument ?
                  <>
                    This artboard is a <strong className="text-foreground/90">full HTML document</strong> (full-page HTML). The file below is complete and self-contained; companion CSS/JS from the Design tab are not used.
                  </>
                : <>
                    Uses Tailwind CDN + default theme tokens.
                    Interactivity in the editor is not replayed — this is
                    markup + theme + a tiny script stub.
                  </>
                }
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="justify-start gap-2 font-mono text-[0.65rem]"
                  onClick={() =>
                    copyText(staticBundle.html, "HTML copied to clipboard")
                  }
                >
                  <Copy className="size-3.5 shrink-0" />
                  Copy {staticBundle.htmlFile}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="justify-start gap-2 font-mono text-[0.65rem]"
                  onClick={() =>
                    downloadText(
                      staticBundle.htmlFile,
                      staticBundle.html,
                      "text/html;charset=utf-8",
                    )
                  }
                >
                  <Download className="size-3.5 shrink-0" />
                  Download HTML
                </Button>
                {!staticBundle.isStandaloneHtmlDocument ?
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="justify-start gap-2 font-mono text-[0.65rem]"
                      onClick={() =>
                        copyText(staticBundle.css, "CSS copied to clipboard")
                      }
                    >
                      <Copy className="size-3.5 shrink-0" />
                      Copy {staticBundle.cssFile}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="justify-start gap-2 font-mono text-[0.65rem]"
                      onClick={() =>
                        downloadText(
                          staticBundle.cssFile,
                          staticBundle.css,
                          "text/css;charset=utf-8",
                        )
                      }
                    >
                      <Download className="size-3.5 shrink-0" />
                      Download CSS
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="justify-start gap-2 font-mono text-[0.65rem]"
                      onClick={() =>
                        copyText(staticBundle.js, "JS copied to clipboard")
                      }
                    >
                      <Copy className="size-3.5 shrink-0" />
                      Copy {staticBundle.jsFile}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="justify-start gap-2 font-mono text-[0.65rem]"
                      onClick={() =>
                        downloadText(
                          staticBundle.jsFile,
                          staticBundle.js,
                          "text/javascript;charset=utf-8",
                        )
                      }
                    >
                      <Download className="size-3.5 shrink-0" />
                      Download JS
                    </Button>
                  </>
                : null}
              </div>
            </div>
          : null}
        </div>
      }

      <div className="space-y-3 border-t border-border/40 pt-3">
        <div className="flex items-center gap-2">
          <Share2 className="text-[var(--workspace-accent)] size-4 shrink-0" />
          <p className="text-foreground text-sm font-semibold tracking-tight">
            Share read-only view
          </p>
        </div>
        <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
          Turn on public access, then copy a link. Viewers see artboards and can
          use prototype navigation — no editing.
        </p>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <Label
            htmlFor="studio-public-share"
            className="text-sm font-medium leading-none"
          >
            Public link
          </Label>
          <Switch
            id="studio-public-share"
            checked={!!projectRow?.is_public}
            onCheckedChange={(v) => setPublic(v)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            onClick={() => void copyShareLink()}
          >
            <Link2 className="size-3.5" />
            {projectRow?.share_token ? "Copy share URL" : "Create & copy link"}
          </Button>
          {shareUrl ?
            <p className="text-muted-foreground break-all font-mono text-[0.65rem]">
              {shareUrl}
            </p>
          : null}
        </div>
      </div>

      <div className="space-y-2 border-t border-border/40 pt-3">
        <Label className="text-xs font-medium">Whole project</Label>
        <p className="text-muted-foreground text-[0.65rem] leading-snug">
          {screens.length} screen{screens.length === 1 ? "" : "s"} in{" "}
          <code className="rounded bg-muted/80 px-1 font-mono text-[0.6rem]">
            screens[]
          </code>
        </p>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            disabled={screens.length === 0}
            onClick={() =>
              copyText(
                projectJson,
                "Project export copied to clipboard",
              )
            }
          >
            <Copy className="size-3.5" />
            Copy all screens JSON
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            disabled={screens.length === 0}
            onClick={() =>
              downloadText(
                `studio-project-${projectId.slice(0, 8)}-screens.json`,
                projectJson,
                "application/json;charset=utf-8",
              )
            }
          >
            <Download className="size-3.5" />
            Download all .json
          </Button>
        </div>
      </div>
    </div>
  );
}
