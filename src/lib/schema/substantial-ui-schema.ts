import { getHtmlDocumentString } from "@/lib/schema/html-document";

/**
 * Detect whether a screen already has generated content worth sending as
 * "current design" for refine/follow-up prompts (vs empty placeholder page).
 */

export function isSubstantialUiSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const html = getHtmlDocumentString(schema);
  if (html != null) return html.trim().length >= 80;

  const o = schema as Record<string, unknown>;

  const children = o.children;
  if (Array.isArray(children) && children.length > 0) return true;

  const meaningfulKeys = Object.keys(o).filter(
    (k) => k !== "schema_version" && k !== "id" && k !== "type",
  );
  if (meaningfulKeys.length === 0) return false;

  // layout/style/props/interactions alone can mean a styled empty page — still "substantial" for refine
  return true;
}
