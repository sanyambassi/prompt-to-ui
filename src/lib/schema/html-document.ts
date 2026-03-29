import type { UISchema } from "@/lib/schema/types";

/** Root node type for “full-document” full-document HTML stored in ui_schema. */
export const HTML_DOCUMENT_ROOT_TYPE = "html_document";

export function buildHtmlDocumentUiSchema(html: string): UISchema {
  return {
    schema_version: 1,
    id: "html-root",
    type: HTML_DOCUMENT_ROOT_TYPE,
    props: { html },
  };
}

/** Extract full HTML string if this screen is an HTML prototype root. */
export function getHtmlDocumentString(schema: unknown): string | null {
  if (!schema || typeof schema !== "object") return null;
  const o = schema as Record<string, unknown>;
  if (o.type !== HTML_DOCUMENT_ROOT_TYPE) return null;
  const props = o.props;
  if (!props || typeof props !== "object") return null;
  const html = (props as Record<string, unknown>).html;
  if (typeof html !== "string" || html.trim().length < 8) return null;
  return html;
}

export function isHtmlDocumentScreen(schema: unknown): boolean {
  return getHtmlDocumentString(schema) != null;
}

const LINK_NEUTRALIZER_SCRIPT = `<script>document.addEventListener('click',function(e){var a=e.target.closest('a');if(a)e.preventDefault();},true);</script>`;

/**
 * Inject a tiny script that prevents all `<a>` click navigation inside the
 * sandboxed iframe. Keeps links visually styled but non-functional.
 */
export function neutralizeHtmlLinks(html: string): string {
  const idx = html.lastIndexOf("</body>");
  if (idx !== -1) {
    return html.slice(0, idx) + LINK_NEUTRALIZER_SCRIPT + html.slice(idx);
  }
  return html + LINK_NEUTRALIZER_SCRIPT;
}
