import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { migrateSchemaToLatest } from "@/lib/schema/migrate";
import { layoutToClasses, styleToProps } from "@/lib/schema/style-to-classes";
import {
  getHtmlDocumentString,
  HTML_DOCUMENT_ROOT_TYPE,
} from "@/lib/schema/html-document";
import type { UISchema } from "@/lib/schema/types";
/** Maps shadcn-style semantic Tailwind classes to CSS variables (works with Tailwind CDN + :root). */
export const STUDIO_EXPORT_SEMANTIC_BRIDGE_CSS = `
/* Bridge: Tailwind-like utility names → theme variables (Studio static export) */
.bg-background { background-color: var(--background); }
.text-foreground { color: var(--foreground); }
.bg-card { background-color: var(--card); }
.text-card-foreground { color: var(--card-foreground); }
.bg-popover { background-color: var(--popover); }
.text-popover-foreground { color: var(--popover-foreground); }
.bg-primary { background-color: var(--primary); }
.text-primary-foreground { color: var(--primary-foreground); }
.text-primary { color: var(--primary); }
.bg-secondary { background-color: var(--secondary); }
.text-secondary-foreground { color: var(--secondary-foreground); }
.bg-muted { background-color: var(--muted); }
.text-muted-foreground { color: var(--muted-foreground); }
.bg-accent { background-color: var(--accent); }
.text-accent-foreground { color: var(--accent-foreground); }
.border-border { border-color: var(--border); }
.border-input { border-color: var(--input); }
.bg-input { background-color: var(--background); }
.ring-ring { --tw-ring-color: var(--ring); }
`.trim();

const STYLE_NUMERIC_NO_PX = new Set([
  "opacity",
  "zIndex",
  "fontWeight",
  "lineHeight",
  "flexGrow",
  "flexShrink",
  "order",
  "flex",
]);

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getText(props: Record<string, unknown> | undefined): string {
  if (!props) return "";
  const t = props.text ?? props.label ?? props.children;
  return typeof t === "string" ? t : "";
}

function mergeNodeStyles(node: UISchema): {
  className: string;
  style: CSSProperties;
} {
  const { className: styleClass, style: inlineStyle } = styleToProps(node.style);
  const layout = layoutToClasses(node.layout);
  const combinedClass = cn(styleClass, layout.className);
  const combinedStyle: CSSProperties = {
    ...layout.style,
    ...inlineStyle,
  };
  const props = node.props ?? {};
  if (node.layout?.mode === "absolute" && typeof props.x === "number") {
    combinedStyle.position = "absolute";
    combinedStyle.left = props.x;
    combinedStyle.top = (props.y as number) ?? 0;
  }
  return { className: combinedClass, style: combinedStyle };
}

function styleToStyleAttr(style: CSSProperties): string {
  const parts: string[] = [];
  for (const [k, val] of Object.entries(style)) {
    if (val == null || val === "") continue;
    const cssKey = k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    if (typeof val === "number") {
      parts.push(
        STYLE_NUMERIC_NO_PX.has(k) ? `${cssKey}:${val}` : `${cssKey}:${val}px`,
      );
    } else {
      parts.push(`${cssKey}:${escapeHtml(String(val))}`);
    }
  }
  return parts.length ? ` style="${parts.join(";")}"` : "";
}

function clsAttr(className: string): string {
  const c = className.trim();
  return c ? ` class="${escapeHtml(c)}"` : "";
}

function dataAttrs(node: UISchema): string {
  return ` data-studio-id="${escapeHtml(node.id)}" data-studio-type="${escapeHtml(node.type)}"`;
}

export function exportThemeToRootCss(): string {
  return `:root {
  color-scheme: light;
  --background: oklch(0.99 0.005 280);
  --foreground: oklch(0.2 0.02 280);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.2 0.02 280);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.2 0.02 280);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.96 0.01 280);
  --secondary-foreground: oklch(0.2 0.02 280);
  --muted: oklch(0.96 0.01 280);
  --muted-foreground: oklch(0.45 0.02 280);
  --accent: oklch(0.96 0.01 280);
  --accent-foreground: oklch(0.2 0.02 280);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.9 0.015 280);
  --input: oklch(0.92 0.015 280);
  --ring: oklch(0.205 0 0);
  --radius: 0.5rem;
}
`;
}

