"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { createStudioGenerationJob } from "@/actions/studio/generation-jobs";
import { createStudioProject, deleteStudioProject } from "@/actions/studio/projects";
import { createStudioScreen } from "@/actions/studio/screens";
import {
  defaultStudioModel,
  getProviderFromModelId,
  modelRequiresThinking,
  STUDIO_MODELS,
  type StudioModelId,
} from "@/lib/llm/studio-models";
import { type ThinkingMode, resolveAutoThinking } from "@/lib/llm/thinking-mode";
import {
  normalizeStudioJobContext,
  STUDIO_MAX_REFERENCE_URLS,
  tryParseReferenceUrl,
} from "@/lib/studio/job-context";
import { cn } from "@/lib/utils";
import { COLOR_SCHEMES } from "@/data/color-schemes";
import type { StudioProjectRow } from "@/types/studio";
import {
  ArrowUp,
  ChevronDown,
  FolderOpen,
  Globe,
  Grid2x2,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Monitor,
  MoreHorizontal,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Smartphone,
  Moon,
  Sparkles,
  Sun,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { usePendingAttachments, type PendingAttachment } from "@/store/pending-attachments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ALL_SUGGESTIONS = [
  {
    label: "SaaS Dashboard",
    text: "Modern SaaS analytics dashboard with dark theme, real-time charts, KPI cards, and sleek sidebar navigation",
  },
  {
    label: "AI Landing Page",
    text: "Premium landing page for an AI writing assistant with hero section, feature cards with illustrations, testimonials, pricing tiers, and a signup flow",
  },
  {
    label: "Habit Tracker",
    text: "Habit tracker mobile app with daily streaks, circular progress rings, soft pastel gradients, and playful micro-animations",
  },
  {
    label: "E-commerce Store",
    text: "Luxury fashion e-commerce homepage with editorial hero image, trending collections grid, minimalist product cards, and a sticky cart drawer",
  },
  {
    label: "Food Delivery",
    text: "Food delivery app with restaurant listings, cuisine filters, order tracking map, and a warm appetizing color palette",
  },
  {
    label: "Finance App",
    text: "Personal finance mobile app with spending breakdown donut chart, transaction history, budget goals, and a clean fintech aesthetic",
  },
  {
    label: "Travel Booking",
    text: "Travel booking app with destination cards, date picker, price comparison, and dreamy photography-driven design",
  },
  {
    label: "Social Platform",
    text: "Social media feed with stories carousel, post cards with reactions, comments thread, and a vibrant modern design",
  },
  {
    label: "Music Player",
    text: "Mobile music player with album art, playback controls, playlist queue, and a retro vinyl-inspired dark UI",
  },
  {
    label: "Fitness Tracker",
    text: "Fitness tracking app with workout logging, progress charts, activity rings, leaderboard, and an energetic bold design",
  },
  {
    label: "Portfolio Site",
    text: "Creative portfolio website for a designer with project gallery grid, about section, contact form, and editorial typography",
  },
  {
    label: "Recipe App",
    text: "Recipe app with ingredient lists, step-by-step instructions, cook time badges, and warm kitchen-inspired visuals",
  },
  {
    label: "Podcast App",
    text: "Podcast app with episode cards, waveform player, subscription management, and a cozy dark-mode interface",
  },
  {
    label: "Real Estate",
    text: "Real estate listing page with property gallery carousel, floor plan, neighborhood map, mortgage calculator, and a premium feel",
  },
  {
    label: "Event Tickets",
    text: "Event ticketing app with concert listings, seat picker, QR code tickets, and a bold nightlife-inspired neon aesthetic",
  },
  {
    label: "Weather App",
    text: "Weather forecast app with animated conditions, hourly timeline, 7-day outlook, and atmospheric gradient backgrounds",
  },
];

const SSR_SUGGESTIONS = ALL_SUGGESTIONS.slice(0, 6);

const THINKING_OPTIONS: { value: ThinkingMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "fast", label: "Fast" },
  { value: "think", label: "Think" },
  { value: "sync-neurons", label: "Deep" },
  { value: "go-all-in", label: "Max" },
];

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

type Props = {
  initialProjects?: StudioProjectRow[];
};

