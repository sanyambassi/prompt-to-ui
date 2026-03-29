"use client";

import { useCallback, useState } from "react";
import type { CSSProperties, JSX, MouseEvent, ReactNode } from "react";
import type { UISchema } from "@/lib/schema/types";
import { getHtmlDocumentString, neutralizeHtmlLinks } from "@/lib/schema/html-document";
import { injectLiveEditor } from "@/lib/schema/inject-live-editor";
import { enhanceHtmlForPreview } from "@/lib/schema/enhance-html-preview";
import { migrateSchemaToLatest } from "@/lib/schema/migrate";
import { layoutToClasses, styleToProps } from "@/lib/schema/style-to-classes";
import { cn } from "@/lib/utils";
import type { StudioPrototypeLinkRow } from "@/types/studio";

export type SchemaRendererSelection = {
  enabled: boolean;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
};

export type SchemaRendererPrototype = {
  enabled: boolean;
  screenId: string;
  links: StudioPrototypeLinkRow[];
  onNavigateToScreen: (targetScreenId: string) => void;
};

type Props = {
  schema: UISchema;
  className?: string;
  /** When set, clicking nodes selects them (for AI “edit this part”). */
  selection?: SchemaRendererSelection;
  /** Click-through navigation between artboards (toolbar Play mode). */
  prototype?: SchemaRendererPrototype;
  /** Enable live WYSIWYG editing inside the iframe. */
  editable?: boolean;
  /** Allow pointer events (e.g. scrolling) without full edit mode. */
  interactive?: boolean;
};

function getText(props: Record<string, unknown> | undefined): string {
  if (!props) return "";
  const t = props.text ?? props.label ?? props.children;
  return typeof t === "string" ? t : "";
}

function selectionOutlineClass(
  selection: SchemaRendererSelection | undefined,
  nodeId: string,
) {
  if (!selection?.enabled) return "";
  return cn(
    selection.selectedNodeId === nodeId &&
      "outline outline-2 outline-[var(--workspace-accent)] outline-offset-1 rounded-[2px]",
    "cursor-pointer",
  );
}

function selectionClick(
  selection: SchemaRendererSelection | undefined,
  nodeId: string,
): ((e: MouseEvent) => void) | undefined {
  if (!selection?.enabled) return undefined;
  return (e: MouseEvent) => {
    e.stopPropagation();
    selection.onSelectNode(nodeId);
  };
}

/** Block javascript: / data: (non-image) URLs to prevent XSS from AI output. */
function safeUrl(raw: string): string {
  if (!raw) return "";
  const lower = raw.trim().toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("/")) return raw;
  if (lower.startsWith("data:image/")) return raw;
  return "";
}

function prototypeTargetForNode(
  prototype: SchemaRendererPrototype | undefined,
  nodeId: string,
): string | null {
  if (!prototype?.enabled) return null;
  const hit = prototype.links.find(
    (l) =>
      l.screen_id === prototype.screenId &&
      l.source_node_id === nodeId &&
      (l.trigger === "click" || l.trigger == null || l.trigger === ""),
  );
  return hit?.target_screen_id ?? null;
}