export function exportStaticCompanionCss(): string {
  return `/**
 * Studio static export — theme tokens + semantic utilities.
 * Pair with index.html (Tailwind CDN) and export.js.
 * Generated: ${new Date().toISOString()}
 */

${exportThemeToRootCss()}

${STUDIO_EXPORT_SEMANTIC_BRIDGE_CSS}

:root {
  --font-studio-display: "Manrope", ui-sans-serif, system-ui, sans-serif;
  --font-studio-body: "Inter", ui-sans-serif, system-ui, sans-serif;
}
.studio-root,
.studio-export-root {
  font-family: var(--font-studio-body);
  -webkit-font-smoothing: antialiased;
}
.font-studio-display {
  font-family: var(--font-studio-display);
}
.material-symbols-outlined {
  font-family: "Material Symbols Outlined";
  font-weight: 300;
  font-variation-settings: "FILL" 0, "wght" 300, "GRAD" 0, "opsz" 24;
  -webkit-font-smoothing: antialiased;
}

*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font-studio-body), ui-sans-serif, system-ui, sans-serif;
}
`;
}

export function exportStaticCompanionJs(): string {
  return `/**
 * Studio static export — add behavior (API calls, analytics, routing).
 * Buttons and links with href="#" are noop by default.
 */
(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }
  ready(function () {
    document.querySelectorAll('a[href="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
      });
    });
  });
})();
`;
}

