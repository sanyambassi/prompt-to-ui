"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createStudioGenerationJob } from "@/actions/studio/generation-jobs";
import { createStudioProject } from "@/actions/studio/projects";
import { createStudioScreen } from "@/actions/studio/screens";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { PromptInspirationBar } from "@/components/studio/PromptInspirationBar";
import { ANONYMOUS_USER_ID } from "@/lib/auth/anonymous-user";
import { type ThinkingMode, resolveAutoThinking } from "@/lib/llm/thinking-mode";
import {
  defaultStudioModel,
  getStudioModelMeta,
  modelRequiresThinking,
  STUDIO_MODELS,
  type StudioModelId,
} from "@/lib/llm/studio-models";
import type { WelcomeInspirationFile } from "@/lib/client/welcome-inspiration-idb";
import { idbTakeWelcomeInspirations } from "@/lib/client/welcome-inspiration-idb";
import { uploadInspirationAssetsToProject } from "@/lib/client/upload-inspiration-assets";
import { normalizeStudioJobContext } from "@/lib/studio/job-context";
import {
  clearWelcomeSessionStorage,
  WELCOME_MODEL_KEY,
  WELCOME_PROMPT_KEY,
  WELCOME_REFERENCE_URLS_KEY,
  WELCOME_SURFACE_KEY,
  WELCOME_THINKING_KEY,
} from "@/lib/studio/welcome-session-storage";
import { cn } from "@/lib/utils";

import { ArrowUp, Loader2, Monitor, Smartphone } from "lucide-react";

const THINKING: ThinkingMode[] = [
  "auto",
  "fast",
  "think",
  "sync-neurons",
  "go-all-in",
];

type BootstrapOk = {
  ok: true;
  projectId: string;
};

type BootstrapResult = BootstrapOk | { ok: false; error: string };

function titleFromPrompt(prompt: string): string {
  const t = prompt.replace(/\s+/g, " ").trim().slice(0, 80);
  return t.length > 0 ? t : "New design";
}

/** Dedupe in-flight bootstrap (React Strict Mode / remounts). */
const welcomeBootstrapPromises = new Map<string, Promise<BootstrapResult>>();

type BootstrapArgs = {
  prompt: string;
  surface: "app" | "web";
  modelId: StudioModelId;
  thinking: ThinkingMode;
  referenceUrls: string[];
  inspirationQueued: WelcomeInspirationFile[];
};

async function runWelcomeBootstrapOnce(
  dedupeKey: string,
  run: () => Promise<BootstrapResult>,
): Promise<BootstrapResult> {
  const existing = welcomeBootstrapPromises.get(dedupeKey);
  if (existing) return existing;
  const p = run().finally(() => {
    welcomeBootstrapPromises.delete(dedupeKey);
  });
  welcomeBootstrapPromises.set(dedupeKey, p);
  return p;
}