function renderNode(
  node: UISchema,
  depth: number,
  selection?: SchemaRendererSelection,
  prototype?: SchemaRendererPrototype,
): ReactNode {
  const { className: styleClass, style: inlineStyle } = styleToProps(node.style);
  const layout = layoutToClasses(node.layout);
  const props = node.props ?? {};
  const combinedClass = cn(styleClass, layout.className);
  const combinedStyle: CSSProperties = {
    ...layout.style,
    ...inlineStyle,
  };

  if (node.layout?.mode === "absolute" && typeof props.x === "number") {
    combinedStyle.position = "absolute";
    combinedStyle.left = props.x as number;
    combinedStyle.top = (props.y as number) ?? 0;
  }

  const selOutline = selectionOutlineClass(selection, node.id);
  const selOnClick = selectionClick(selection, node.id);

  const wrap = (
    Tag: keyof JSX.IntrinsicElements,
    extra: {
      className?: string;
      style?: CSSProperties;
      onClick?: (e: MouseEvent) => void;
    } = {},
    inner?: ReactNode,
  ) => {
    const El = Tag;
    return (
      <El
        key={node.id}
        className={cn(extra.className, combinedClass, selOutline)}
        style={{ ...combinedStyle, ...extra.style }}
        data-studio-id={node.id}
        data-studio-type={node.type}
        onClick={(e) => {
          selOnClick?.(e);
          extra.onClick?.(e);
        }}
      >
        {inner}
      </El>
    );
  };

  const children =
    node.children?.map((c) =>
      renderNode(c, depth + 1, selection, prototype),
    ) ?? null;

  switch (node.type) {
    case "page":
      return wrap(
        "div",
        {
          className: cn(
            "studio-root min-h-[200px] w-full",
            combinedClass,
            selOutline,
          ),
          style: {
            ...combinedStyle,
            ...(combinedStyle.backgroundColor ||
            (combinedStyle as { background?: string }).background
              ? {}
              : { backgroundColor: "#f7f9fb" }),
            color: combinedStyle.color ?? "#191c1e",
          },
        },
        children,
      );
    case "section":
      return wrap("section", { className: "w-full" }, children);
    case "container":
      return wrap(
        "div",
        {
          className: cn("rounded-xl p-4", combinedClass),
          style: combinedStyle,
        },
        children,
      );
    case "card":
      return wrap(
        "div",
        {
          className: cn("rounded-xl p-5", combinedClass),
          style: {
            boxShadow: combinedStyle.boxShadow ?? "0 8px 24px rgba(25, 28, 30, 0.06)",
            ...combinedStyle,
          },
        },
        children,
      );
    case "hero":
      return wrap(
        "div",
        {
          className: "flex flex-col gap-4 rounded-xl p-8 md:flex-row md:items-center",
        },
        children,
      );
    case "heading":
      return wrap(
        "h2",
        {
          className: cn(
            "font-studio-display text-xl font-semibold tracking-tight",
            combinedClass,
          ),
          style: combinedStyle,
        },
        getText(props) || children,
      );
    case "text":
    case "paragraph":
      return wrap(
        "p",
        {
          className: cn("font-studio-body text-sm leading-relaxed", combinedClass),
          style:
            combinedStyle.color ? combinedStyle : { opacity: 0.88, ...combinedStyle },
        },
        getText(props) || children,
      );
    case "button":
      return (
        <button
          key={node.id}
          type="button"
          className={cn(
            "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium",
            combinedClass,
            selOutline,
          )}
          style={{
            backgroundColor: combinedStyle.backgroundColor || "#3b82f6",
            color: combinedStyle.color || "#ffffff",
            ...combinedStyle,
          }}
          data-studio-id={node.id}
          data-studio-type={node.type}
          onClick={(e) => {
            e.preventDefault();
            const target = prototypeTargetForNode(prototype, node.id);
            if (target) {
              prototype?.onNavigateToScreen(target);
              return;
            }
            selOnClick?.(e);
          }}
        >
          {getText(props) || children}
        </button>
      );
    case "input":
      return (
        <input
          key={node.id}
          className={cn(
            "flex h-8 w-full rounded-md border px-2 text-sm",
            combinedClass,
            selOutline,
          )}
          style={{
            borderColor: combinedStyle.borderColor || "rgba(0,0,0,0.15)",
            backgroundColor: combinedStyle.backgroundColor || "transparent",
            ...combinedStyle,
          }}
          placeholder={
            typeof props.placeholder === "string" ? props.placeholder : ""
          }
          type={typeof props.type === "string" ? props.type : "text"}
          data-studio-id={node.id}
          data-studio-type={node.type}
          readOnly
          onClick={selOnClick}
        />
      );
    case "textarea":
      return (
        <textarea
          key={node.id}
          className={cn(
            "min-h-[72px] w-full rounded-md border px-2 py-1 text-sm",
            combinedClass,
            selOutline,
          )}
          style={{
            borderColor: combinedStyle.borderColor || "rgba(0,0,0,0.15)",
            backgroundColor: combinedStyle.backgroundColor || "transparent",
            ...combinedStyle,
          }}
          placeholder={
            typeof props.placeholder === "string" ? props.placeholder : ""
          }
          data-studio-id={node.id}
          data-studio-type={node.type}
          readOnly
          onClick={selOnClick}
        />
      );
    case "image": {
      const rawSrc = typeof props.src === "string" ? props.src : "";
      const src = safeUrl(rawSrc);
      const alt = typeof props.alt === "string" ? props.alt : "";
      const imagePrompt = typeof props.imagePrompt === "string" ? props.imagePrompt : "";
      if (!src) {
        return wrap(
          "div",
          {
            className:
              "bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 text-zinc-400 flex items-center justify-center text-xs border border-zinc-700/30",
            style: { minHeight: 120 },
          },
          <>
            <span className="opacity-60">{imagePrompt ? `🖼 ${imagePrompt.slice(0, 40)}…` : "🖼 Image"}</span>
          </>,
        );
      }
      return (
        <div
          key={node.id}
          className={cn(
            "relative overflow-hidden rounded-md",
            combinedClass,
            selOutline,
          )}
          style={combinedStyle}
          data-studio-id={node.id}
          data-studio-type={node.type}
          onClick={selOnClick}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary schema URLs */}
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className="h-auto w-full object-cover"
            style={{ maxHeight: (combinedStyle.height as number) || 400 }}
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = "none";
              if (el.parentElement) {
                el.parentElement.classList.add("flex", "items-center", "justify-center", "bg-zinc-800/50", "text-zinc-500", "text-xs");
                el.parentElement.style.minHeight = "80px";
                el.parentElement.textContent = alt || imagePrompt || "Image";
              }
            }}
          />
        </div>
      );
    }
    case "avatar": {
      const rawSrc = typeof props.src === "string" ? props.src : "";
      const src = safeUrl(rawSrc);
      const alt = typeof props.alt === "string" ? props.alt : "";
      const size = (typeof combinedStyle.width === "number" ? combinedStyle.width : 40);
      if (!src) {
        return (
          <div
            key={node.id}
            className={cn("flex items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white font-semibold", combinedClass, selOutline)}
            style={{ ...combinedStyle, width: size, height: size, fontSize: size * 0.4 }}
            data-studio-id={node.id}
            data-studio-type={node.type}
            onClick={selOnClick}
          >
            {alt ? alt.charAt(0).toUpperCase() : "?"}
          </div>
        );
      }
      return (
        <div
          key={node.id}
          className={cn("overflow-hidden rounded-full", combinedClass, selOutline)}
          style={{ ...combinedStyle, width: size, height: size }}
          data-studio-id={node.id}
          data-studio-type={node.type}
          onClick={selOnClick}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
        </div>
      );
    }
    case "icon": {
      const name = typeof props.name === "string" ? props.name : "star";
      const useMaterial =
        props.iconSet === "material" || props.variant === "material";
      if (useMaterial) {
        const glyph =
          typeof props.glyph === "string" && props.glyph.trim()
            ? props.glyph.trim()
            : name;
        return (
          <span
            key={node.id}
            className={cn(
              "material-symbols-outlined inline-flex items-center justify-center leading-none select-none",
              combinedClass,
              selOutline,
            )}
            style={{
              fontSize: (combinedStyle.fontSize as number) || 22,
              ...combinedStyle,
            }}
            data-studio-id={node.id}
            data-studio-type={node.type}
            onClick={selOnClick}
            role="img"
            aria-hidden
          >
            {glyph}
          </span>
        );
      }
      const ICON_MAP: Record<string, string> = {
        star: "⭐", heart: "❤️", settings: "⚙️", search: "🔍", home: "🏠",
        user: "👤", mail: "📧", phone: "📱", cart: "🛒", check: "✅",
        arrow: "→", menu: "☰", close: "✕", plus: "＋", minus: "−",
        lock: "🔒", globe: "🌐", camera: "📷", bell: "🔔", fire: "🔥",
        lightning: "⚡", rocket: "🚀", shield: "🛡", clock: "🕐", chart: "📊",
        download: "⬇️", upload: "⬆️", share: "📤", bookmark: "🔖", gift: "🎁",
        trophy: "🏆", target: "🎯", map: "🗺", music: "🎵", play: "▶",
        pause: "⏸", stop: "⏹", refresh: "🔄", edit: "✏️", trash: "🗑",
        folder: "📁", file: "📄", code: "💻", link: "🔗", tag: "🏷",
        sun: "☀️", moon: "🌙", cloud: "☁️", dollar: "💲", percent: "％",
        info: "ℹ️", warning: "⚠️", error: "❌", success: "✅",
      };
      const icon = ICON_MAP[name.toLowerCase()] || name;
      return (
        <span
          key={node.id}
          className={cn("inline-flex items-center justify-center", combinedClass, selOutline)}
          style={{ fontSize: (combinedStyle.fontSize as number) || 20, ...combinedStyle }}
          data-studio-id={node.id}
          data-studio-type={node.type}
          onClick={selOnClick}
          role="img"
          aria-label={name}
        >
          {icon}
        </span>
      );
    }
    case "divider":
      return (
        <hr
          key={node.id}
          className={cn("border-border", combinedClass, selOutline)}
          style={combinedStyle}
          data-studio-id={node.id}
          data-studio-type={node.type}
          onClick={selOnClick}
        />
      );
    case "spacer":
      return (
        <div
          key={node.id}
          className={cn(combinedClass, selOutline)}
          style={{ height: (props.height as number) ?? 16, ...combinedStyle }}
          data-studio-id={node.id}
          data-studio-type={node.type}
          onClick={selOnClick}
        />
      );
    case "badge":
      return wrap(
        "span",
        {
          className: "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
          style: { borderColor: combinedStyle.borderColor || "rgba(0,0,0,0.15)" },
        },
        getText(props) || children,
      );
    case "link":
      return (
        <a
          key={node.id}
          href="#"
          className={cn(
            "underline-offset-4 hover:underline",
            combinedClass,
            selOutline,
          )}
          style={{ color: combinedStyle.color || "#3b82f6", ...combinedStyle }}
          data-studio-id={node.id}
          data-studio-type={node.type}
          onClick={(e) => {
            e.preventDefault();
            const target = prototypeTargetForNode(prototype, node.id);
            if (target) {
              prototype?.onNavigateToScreen(target);
              return;
            }
            selOnClick?.(e);
          }}
        >
          {getText(props) || children}
        </a>
      );
    case "navbar":
      return wrap(
        "nav",
        {
          className: cn(
            "flex items-center justify-between gap-4 px-4 py-3",
            combinedClass,
          ),
          style: {
            borderBottom: `1px solid ${combinedStyle.borderColor ? String(combinedStyle.borderColor) : "rgba(25, 28, 30, 0.06)"}`,
            ...combinedStyle,
          },
        },
        children,
      );
    case "footer":
      return wrap(
        "footer",
        {
          className: "px-4 py-6 text-sm",
          style: { borderTop: `1px solid ${combinedStyle.borderColor || "rgba(0,0,0,0.08)"}`, opacity: inlineStyle?.color ? 1 : 0.6 },
        },
        children,
      );
    case "pricing-card":
    case "feature-card":
    case "stat-card":
    case "testimonial":
      return wrap(
        "div",
        {
          className: "rounded-lg p-4",
          style: !inlineStyle?.backgroundColor
            ? { border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }
            : { boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
        },
        children,
      );
    case "form":
      return (
        <form
          key={node.id}
          className={cn(
            "flex flex-col gap-3",
            combinedClass,
            selOutline,
          )}
          style={combinedStyle}
          data-studio-id={node.id}
          data-studio-type={node.type}
          onSubmit={(e) => e.preventDefault()}
          onClick={selOnClick}
        >
          {children}
        </form>
      );
    case "list":
      return wrap(
        "ul",
        { className: "list-inside list-disc space-y-1 text-sm" },
        children,
      );
    case "table":
      return wrap("div", { className: "overflow-x-auto" }, children);
    case "stack":
      return wrap("div", { className: "flex flex-col" }, children);
    case "grid":
      return wrap("div", { className: "grid" }, children);
    case "row":
    case "flex-row":
      return wrap("div", { className: "flex flex-row flex-wrap items-center" }, children);
    default:
      return wrap("div", { className: "p-1" }, children);
  }
}

