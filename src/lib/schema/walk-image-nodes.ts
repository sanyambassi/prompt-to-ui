import type { UISchema } from "@/lib/schema/types";
import { getHtmlDocumentString } from "@/lib/schema/html-document";

function parseStyleDimension(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const t = value.trim();
    const px = /^(\d+(?:\.\d+)?)px$/i.exec(t);
    if (px) {
      const n = parseFloat(px[1]);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
  }
  return undefined;
}

function parseDimensionFromAttr(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const n = parseFloat(val);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

export type ImageNode = {
  nodeId: string;
  imagePrompt: string;
  currentSrc: string;
  path: number[];
  nodeType: "image" | "avatar";
  /** Numeric width/height from node style when parseable (for synthesis aspect). */
  styleWidth?: number;
  styleHeight?: number;
};

/**
 * Walk a UISchema tree and collect all image nodes that have an
 * `imagePrompt` prop (meaning they want AI image generation).
 */
export function collectImageNodes(
  schema: UISchema,
  path: number[] = [],
): ImageNode[] {
  const results: ImageNode[] = [];

  if (schema.type === "image" || schema.type === "avatar") {
    const p = schema.props ?? {};
    const st = schema.style ?? {};
    const imagePrompt =
      typeof p.imagePrompt === "string" ? p.imagePrompt.trim() : "";
    if (imagePrompt.length > 5) {
      const styleWidth = parseStyleDimension(st.width);
      const styleHeight = parseStyleDimension(st.height);
      results.push({
        nodeId: schema.id,
        imagePrompt,
        currentSrc: typeof p.src === "string" ? p.src : "",
        path,
        nodeType: schema.type === "avatar" ? "avatar" : "image",
        ...(styleWidth !== undefined ? { styleWidth } : {}),
        ...(styleHeight !== undefined ? { styleHeight } : {}),
      });
    }
  }

  if (schema.children) {
    for (let i = 0; i < schema.children.length; i++) {
      results.push(...collectImageNodes(schema.children[i], [...path, i]));
    }
  }

  return results;
}

/**
 * Set a node's `props.src` by nodeId inside a UISchema tree.
 * Mutates the schema in place. Returns true if the node was found.
 */
export function setImageSrc(
  schema: UISchema,
  nodeId: string,
  newSrc: string,
): boolean {
  if (schema.id === nodeId) {
    if (!schema.props) schema.props = {};
    schema.props.src = newSrc;
    return true;
  }
  if (schema.children) {
    for (const child of schema.children) {
      if (setImageSrc(child, nodeId, newSrc)) return true;
    }
  }
  return false;
}

/* ── HTML image extraction (for HTML prototype mode) ── */

/** Match value in either single or double quotes; capture group 1 = the value. */
function readAttr(tag: string, attr: string): string | undefined {
  const re = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const m = re.exec(tag);
  if (!m) return undefined;
  return m[1] ?? m[2];
}

/** Replace (or insert) `src` in an <img> tag, handling both quote styles. */
function replaceSrcInTag(tag: string, newSrc: string): string {
  const escaped = escapeHtmlAttr(newSrc);
  const srcRe = /\bsrc\s*=\s*(?:"[^"]*"|'[^']*')/i;
  if (srcRe.test(tag)) {
    return tag.replace(srcRe, `src="${escaped}"`);
  }
  return tag.replace(/<img\b/i, `<img src="${escaped}"`);
}

/**
 * Matches `<img ... data-image-prompt="..." ...>` or single-quoted variant.
 * Capture group 1 = double-quoted prompt value, group 2 = single-quoted.
 */
const IMG_PROMPT_RE =
  /<img\b[^>]*?\bdata-image-prompt\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*?\/?>/gi;

/**
 * Scan an HTML string for `<img data-image-prompt="...">` tags.
 * Returns ImageNode-compatible objects the synthesis pipeline can consume.
 */
export function collectImagePromptsFromHtml(html: string): ImageNode[] {
  const results: ImageNode[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;

  IMG_PROMPT_RE.lastIndex = 0;
  while ((match = IMG_PROMPT_RE.exec(html)) !== null) {
    const rawPrompt = match[1] ?? match[2] ?? "";
    const prompt = decodeHtmlEntities(rawPrompt).trim();
    if (prompt.length <= 5) continue;

    const tag = match[0];
    const id = readAttr(tag, "id");
    const nodeId = id?.trim() || `html-img-${idx}`;

    const isAvatar =
      tag.includes("avatar") ||
      tag.includes("rounded-full") ||
      tag.includes("border-radius: 50%") ||
      tag.includes("border-radius:50%");

    results.push({
      nodeId,
      imagePrompt: prompt,
      currentSrc: readAttr(tag, "src") ?? "",
      path: [idx],
      nodeType: isAvatar ? "avatar" : "image",
      ...(parseDimensionFromAttr(readAttr(tag, "width")) !== undefined
        ? { styleWidth: parseDimensionFromAttr(readAttr(tag, "width")) }
        : {}),
      ...(parseDimensionFromAttr(readAttr(tag, "height")) !== undefined
        ? { styleHeight: parseDimensionFromAttr(readAttr(tag, "height")) }
        : {}),
    });
    idx++;
  }
  return results;
}

/**
 * Replace the `src` of an `<img>` in an html_document UISchema node.
 * Uses the tag's `id` attribute for a named match, or falls back to
 * positional index for `html-img-N` synthetic IDs.
 * Mutates the schema in place.
 */
export function replaceHtmlImageSrc(
  schema: UISchema,
  nodeId: string,
  newSrc: string,
): void {
  const html = getHtmlDocumentString(schema as unknown as Record<string, unknown>);
  if (!html) return;

  const isIndexBased = /^html-img-\d+$/.test(nodeId);

  let newHtml: string;
  if (isIndexBased) {
    const targetIdx = parseInt(nodeId.replace("html-img-", ""), 10);
    let current = 0;
    let found = false;
    IMG_PROMPT_RE.lastIndex = 0;
    newHtml = html.replace(IMG_PROMPT_RE, (fullTag) => {
      if (current === targetIdx) {
        found = true;
        current++;
        return replaceSrcInTag(fullTag, newSrc);
      }
      current++;
      return fullTag;
    });
    if (!found) return;
  } else {
    let found = false;
    IMG_PROMPT_RE.lastIndex = 0;
    newHtml = html.replace(IMG_PROMPT_RE, (fullTag) => {
      if (found) return fullTag;
      const tagId = readAttr(fullTag, "id")?.trim();
      if (tagId === nodeId) {
        found = true;
        return replaceSrcInTag(fullTag, newSrc);
      }
      return fullTag;
    });
    if (!found) return;
  }

  if (!schema.props) schema.props = {};
  schema.props.html = newHtml;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