export function WelcomeShell({
  initialProjects = [],
}: Props) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [prompt, setPrompt] = useState("");
  const [surface, setSurface] = useState<"web" | "app">("web");
  const [model, setModel] = useState<StudioModelId>(defaultStudioModel());
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("auto");
  const [creating, setCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"mine" | "shared">("mine");
  const [projects, setProjects] = useState<StudioProjectRow[]>(initialProjects);
  const [suggestions, setSuggestions] = useState(SSR_SUGGESTIONS);
  useEffect(() => {
    const shuffled = [...ALL_SUGGESTIONS].sort(() => Math.random() - 0.5);
    setSuggestions(shuffled.slice(0, 6));
  }, []);
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<PendingAttachment[]>([]);
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [urlInputVisible, setUrlInputVisible] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [selectedScheme, setSelectedScheme] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const pendingStore = usePendingAttachments();

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
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

  const handleSubmit = useCallback(async () => {
    const p = prompt.trim();
    if (p.length < 3 || creating) return;

    setCreating(true);
    try {
      const resolvedThinking = resolveAutoThinking(thinkingMode);
      const effectiveThinking =
        model !== "auto" && modelRequiresThinking(model) && resolvedThinking === "fast"
          ? "think"
          : resolvedThinking;

      const title = p.replace(/\s+/g, " ").trim().slice(0, 80) || "New design";

      const proj = await createStudioProject(title);
      if (!proj.ok) {
        toast.error(proj.error);
        return;
      }

      const isMobile = surface === "app";
      const screenW = isMobile ? 390 : 1280;
      const screenH = isMobile ? 844 : 800;

      const scr = await createStudioScreen(proj.data.id, {
        width: screenW,
        height: screenH,
        name: "Screen",
      });
      if (!scr.ok) { toast.error(scr.error); return; }

      const scheme = selectedScheme
        ? COLOR_SCHEMES.find((s) => s.id === selectedScheme)
        : null;
      const context = normalizeStudioJobContext({
        reference_urls: referenceUrls,
        ...(scheme && {
          color_scheme: {
            name: scheme.name,
            mode: scheme.mode,
            colors: scheme.colors,
            fonts: scheme.fonts,
          },
        }),
      });
      const job = await createStudioGenerationJob(proj.data.id, {
        prompt: p,
        screen_id: scr.data.id,
        model,
        context,
      });
      if (!job.ok) { toast.error(job.error); return; }

      try {
        sessionStorage.setItem(
          "ptu-pending-job",
          JSON.stringify({
            jobId: job.data.id,
            thinkingMode: effectiveThinking,
            model,
          }),
        );
      } catch {
        /* optional */
      }

      if (attachedFiles.length > 0) {
        for (const f of attachedFiles) pendingStore.addAttachment(f);
        setAttachedFiles([]);
      }
      setReferenceUrls([]);

      router.push(`/project/${proj.data.id}`);

      // fire-and-forget: generate a thumbnail for the sidebar
      try {
        void fetch("/api/studio/generation/thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            projectId: proj.data.id,
            prompt: p,
            ...(model !== "auto" && { provider: getProviderFromModelId(model) }),
          }),
        });
      } catch {
        /* thumbnail is optional */
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create project",
      );
    } finally {
      setCreating(false);
    }
  }, [
    prompt,
    creating,
    model,
    thinkingMode,
    router,
    attachedFiles,
    referenceUrls,
    pendingStore,
    surface,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDeleteProject = useCallback(
    async (id: string) => {
      if (!confirm("Delete this project?")) return;
      const res = await deleteStudioProject(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setProjects((prev) => prev.filter((p) => p.id !== id));
      toast.success("Project deleted");
    },
    [],
  );

  const canSubmit = prompt.trim().length >= 3 && !creating;

  const filteredProjects = searchQuery.trim()
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : projects;

  const groupedProjects = groupProjectsByDate(filteredProjects);

  return (
    <div className="studio-shell-bg fixed inset-0 flex text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* ── projects sidebar ── */}
      <aside
          className={cn(
            "relative z-20 flex shrink-0 flex-col transition-all duration-200 overflow-hidden",
            sidebarOpen ? "w-[280px] sm:w-[320px]" : "w-0",
          )}
        >
          {sidebarOpen && (
            <div className="studio-glass-bar flex h-full w-[280px] sm:w-[320px] flex-col border-r bg-white/85 dark:bg-zinc-900/90">
              {/* sidebar header with logo */}
              <div className="flex h-14 shrink-0 items-center gap-2.5 px-5">
                <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-violet-500 to-fuchsia-600 shadow-md shadow-violet-500/25">
                  <Sparkles className="size-[15px] text-white" strokeWidth={2} />
                </div>
                <span className="flex-1 text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Prompt to UI
                </span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              </div>

              {/* tabs */}
              <div className="mx-4 flex rounded-xl bg-zinc-100/90 p-1 ring-1 ring-zinc-200/60 dark:bg-zinc-800 dark:ring-zinc-700">
                <button
                  type="button"
                  onClick={() => setSidebarTab("mine")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition-all",
                    sidebarTab === "mine"
                      ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-600"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                  )}
                >
                  <Grid2x2 className="size-3.5" />
                  My projects
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab("shared")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition-all",
                    sidebarTab === "shared"
                      ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-600"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                  )}
                >
                  <Users className="size-3.5" />
                  Shared with me
                </button>
              </div>

              {/* search */}
              <div className="mx-4 mt-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search projects"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-3 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:border-violet-500/50 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  />
                </div>
              </div>

              {/* project list */}
              <div
                className="thin-scrollbar mt-3 flex-1 overflow-y-auto px-4 pb-4"
              >
                {sidebarTab === "shared" ? (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                    <Users className="mb-2 size-8" />
                    <span className="text-[13px] font-medium">No shared projects</span>
                    <span className="mt-1 text-[11px] text-zinc-400">Projects shared with you will appear here</span>
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                    <FolderOpen className="mb-2 size-8" />
                    <span className="text-[13px] font-medium">
                      {searchQuery ? "No matches" : "No projects yet"}
                    </span>
                    <span className="mt-1 text-[11px] text-zinc-400">
                      {searchQuery ? "Try a different search" : "Create one from the prompt"}
                    </span>
                  </div>
                ) : (
                  <>
                    {groupedProjects.map((group) => (
                      <div key={group.label} className="mb-4">
                        <div className="mb-2 px-1 text-[12px] font-semibold text-zinc-500">
                          {group.label}
                        </div>
                        <div className="space-y-0.5">
                          {group.projects.map((p) => (
                            <div key={p.id} className="group relative">
                              <Link
                                href={`/project/${p.id}`}
                                className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-all hover:bg-zinc-50 active:bg-zinc-100/80 dark:hover:bg-white/5 dark:active:bg-white/10"
                              >
                                {/* thumbnail */}
                                <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                                  {p.thumbnail_url ? (
                                    <img
                                      src={p.thumbnail_url}
                                      alt=""
                                      className="size-full object-cover"
                                    />
                                  ) : (
                                    <FolderOpen className="size-4 text-zinc-500" />
                                  )}
                                </div>

                                {/* info */}
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[13px] font-medium text-zinc-700 group-hover:text-zinc-900 dark:text-zinc-300 dark:group-hover:text-zinc-100">
                                    {p.name}
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-zinc-500">
                                    {formatDate(p.updated_at)}
                                  </div>
                                </div>
                              </Link>

                              {/* context menu trigger */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setProjectMenuId(projectMenuId === p.id ? null : p.id);
                                }}
                                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg opacity-100 sm:opacity-0 transition-all sm:group-hover:opacity-100 hover:bg-white/[0.08]"
                              >
                                <MoreHorizontal className="size-4 text-zinc-500" />
                              </button>

                              {/* context menu */}
                              {projectMenuId === p.id && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setProjectMenuId(null)} />
                                  <div className="absolute right-2 top-full z-50 mt-1 w-44 rounded-xl border border-zinc-200 bg-white py-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setProjectMenuId(null);
                                        void handleDeleteProject(p.id);
                                      }}
                                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-red-400 transition-colors hover:bg-white/[0.04]"
                                    >
                                      <Trash2 className="size-3.5" />
                                      Delete project
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* sidebar footer */}
              <div className="shrink-0 border-t border-zinc-200 px-4 py-2.5 dark:border-zinc-700">
                <Link
                  href="/settings"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-zinc-500 dark:text-zinc-400"
                >
                  <KeyRound className="size-3.5" />
                  Settings
                </Link>
              </div>
            </div>
          )}
        </aside>

      {/* ── main content area ── */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.45]"
          style={{
            backgroundImage:
              "radial-gradient(circle, oklch(0.45 0.03 275 / 0.08) 0.75px, transparent 0.75px)",
            backgroundSize: "20px 20px",
          }}
          aria-hidden
        />

        {/* ── radial glow ── */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 85% 55% at 50% 0%, oklch(0.62 0.16 275 / 0.08), transparent 52%)",
          }}
          aria-hidden
        />

        {/* ── top bar ── */}
        <header className="studio-glass-bar relative z-30 flex h-14 shrink-0 items-center justify-between border-b px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="mr-1 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
                aria-label="Open sidebar"
              >
                <PanelLeftOpen className="size-4" />
              </button>
            )}
            {!sidebarOpen && (
              <>
                <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-violet-500 to-fuchsia-600 shadow-md shadow-violet-500/25">
                  <Sparkles className="size-[15px] text-white" strokeWidth={2} />
                </div>
                <span className="text-[1.05rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Prompt to UI
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </button>

            {!sidebarOpen && (
              <Link
                href="/settings"
                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                aria-label="Settings"
              >
                <KeyRound className="size-[18px]" />
              </Link>
            )}

          </div>
        </header>

        {/* ── main area ── */}
        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-8">
          {/* heading */}
          <div className="mb-10 max-w-2xl text-center">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-600/90">
              Spatial prototyping
            </p>
            <h1 className="text-balance text-[2rem] font-semibold leading-[1.15] tracking-tight text-zinc-900 sm:text-[2.75rem] dark:text-zinc-100">
              What do you want to{" "}
              <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 bg-clip-text text-transparent">
                create
              </span>
              ?
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Describe a product, site, or app — we generate screens and place them on an infinite canvas you can refine.
            </p>
          </div>

          {/* suggestion chips */}
          {prompt.length === 0 && (
            <div className="mb-8 flex flex-wrap justify-center gap-2.5">
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setPrompt(s.text);
                    textareaRef.current?.focus();
                  }}
                  className="rounded-full border border-zinc-200/90 bg-white/70 px-4 py-2 text-[13px] font-medium text-zinc-700 shadow-sm transition-all hover:border-violet-300/60 hover:bg-white hover:text-zinc-900 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300 dark:hover:border-violet-500/40 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* ── prompt card ── */}
          <div className="w-full max-w-[680px]">
            <div className="studio-prompt-elevated relative rounded-2xl transition-[border-color,box-shadow] duration-200">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what to design…"
                rows={1}
                className="block w-full resize-none bg-transparent px-5 pt-4 pb-2 text-base leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
                style={{ minHeight: "56px", maxHeight: "200px" }}
              />

              {/* attached file / URL chips + inline URL input */}
              {(attachedFiles.length > 0 || referenceUrls.length > 0 || urlInputVisible) && (
                <div className="flex flex-wrap items-center gap-1.5 px-4 pt-1 pb-1">
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
                        className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none"
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

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFileSelect(e.target.files);
                  e.target.value = "";
                }}
              />

              {/* controls row */}
              <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-1">
                {/* surface toggle */}
                <div className="flex rounded-lg bg-zinc-100/90 p-0.5 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:ring-zinc-700">
                  <button
                    type="button"
                    onClick={() => setSurface("web")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-all",
                      surface === "web"
                        ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-600"
                        : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                    )}
                  >
                    <Monitor className="size-3.5" />
                    Web
                  </button>
                  <button
                    type="button"
                    onClick={() => setSurface("app")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-all",
                      surface === "app"
                        ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-600"
                        : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                    )}
                  >
                    <Smartphone className="size-3.5" />
                    App
                  </button>
                </div>

                {/* model selector */}
                <div className="relative">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value as StudioModelId)}
                    className="h-7 appearance-none rounded-lg border-0 bg-zinc-100 py-0 pl-2.5 pr-7 text-[12px] font-medium text-zinc-600 outline-none transition-colors hover:bg-zinc-200 hover:text-zinc-800 focus:ring-0 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                  >
                    {STUDIO_MODELS.map((m) => (
                      <option key={m.id} value={m.id} className="bg-white text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-zinc-500" />
                </div>

                {/* thinking selector */}
                <div className="relative">
                  <select
                    value={thinkingMode}
                    onChange={(e) =>
                      setThinkingMode(e.target.value as ThinkingMode)
                    }
                    className="h-7 appearance-none rounded-lg border-0 bg-zinc-100 py-0 pl-2.5 pr-7 text-[12px] font-medium text-zinc-600 outline-none transition-colors hover:bg-zinc-200 hover:text-zinc-800 focus:ring-0 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                  >
                    {THINKING_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} className="bg-white text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-zinc-500" />
                </div>

                <div className="flex-1" />

                {/* color scheme dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    type="button"
                    disabled={creating}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2 h-8 text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-800",
                      selectedScheme && "text-violet-600 hover:text-violet-700",
                      creating && "pointer-events-none opacity-40",
                    )}
                    aria-label="Color scheme"
                    title="Pick a color scheme for generation"
                  >
                    <Palette className="size-4" />
                    {selectedScheme && (
                      <span className="text-[11px] font-medium max-w-[80px] truncate">
                        {COLOR_SCHEMES.find((s) => s.id === selectedScheme)?.name}
                      </span>
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-y-auto">
                    <DropdownMenuItem
                      onClick={() => setSelectedScheme(null)}
                      className={cn("gap-2", !selectedScheme && "font-medium text-violet-600")}
                    >
                      <div
                        className="size-4 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{
                          background: "conic-gradient(#a78bfa 0deg 120deg, #38bdf8 120deg 240deg, #fb923c 240deg 360deg)",
                        }}
                      />
                      AI picks
                    </DropdownMenuItem>
                    {COLOR_SCHEMES.map((scheme) => {
                      const p = scheme.preview;
                      const deg = 360 / p.length;
                      const stops = p
                        .map((c, i) => `${c} ${i * deg}deg ${(i + 1) * deg}deg`)
                        .join(", ");
                      return (
                        <DropdownMenuItem
                          key={scheme.id}
                          onClick={() => setSelectedScheme(scheme.id)}
                          className={cn("gap-2", selectedScheme === scheme.id && "font-medium text-violet-600")}
                        >
                          <div
                            className="size-4 shrink-0 rounded-full ring-1 ring-black/10"
                            style={{ background: `conic-gradient(${stops})` }}
                          />
                          {scheme.name}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    type="button"
                    disabled={creating}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-800",
                      (attachedFiles.length > 0 || referenceUrls.length > 0) &&
                        "text-violet-600 hover:text-violet-700",
                      creating && "pointer-events-none opacity-40",
                    )}
                    aria-label="Add attachment"
                    title="Upload images or attach a website URL as reference"
                  >
                    <Plus className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuItem
                      onClick={() => fileInputRef.current?.click()}
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

                {/* send button */}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg transition-all",
                    canSubmit
                      ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/30 hover:shadow-xl hover:shadow-violet-500/25 active:scale-[0.97]"
                      : "bg-zinc-100 text-zinc-400",
                  )}
                  aria-label="Create project"
                >
                  {creating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <p className="mt-3 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
              Press <kbd className="rounded border border-zinc-300 px-1 py-0.5 font-mono text-[10px] dark:border-zinc-600">Enter</kbd> to create
              &nbsp;·&nbsp;
              <kbd className="rounded border border-zinc-300 px-1 py-0.5 font-mono text-[10px] dark:border-zinc-600">Shift + Enter</kbd> for new line
            </p>
          </div>
        </main>
      </div>

    </div>
  );
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function groupProjectsByDate(
  projects: StudioProjectRow[],
): { label: string; projects: StudioProjectRow[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - 6 * 86400_000;
  const monthStart = todayStart - 29 * 86400_000;

  const groups: Record<string, StudioProjectRow[]> = {};
  const order: string[] = [];

  for (const p of projects) {
    const t = new Date(p.updated_at).getTime();
    let label: string;
    if (t >= todayStart) label = "Today";
    else if (t >= weekStart) label = "Last 7 days";
    else if (t >= monthStart) label = "Last 30 days";
    else {
      const d = new Date(p.updated_at);
      label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    if (!groups[label]) {
      groups[label] = [];
      order.push(label);
    }
    groups[label].push(p);
  }

  return order.map((label) => ({ label, projects: groups[label] }));
}
