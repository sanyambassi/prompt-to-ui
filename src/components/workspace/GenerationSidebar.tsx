"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Image as ImageIcon,
  Layout,
  Loader2,
  Palette,
  Monitor,
  AlertTriangle,
  Activity,
  Type,
  Square,
  Rows3,
} from "lucide-react";
import { extractJsonObjectFromLlmText } from "@/lib/llm/extract-json";
import { HTML_DOCUMENT_ROOT_TYPE } from "@/lib/schema/html-document";
import { useGenerationLog, type AgentLogEntry } from "@/store/generation-log";

/* ── humanize raw UISchema JSON into friendly summaries ── */

function humanizeContent(raw: string): ContentSummary {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      description: "Generating design…",
      components: [],
      pieceCount: 0,
      rawAvailable: false,
    };
  }

  /** Same salvage path as the generation server (`run-generation-job-streaming`). */
  try {
    const parsed = extractJsonObjectFromLlmText(trimmed);
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;

      if (o.type === HTML_DOCUMENT_ROOT_TYPE) {
        const props = o.props as Record<string, unknown> | undefined;
        const html = props && typeof props.html === "string" ? props.html : "";
        const n = html.length;
        return {
          description:
            n > 0
              ? `HTML page prototype — about ${n < 1000 ? `${n} characters` : `${Math.round(n / 100) / 10}k characters`} of markup`
              : "HTML page prototype from the model",
          components:
            n > 0 ? [{ icon: "layout", label: "Full-page HTML" }] : [],
          pieceCount: n > 0 ? 1 : 0,
          rawAvailable: n > 0,
        };
      }

      if (Array.isArray(o.screens)) {
        return summarizeHtmlScreensEnvelope(o.screens as unknown[]);
      }

      return summarizeSchema(o);
    }
  } catch {
    /* partial stream, truncated JSON, or non-JSON prefix — heuristic below */
  }
  return extractPartialSummary(raw);
}

function summarizeHtmlScreensEnvelope(screens: unknown[]): ContentSummary {
  const names: string[] = [];
  let totalChars = 0;
  for (const s of screens) {
    if (!s || typeof s !== "object") continue;
    const rec = s as Record<string, unknown>;
    if (typeof rec.name === "string") names.push(rec.name);
    if (typeof rec.html === "string") totalChars += rec.html.length;
  }
  const screenCount = screens.length;
  const nameHint =
    names.length > 0
      ? ` — ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}`
      : "";
  const sizeHint =
    totalChars > 0
      ? `, ~${totalChars < 1000 ? `${totalChars} chars` : `${Math.round(totalChars / 100) / 10}k chars`} of HTML`
      : "";
  return {
    description:
      screenCount === 1
        ? `Generated "${names[0] ?? "Screen"}" — full HTML page${sizeHint}`
        : `Generated ${screenCount} HTML screens${nameHint}${sizeHint}`,
    components: [{ icon: "layout", label: `${screenCount} HTML page${screenCount === 1 ? "" : "s"}` }],
    pieceCount: screenCount,
    rawAvailable: totalChars > 0,
  };
}

type ContentSummary = {
  description: string;
  components: { icon: string; label: string }[];
  /** Count of non-structural UI nodes (buttons, text, images, …) — what users expect as “pieces”. */
  pieceCount: number;
  rawAvailable: boolean;
};

/** Layout / wrapper nodes: not counted as “UI pieces” but their children are. */
const STRUCTURAL_NODE_TYPES = new Set([
  "page",
  "section",
  "container",
  "stack",
  "row",
  "grid",
  "column",
  "flex-row",
  "flex-column",
  "flex",
  "fragment",
  "group",
  "wrapper",
  "layout",
  "spacer",
  "",
]);

/**
 * Walk UISchema (or LLM envelope with `screens[]`) and count every non-structural node.
 * `distinctTypesOut` receives one chip per distinct friendly label (for the UI), not the total.
 */
/** Model sometimes puts headings/button copy on structural nodes only — still count as a “piece”. */
function structuralNodeWithDisplayCopy(n: Record<string, unknown>): boolean {
  const kids = n.children;
  if (Array.isArray(kids) && kids.length > 0) return false;
  const p = n.props;
  if (!p || typeof p !== "object") return false;
  const rec = p as Record<string, unknown>;
  for (const key of ["text", "title", "label", "placeholder"]) {
    const v = rec[key];
    if (typeof v === "string" && v.trim().length > 0) return true;
  }
  return false;
}

