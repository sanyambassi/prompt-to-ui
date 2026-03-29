import { LLM_MAX_SCREENS_PER_JOB } from "@/lib/schema/llm-screens-envelope";
import { designQualityGuide } from "@/lib/prompts/design-quality-guide";
import { buildViewportContext } from "@/lib/prompts/ui-schema-generation";

/**
 * Full HTML prototypes instead of UISchema JSON.
 * Stored in DB as ui_schema root type "html_document".
 */

function htmlEnvelopeRules(): string {
  return `Output ONE JSON object (raw only, no markdown fences):
{
  "project_title": "optional short product name",
  "design_md": "# Design System\\n\\n## Creative Direction\\n...\\n\\n## Colors\\n...\\n\\n## Typography\\n...\\n\\n## Component Guidelines\\n...",
  "screens": [
    { "name": "Short label for the canvas", "html": "<!DOCTYPE html>..." },
    ...
  ],
  "suggestions": [ "3-4 short follow-up ideas" ]
}

Rules:

**"design_md" — THE DESIGN SYSTEM (mandatory for new projects, recommended for all):**
- Write this FIRST, before any screens. Think about the design holistically: creative direction, color palette, typography, component rules.
- Format: a markdown document (escaped for JSON) structured as:
  \`# Design System: <Product Name>\`
  \`## Creative Direction\` — 2-3 sentences on the aesthetic (e.g. "Warm editorial calm", "Bold tech-forward energy").
  \`## Colors\` — A markdown table: | Token | Hex | Usage |. Include 6-10 semantic tokens: primary, on-primary, secondary, surface, surface-container-low, on-surface, on-surface-variant, accent/tertiary, outline-variant, etc.
  \`## Typography\` — Font families (headline vs body), weights, and sizing guidance. E.g. "Headlines: Playfair Display (serif), Body: Inter (sans-serif)".
  \`## Component Guidelines\` — Button styles, card patterns, spacing philosophy, shadow approach, border rules.
  \`## Do's and Don'ts\` — 3-4 concrete rules the design follows.
- Every screen (including the Design System visual card) MUST follow the colors, fonts, and rules defined in design_md.
- The design_md is the single source of truth. If a screen uses a color, it must be a token from design_md.

**"screens" — HTML DOCUMENTS:**
- "screens": 1 to ${LLM_MAX_SCREENS_PER_JOB} entries. Each "html" MUST be a **complete** HTML document: <!DOCTYPE html>, <html>, <head>, <body>.
- Each page should be **self-contained**: Tailwind CDN \`<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>\`, Google Fonts links, Lucide icons CDN (\`<script src="https://unpkg.com/lucide@latest"></script>\` + \`<script>lucide.createIcons();</script>\` before \`</body>\`), inline \`tailwind.config\` with **theme.extend.colors** for semantic tokens matching the design_md palette.
- Use responsive, production-typical layout for the given viewport; no external APIs.
- Escape any double quotes inside HTML strings in JSON (use \`\\"\` or prefer single quotes in HTML attributes where valid).

**LINKS — visual only, no real navigation:**
- All \`<a>\` tags MUST use \`href="#"\`. Do NOT use real URLs, localhost paths, relative paths, or page anchors.
- Links are purely visual. Prototype navigation between screens is handled externally by the tool — not via HTML hrefs.
- \`<button>\` elements: use \`type="button"\` and no \`onclick\` navigation.

**IMAGES — visually rich designs with flexible sourcing:**
Every professional page needs images. You have two options:

**Option A — AI-generated images (preferred for custom, product-specific imagery):**
Use \`<img>\` tags with a **\`data-image-prompt\`** attribute. The system auto-generates a real AI image for each one.
Format: \`<img src='https://picsum.photos/seed/keyword/800/500' alt='Description' data-image-prompt='professional product photo of wireless headphones on dark gradient, studio lighting, 8k' width='800' height='500' class='...' />\`
- \`src\`: A picsum.photos placeholder (shown instantly while AI generates). Use a descriptive seed: \`https://picsum.photos/seed/{keyword}/{width}/{height}\`.
- \`data-image-prompt\`: A detailed AI prompt. Be specific: subject, style, lighting, composition, mood.
- \`width\` and \`height\` attributes: numeric dimensions so the pipeline picks the right aspect ratio.

**Option B — Web images (for stock photos, logos, icons, or when AI generation is overkill):**
Use standard \`<img src="https://images.unsplash.com/...">\` with a real, publicly accessible URL. No \`data-image-prompt\` needed — the pipeline leaves these untouched.
Good for: brand logos, generic stock photos, decorative patterns, icon CDNs, well-known imagery.

**Web Search tool — always enabled:**
You have access to a web search tool. Use it to find real, high-quality image URLs (Unsplash, Pexels, stock photo sites, brand logos, etc.) when appropriate for Option B. This is especially useful for realistic stock photography, brand assets, or when the user references a specific company/product.

Rules for both options:
- Include images for: hero banners, product photos, team/avatar photos, feature illustrations, gallery items, testimonial avatars.
- For avatars / profile pictures, add \`class='rounded-full'\`.
- Vary image sizes by viewport:
  - Desktop: hero 1200×600, cards 400×300, avatars 80×80, thumbnails 200×200.
  - Mobile: hero 390×260 (full-width), cards 350×220, avatars 48×48.
- A page with ZERO images is UNACCEPTABLE. Every product screen must have at least 2-3 \`<img>\` tags (mix of Option A and B as appropriate).

${designQualityGuide()}
`.trim();
}