function uiSchemaNodeToHtmlFragment(node: UISchema): string {
  const { className: combinedClass, style: combinedStyle } = mergeNodeStyles(node);
  const props = node.props ?? {};
  const children =
    node.children?.map((c) => uiSchemaNodeToHtmlFragment(c)).join("") ?? "";

  if (node.type === HTML_DOCUMENT_ROOT_TYPE) {
    const raw = getHtmlDocumentString(node);
    const n = raw?.length ?? 0;
    return `<div class="rounded border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-700">${escapeHtml(`Full HTML document (${n} characters) — use Download HTML / export bundle for the complete file.`)}</div>`;
  }

  const wrap = (
    tag: string,
    extraClass: string,
    extraStyle: CSSProperties,
    inner: string,
    extraAttrs = "",
  ): string => {
    const cls = cn(extraClass, combinedClass);
    const st: CSSProperties = { ...combinedStyle, ...extraStyle };
    return `<${tag}${clsAttr(cls)}${styleToStyleAttr(st)}${dataAttrs(node)}${extraAttrs}>${inner}</${tag}>`;
  };

  switch (node.type) {
    case "page": {
      const cls = cn(
        "studio-root min-h-[200px] w-full",
        combinedClass,
      );
      const st: CSSProperties = {
        backgroundColor: "#f7f9fb",
        color: "#191c1e",
        ...combinedStyle,
      };
      return `<div${clsAttr(cls)}${styleToStyleAttr(st)}${dataAttrs(node)}>${children}</div>`;
    }
    case "section":
      return wrap("section", "", {}, children);
    case "container":
      return wrap("div", "rounded-xl p-4", {}, children);
    case "card": {
      const cls = cn("rounded-xl p-5", combinedClass);
      const st = {
        boxShadow: "0 8px 24px rgba(25, 28, 30, 0.06)",
        ...combinedStyle,
      } as CSSProperties;
      return `<div${clsAttr(cls)}${styleToStyleAttr(st)}${dataAttrs(node)}>${children}</div>`;
    }
    case "hero":
      return wrap(
        "div",
        "flex flex-col gap-4 rounded-xl border bg-muted/30 p-8 md:flex-row md:items-center",
        {},
        children,
      );
    case "heading": {
      const text = escapeHtml(getText(props) || "") || children;
      return wrap(
        "h2",
        "font-studio-display text-xl font-semibold tracking-tight",
        {},
        text,
      );
    }
    case "text":
    case "paragraph": {
      const text = escapeHtml(getText(props) || "") || children;
      return wrap(
        "p",
        "font-studio-body text-sm leading-relaxed text-muted-foreground",
        {},
        text,
      );
    }
    case "button": {
      const text = escapeHtml(getText(props) || "") || children;
      const cls = cn(
        "inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90",
        combinedClass,
      );
      return `<button type="button"${clsAttr(cls)}${styleToStyleAttr(combinedStyle)}${dataAttrs(node)}>${text}</button>`;
    }
    case "input": {
      const ph =
        typeof props.placeholder === "string" ?
          ` placeholder="${escapeHtml(props.placeholder)}"`
        : "";
      const typ =
        typeof props.type === "string" ? props.type : "text";
      const cls = cn(
        "flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm",
        combinedClass,
      );
      return `<input type="${escapeHtml(typ)}"${ph}${clsAttr(cls)}${styleToStyleAttr(combinedStyle)}${dataAttrs(node)} readonly />`;
    }
    case "textarea": {
      const ph =
        typeof props.placeholder === "string" ?
          ` placeholder="${escapeHtml(props.placeholder)}"`
        : "";
      const cls = cn(
        "min-h-[72px] w-full rounded-md border border-input bg-background px-2 py-1 text-sm",
        combinedClass,
      );
      return `<textarea${ph}${clsAttr(cls)}${styleToStyleAttr(combinedStyle)}${dataAttrs(node)} readonly></textarea>`;
    }
    case "icon": {
      const name = typeof props.name === "string" ? props.name : "star";
      const useMaterial =
        props.iconSet === "material" || props.variant === "material";
      const glyphRaw =
        typeof props.glyph === "string" && props.glyph.trim()
          ? props.glyph.trim()
          : name;
      const glyph = escapeHtml(glyphRaw);
      if (useMaterial) {
        const cls = cn(
          "material-symbols-outlined inline-flex items-center justify-center leading-none",
          combinedClass,
        );
        const st = {
          ...combinedStyle,
          fontSize: (combinedStyle.fontSize as number) || 22,
        } as CSSProperties;
        return `<span${clsAttr(cls)}${styleToStyleAttr(st)}${dataAttrs(node)} role="img" aria-hidden="true">${glyph}</span>`;
      }
      const ICON_MAP: Record<string, string> = {
        star: "⭐",
        heart: "❤️",
        settings: "⚙️",
        search: "🔍",
        home: "🏠",
      };
      const icon = ICON_MAP[name.toLowerCase()] || glyphRaw;
      const cls = cn("inline-flex items-center justify-center", combinedClass);
      const st = {
        ...combinedStyle,
        fontSize: (combinedStyle.fontSize as number) || 20,
      } as CSSProperties;
      return `<span${clsAttr(cls)}${styleToStyleAttr(st)}${dataAttrs(node)} role="img" aria-label="${escapeHtml(name)}">${icon}</span>`;
    }
    case "image": {
      const src = typeof props.src === "string" ? props.src : "";
      const alt = typeof props.alt === "string" ? props.alt : "";
      if (!src) {
        return wrap(
          "div",
          "bg-muted text-muted-foreground flex h-24 items-center justify-center text-xs",
          {},
          "[image]",
        );
      }
      const cls = cn("relative overflow-hidden rounded-md", combinedClass);
      return `<div${clsAttr(cls)}${styleToStyleAttr(combinedStyle)}${dataAttrs(node)}><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="h-auto max-h-48 w-full object-cover" loading="lazy" /></div>`;
    }
    case "divider":
      return `<hr${clsAttr(cn("border-border", combinedClass))}${styleToStyleAttr(combinedStyle)}${dataAttrs(node)} />`;
    case "spacer": {
      const h = (props.height as number) ?? 16;
      const st = { ...combinedStyle, height: h } as CSSProperties;
      return `<div${clsAttr(combinedClass)}${styleToStyleAttr(st)}${dataAttrs(node)}></div>`;
    }
    case "badge": {
      const text = escapeHtml(getText(props) || "") || children;
      return wrap(
        "span",
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        {},
        text,
      );
    }
    case "link": {
      const text = escapeHtml(getText(props) || "") || children;
      const cls = cn(
        "text-primary underline-offset-4 hover:underline",
        combinedClass,
      );
      return `<a href="#"${clsAttr(cls)}${styleToStyleAttr(combinedStyle)}${dataAttrs(node)}>${text}</a>`;
    }
    case "navbar":
      return wrap(
        "nav",
        "flex items-center justify-between gap-4 border-b border-border bg-background/95 px-4 py-3",
        {},
        children,
      );
    case "footer":
      return wrap(
        "footer",
        "border-t border-border px-4 py-6 text-sm text-muted-foreground",
        {},
        children,
      );
    case "pricing-card":
    case "feature-card":
    case "stat-card":
    case "testimonial":
      return wrap("div", "rounded-lg border bg-card p-4 shadow-sm", {}, children);
    case "form": {
      const cls = cn("flex flex-col gap-3", combinedClass);
      return `<form${clsAttr(cls)}${styleToStyleAttr(combinedStyle)}${dataAttrs(node)} onsubmit="return false;">${children}</form>`;
    }
    case "list":
      return wrap("ul", "list-inside list-disc space-y-1 text-sm", {}, children);
    case "table":
      return wrap("div", "overflow-x-auto", {}, children);
    default:
      return wrap(
        "div",
        "rounded border border-dashed border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-950 dark:text-amber-100",
        {},
        `Unknown: <strong>${escapeHtml(node.type)}</strong>${children}`,
      );
  }
}