function walkUiSchemaPieceCount(
  root: Record<string, unknown>,
  distinctTypesOut: { icon: string; label: string }[],
): number {
  let total = 0;

  function nodeType(n: Record<string, unknown>): string {
    return typeof n.type === "string" ? n.type : "";
  }

  function visit(n: Record<string, unknown>) {
    const t = nodeType(n);
    if (!STRUCTURAL_NODE_TYPES.has(t)) {
      total += 1;
      const label = friendlyTypeName(t || "node");
      if (!distinctTypesOut.find((c) => c.label === label)) {
        distinctTypesOut.push({ icon: iconForType(t || "node"), label });
      }
    } else if (structuralNodeWithDisplayCopy(n)) {
      total += 1;
      const label = `${friendlyTypeName(t || "node")} (content)`;
      if (!distinctTypesOut.find((c) => c.label === label)) {
        distinctTypesOut.push({ icon: iconForType(t || "layout"), label });
      }
    }
    if (Array.isArray(n.children)) {
      for (const child of n.children) {
        if (child && typeof child === "object") {
          visit(child as Record<string, unknown>);
        }
      }
    }
    if (Array.isArray(n.screens)) {
      for (const s of n.screens) {
        if (s && typeof s === "object") {
          visitScreenEntry(s as Record<string, unknown>);
        }
      }
    }
  }

  function visitScreenEntry(sc: Record<string, unknown>) {
    if (sc.root && typeof sc.root === "object") {
      visit(sc.root as Record<string, unknown>);
      return;
    }
    const raw =
      sc.ui_schema ??
      sc.uiSchema ??
      sc.schema;
    if (typeof raw === "string") {
      try {
        const p = JSON.parse(raw) as unknown;
        if (p && typeof p === "object") {
          visit(p as Record<string, unknown>);
        }
      } catch {
        /* ignore */
      }
    } else if (raw && typeof raw === "object") {
      visit(raw as Record<string, unknown>);
    }
  }

  visit(root);
  return total;
}

function summarizeSchema(schema: Record<string, unknown>): ContentSummary {
  const components: { icon: string; label: string }[] = [];
  const pieceCount = walkUiSchemaPieceCount(schema, components);
  const rootType = typeof schema.type === "string" ? schema.type : "unknown";

  const screenCount = Array.isArray(schema.screens) ? schema.screens.length : 0;
  const screenNames =
    screenCount > 0 && Array.isArray(schema.screens)
      ? (schema.screens as unknown[])
          .map((s) =>
            s && typeof s === "object" && typeof (s as Record<string, unknown>).name === "string"
              ? String((s as Record<string, unknown>).name)
              : null,
          )
          .filter((n): n is string => Boolean(n))
      : [];
  const pageType = rootType === "page" ? "page" : rootType;

  let description: string;
  if (screenCount > 1) {
    const nameHint =
      screenNames.length > 0
        ? ` — ${screenNames.slice(0, 3).join(", ")}${screenNames.length > 3 ? "…" : ""}`
        : "";
    description = `Generated ${screenCount} screens${nameHint}, with ${pieceCount} UI pieces total`;
  } else if (screenCount === 1) {
    const oneName = screenNames[0];
    description = oneName
      ? `Generated “${oneName}” with ${pieceCount} UI elements`
      : `Generated 1 screen with ${pieceCount} UI elements`;
  } else if (pieceCount > 0) {
    description = `Building a ${pageType} with ${pieceCount} UI elements`;
  } else {
    description = `Building ${pageType} layout`;
  }

  return { description, components, pieceCount, rawAvailable: true };
}

function friendlyTypeName(type: string): string {
  const map: Record<string, string> = {
    heading: "Headings",
    text: "Text",
    paragraph: "Text",
    button: "Buttons",
    image: "Images",
    card: "Cards",
    hero: "Hero Section",
    navbar: "Navigation",
    footer: "Footer",
    input: "Input Fields",
    textarea: "Text Areas",
    form: "Forms",
    link: "Links",
    badge: "Badges",
    divider: "Dividers",
    list: "Lists",
    table: "Tables",
    "pricing-card": "Pricing Cards",
    "feature-card": "Feature Cards",
    "stat-card": "Stat Cards",
    testimonial: "Testimonials",
    icon: "Icons",
  };
  return map[type] || type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, " ") + "s";
}

