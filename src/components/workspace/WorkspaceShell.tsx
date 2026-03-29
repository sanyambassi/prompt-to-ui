"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { deleteStudioProject, updateStudioProject } from "@/actions/studio/projects";
import { getRegenerationPromptForScreen } from "@/actions/studio/regeneration";
import {
  createStudioGenerationJob,
  getScreenGenerationLog,
  saveGenerationLog,
} from "@/actions/studio/generation-jobs";
import {
  CanvasStudioActionsContext,
  type GenerateNewScreenSizePayload,
} from "@/context/canvas-studio-actions-context";
import {
  createStudioScreen,
  listStudioScreens,
  updateStudioScreen,
} from "@/actions/studio/screens";
import { StudioCanvas } from "@/components/canvas/StudioCanvas";
import { GenerationSidebar } from "@/components/workspace/GenerationSidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCanvasPersistence } from "@/hooks/useCanvasPersistence";
import { useGenerationStream } from "@/hooks/useGenerationStream";
import {
  STUDIO_MODELS,
  type StudioModelId,
  defaultStudioModel,
  getStudioModelMeta,
} from "@/lib/llm/studio-models";
import { type ThinkingMode, resolveAutoThinking } from "@/lib/llm/thinking-mode";
import type { UISchema } from "@/lib/schema/types";
import { useEditorStore } from "@/store/editor";
import { useCanvasItemsStore, type CanvasItem } from "@/store/canvas-items";
import { useGenerationLog } from "@/store/generation-log";
import { useSettingsStore } from "@/store/settings";
import { uploadAttachmentToLocal } from "@/lib/client/upload-attachment";
import { cn } from "@/lib/utils";
import type {
  StudioAssetRow,
  StudioGenerationJobContext,
  StudioGenerationJobRow,
  StudioProjectRow,
  StudioPrototypeLinkRow,
  StudioScreenRow,
  StudioVariantRow,
} from "@/types/studio";
import { buildStaticExportBundle, escapeHtml } from "@/lib/schema/export-static-bundle";
import { isHtmlDocumentScreen, getHtmlDocumentString, buildHtmlDocumentUiSchema } from "@/lib/schema/html-document";
import { clampArtboardDimension } from "@/lib/studio/artboard-presets";
import { appendMissingWebframeItems } from "@/lib/studio/append-missing-canvas-webframes";
import { gatherCanvasItemsInHorizontalRow } from "@/lib/studio/gather-canvas-items-layout";
import {
  STUDIO_MAX_REFERENCE_URLS,
  tryParseReferenceUrl,
} from "@/lib/studio/job-context";
import { sortScreensForDisplay, isStyleGuideScreenRow } from "@/lib/studio/screen-display-order";
import JSZip from "jszip";
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  Download,
  KeyRound,
  LayoutGrid,
  Globe,
  ImageIcon,
  Loader2,
  Menu,
  Moon,
  Plus,
  Pencil,
  RefreshCw,
  ScrollText,
  Share2,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { usePendingAttachments, type PendingAttachment } from "@/store/pending-attachments";

type Props = {
  initialProject: StudioProjectRow;
  initialScreens: StudioScreenRow[];
  initialGenerationJobs: StudioGenerationJobRow[];
  initialLibrary: {
    assets: StudioAssetRow[];
    variants: StudioVariantRow[];
    prototypeLinks: StudioPrototypeLinkRow[];
  };
};

function SuggestionChips({ suggestions, onPick }: { suggestions: string[]; onPick: (s: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", checkOverflow); ro.disconnect(); };
  }, [checkOverflow, suggestions]);

  const dragState = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragState.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft, moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds.active) return;
    e.preventDefault();
    const dx = e.clientX - ds.startX;
    if (Math.abs(dx) > 3) ds.moved = true;
    scrollRef.current!.scrollLeft = ds.scrollLeft - dx;
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current.active = false;
  }, []);

  return (
    <div className="relative mb-2">
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex gap-1.5 overflow-x-auto pb-0.5 select-none touch-pan-x"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", cursor: "grab" }}
      >
        {suggestions.slice(0, 4).map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (!dragState.current.moved) onPick(s);
              dragState.current.moved = false;
            }}
            className="shrink-0 whitespace-nowrap rounded-full border border-zinc-200/80 bg-white/85 px-3 py-1.5 text-[11px] font-medium text-zinc-700 shadow-sm backdrop-blur-md transition-all hover:border-violet-300/50 hover:bg-white hover:text-zinc-900 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800/85 dark:text-zinc-300 dark:hover:border-violet-500/40 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            {s}
          </button>
        ))}
      </div>
      {canScrollRight && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-zinc-50/80 to-transparent" />
      )}
    </div>
  );
}

const THINKING_OPTIONS: { value: ThinkingMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "fast", label: "Fast" },
  { value: "think", label: "Think" },
  { value: "sync-neurons", label: "Deep" },
  { value: "go-all-in", label: "Max" },
];

const streamedJobs = new Set<string>();

/** Reuse prompt for “Generate → device size” when the bar was cleared after a run. */
function pickLatestJobPrompt(
  jobs: StudioGenerationJobRow[],
  preferredScreenId: string | null,
): string {
  const ok = (p: unknown): p is string =>
    typeof p === "string" && p.trim().length >= 3;
  const sorted = [...jobs].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  if (preferredScreenId) {
    const hit = sorted.find(
      (j) => j.screen_id === preferredScreenId && ok(j.prompt),
    );
    if (hit) return hit.prompt.trim();
  }
  const hit = sorted.find((j) => ok(j.prompt));
  return hit?.prompt.trim() ?? "";
}

function inferDeviceTypeFromWidth(widthPx: number): "phone" | "tablet" | "desktop" {
  if (widthPx <= 500) return "phone";
  if (widthPx <= 1024) return "tablet";
  return "desktop";
}

function formatReferenceUrlChip(url: string): string {
  try {
    const u = new URL(url);
    const path =
      u.pathname && u.pathname !== "/"
        ? u.pathname.length > 20
          ? `${u.pathname.slice(0, 18)}…`
          : u.pathname
        : "";
    return path ? `${u.hostname}${path}` : u.hostname;
  } catch {
    return url.length > 36 ? `${url.slice(0, 34)}…` : url;
  }
}

function generationContextFromUrls(
  urls: string[],
): { context: StudioGenerationJobContext } | undefined {
  if (urls.length === 0) return undefined;
  return { context: { reference_urls: [...urls] } };
}