export function uiSchemaToStaticHtmlFragment(schema: UISchema): string {
  const root = migrateSchemaToLatest(schema);
  return uiSchemaNodeToHtmlFragment(root);
}

export type StaticExportBundle = {
  /** Full HTML document (references ./studio-export.css and ./studio-export.js). */
  html: string;
  css: string;
  js: string;
  /**
   * When true, `html` is the model’s complete document (self-contained). `css`/`js` are empty and not linked.
   */
  isStandaloneHtmlDocument?: boolean;
};

export function buildStaticExportBundle(
  schema: UISchema,
  options: {
    title: string;
    cssFile?: string;
    jsFile?: string;
    screenWidth?: number;
    screenHeight?: number;
  },
): StaticExportBundle {
  const root = migrateSchemaToLatest(schema);
  const standalone = getHtmlDocumentString(root);
  if (standalone) {
    let html = standalone;
    const w = options.screenWidth;
    if (w && w > 0) {
      const constraintCss = `<style>html,body{max-width:${w}px;margin:0 auto;}@media(min-width:${w + 1}px){body{box-shadow:0 0 40px rgba(0,0,0,.08);min-height:100vh;}html{background:#f4f4f5;}}</style>`;
      const headEnd = html.indexOf("</head>");
      if (headEnd !== -1) {
        html = html.slice(0, headEnd) + constraintCss + html.slice(headEnd);
      }
    }
    return {
      html,
      css: "",
      js: "",
      isStandaloneHtmlDocument: true,
    };
  }

  const cssFile = options.cssFile ?? "studio-export.css";
  const jsFile = options.jsFile ?? "studio-export.js";
  const inner = uiSchemaNodeToHtmlFragment(root);
  const title = escapeHtml(options.title);
  const bodyInner =
    inner.includes("\n") ?
      inner.split("\n").map((l) => `    ${l}`).join("\n")
    : `    ${inner}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Manrope:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,300,0,0&amp;display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="${escapeHtml(cssFile)}" />
</head>
<body class="min-h-screen antialiased bg-background text-foreground">
  <main class="studio-export-root w-full p-4">
${bodyInner}
  </main>
  <script src="${escapeHtml(jsFile)}" defer></script>
</body>
</html>
`;

  return {
    html,
    css: exportStaticCompanionCss(),
    js: exportStaticCompanionJs(),
  };
}