function iconForType(type: string): string {
  const map: Record<string, string> = {
    heading: "type",
    text: "type",
    paragraph: "type",
    button: "square",
    image: "image",
    card: "layout",
    hero: "layout",
    navbar: "rows",
    footer: "rows",
    input: "square",
    form: "layout",
    link: "type",
  };
  return map[type] || "square";
}

function extractPartialSummary(raw: string): ContentSummary {
  if (raw.includes(`"type"`) && raw.includes(HTML_DOCUMENT_ROOT_TYPE)) {
    return {
      description: "Receiving HTML prototype from the model…",
      components: [{ icon: "layout", label: "Full-page HTML" }],
      pieceCount: 0,
      rawAvailable: raw.length > 0,
    };
  }
  const looksMultiScreen = /"screens"\s*:\s*\[/.test(raw);
  const components: { icon: string; label: string }[] = [];
  const typeMatches = raw.match(/"type"\s*:\s*"([a-z0-9_-]+)"/gi);
  let pieceCount = 0;
  if (typeMatches) {
    const seen = new Set<string>();
    const SKIP = new Set(STRUCTURAL_NODE_TYPES);
    for (const m of typeMatches) {
      const val = m.match(/"type"\s*:\s*"([a-z0-9_-]+)"/i)?.[1]?.toLowerCase();
      if (!val || SKIP.has(val)) continue;
      pieceCount += 1;
      if (!seen.has(val)) {
        seen.add(val);
        components.push({ icon: iconForType(val), label: friendlyTypeName(val) });
      }
    }
  }

  const description =
    pieceCount > 0
      ? `Building UI with ${pieceCount} UI piece${pieceCount === 1 ? "" : "s"}…`
      : looksMultiScreen
        ? "Receiving multi-screen layout from the model…"
        : "Generating design…";

  return { description, components, pieceCount, rawAvailable: raw.length > 0 };
}

function ComponentIcon({ name }: { name: string }) {
  switch (name) {
    case "type": return <Type className="size-3 text-sky-600" />;
    case "image": return <ImageIcon className="size-3 text-sky-600" />;
    case "layout": return <Layout className="size-3 text-sky-600" />;
    case "rows": return <Rows3 className="size-3 text-sky-600" />;
    default: return <Square className="size-3 text-sky-600" />;
  }
}

/* ── main sidebar ── */

export function GenerationSidebar({ onClose }: { onClose: () => void }) {
  const entries = useGenerationLog((s) => s.entries);
  const isGenerating = useGenerationLog((s) => s.isGenerating);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [reasoningCollapsed, setReasoningCollapsed] = useState(false);
  const [responseCollapsed, setResponseCollapsed] = useState(false);
  const [progressCollapsed, setProgressCollapsed] = useState(false);

  const hasThinkingEvent = entries.some((e) => e.type === "thinking");

  const thinkingText = useMemo(
    () =>
      entries
        .filter((e): e is AgentLogEntry & { type: "thinking" } => e.type === "thinking")
        .map((e) => e.text)
        .join(""),
    [entries],
  );

  const contentText = useMemo(
    () =>
      entries
        .filter((e): e is AgentLogEntry & { type: "content" } => e.type === "content")
        .map((e) => e.text)
        .join(""),
    [entries],
  );

  const contentSummary = useMemo(() => humanizeContent(contentText), [contentText]);

  const userPromptEntry = useMemo(
    () =>
      entries.find(
        (e): e is AgentLogEntry & { type: "user_prompt" } =>
          e.type === "user_prompt",
      ),
    [entries],
  );

  const statusEntries = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.type !== "thinking" &&
          e.type !== "content" &&
          e.type !== "user_prompt",
      ),
    [entries],
  );

  const copyUserPrompt = useCallback(async () => {
    const t = userPromptEntry?.text?.trim() ?? "";
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      toast.success("Prompt copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }, [userPromptEntry?.text]);

  const isDone = entries.some((e) => e.type === "done");
  const hasError = entries.some((e) => e.type === "error");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [entries]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    stickToBottom.current = atBottom;
  };

  return (
    <div className="absolute left-3 right-3 top-3 bottom-16 z-[205] flex max-w-[340px] flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-300/60 backdrop-blur-2xl sm:right-auto sm:w-[340px]">
      {/* header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-3">
        <div className="relative flex size-6 items-center justify-center">
          {isGenerating ? (
            <Activity className="size-4 animate-pulse text-violet-600" />
          ) : hasError ? (
            <AlertTriangle className="size-4 text-amber-600" />
          ) : isDone ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <Activity className="size-4 text-zinc-500" />
          )}
        </div>
        <span className="flex-1 text-[13px] font-semibold text-zinc-900">
          {isGenerating ? "Generating…" : hasError ? "Error" : isDone ? "Complete" : "Generation log"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          aria-label="Collapse generation log"
          title="Collapse (use Log in the top bar to open again)"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      {/* scrollable body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,0,0,0.15) transparent" }}
      >
        {userPromptEntry && userPromptEntry.text.trim().length > 0 && (
          <div className="border-b border-zinc-100 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                Your prompt
              </span>
              <button
                type="button"
                onClick={() => void copyUserPrompt()}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900"
              >
                <Copy className="size-3" />
                Copy
              </button>
            </div>
            <p className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-[12px] leading-relaxed text-zinc-800">
              {userPromptEntry.text}
            </p>
          </div>
        )}

        {/* status timeline */}
        {statusEntries.length > 0 && (
          <div className="border-b border-zinc-100 px-4 py-3">
            <button
              type="button"
              onClick={() => setProgressCollapsed((v) => !v)}
              className="mb-2 flex w-full items-center gap-1.5 text-left"
            >
              {progressCollapsed
                ? <ChevronRight className="size-3 text-zinc-700" />
                : <ChevronDown className="size-3 text-zinc-700" />
              }
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-700">
                Progress
              </span>
              <span className="ml-auto text-[10px] text-zinc-600">{statusEntries.length}</span>
            </button>
            {!progressCollapsed && (
              <div className="space-y-1.5">
                {statusEntries.map((entry, i) => (
                  <StatusLine key={i} entry={entry} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* thinking / reasoning */}
        {hasThinkingEvent && (
          <div className="border-b border-zinc-100 px-4 py-3">
            <button
              type="button"
              onClick={() => setReasoningCollapsed((v) => !v)}
              className="mb-2 flex w-full items-center gap-1.5 text-left"
            >
              {reasoningCollapsed
                ? <ChevronRight className="size-3 text-violet-700" />
                : <ChevronDown className="size-3 text-violet-700" />
              }
              <Brain className="size-3 text-violet-600" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-800">
                {thinkingText.length > 0 ? "Reasoning" : "Reasoning"}
              </span>
              {isGenerating && !isDone && (
                <Loader2 className="ml-auto size-3 animate-spin text-violet-500" />
              )}
            </button>
            {!reasoningCollapsed && (
              <>
                {thinkingText.length > 0 ? (
                  <div className="max-h-[40vh] overflow-y-auto rounded-lg bg-violet-50 p-3">
                    <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-zinc-800">
                      {thinkingText}
                      {isGenerating && !isDone && contentText.length === 0 && (
                        <span className="inline-block h-3.5 w-[2px] animate-pulse bg-violet-400 align-text-bottom" />
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="text-[12px] italic text-zinc-500">
                    {isGenerating && !isDone
                      ? "Model is reasoning…"
                      : "The provider did not expose reasoning text for this run."}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* content / model response — humanized */}
        {contentText.length > 0 && (
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={() => setResponseCollapsed((v) => !v)}
              className="mb-2 flex w-full items-center gap-1.5 text-left"
            >
              {responseCollapsed
                ? <ChevronRight className="size-3 text-sky-700" />
                : <ChevronDown className="size-3 text-sky-700" />
              }
              <Code2 className="size-3 text-sky-600" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-900">
                What the model produced
              </span>
              {isGenerating && !isDone && (
                <Loader2 className="ml-auto size-3 animate-spin text-sky-500" />
              )}
            </button>
            {!responseCollapsed && (
              <div className="space-y-2.5">
                {/* friendly summary (default — not raw JSON) */}
                <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-3">
                  <p className="text-[12px] leading-relaxed text-zinc-800">
                    {contentSummary.description}
                    {isGenerating && !isDone && (
                      <span className="inline-block h-3.5 w-[2px] animate-pulse bg-sky-400 align-text-bottom ml-1" />
                    )}
                  </p>

                  {contentSummary.components.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {contentSummary.components.map((c, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-md border border-sky-200/80 bg-white px-2 py-0.5 text-[11px] text-sky-900"
                        >
                          <ComponentIcon name={c.icon} />
                          {c.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* optional technical dump */}
                {contentSummary.rawAvailable && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowRawResponse((v) => !v)}
                      className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 transition-colors hover:text-zinc-800"
                    >
                      {showRawResponse
                        ? <ChevronDown className="size-2.5" />
                        : <ChevronRight className="size-2.5" />
                      }
                      {showRawResponse
                        ? "Hide technical output"
                        : "Show technical output (raw model text)"}
                    </button>
                    {showRawResponse && (
                      <div className="mt-1.5 max-h-[30vh] overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-zinc-700 font-mono">
                          {contentText}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* empty state */}
        {entries.length === 0 && (
          <div className="flex max-w-[280px] flex-col items-center justify-center gap-2 px-4 py-12 text-center text-zinc-700">
            <Activity className="size-6 text-zinc-400" />
            {isGenerating ? (
              <span className="text-[12px] text-zinc-700">Waiting for generation…</span>
            ) : (
              <>
                <span className="text-[13px] font-medium text-zinc-800">
                  No saved log for this artboard
                </span>
                <span className="text-[11px] leading-relaxed text-zinc-500">
                  Run Generate or Regenerate on this artboard to create a log. Older projects need
                  DB migrations for job log and per-screen cache.
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function humanizeStatusMessage(message: string): string {
  const t = message.trim();
  if (t.length > 200 && (t.startsWith("{") || t.startsWith("["))) {
    try {
      const parsed = JSON.parse(t) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        if (parsed.type === HTML_DOCUMENT_ROOT_TYPE) return "Received HTML prototype payload";
        if (Array.isArray(parsed.screens)) {
          return `Received ${parsed.screens.length} screen(s) from the model`;
        }
      }
    } catch {
      /* keep original */
    }
    return "Received structured data from the model (see “What the model produced” for a summary)";
  }
  return message;
}

function StatusLine({ entry }: { entry: AgentLogEntry }) {
  switch (entry.type) {
    case "status":
      return (
        <div className="flex items-start gap-2">
          <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-400" />
          <span className="text-[12px] leading-snug text-zinc-700">
            {humanizeStatusMessage(entry.message)}
          </span>
        </div>
      );
    case "screen":
      return (
        <div className="flex items-start gap-2">
          <Monitor className="mt-0.5 size-3 shrink-0 text-emerald-600" />
          <span className="text-[12px] leading-snug text-zinc-800">
            Saved artboard {entry.index + 1}: {entry.name}
          </span>
        </div>
      );
    case "palette":
      return (
        <div className="flex items-start gap-2">
          <Palette className="mt-0.5 size-3 shrink-0 text-amber-600" />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-medium text-zinc-700">Color palette</span>
            {entry.colors.map((c, i) => (
              <span
                key={i}
                title={c}
                className="inline-block size-3.5 rounded border border-zinc-200 shadow-sm"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      );
    case "image_progress":
      return (
        <div className="flex items-start gap-2">
          <ImageIcon className="mt-0.5 size-3 shrink-0 animate-pulse text-fuchsia-600" />
          <span className="text-[12px] leading-snug text-zinc-700">
            Image {entry.current} of {entry.total}
            {entry.prompt ? ` — ${entry.prompt}` : ""}
            …
          </span>
        </div>
      );
    case "image_done":
      return (
        <div className="flex items-start gap-2">
          <ImageIcon className="mt-0.5 size-3 shrink-0 text-fuchsia-600" />
          <span className="text-[12px] leading-snug text-zinc-800">Image generated and attached</span>
        </div>
      );
    case "suggestions":
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Suggested next prompts
          </span>
          <ul className="space-y-1 pl-0.5">
            {entry.items.map((s, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-snug text-zinc-700">
                <span className="font-medium text-violet-600">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "done":
      return (
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600" />
          <span className="text-[12px] leading-snug font-medium text-zinc-800">
            Generation complete
          </span>
        </div>
      );
    case "error":
      return (
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-red-600" />
          <span className="text-[12px] leading-snug text-red-800">{entry.message}</span>
        </div>
      );
    default:
      return null;
  }
}