export function buildHtmlPrototypeSystemPrompt(): string {
  return `You are an expert front-end prototyper. You output JSON whose "screens" array contains full HTML documents for a spatial design tool.\n\n${htmlEnvelopeRules()}\n\nRespond with raw JSON only.`;
}

export function buildHtmlPrototypeRefineSystemPrompt(): string {
  return `You are an expert front-end prototyper. The user has an EXISTING HTML document (current artboard). They will ask for changes.

Return the SAME JSON envelope as new designs:
${htmlEnvelopeRules()}

Refine rules:
- Return EXACTLY ONE screen in the "screens" array: the full updated HTML for the current artboard after applying the user's request.
- Do NOT regenerate other screens from the project. Only edit the single screen the user is targeting.
- Preserve structure, layout, and content that the user did not ask to change.
- **design_md handling on refine:**
  - If the user's request does NOT involve color/palette/font/styling changes, you may OMIT "design_md" from the JSON — the system keeps the existing one.
  - If the user asks for design changes (new colors, fonts, style overhaul), include an updated "design_md" that reflects the changes. The system will replace the old one.
  - The screen MUST still follow the design system (existing or updated).
- Do NOT include a Design System screen unless the user explicitly asks for color/palette/font/styling changes. Even then, only include the updated product screen — the system updates the Design System separately.

Respond with raw JSON only.`;
}

export function buildHtmlPrototypeUserPrompt(
  userRequest: string,
  viewportWidth?: number,
  viewportHeight?: number,
): string {
  const viewport =
    viewportWidth && viewportHeight
      ? `\n\n${buildViewportContext(viewportWidth, viewportHeight)}\nDesign the main screen width to feel natural at this size.\n`
      : "";
  return `User request:\n${userRequest}${viewport}\n\nReturn the JSON object with a "screens" array. Each screen's "html" must be a complete document.`;
}

export function buildHtmlPrototypeRefineUserPrompt(
  currentHtml: string,
  userRequest: string,
  viewportWidth?: number,
  viewportHeight?: number,
  designMd?: string | null,
): string {
  const viewport =
    viewportWidth && viewportHeight
      ? `\n\n${buildViewportContext(viewportWidth, viewportHeight)}\n`
      : "";
  const clip =
    currentHtml.length > 120_000
      ? `${currentHtml.slice(0, 120_000)}\n\n[…truncated for context…]`
      : currentHtml;
  const designCtx =
    designMd && designMd.trim().length > 0
      ? `\n\nExisting DESIGN.md (the project's design system — all screens must follow this):\n${designMd.slice(0, 30_000)}\n`
      : "";
  return `Current HTML document for this artboard:\n${clip}${designCtx}\n\nUser request:\n${userRequest}${viewport}\n\nReturn the JSON object with EXACTLY 1 entry in "screens" — the full updated HTML for this artboard only.`;
}