export function WorkspaceShell({
  initialProject,
  initialScreens,
  initialGenerationJobs,
  initialLibrary,
}: Props) {
  const hydrated = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const generationLockRef = useRef(false);
  const lastGenerationPromptRef = useRef(
    pickLatestJobPrompt(initialGenerationJobs, null),
  );

  const hydrate = useEditorStore((s) => s.hydrate);
  const reset = useEditorStore((s) => s.reset);
  const upsertScreen = useEditorStore((s) => s.upsertScreen);
  const removeScreen = useEditorStore((s) => s.removeScreen);
  const upsertAsset = useEditorStore((s) => s.upsertAsset);
  const removeAsset = useEditorStore((s) => s.removeAsset);
  const upsertVariant = useEditorStore((s) => s.upsertVariant);
  const removeVariant = useEditorStore((s) => s.removeVariant);
  const upsertPrototypeLink = useEditorStore((s) => s.upsertPrototypeLink);
  const removePrototypeLink = useEditorStore((s) => s.removePrototypeLink);
  const setPrototypeLinks = useEditorStore((s) => s.setPrototypeLinks);
  const addCanvasItem = useCanvasItemsStore((s) => s.addItem);
  const setCanvasItems = useCanvasItemsStore((s) => s.setItems);

  const setScreens = useEditorStore((s) => s.setScreens);

  const { saveItems, dispose: disposePersistence } = useCanvasPersistence(initialProject.id);
  const { startStream, cancelStream } = useGenerationStream();
  const genLog = useGenerationLog();

  const handleScreenReady = useCallback(async () => {
    const fresh = await listStudioScreens(initialProject.id);
    if (fresh.ok) {
      setScreens(fresh.data);
      const currentItems = useCanvasItemsStore.getState().items;
      setCanvasItems(appendMissingWebframeItems(currentItems, fresh.data));
    }
  }, [initialProject.id, setScreens, setCanvasItems]);
  const settings = useSettingsStore();

  const router = useRouter();
  const [generationJobs, setGenerationJobs] = useState(initialGenerationJobs);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [renaming, setRenaming] = useState(false);
  const [projectName, setProjectName] = useState(initialProject.name);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<StudioModelId>(() => {
    if (initialGenerationJobs.length === 0) return defaultStudioModel();
    const sorted = [...initialGenerationJobs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const last = sorted[0]?.model;
    return last && getStudioModelMeta(last) ? (last as StudioModelId) : defaultStudioModel();
  });
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("auto");
  const [pending, startGenerationTransition] = useTransition();
  const [attachedFiles, setAttachedFiles] = useState<PendingAttachment[]>([]);
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [urlInputVisible, setUrlInputVisible] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);

  const [editingScreenId, setEditingScreenId] = useState<string | null>(null);
  const [liveEditScreenId, setLiveEditScreenId] = useState<string | null>(null);
  const liveEditHtmlRef = useRef<string | null>(null);

  const isGenerating = genLog.isGenerating || pending;

  const activeScreenId = useEditorStore((s) => s.activeScreenId);
  const selectedItemId = useCanvasItemsStore((s) => s.selectedItemId);

  const selectedScreenId = useCanvasItemsStore((s) => {
    if (!selectedItemId) return null;
    const item = s.items.find((i) => i.id === selectedItemId);
    if (!item || item.type !== "webframe") return null;
    return (item as CanvasItem & { screenId: string }).screenId;
  });

  const isSelectedScreenDS = useEditorStore((s) => {
    if (!selectedScreenId) return false;
    const screen = s.screens.find((sc) => sc.id === selectedScreenId);
    return screen ? isStyleGuideScreenRow(screen) : false;
  });

  const promptDisabled = isGenerating || isSelectedScreenDS;
  const canGenerate = prompt.trim().length >= 3 && !isGenerating && !isSelectedScreenDS;

  // Clear explicit editing state when user deselects or selects a different screen
  useEffect(() => {
    if (editingScreenId && selectedScreenId !== editingScreenId) {
      setEditingScreenId(null);
    }
  }, [editingScreenId, selectedScreenId]);

  // Stop live editing when selection changes away
  useEffect(() => {
    if (liveEditScreenId && selectedScreenId !== liveEditScreenId) {
      handleStopLiveEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScreenId]);

  // Determine the effective edit target for prompt placeholder
  const editTargetScreenId =
    editingScreenId ?? (selectedScreenId && !isSelectedScreenDS ? selectedScreenId : null);
  const editTargetScreenName = useMemo(() => {
    if (!editTargetScreenId) return null;
    const s = useEditorStore.getState().screens.find((sc) => sc.id === editTargetScreenId);
    return s?.name?.trim() || null;
  }, [editTargetScreenId]);

  // ── auto-open sidebar when generation starts; toast when it finishes ──
  const wasGeneratingRef = useRef(false);
  useEffect(() => {
    if (genLog.isGenerating) {
      setSidebarOpen(true);
      wasGeneratingRef.current = true;
    } else if (wasGeneratingRef.current) {
      wasGeneratingRef.current = false;
      const hasError = genLog.entries.some((e) => e.type === "error");
      if (hasError) {
        toast.error("Generation failed", { duration: 4000 });
      } else {
        toast.success("Generation complete", { duration: 3000 });
      }
    }
  }, [genLog.isGenerating, genLog.entries]);

  const persistLog = useCallback(
    async (jobId: string, rawEntries: unknown[], mirrorToScreenIds?: string[]) => {
      if (rawEntries.length === 0) return;
      const serializable = rawEntries.map((e) => ({ ...(e as object) }) as Record<string, unknown>);
      await saveGenerationLog(jobId, serializable, { mirrorToScreenIds });
    },
    [],
  );

  // ── load generation log for the active artboard (per-screen cache + job fallback) ──
  const logFetchSeq = useRef(0);
  useEffect(() => {
    if (!activeScreenId) return;
    /* Avoid swapping in DB history while a run is starting or streaming (same as UI `isGenerating`). */
    if (genLog.isGenerating || pending) return;

    const seq = ++logFetchSeq.current;
    void getScreenGenerationLog(activeScreenId).then((res) => {
      if (seq !== logFetchSeq.current) return;
      if (useEditorStore.getState().activeScreenId !== activeScreenId) return;
      if (!res.ok) {
        useGenerationLog.getState().loadFromHistory(null, []);
        return;
      }
      const payload = res.data;
      if (payload && Array.isArray(payload.entries) && payload.entries.length > 0) {
        useGenerationLog.getState().loadFromHistory(payload.jobId, payload.entries, {
          userPromptFallback: payload.userPrompt ?? null,
        });
      } else {
        useGenerationLog.getState().loadFromHistory(null, []);
      }
    });
  }, [activeScreenId, genLog.isGenerating, pending]);

  // ── auto-size textarea ──
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [prompt]);

  useEffect(() => {
    if (!urlInputVisible) return;
    const t = setTimeout(() => urlInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [urlInputVisible]);

  const addReferenceUrlInline = useCallback(() => {
    const normalized = tryParseReferenceUrl(urlDraft);
    if (!normalized) {
      toast.error("Enter a valid website URL (https://…)");
      return;
    }
    if (referenceUrls.length >= STUDIO_MAX_REFERENCE_URLS) {
      toast.error(`At most ${STUDIO_MAX_REFERENCE_URLS} reference URLs`);
      return;
    }
    if (referenceUrls.includes(normalized)) {
      toast.message("That URL is already attached");
      return;
    }
    setReferenceUrls((prev) => [...prev, normalized]);
    setUrlDraft("");
    setUrlInputVisible(false);
  }, [referenceUrls, urlDraft]);

  const removeReferenceUrl = useCallback((url: string) => {
    setReferenceUrls((prev) => prev.filter((u) => u !== url));
  }, []);

  // ── hydrate + auto-stream (single effect to survive Strict Mode) ──
  useEffect(() => {
    hydrate(initialProject, initialScreens, {
      assets: initialLibrary.assets,
      variants: initialLibrary.variants,
      prototypeLinks: initialLibrary.prototypeLinks,
    });
    hydrated.current = true;

    const doc = initialProject.canvas_document;
    const screenIds = new Set(initialScreens.map((s) => s.id));
    let restoredItems: CanvasItem[] = [];

    if (doc && Array.isArray((doc as Record<string, unknown>).items)) {
      const rawItems = (doc as { items: CanvasItem[] }).items;
      const mapped = rawItems.map((item) => {
        if (item.type === "image" && item.loading) {
          return { ...item, loading: false, prompt: item.prompt || "Generation interrupted" };
        }
        return item;
      });
      // Only keep webframes whose screen exists; drop orphaned refs (e.g. from deleted screens)
      restoredItems = mapped.filter((item) => {
        if (item.type === "webframe") return screenIds.has(item.screenId);
        return true; // keep images
      });
    }

    // Ensure every screen has a canvas webframe (merge in any missing)
    restoredItems = appendMissingWebframeItems(restoredItems, initialScreens);

    if (restoredItems.length > 0) {
      setCanvasItems(restoredItems);
    }

    // Auto-start pending job (from landing page sessionStorage OR initial DB data)
    let pendingJobId: string | undefined;
    let pendingThinking = "fast";

    try {
      const raw = sessionStorage.getItem("ptu-pending-job");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          jobId?: string;
          thinkingMode?: string;
          model?: string;
        };
        pendingJobId = parsed.jobId;
        pendingThinking = parsed.thinkingMode ?? "fast";
        if (parsed.model) setModel(parsed.model as StudioModelId);
        sessionStorage.removeItem("ptu-pending-job");
      }
    } catch { /* ignore */ }

    if (!pendingJobId) {
      const fromDb = initialGenerationJobs.find(
        (j) => (j.status === "pending" || j.status === "running") && j.screen_id,
      );
      if (fromDb) pendingJobId = fromDb.id;
    }

    if (pendingJobId) {
      const screen = initialScreens[0];
      if (screen) {
        const items = useCanvasItemsStore.getState().items;
        if (!items.some((i) => i.id === `wf-${screen.id}`)) {
          useCanvasItemsStore.getState().addItem({
            id: `wf-${screen.id}`,
            type: "webframe",
            x: 700,
            y: 200,
            width: screen.width,
            height: screen.height,
            screenId: screen.id,
            deviceType: screen.width <= 500 ? "phone" : "desktop",
          });
        }
      }

      if (!streamedJobs.has(pendingJobId)) {
        streamedJobs.add(pendingJobId);
        const pendingAttachments = usePendingAttachments.getState().consumeAttachments();
        const capturedJobId = pendingJobId;
        startGenerationTransition(async () => {
          const attachedImages = pendingAttachments.length > 0
            ? await Promise.all(
                pendingAttachments.map(async (a) => {
                  const url = await uploadAttachmentToLocal(a, initialProject.id);
                  return { base64: a.base64, mimeType: a.mimeType, filename: a.filename, ...(url ? { url } : {}) };
                }),
              )
            : undefined;
          const result = await startStream({
            jobId: capturedJobId,
            thinkingMode: pendingThinking,
            targetScreenId: screen?.id ?? null,
            attachedImages,
            pipeline: useSettingsStore.getState().getGenerationPipelineBody(),
            onScreenReady: () => void handleScreenReady(),
          });
          await persistLog(capturedJobId, result.entries, result.affectedScreenIds);
          if (result.ok) {
            const fresh = await listStudioScreens(initialProject.id);
            if (fresh.ok) {
              setScreens(fresh.data);
              const currentItems = useCanvasItemsStore.getState().items;
              setCanvasItems(appendMissingWebframeItems(currentItems, fresh.data));
            }
          }
        });
      }
    }

    return () => {
      cancelStream();
      if (pendingJobId) streamedJobs.delete(pendingJobId);
      disposePersistence();
      reset();
      setCanvasItems([]);
      hydrated.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrate, reset, disposePersistence]);

  // ── persist canvas items ──
  useEffect(() => {
    const unsub = useCanvasItemsStore.subscribe((state) => {
      saveItems(state.items);
    });
    return unsub;
  }, [saveItems]);


  // ── editScreen: selecting a screen and typing focuses prompt for AI editing ──
  const handleEditScreen = useCallback(
    (screenId: string) => {
      setEditingScreenId(screenId);
      useEditorStore.getState().setActiveScreen(screenId);
      textareaRef.current?.focus();
    },
    [],
  );

  // ── liveEditScreen: toggle WYSIWYG editing inside the iframe ──
  const handleLiveEditScreen = useCallback(
    (screenId: string) => {
      if (liveEditScreenId === screenId) {
        // Toggle off — save pending changes
        handleStopLiveEdit();
        return;
      }
      setLiveEditScreenId(screenId);
      liveEditHtmlRef.current = null;
      useEditorStore.getState().setActiveScreen(screenId);
      const canvasItems = useCanvasItemsStore.getState().items;
      const wf = canvasItems.find(
        (i) => i.type === "webframe" && (i as CanvasItem & { screenId: string }).screenId === screenId,
      );
      if (wf) useCanvasItemsStore.getState().selectItem(wf.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveEditScreenId],
  );

  const handleStopLiveEdit = useCallback(() => {
    const sid = liveEditScreenId;
    const html = liveEditHtmlRef.current;
    setLiveEditScreenId(null);
    liveEditHtmlRef.current = null;
    if (!sid || !html) return;

    const schema = buildHtmlDocumentUiSchema(html);
    useEditorStore.getState().updateScreenLocal(sid, {
      ui_schema: schema,
    });
    void updateStudioScreen(sid, {
      ui_schema: schema,
    }).then((res) => {
      if (res.ok) {
        upsertScreen(res.data);
        toast.success("Changes saved");
      } else {
        toast.error("Failed to save changes");
      }
    });
  }, [liveEditScreenId, upsertScreen]);

  // Listen for postMessage from the live-editing iframe
  useEffect(() => {
    if (!liveEditScreenId) return;
    const handler = (e: MessageEvent) => {
      if (
        e.data &&
        typeof e.data === "object" &&
        e.data.type === "__ptu_html_update" &&
        typeof e.data.html === "string"
      ) {
        liveEditHtmlRef.current = e.data.html;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [liveEditScreenId]);

  // ── generate: edit-in-place when a screen is targeted, otherwise create new ──
  const handleGenerate = useCallback(() => {
    const text = prompt.trim();
    if (text.length < 3) return;
    lastGenerationPromptRef.current = text;

    // Determine if we're editing an existing screen in place.
    // Priority: explicit editingScreenId > selected non-DS screen > create new.
    const targetEditScreenId =
      editingScreenId ??
      (selectedScreenId && !isSelectedScreenDS ? selectedScreenId : null);

    const rawAttachments = attachedFiles.map((f) => ({
      base64: f.base64,
      mimeType: f.mimeType,
      filename: f.filename,
    }));
    const urlsForJob = [...referenceUrls];
    setAttachedFiles([]);
    setReferenceUrls([]);
    setPrompt("");
    setEditingScreenId(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    startGenerationTransition(async () => {
      try {
      const currentAttachments = rawAttachments.length > 0
        ? await Promise.all(
            rawAttachments.map(async (a) => {
              const url = await uploadAttachmentToLocal(
                { id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`, previewUrl: "", ...a },
                initialProject.id,
              );
              return { ...a, ...(url ? { url } : {}) };
            }),
          )
        : rawAttachments;
      const resolvedThinking = resolveAutoThinking(thinkingMode);
      const allScreens = useEditorStore.getState().screens;

      let screenId: string;

      if (targetEditScreenId) {
        // ── Edit in place: reuse the targeted screen ──
        const target = allScreens.find((s) => s.id === targetEditScreenId);
        if (!target) {
          toast.error("Screen not found");
          return;
        }
        screenId = targetEditScreenId;

        // Sync canvas dimensions → DB if resized
        const wf = useCanvasItemsStore
          .getState()
          .items.find(
            (i): i is CanvasItem & { type: "webframe"; screenId: string } =>
              i.type === "webframe" && i.screenId === targetEditScreenId,
          );
        if (wf) {
          const cw = clampArtboardDimension(Math.round(wf.width));
          const ch = clampArtboardDimension(Math.round(wf.height));
          if (cw !== target.width || ch !== target.height) {
            const up = await updateStudioScreen(targetEditScreenId, { width: cw, height: ch });
            if (up.ok) {
              upsertScreen(up.data);
              useCanvasItemsStore.getState().updateItem(wf.id, {
                width: cw,
                height: ch,
                deviceType: inferDeviceTypeFromWidth(cw),
              } as Partial<CanvasItem>);
            }
          }
        }
      } else {
        // ── Create new screen ──
        let existingProjectContext: string | null = null;
        if (allScreens.length > 0) {
          const activeId = activeScreenId ?? allScreens[0]?.id;
          const activeScreen = allScreens.find((s) => s.id === activeId);
          if (activeScreen?.ui_schema) {
            existingProjectContext = getHtmlDocumentString(activeScreen.ui_schema as UISchema) ?? null;
          }
        }

        // Derive dimensions from the first non-DS product screen
        const refScreen = allScreens.find((s) => !isStyleGuideScreenRow(s) && s.width > 0)
          ?? allScreens.find((s) => !isStyleGuideScreenRow(s));
        const newW = refScreen?.width || 1280;
        const newH = refScreen?.height || 800;

        const maxSort = allScreens.reduce(
          (m, s) => Math.max(m, s.sort_order ?? 0),
          -1,
        );
        const screenRes = await createStudioScreen(initialProject.id, {
          name: text.slice(0, 40),
          width: newW,
          height: newH,
          sort_order: maxSort + 1,
        });
        if (!screenRes.ok) {
          toast.error(screenRes.error);
          return;
        }
        const screen = screenRes.data;
        upsertScreen(screen);

        const items = useCanvasItemsStore.getState().items;
        const maxRight = items.reduce(
          (max, item) => Math.max(max, item.x + (item.width || 0)),
          0,
        );
        const placeX = items.length > 0 ? maxRight + 80 : 1000;
        addCanvasItem({
          id: `wf-${screen.id}`,
          type: "webframe",
          x: placeX,
          y: 200,
          width: screen.width || 1280,
          height: screen.height || 800,
          screenId: screen.id,
          deviceType: inferDeviceTypeFromWidth(screen.width || 1280),
        });
        useEditorStore.getState().setActiveScreen(screen.id);
        screenId = screen.id;

        // Pass context for new screens so model has style continuity
        const jobRes = await createStudioGenerationJob(initialProject.id, {
          prompt: text,
          screen_id: screenId,
          model,
          ...generationContextFromUrls(urlsForJob),
        });
        if (!jobRes.ok) {
          toast.error(jobRes.error);
          return;
        }
        const streamResult = await startStream({
          jobId: jobRes.data.id,
          thinkingMode: resolvedThinking,
          targetScreenId: screenId,
          screenCount: 1,
          attachedImages: currentAttachments.length > 0 ? currentAttachments : undefined,
          pipeline: settings.getGenerationPipelineBody(),
          onScreenReady: () => void handleScreenReady(),
          existingProjectContext,
        });
        await persistLog(jobRes.data.id, streamResult.entries, streamResult.affectedScreenIds);
        const freshScreens = await listStudioScreens(initialProject.id);
        if (freshScreens.ok) {
          setScreens(freshScreens.data);
          const currentItems2 = useCanvasItemsStore.getState().items;
          setCanvasItems(appendMissingWebframeItems(currentItems2, freshScreens.data));
        }
        return;
      }

      // ── Common path for edit-in-place ──
      const jobRes = await createStudioGenerationJob(initialProject.id, {
        prompt: text,
        screen_id: screenId,
        model,
        ...generationContextFromUrls(urlsForJob),
      });

      if (!jobRes.ok) {
        toast.error(jobRes.error);
        return;
      }

      const streamResult = await startStream({
        jobId: jobRes.data.id,
        thinkingMode: resolvedThinking,
        targetScreenId: screenId,
        screenCount: 1,
        attachedImages: currentAttachments.length > 0 ? currentAttachments : undefined,
        pipeline: settings.getGenerationPipelineBody(),
        onScreenReady: () => void handleScreenReady(),
      });
      await persistLog(jobRes.data.id, streamResult.entries, streamResult.affectedScreenIds);

      const freshScreens = await listStudioScreens(initialProject.id);
      if (freshScreens.ok) {
        setScreens(freshScreens.data);
        const currentItems = useCanvasItemsStore.getState().items;
        setCanvasItems(appendMissingWebframeItems(currentItems, freshScreens.data));
      }
      } catch (err) {
        console.error("[generation] transition error:", err);
        toast.error(err instanceof Error ? err.message : "Generation failed");
      }
    });
  }, [
    editingScreenId,
    selectedScreenId,
    isSelectedScreenDS,
    activeScreenId,
    prompt,
    attachedFiles,
    referenceUrls,
    initialProject.id,
    model,
    thinkingMode,
    startStream,
    persistLog,
    upsertScreen,
    addCanvasItem,
    setCanvasItems,
    setScreens,
    settings,
    handleScreenReady,
  ]);

  /** Generate → pick a size: new artboard at that size + same pipeline as the main prompt bar. */
  const handleGenerateNewScreenAtSize = useCallback(
    (payload: GenerateNewScreenSizePayload) => {
      if (generationLockRef.current || useGenerationLog.getState().isGenerating || pending) {
        toast.error("Wait for the current generation to finish.");
        return;
      }
      generationLockRef.current = true;
      const typed = prompt.trim();
      const preferredId = selectedScreenId ?? useEditorStore.getState().activeScreenId;
      const fromJobs = pickLatestJobPrompt(generationJobs, preferredId);
      const fromRef = lastGenerationPromptRef.current.trim();
      const text =
        typed.length >= 3 ? typed
        : fromJobs.length >= 3 ? fromJobs
        : fromRef.length >= 3 ? fromRef
        : "";
      if (text.length < 3) {
        generationLockRef.current = false;
        toast.error(
          "Enter at least 3 characters in the prompt bar, or run Generate once so we can reuse that prompt for another size.",
        );
        return;
      }
      lastGenerationPromptRef.current = text;

      const rawAttachments2 = attachedFiles.map((f) => ({
        base64: f.base64,
        mimeType: f.mimeType,
        filename: f.filename,
      }));
      const urlsForJob = [...referenceUrls];
      setAttachedFiles([]);
      setReferenceUrls([]);
      setPrompt("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      setSidebarOpen(true);
      toast.message(`New ${payload.label} artboard…`, {
        description: "Generating with your prompt.",
      });

      startGenerationTransition(async () => {
        try {
        const currentAttachments = rawAttachments2.length > 0
          ? await Promise.all(
              rawAttachments2.map(async (a) => {
                const url = await uploadAttachmentToLocal(
                  { id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`, previewUrl: "", ...a },
                  initialProject.id,
                );
                return { ...a, ...(url ? { url } : {}) };
              }),
            )
          : rawAttachments2;
        const resolvedThinking = resolveAutoThinking(thinkingMode);
        const cw = clampArtboardDimension(Math.round(payload.width));
        const ch = clampArtboardDimension(Math.round(payload.height));

        const existing = useEditorStore.getState().screens;
        const maxSort = existing.reduce(
          (m, s) => Math.max(m, s.sort_order ?? 0),
          -1,
        );

        const screenRes = await createStudioScreen(initialProject.id, {
          name: text.slice(0, 40),
          width: cw,
          height: ch,
          sort_order: maxSort + 1,
        });
        if (!screenRes.ok) {
          toast.error(screenRes.error);
          return;
        }
        const screen = screenRes.data;
        upsertScreen(screen);

        const items = useCanvasItemsStore.getState().items;
        const maxRight = items.reduce(
          (max, item) => Math.max(max, item.x + (item.width || 0)),
          0,
        );
        const placeX = items.length > 0 ? maxRight + 80 : 1000;
        addCanvasItem({
          id: `wf-${screen.id}`,
          type: "webframe",
          x: placeX,
          y: 200,
          width: cw,
          height: ch,
          screenId: screen.id,
          deviceType: payload.deviceType,
        });
        useEditorStore.getState().setActiveScreen(screen.id);

        const jobRes = await createStudioGenerationJob(initialProject.id, {
          prompt: text,
          screen_id: screen.id,
          model,
          ...generationContextFromUrls(urlsForJob),
        });

        if (!jobRes.ok) {
          toast.error(jobRes.error);
          return;
        }

        const streamResult = await startStream({
          jobId: jobRes.data.id,
          thinkingMode: resolvedThinking,
          targetScreenId: screen.id,
          screenCount: 1,
          attachedImages: currentAttachments.length > 0 ? currentAttachments : undefined,
          pipeline: settings.getGenerationPipelineBody(),
          onScreenReady: () => void handleScreenReady(),
        });
        await persistLog(jobRes.data.id, streamResult.entries, streamResult.affectedScreenIds);

        const freshScreens = await listStudioScreens(initialProject.id);
        if (freshScreens.ok) {
          setScreens(freshScreens.data);
          const currentItems = useCanvasItemsStore.getState().items;
          setCanvasItems(appendMissingWebframeItems(currentItems, freshScreens.data));
        }
        } catch (err) {
          console.error("[generation] new-screen-size error:", err);
          toast.error(err instanceof Error ? err.message : "Generation failed");
        } finally {
          generationLockRef.current = false;
        }
      });
    },
    [
      prompt,
      attachedFiles,
      referenceUrls,
      pending,
      initialProject.id,
      model,
      thinkingMode,
      startStream,
      persistLog,
      upsertScreen,
      addCanvasItem,
      setCanvasItems,
      setScreens,
      settings,
      generationJobs,
      handleScreenReady,
      selectedScreenId,
    ],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && canGenerate) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 5MB)`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] || "";
        const att: PendingAttachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          filename: file.name,
          mimeType: file.type,
          base64,
          previewUrl: dataUrl,
        };
        setAttachedFiles((prev) => [...prev, att]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const removeAttachedFile = useCallback((id: string) => {
    setAttachedFiles((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /**
   * Regenerate into a **new** artboard: originals are never overwritten.
   * Copies size + ui_schema onto the new row so the model still gets full refine context.
   */
  const runRegenerationAsNewScreen = useCallback(
    async (sourceScreenId: string, promptText: string): Promise<boolean> => {
      if (useGenerationLog.getState().isGenerating) return false;
      const trimmedPrompt = promptText.trim();
      if (trimmedPrompt.length >= 3) {
        lastGenerationPromptRef.current = trimmedPrompt;
      }
      const urlsForJob = [...referenceUrls];
      const source = useEditorStore
        .getState()
        .screens.find((s) => s.id === sourceScreenId);
      if (!source) {
        toast.error("Source artboard not found");
        return false;
      }

      const items = useCanvasItemsStore.getState().items;
      const sourceWf = items.find(
        (i): i is CanvasItem & { type: "webframe"; screenId: string } =>
          i.type === "webframe" && i.screenId === sourceScreenId,
      );
      let w = source.width || 1280;
      let h = source.height || 800;
      if (sourceWf) {
        w = clampArtboardDimension(Math.round(sourceWf.width));
        h = clampArtboardDimension(Math.round(sourceWf.height));
      }
      const maxRight = items.reduce(
        (max, item) => Math.max(max, item.x + (item.width || 0)),
        0,
      );
      const placeX = maxRight > 0 ? maxRight + 80 : 1000;
      const placeY = sourceWf?.y ?? 200;

      const allScreens = useEditorStore.getState().screens;
      const maxSort = Math.max(
        0,
        ...allScreens.map((s) => Number(s.sort_order) || 0),
      );

      const baseName = source.name.trim() || "Screen";
      const newName = `${baseName} — regenerated`.slice(0, 200);

      const uiCopy = (
        source.ui_schema
          ? JSON.parse(JSON.stringify(source.ui_schema))
          : { schema_version: 1, id: "root", type: "page" }
      ) as UISchema;

      const screenRes = await createStudioScreen(initialProject.id, {
        name: newName,
        width: w,
        height: h,
        ui_schema: uiCopy,
        sort_order: maxSort + 1,
        canvas_x: placeX,
        canvas_y: placeY,
      });
      if (!screenRes.ok) {
        toast.error(screenRes.error);
        return false;
      }

      const newScreen = screenRes.data;
      upsertScreen(newScreen);
      addCanvasItem({
        id: `wf-${newScreen.id}`,
        type: "webframe",
        x: placeX,
        y: placeY,
        width: w,
        height: h,
        screenId: newScreen.id,
        deviceType: inferDeviceTypeFromWidth(w),
      });
      useEditorStore.getState().setActiveScreen(newScreen.id);

      const resolvedThinking = resolveAutoThinking(thinkingMode);
      const jobRes = await createStudioGenerationJob(initialProject.id, {
        prompt: promptText,
        screen_id: newScreen.id,
        model,
        ...generationContextFromUrls(urlsForJob),
      });
      if (!jobRes.ok) {
        toast.error(jobRes.error);
        return false;
      }

      const streamResult = await startStream({
        jobId: jobRes.data.id,
        thinkingMode: resolvedThinking,
        targetScreenId: newScreen.id,
        pipeline: settings.getGenerationPipelineBody(),
        onScreenReady: () => void handleScreenReady(),
      });
      await persistLog(jobRes.data.id, streamResult.entries, streamResult.affectedScreenIds);

      const freshScreens = await listStudioScreens(initialProject.id);
      if (freshScreens.ok) {
        setScreens(freshScreens.data);
        const currentItems = useCanvasItemsStore.getState().items;
        setCanvasItems(appendMissingWebframeItems(currentItems, freshScreens.data));
      }

      return streamResult.ok;
    },
    [
      addCanvasItem,
      handleScreenReady,
      initialProject.id,
      model,
      persistLog,
      referenceUrls,
      setCanvasItems,
      setScreens,
      settings,
      startStream,
      thinkingMode,
      upsertScreen,
    ],
  );

  const handleRegenerateScreen = useCallback(
    (screenId: string) => {
      if (useGenerationLog.getState().isGenerating || pending) {
        toast.error("Wait for the current generation to finish.");
        return;
      }
      setSidebarOpen(true);
      startGenerationTransition(async () => {
        const pr = await getRegenerationPromptForScreen(
          initialProject.id,
          screenId,
        );
        if (!pr.ok) {
          toast.error(pr.error);
          return;
        }
        toast.message("Regenerating into a new artboard…", {
          description: "Original screen is left unchanged.",
        });
        const ok = await runRegenerationAsNewScreen(screenId, pr.data.prompt);
        if (ok) toast.success("New artboard created");
        else toast.error("Regeneration failed");
      });
    },
    [
      initialProject.id,
      pending,
      runRegenerationAsNewScreen,
      startGenerationTransition,
    ],
  );

  const handleRegenerateProject = useCallback(() => {
    if (useGenerationLog.getState().isGenerating || pending) {
      toast.error("Wait for the current generation to finish.");
      return;
    }
    const screens = sortScreensForDisplay(useEditorStore.getState().screens);
    if (screens.length === 0) {
      toast.error("No artboards in this project.");
      return;
    }
    if (
      !confirm(
        `Create a regenerated copy of each of ${screens.length} artboard(s)? Originals stay unchanged. Uses your current model, thinking mode, and pipeline — can take several minutes.`,
      )
    ) {
      return;
    }
    setMenuOpen(false);
    setSidebarOpen(true);
    startGenerationTransition(async () => {
      for (let i = 0; i < screens.length; i++) {
        const sc = screens[i];
        const pr = await getRegenerationPromptForScreen(
          initialProject.id,
          sc.id,
        );
        if (!pr.ok) {
          toast.error(`Skipped “${sc.name}”: ${pr.error}`);
          continue;
        }
        toast.message(`New copy ${i + 1}/${screens.length}: ${sc.name}`, {
          description: "Original left unchanged.",
        });
        const ok = await runRegenerationAsNewScreen(sc.id, pr.data.prompt);
        if (!ok) {
          toast.error(`Failed on “${sc.name}” — stopped.`);
          return;
        }
      }
      toast.success("All regeneration copies created.");
    });
  }, [initialProject.id, pending, runRegenerationAsNewScreen, startGenerationTransition]);

  const handleGatherAllCanvas = useCallback(async () => {
    setMenuOpen(false);
    const items = useCanvasItemsStore.getState().items;
    if (items.length === 0) {
      toast.error("Nothing on the canvas");
      return;
    }
    const screens = useEditorStore.getState().screens;
    const gathered = gatherCanvasItemsInHorizontalRow(items, screens);
    setCanvasItems(gathered);

    const webframes = gathered.filter(
      (i): i is CanvasItem & { type: "webframe"; screenId: string } =>
        i.type === "webframe",
    );
    const updateLocal = useEditorStore.getState().updateScreenLocal;
    for (const wf of webframes) {
      updateLocal(wf.screenId, { canvas_x: wf.x, canvas_y: wf.y });
    }

    const results = await Promise.all(
      webframes.map((wf) =>
        updateStudioScreen(wf.screenId, { canvas_x: wf.x, canvas_y: wf.y }),
      ),
    );
    const failed = results.find((r) => !r.ok);
    if (failed && !failed.ok) {
      toast.error(`Saved layout on canvas; could not sync a screen: ${failed.error}`);
    } else {
      toast.success("Gathered everything into one row");
    }

    void updateStudioProject(initialProject.id, {
      canvas_document: { items: gathered } as Record<string, unknown>,
    });
  }, [initialProject.id, setCanvasItems]);

  const canvasStudioActions = useMemo(
    () => ({
      regenerateScreen: handleRegenerateScreen,
      regenerateProject: handleRegenerateProject,
      generateNewScreenAtSize: handleGenerateNewScreenAtSize,
      editScreen: handleEditScreen,
      liveEditScreen: handleLiveEditScreen,
      liveEditScreenId,
      stopLiveEdit: handleStopLiveEdit,
    }),
    [
      handleGenerateNewScreenAtSize,
      handleRegenerateProject,
      handleRegenerateScreen,
      handleEditScreen,
      handleLiveEditScreen,
      liveEditScreenId,
      handleStopLiveEdit,
    ],
  );

  const entries = genLog.entries;
  const suggestions = useGenerationLog((s) => s.suggestions);

  return (
    <div className="studio-shell-bg fixed inset-0 flex flex-col text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* ── minimal top bar ── */}
      <header className="studio-glass-bar relative z-[220] flex h-12 shrink-0 items-center gap-3 border-b px-4">
        {/* burger menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-8 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
            aria-label="Menu"
          >
            <Menu className="size-[18px]" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-[221]"
                onClick={() => setMenuOpen(false)}
                aria-hidden
              />
              <div className="absolute left-0 top-full z-[222] mt-1.5 w-56 max-h-[70dvh] overflow-y-auto rounded-xl border border-zinc-200/90 bg-white/95 py-1.5 shadow-[0_16px_48px_-8px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); router.push("/"); }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <ChevronLeft className="size-4 text-zinc-500" />
                  Go to all projects
                </button>

                <div className="my-1.5 border-t border-zinc-200 dark:border-zinc-700" />

                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); toast.info("Share coming soon"); }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <Share2 className="size-4 text-zinc-500" />
                  Share
                </button>

                <div className="my-1.5 border-t border-zinc-200 dark:border-zinc-700" />

                <button
                  type="button"
                  onClick={() => handleRegenerateProject()}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <RefreshCw className="size-4 text-zinc-500" />
                  Regenerate
                </button>

                <button
                  type="button"
                  onClick={() => void handleGatherAllCanvas()}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <LayoutGrid className="size-4 text-zinc-500" />
                  Gather all
                </button>

                <div className="my-1.5 border-t border-zinc-200 dark:border-zinc-700" />

                <button
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false);
                    const screens = useEditorStore.getState().screens.filter(
                      (s) => s.ui_schema && typeof s.ui_schema === "object",
                    );
                    if (screens.length === 0) {
                      toast.error("No screens to export");
                      return;
                    }
                    try {
                      const zip = new JSZip();
                      const slug = (n: string) => n.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_|_$/g, "").slice(0, 48) || "screen";
                      const templateScreen = screens.find(
                        (s) => !isHtmlDocumentScreen(s.ui_schema),
                      );
                      const templateSchema =
                        (templateScreen?.ui_schema as UISchema) ??
                        ({ schema_version: 1, id: "r", type: "page" } as UISchema);
                      const sharedTpl = buildStaticExportBundle(templateSchema, {
                        title: "Shared",
                        cssFile: "styles.css",
                        jsFile: "script.js",
                      });
                      const sharedCss = sharedTpl.css;
                      const sharedJs = sharedTpl.js;
                      zip.file("styles.css", sharedCss);
                      zip.file("script.js", sharedJs);
                      const links: string[] = [];
                      for (let i = 0; i < screens.length; i++) {
                        const s = screens[i];
                        const name = s.name || `Screen ${i + 1}`;
                        const base = `${slug(name)}-${s.id.slice(0, 8)}`;
                        const htmlFile = `${base}.html`;
                        const bundle = buildStaticExportBundle(s.ui_schema as UISchema, {
                          title: name,
                          cssFile: "styles.css",
                          jsFile: "script.js",
                          screenWidth: s.width,
                          screenHeight: s.height,
                        });
                        zip.file(htmlFile, bundle.html);
                        links.push(`    <li><a href="./${htmlFile}">${escapeHtml(name)}</a></li>`);
                      }
                      const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(projectName)} - Export</title>
</head>
<body style="font-family:system-ui;padding:2rem;max-width:640px;margin:0 auto">
  <h1>${escapeHtml(projectName)}</h1>
  <p>Screens (${screens.length}):</p>
  <ul style="list-style:none;padding:0">${links.join("\n")}</ul>
</body>
</html>`;
                      zip.file("index.html", indexHtml);
                      if (initialProject.design_md) {
                        zip.file("DESIGN.md", initialProject.design_md);
                      }
                      const blob = await zip.generateAsync({ type: "blob" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${projectName.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.zip`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success(`Exported ${screens.length} screen(s)`);
                    } catch (err) {
                      toast.error("Export failed");
                      console.error(err);
                    }
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <Download className="size-4 text-zinc-500" />
                  Export project
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    const screens = useEditorStore.getState().screens;
                    if (screens.length === 0) { toast.error("No screens to export"); return; }
                    const payload = {
                      project_id: initialProject.id,
                      project_name: projectName,
                      exported_at: new Date().toISOString(),
                      screens: screens.map((s) => ({ id: s.id, name: s.name, width: s.width, height: s.height, ui_schema: s.ui_schema })),
                    };
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${projectName.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("JSON exported");
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <Code className="size-4 text-zinc-500" />
                  Export JSON
                </button>

                <div className="my-1.5 border-t border-zinc-200 dark:border-zinc-700" />

                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setRenaming(true); }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <Pencil className="size-4 text-zinc-500" />
                  Rename
                </button>

                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); router.push("/settings"); }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <KeyRound className="size-4 text-zinc-500 dark:text-zinc-400" />
                  Settings
                </button>

                <div className="my-1.5 border-t border-zinc-200 dark:border-zinc-700" />

                <button
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false);
                    if (!confirm("Delete this project?")) return;
                    const res = await deleteStudioProject(initialProject.id);
                    if (res.ok) {
                      toast.success("Project deleted");
                      router.push("/");
                    } else {
                      toast.error(res.error);
                    }
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="size-4" />
                  Delete project
                </button>
              </div>
            </>
          )}
        </div>

        {/* project name */}
        <div className="min-w-0 flex-shrink">
          {renaming ? (
            <input
              autoFocus
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={() => {
                setRenaming(false);
                const trimmed = projectName.trim();
                if (trimmed && trimmed !== initialProject.name) {
                  void updateStudioProject(initialProject.id, { name: trimmed });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") { setProjectName(initialProject.name); setRenaming(false); }
              }}
              className="h-7 w-full max-w-[200px] rounded-md border border-zinc-300 bg-zinc-50 px-2 text-base sm:text-[13px] text-zinc-800 outline-none focus:border-violet-500/50"
            />
          ) : (
            <span className="block truncate text-[13px] font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">
              {projectName}
            </span>
          )}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              handleFileSelect(e.target.files);
              e.target.value = "";
            }
          }}
        />
      </header>

      {/* ── canvas (z-0 so header z-[220] stays above GenerationSidebar z-[205] inside here) ── */}
      <div className="relative z-0 min-h-0 flex-1 overflow-hidden">
        <CanvasStudioActionsContext.Provider value={canvasStudioActions}>
          <StudioCanvas />
        </CanvasStudioActionsContext.Provider>

        {/* ── generation sidebar ── */}
        {sidebarOpen && (
          <GenerationSidebar onClose={() => setSidebarOpen(false)} />
        )}

        {/* ── collapsed: always-visible expand control on the canvas edge ── */}
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="absolute left-0 top-1/2 z-[210] flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-r-xl border border-l-0 border-zinc-200 bg-white py-3 pl-1.5 pr-2.5 shadow-md transition-colors hover:border-violet-200 hover:bg-violet-50/50"
            aria-label="Expand activity panel"
            title="View generation activity and model output"
          >
            <ChevronRight className="size-4 text-zinc-500" />
            <ScrollText className="size-4 text-violet-600" />
            <span className="select-none text-[9px] font-bold uppercase tracking-wider text-zinc-600">
              Activity
            </span>
            {entries.length > 0 && (
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  isGenerating ? "animate-pulse bg-violet-500"
                  : entries.some((e) => e.type === "error") ? "bg-red-500"
                  : "bg-emerald-500",
                )}
                aria-hidden
              />
            )}
          </button>
        )}

        {/* ── floating prompt bar ── */}
        <div className="absolute bottom-5 left-1/2 z-20 w-full max-w-[640px] -translate-x-1/2 px-4">
          {/* ── contextual suggestions (horizontal, drag-to-scroll) ── */}
          {suggestions.length > 0 && !isGenerating && (
            <SuggestionChips suggestions={suggestions} onPick={(s) => { setPrompt(s); textareaRef.current?.focus(); }} />
          )}
          <div className={cn(
            "studio-prompt-elevated rounded-2xl transition-[border-color,box-shadow] duration-200",
            editTargetScreenName && !isGenerating && "ring-2 ring-violet-400/40",
            isSelectedScreenDS && "opacity-50",
          )}>
            {editTargetScreenName && !isGenerating && (
              <div className="flex items-center gap-1.5 px-4 pt-2 pb-0 min-w-0">
                <Pencil className="size-3 shrink-0 text-violet-500" />
                <span className="min-w-0 truncate text-[11px] font-medium text-violet-600">
                  Editing: {editTargetScreenName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingScreenId(null);
                    useCanvasItemsStore.getState().selectItem(null);
                  }}
                  className="ml-auto text-[10px] text-zinc-400 hover:text-zinc-600"
                >
                  Cancel
                </button>
              </div>
            )}
            {isSelectedScreenDS && (
              <div className="px-4 pt-2.5 pb-0 text-[11px] text-zinc-400">
                Design System is read-only
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isSelectedScreenDS
                  ? "Select a product screen to edit, or deselect to create new…"
                  : editTargetScreenName
                    ? `Describe changes to "${editTargetScreenName}"…`
                    : "Describe changes or create something new…"
              }
              rows={1}
              disabled={promptDisabled}
              className="block w-full resize-none bg-transparent px-4 pt-3 pb-1.5 text-base leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:outline-none disabled:opacity-40 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              style={{ minHeight: "40px", maxHeight: "160px" }}
            />

            {/* attached file / URL chips + inline URL input */}
            {(attachedFiles.length > 0 || referenceUrls.length > 0 || urlInputVisible) && (
              <div className="flex flex-wrap items-center gap-1.5 px-3 pt-0.5 pb-1">
                {attachedFiles.map((f) => (
                  <div
                    key={f.id}
                    className="group relative flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-1.5 py-1"
                  >
                    <img
                      src={f.previewUrl}
                      alt={f.filename}
                      className="size-6 rounded object-cover"
                    />
                    <span className="max-w-[100px] truncate text-[10px] text-zinc-600">
                      {f.filename}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachedFile(f.id)}
                      className="flex size-3.5 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 transition-colors hover:bg-red-100 hover:text-red-600"
                    >
                      <X className="size-2" />
                    </button>
                  </div>
                ))}
                {referenceUrls.map((u) => (
                  <div
                    key={u}
                    className="group flex max-w-[220px] items-center gap-1.5 rounded-lg border border-sky-200/90 bg-sky-50/90 px-1.5 py-1"
                    title={u}
                  >
                    <Globe className="size-3.5 shrink-0 text-sky-600" />
                    <span className="min-w-0 truncate text-[10px] font-medium text-sky-900">
                      {formatReferenceUrlChip(u)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeReferenceUrl(u)}
                      className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-sky-200/80 text-sky-700 transition-colors hover:bg-red-100 hover:text-red-600"
                      aria-label="Remove URL"
                    >
                      <X className="size-2" />
                    </button>
                  </div>
                ))}
                {urlInputVisible && (
                  <div className="flex w-full items-center gap-1.5">
                    <Globe className="size-3.5 shrink-0 text-sky-500" />
                    <input
                      ref={urlInputRef}
                      value={urlDraft}
                      onChange={(e) => setUrlDraft(e.target.value)}
                      placeholder="https://example.com"
                      className="min-w-0 flex-1 bg-transparent text-base sm:text-[12px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addReferenceUrlInline();
                        } else if (e.key === "Escape") {
                          setUrlDraft("");
                          setUrlInputVisible(false);
                        }
                      }}
                      onBlur={() => {
                        if (!urlDraft.trim()) {
                          setUrlInputVisible(false);
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5">
              {/* model */}
              <div className="relative">
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as StudioModelId)}
                  disabled={isGenerating}
                  className="h-6 appearance-none rounded-md border-0 bg-zinc-100 py-0 pl-2 pr-6 text-[11px] font-medium text-zinc-700 outline-none transition-colors hover:bg-zinc-200 hover:text-zinc-900 focus:ring-0 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {STUDIO_MODELS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-white text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">{m.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-2.5 -translate-y-1/2 text-zinc-500" />
              </div>

              {/* thinking */}
              <div className="relative">
                <select
                  value={thinkingMode}
                  onChange={(e) => setThinkingMode(e.target.value as ThinkingMode)}
                  disabled={isGenerating}
                  className="h-6 appearance-none rounded-md border-0 bg-zinc-100 py-0 pl-2 pr-6 text-[11px] font-medium text-zinc-700 outline-none transition-colors hover:bg-zinc-200 hover:text-zinc-900 focus:ring-0 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {THINKING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} className="bg-white text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-2.5 -translate-y-1/2 text-zinc-500" />
              </div>

              <div className="flex-1" />

              <DropdownMenu>
                <DropdownMenuTrigger
                  type="button"
                  disabled={isGenerating}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-800",
                    (attachedFiles.length > 0 || referenceUrls.length > 0) &&
                      "text-violet-600 hover:text-violet-700",
                    isGenerating && "pointer-events-none opacity-40",
                  )}
                  aria-label="Add attachment"
                  title="Upload images or attach a website URL as reference"
                >
                  <Plus className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuItem
                    onClick={() => fileRef.current?.click()}
                    className="gap-2"
                  >
                    <ImageIcon className="size-4 text-zinc-500" />
                    Upload files
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setUrlInputVisible(true)}
                    className="gap-2"
                  >
                    <Globe className="size-4 text-zinc-500" />
                    Website URL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* send */}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg transition-all",
                  canGenerate
                    ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20 active:scale-95"
                    : "bg-zinc-100 text-zinc-400",
                )}
                aria-label="Generate"
              >
                {isGenerating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="size-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
