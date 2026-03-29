/** Component types the renderer and AI prompts must stay in sync with. */
export const ALLOWED_COMPONENT_TYPES = [
  "page",
  "section",
  "container",
  "heading",
  "text",
  "paragraph",
  "button",
  "input",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "card",
  "image",
  "icon",
  "navbar",
  "footer",
  "sidebar",
  "modal",
  "drawer",
  "divider",
  "spacer",
  "badge",
  "avatar",
  "table",
  "list",
  "link",
  "form",
  "hero",
  "pricing-card",
  "testimonial",
  "stat-card",
  "feature-card",
] as const;

export type AllowedComponentType = (typeof ALLOWED_COMPONENT_TYPES)[number];

export function isAllowedComponentType(
  t: string,
): t is AllowedComponentType {
  return (ALLOWED_COMPONENT_TYPES as readonly string[]).includes(t);
}