export function WorkspaceCreateClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("s")?.trim() ?? "";

  const [authChecked, setAuthChecked] = useState(false);
  const [phase, setPhase] = useState<
    "auth_wait" | "await_prompt" | "loading" | "error"
  >("auth_wait");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftSurface, setDraftSurface] = useState<"app" | "web">("web");
  const [draftModel, setDraftModel] = useState<StudioModelId>(defaultStudioModel());
  const [draftThinking, setDraftThinking] = useState<ThinkingMode>("auto");
  const [draftRefUrls, setDraftRefUrls] = useState<string[]>([]);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);

  const [, startTransition] = useTransition();
  const autoBootstrapRef = useRef(false);

  const readStoredWelcomeArgs = useCallback((): BootstrapArgs | null => {
    if (typeof window === "undefined") return null;
    const prompt = sessionStorage.getItem(WELCOME_PROMPT_KEY)?.trim() ?? "";
    if (prompt.length < 3) return null;
    const surfaceRaw = sessionStorage.getItem(WELCOME_SURFACE_KEY);
    const surface: "app" | "web" = surfaceRaw === "app" ? "app" : "web";
    const modelStored = sessionStorage.getItem(WELCOME_MODEL_KEY);
    const modelId =
      modelStored && getStudioModelMeta(modelStored) ?
        (modelStored as StudioModelId)
      : defaultStudioModel();
    const thinkingStored = sessionStorage.getItem(
      WELCOME_THINKING_KEY,
    ) as ThinkingMode | null;
    const thinking =
      thinkingStored && THINKING.includes(thinkingStored) ?
        thinkingStored
      : ("fast" satisfies ThinkingMode);

    let referenceUrls: string[] = [];
    try {
      const uraw = sessionStorage.getItem(WELCOME_REFERENCE_URLS_KEY);
      if (uraw) {
        const parsed = JSON.parse(uraw) as unknown;
        if (Array.isArray(parsed)) {
          referenceUrls = parsed.filter((x): x is string => typeof x === "string");
        }
      }
    } catch {
      /* ignore */
    }

    return {
      prompt,
      surface,
      modelId,
      thinking,
      referenceUrls,
      inspirationQueued: [],
    };
  }, []);

  const executeBootstrap = useCallback(
    async (args: BootstrapArgs): Promise<BootstrapResult> => {
      const resolvedThinking = resolveAutoThinking(args.thinking);
      const effectiveThinking =
        args.modelId !== "auto" && modelRequiresThinking(args.modelId) && resolvedThinking === "fast" ?
          "think"
        : resolvedThinking;

      const proj = await createStudioProject(titleFromPrompt(args.prompt));
      if (!proj.ok) return { ok: false, error: proj.error };

      const w = args.surface === "app" ? 390 : 1280;
      const h = args.surface === "app" ? 844 : 800;
      const scr = await createStudioScreen(proj.data.id, {
        width: w,
        height: h,
        name: "Screen",
        canvas_x: 1000,
        canvas_y: 80,
      });
      if (!scr.ok) return { ok: false, error: scr.error };

      let inspirationAssetIds: string[] = [];
      if (args.inspirationQueued.length > 0) {
        try {
          inspirationAssetIds = await uploadInspirationAssetsToProject(
            proj.data.id,
            args.inspirationQueued,
          );
        } catch {
          /* optional */
        }
      }

      const context = normalizeStudioJobContext({
        reference_urls: args.referenceUrls,
        inspiration_asset_ids: inspirationAssetIds,
      });

      const job = await createStudioGenerationJob(proj.data.id, {
        prompt: args.prompt,
        screen_id: scr.data.id,
        model: args.modelId,
        context,
      });
      if (!job.ok) return { ok: false, error: job.error };

      try {
        sessionStorage.setItem(
          "ptu-pending-job",
          JSON.stringify({
            jobId: job.data.id,
            thinkingMode: effectiveThinking,
          }),
        );
      } catch { /* optional */ }

      return { ok: true, projectId: proj.data.id };
    },
    [],
  );

  const finishBootstrapSuccess = useCallback(
    (projectId: string) => {
      clearWelcomeSessionStorage();
      toast.success("Project ready");
      router.replace(`/project/${projectId}`);
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    if (autoBootstrapRef.current) return;

    const stored = readStoredWelcomeArgs();
    if (!stored) {
      startTransition(() => setPhase("await_prompt"));
      return;
    }

    autoBootstrapRef.current = true;
    startTransition(() => setPhase("loading"));

    const idbKey = sessionId || "welcome";
    const dedupeKey = `stored:${idbKey}:${stored.prompt.slice(0, 48)}`;

    startTransition(() => {
      void (async () => {
        let inspirationQueued = stored.inspirationQueued;
        try {
          const fromIdb = await idbTakeWelcomeInspirations(idbKey);
          if (fromIdb.length > 0) {
            inspirationQueued = [...inspirationQueued, ...fromIdb];
          }
        } catch {
          /* optional */
        }

        const result = await runWelcomeBootstrapOnce(dedupeKey, () =>
          executeBootstrap({ ...stored, inspirationQueued }),
        );

        if (!result.ok) {
          setPhase("error");
          setErrorMessage(result.error);
          autoBootstrapRef.current = false;
          return;
        }
        finishBootstrapSuccess(result.projectId);
      })();
    });
  }, [
    authChecked,
    executeBootstrap,
    finishBootstrapSuccess,
    readStoredWelcomeArgs,
    sessionId,
  ]);

  const submitDraft = useCallback(() => {
    const p = draftPrompt.trim();
    if (p.length < 3) {
      toast.error("Describe your app (at least 3 characters)");
      return;
    }

    setPhase("loading");
    startTransition(() => {
      void (async () => {
        const queued: WelcomeInspirationFile[] = [];
        for (const f of draftFiles) {
          queued.push({
            name: f.name,
            mime: f.type || "application/octet-stream",
            data: await f.arrayBuffer(),
          });
        }

        const dedupeKey = `inline:${crypto.randomUUID()}`;
        const result = await runWelcomeBootstrapOnce(dedupeKey, () =>
          executeBootstrap({
            prompt: p,
            surface: draftSurface,
            modelId: draftModel,
            thinking: draftThinking,
            referenceUrls: draftRefUrls,
            inspirationQueued: queued,
          }),
        );

        if (!result.ok) {
          setPhase("error");
          setErrorMessage(result.error);
          return;
        }
        finishBootstrapSuccess(result.projectId);
      })();
    });
  }, [
    draftFiles,
    draftModel,
    draftPrompt,
    draftRefUrls,
    draftSurface,
    draftThinking,
    executeBootstrap,
    finishBootstrapSuccess,
  ]);

  if (!authChecked) {
    return (
      <div className="dark flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[#0a0a0c] text-white">
        <Loader2 className="text-[var(--workspace-accent)] size-8 animate-spin" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="dark flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4 bg-[#0a0a0c] px-6 text-center text-white">
        <p className="text-white/80 max-w-md text-sm">{errorMessage}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="default"
            onClick={() => {
              setErrorMessage(null);
              setPhase("await_prompt");
            }}
          >
            Try again
          </Button>
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
            Home
          </Link>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="dark flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4 bg-[#0a0a0c] text-white">
        <Loader2 className="text-[var(--workspace-accent)] size-10 animate-spin" />
        <p className="text-white/70 max-w-sm text-center text-sm">
          Creating your project and generating the first screens…
        </p>
        <p className="text-white/60 max-w-xs text-center text-xs">
          This can take a minute. You&apos;ll land in the full studio when it&apos;s
          ready.
        </p>
      </div>
    );
  }

  /* await_prompt */
  return (
    <div className="dark flex min-h-[calc(100vh-3.5rem)] flex-col bg-[#0a0a0c] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            linear-gradient(to bottom, oklch(0.22 0.06 280 / 0.15), transparent 42%),
            radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.45 0.18 280 / 0.2), transparent 55%)
          `,
        }}
        aria-hidden
      />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10">
        <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          What should we design?
        </h1>
        <p className="text-white/65 mx-auto mb-6 max-w-lg text-center text-sm">
          Signed in as you — describe your product and we&apos;ll create a project
          and first artboards automatically. No empty project step.
        </p>

        <div className="border-white/10 bg-[#121216]/95 w-full rounded-[1.35rem] border p-1 shadow-2xl shadow-black/50 backdrop-blur-md">
          <div className="px-3 pt-3 sm:px-4">
            <PromptInspirationBar
              variant="marketing"
              referenceUrls={draftRefUrls}
              onReferenceUrlsChange={setDraftRefUrls}
              inspirationFiles={draftFiles}
              onInspirationFilesChange={setDraftFiles}
            />
          </div>
          <label htmlFor="create-prompt" className="sr-only">
            Design prompt
          </label>
          <textarea
            id="create-prompt"
            value={draftPrompt}
            onChange={(e) => setDraftPrompt(e.target.value)}
            placeholder="e.g. A fitness app home with progress rings and weekly goals"
            rows={4}
            className="placeholder:text-white/50 min-h-[120px] w-full resize-none rounded-2xl border-0 bg-transparent px-4 py-4 text-base text-white outline-none ring-0 sm:min-h-[140px] sm:text-lg"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2.5 sm:px-4">
            <div className="flex items-center gap-1">
              <div className="ml-1 flex rounded-full bg-black/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setDraftSurface("app")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    draftSurface === "app" ?
                      "bg-white/15 text-white"
                    : "text-white/65 hover:text-white/90",
                  )}
                >
                  <Smartphone className="size-3.5" />
                  App
                </button>
                <button
                  type="button"
                  onClick={() => setDraftSurface("web")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    draftSurface === "web" ?
                      "bg-white/15 text-white"
                    : "text-white/65 hover:text-white/90",
                  )}
                >
                  <Monitor className="size-3.5" />
                  Web
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={draftModel}
                onChange={(e) =>
                  setDraftModel(e.target.value as StudioModelId)
                }
                className="border-white/12 bg-white/[0.06] text-white/85 max-w-[min(200px,50vw)] cursor-pointer rounded-full border px-2.5 py-1.5 text-xs font-medium outline-none"
              >
                {STUDIO_MODELS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-[#141418]">
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                value={draftThinking}
                onChange={(e) =>
                  setDraftThinking(e.target.value as ThinkingMode)
                }
                className="border-white/12 bg-white/[0.06] text-white/85 cursor-pointer rounded-full border px-2 py-1.5 text-[0.65rem] font-medium outline-none"
              >
                {THINKING.map((t) => (
                  <option key={t} value={t} className="bg-[#141418]">
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void submitDraft()}
                disabled={draftPrompt.trim().length < 3}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full transition-all",
                  draftPrompt.trim().length >= 3 ?
                    "bg-[var(--workspace-accent)] text-white shadow-lg shadow-[var(--workspace-accent-soft)] hover:opacity-95"
                  : "cursor-not-allowed bg-white/10 text-white/55",
                )}
                aria-label="Create project and generate"
              >
                <ArrowUp className="size-5" />
              </button>
            </div>
          </div>
        </div>

        <p className="text-white/60 mt-6 text-center text-xs">
          <Link href="/" className="underline-offset-2 hover:underline">
            Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