function HtmlIframe({ srcDoc, editable, interactive }: { srcDoc: string; editable?: boolean; interactive?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const handleLoad = useCallback(() => setLoaded(true), []);

  return (
    <div className="relative h-full w-full min-h-0">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-500" />
            <span className="text-xs text-zinc-400 font-medium">Loading preview…</span>
          </div>
        </div>
      )}
      <iframe
        title="HTML prototype"
        className="h-full min-h-[320px] w-full border-0 bg-white"
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        style={{
          pointerEvents: (editable || interactive) ? "auto" : "none",
          touchAction: (editable || interactive) ? "auto" : undefined,
        }}
        onLoad={handleLoad}
      />
    </div>
  );
}

export function SchemaRenderer({ schema, className, selection, prototype, editable, interactive }: Props) {
  const root = migrateSchemaToLatest(schema);
  const htmlDoc = getHtmlDocumentString(root);
  if (htmlDoc) {
    const clearOnBackdrop =
      selection?.enabled ?
        (e: MouseEvent<HTMLDivElement>) => {
          if (e.target === e.currentTarget) selection.onSelectNode(null);
        }
      : undefined;
    const enhanced = enhanceHtmlForPreview(htmlDoc);
    const processedHtml = editable ? injectLiveEditor(enhanced) : neutralizeHtmlLinks(enhanced);
    return (
      <div
        className={cn(
          "schema-renderer html-document-prototype h-full w-full min-h-0",
          className,
        )}
        onClick={clearOnBackdrop}
      >
        <HtmlIframe srcDoc={processedHtml} editable={editable} interactive={interactive} />
      </div>
    );
  }

  const clearOnBackdrop =
    selection?.enabled ?
      (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) selection.onSelectNode(null);
      }
    : undefined;

  return (
    <div
      className={cn("schema-renderer w-full", className)}
      onClick={clearOnBackdrop}
    >
      {renderNode(root, 0, selection, prototype)}
    </div>
  );
}
