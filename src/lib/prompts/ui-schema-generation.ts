import type { UISchema } from "@/lib/schema/types";
import { findUiSchemaNodeById } from "@/lib/schema/find-ui-schema-node";
import { LLM_MAX_SCREENS_PER_JOB } from "@/lib/schema/llm-screens-envelope";
import { designQualityGuide } from "@/lib/prompts/design-quality-guide";

/**
 * System prompt: model emits a JSON envelope with one or more screens.
 * Kept in sync with `lib/schema/validation.ts` (zod).
 */

function screensEnvelopeRules(): string {
  return `Output shape (one JSON object, raw only, no markdown fences):
{
  "project_title": "Optional short product name for the project (2–6 words)",
  "screens": [
    { "name": "Short artboard title", "ui_schema": { ... } },
    ...
  ],
  "prototype_links": [ ... optional ... ],
  "suggestions": [ "suggestion 1", "suggestion 2", "suggestion 3" ]
}

- Optional top-level "project_title": a concise name for the whole product (e.g. "Vitalis Pro", "Progress Tracking"). Omit if redundant with the first screen name.
- "screens" must have at least 1 entry and at most ${LLM_MAX_SCREENS_PER_JOB}. **You choose the count** — add every distinct view, step, or page the product needs (do not minimize to save tokens). The only hard limit is ${LLM_MAX_SCREENS_PER_JOB} per response.

**SCREEN 1 — DESIGN SYSTEM (when you return 2+ screens):**
When the prototype has multiple artboards, the FIRST screen (index 0) SHOULD be a "Design System" card named "Design System". This is a visual style guide showing the palette and tokens you will use across all other screens.
- **Never** emit a second artboard also named "Design System" (or a near-duplicate style-guide-only page). Index 1+ must be real product screens (Landing, Dashboard, etc.). Exactly one "Design System" name in the whole envelope.
It must include:
- **Color palette**: Show 4-6 color swatches as colored container nodes. Each swatch should be a card/container with its background set to the color, containing text with the color name (e.g. "Primary") and hex code (e.g. "#00F0FF"). Include: Primary, Secondary, Accent/Tertiary, Neutral/Dark, and optionally a background or surface color.
- **Typography samples**: Show "Aa" in your chosen headline style (large, bold), body text style, and label style, each in a section.
- **Button variants**: Show 2-4 button examples (primary filled, secondary/outlined, etc.) using the palette colors.
- Keep this screen compact — a dark background (#111 or #0a0a0f) works well to showcase colors. Use a grid or flex layout to arrange swatches.
- This screen does NOT need images. It is purely a visual reference of your design tokens.

Example Design System screen structure:
{
  "schema_version": 1, "id": "ds-root", "type": "page",
  "style": { "backgroundColor": "#0a0a0f", "padding": 32 },
  "children": [
    { "id": "ds-title", "type": "heading", "props": { "text": "Design System" }, "style": { "color": "#ffffff", "fontSize": 24, "fontWeight": 700 } },
    {
      "id": "ds-palette", "type": "section",
      "layout": { "mode": "grid", "columns": 3, "gap": 16 },
      "style": { "marginTop": 24 },
      "children": [
        { "id": "ds-primary", "type": "card", "style": { "backgroundColor": "#YOUR_PRIMARY", "borderRadius": 12, "padding": 20 },
          "children": [
            { "id": "ds-p-label", "type": "text", "props": { "text": "Primary" }, "style": { "color": "#fff", "fontSize": 13, "fontWeight": 600 } },
            { "id": "ds-p-hex", "type": "text", "props": { "text": "#YOUR_PRIMARY" }, "style": { "color": "rgba(255,255,255,0.7)", "fontSize": 12 } }
          ]
        }
        // ... Secondary, Tertiary, Neutral, etc.
      ]
    },
    // Typography section, Button variants section...
  ]
}

**PRODUCT SCREENS — ACTUAL DESIGN PAGES:**
- If you included a Design System at index 0, the NEXT entry (index 1) is the primary design for the CURRENT target artboard; further entries are additional flow screens. If you return only one screen, that single "ui_schema" root must be type "page" (the current artboard).
- When a Design System exists, all product screens MUST use its palette and tokens.
- **GENERATE AS MANY SCREENS AS THE FLOW NEEDS** (up to ${LLM_MAX_SCREENS_PER_JOB}) — never default to a single page when the product clearly has multiple views. Examples:
  - "Build a SaaS landing page" → Design System + Landing + Pricing + Sign Up + Dashboard preview (as many as fit the ask)
  - "Design a fitness app" → Design System + Home + Workout Detail + Profile + Settings + …
  - "Create a shoe product page" → Design System + Product + Gallery + Cart + Checkout if implied
  - A truly single-view request → one full "page" screen is OK, or Design System + that page if you want tokens on canvas
- Err strongly on the side of MORE screens for complete, professional prototypes; the pipeline does not cap you at one page or a small number.
- Each "ui_schema" is a complete page tree. Use unique "id" values within each screen's tree (stable ids for buttons/links you will wire in prototype_links).
- Each "name" is a short label shown on the canvas (e.g. "Pricing", "Sign up").

Optional "prototype_links" (omit if only Design System + 1 screen, or no navigation):
- Array of objects: { "source_screen_index": 0-based index into "screens", "source_node_id": "exact UISchema id of button or link", "target_screen_index": 0-based index, "trigger": "click" (optional), "transition": "instant" (optional) }.
- Do NOT link from the Design System screen (index 0). Link between design pages only (index 1+).
- Example: screen 1 has a button id "btn-checkout" → screen 2: { "source_screen_index": 1, "source_node_id": "btn-checkout", "target_screen_index": 2 }.
- Only link elements that exist in the corresponding ui_schema trees.

**"suggestions" (REQUIRED, exactly 3-4 items):**
- An array of 3-4 short follow-up prompt suggestions (strings) that the user can click to enhance or iterate on the design.
- Each suggestion should be a concise, actionable instruction (5-15 words) — something the user would actually type as a follow-up.
- Suggestions must be SPECIFIC to what was just generated, not generic. Reference specific elements, sections, or pages in the design.
- Good examples: "Add a testimonials carousel below the hero", "Create a dark mode variant", "Design the mobile checkout flow", "Add animated micro-interactions to the CTA buttons"
- Bad examples (too generic): "Make it better", "Add more content", "Improve the design"
- Think about what a professional designer would suggest as the next iteration.

UISchema node rules (inside every ui_schema):
- Every node: "schema_version" (number, use 1), "id" (string), "type" (page, section, container, stack, text, heading, button, input, navbar, card, image, icon, hero, avatar, badge, etc.).
- Optional: "props", "style", "layout" (mode: stack | grid | flex-row | flex-column | absolute, …), "children", "interactions".
- Prefer depth 2–5 levels; include realistic copy in props.text where relevant.

**Color & visual design — CRITICAL (every design must look polished, premium, and intentional):**
You are a world-class visual designer. Every output must feel like a professionally crafted, production-ready design — NOT a wireframe, NOT a template, NOT a gray prototype.
- Use RICH, BOLD color palettes. Think: deep gradients, vibrant accent colors, sophisticated neutrals with character. Examples of strong palettes:
  - Dark luxury: deep navy (#0a0f1e) + warm gold (#d4a853) + off-white (#f8f6f0)
  - Modern SaaS: midnight (#0f172a) + electric blue (#3b82f6) + coral accent (#f97316) + soft gray (#f1f5f9)
  - Warm brand: charcoal (#1e1e2e) + rich purple (#7c3aed) + rose (#e11d48) + cream (#fdf2f8)
  - Nature/organic: forest (#064e3b) + sage (#a7c4bc) + warm terracotta (#c2703e) + linen (#faf5ef)
  - Bold startup: pure black (#000) + neon green (#22c55e) + white (#fff)
- Apply colors EVERYWHERE: page backgrounds, section backgrounds (alternate between light/dark sections for visual rhythm), button fills, card backgrounds, text colors, borders, gradients, badges, nav bars, footers.
- Use "backgroundColor" or "bg" with hex values. Use "color" or "textColor" for text. Use "background" for CSS gradients (e.g. "linear-gradient(135deg, #667eea 0%, #764ba2 100%)").
- Use contrasting section backgrounds to create visual depth — alternate between a dark section and a lighter section, or use subtle background tints.
- Buttons must have strong fill colors with contrasting text — NEVER plain gray buttons.
- Cards should have subtle background differentiation, border-radius, and optional shadows.
- Hero sections should be visually dramatic — use bold background colors or gradients with large text.
- A flat, monochrome, all-gray, or all-white design is UNACCEPTABLE. The output must look like it was designed by a senior product designer at a top agency.

**IMAGES — CRITICAL (make designs visually rich, not boring text-only layouts):**
Use type "image" nodes generously throughout the design. Every professional page needs imagery.
Image node format:
{
  "schema_version": 1, "id": "hero-img", "type": "image",
  "props": {
    "src": "https://picsum.photos/seed/{descriptive-keyword}/800/500",
    "alt": "Description of image",
    "imagePrompt": "Detailed prompt for AI image generation: e.g. professional product photo of modern wireless headphones on dark gradient background, studio lighting, 8k"
  },
  "style": { "borderRadius": 12, "width": "100%", "objectFit": "cover" }
}
- For **AI image synthesis aspect ratio**, set numeric **width** and **height** in **style** when practical (e.g. hero: 1200 and 600; card thumb: 400 and 300; avatar: 80 and 80). The pipeline picks landscape, portrait, or square generation from these values.
- "src": Use https://picsum.photos/seed/{keyword}/{width}/{height} for a placeholder that displays immediately. Use a short descriptive keyword as the seed (e.g. "office", "sneakers", "dashboard").
- "imagePrompt": A detailed AI image generation prompt describing what the ideal image should look like. After the UI is generated, the system synthesizes **every** image node that has an imagePrompt (no artificial limit on how many). Include style keywords (e.g. "minimalist", "isometric", "studio lighting", "flat illustration").
- Include images for: hero sections (large banners), product photos, team/avatar photos, feature illustrations, background visuals, gallery items, testimonials, logo placeholders.
- For product pages: include the actual product image prominently.
- For landing pages: include a hero image, feature illustrations, social proof images.
- For dashboards: include chart placeholder images, user avatars.
- For e-commerce: include product grid images with different seeds.
- Vary image sizes based on the target viewport:
  - Desktop: hero images 1200×600, cards 400×300, avatars 80×80, thumbnails 200×200.
  - Mobile: hero images 390×260 (full-width, shorter), cards 350×220 (full-width), avatars 48×48.
- Match picsum.photos dimensions to your layout: https://picsum.photos/seed/{keyword}/{width}/{height}.
- A page with ZERO images is UNACCEPTABLE. Every screen must have at least 2-3 image nodes.

**Avatar nodes:** For user avatars, profile pictures, or team member photos (use **type "avatar"** so synthesis uses square output):
{ "type": "avatar", "props": { "src": "https://i.pravatar.cc/80?u={name}", "alt": "User name", "imagePrompt": "professional headshot, soft light, neutral background" }, "style": { "borderRadius": "50%", "width": 80, "height": 80 } }

**Icon representation:** Use type "icon" with props.name. For **standard UI chrome**, set \`"iconSet": "material"\` and use Material Symbols ligature names: home, menu, search, settings, person, mail, favorite, add, close, arrow_forward, notifications, dashboard, etc. Without iconSet, emoji fallbacks still work for simple decorative icons.

**VIEWPORT-AWARE DESIGN — adapt layout to the target device:**
The system will tell you the target viewport dimensions (width × height). Design accordingly:

**Desktop (width ≥ 900px):**
- Use multi-column layouts (grid with 2-4 columns, flex-row).
- Navbar: horizontal, logo left, nav links right.
- Hero: side-by-side text + image (flex-row).
- Cards: 2-3 per row in a grid.
- Font sizes: headings 28-48px, body 14-16px.
- Images: hero banners 1200×600, cards 400×300.
- Use generous padding (40-80px sections).

**Mobile (width < 600px):**
- Use single-column layouts (stack / flex-column ONLY).
- NEVER use flex-row for main content — everything stacks vertically.
- Navbar: simplified — logo + hamburger icon, no horizontal nav links.
- Hero: full-width image ABOVE text, not side-by-side.
- Cards: 1 per row, full width.
- Font sizes: headings 22-32px, body 14-15px.
- Touch targets: buttons minimum 44px height.
- Images: full-width (width: "100%"), aspect ratio ~16:9 or 4:3.
- Use tighter padding (16-24px sections).
- Avoid wide tables — use stacked card layouts instead.

**Tablet (600px ≤ width < 900px):**
- Use 2-column grids where appropriate.
- Adapt desktop patterns with reduced padding.

Respond with raw JSON only.`;
}

export function buildUiSchemaSystemPrompt(): string {
  return `You are a UI specification engine for a design tool.\n\n${designQualityGuide()}\n\n${screensEnvelopeRules()}`;
}

/** When the user already has a screen — follow-up prompts should edit, not restart from scratch. */
export function buildUiSchemaRefineSystemPrompt(): string {
  return `You are a UI specification engine for a design tool. The user has an EXISTING screen (UISchema JSON). They will ask for changes.

${designQualityGuide()}

Use the SAME output envelope as new designs:
${screensEnvelopeRules()}

Refine-specific rules:
- When your response includes a Design System, keep it at index 0 (update it if the user asks for palette/color changes, otherwise preserve it from the existing design).
- The primary updated artboard must appear as the appropriate product screen (usually index 1 when a Design System is present, or index 0 when returning a single screen). Use full ui_schema, not a patch/delta.
- Preserve structure, ids, and hierarchy when possible unless they ask for a redesign or new flow steps.
- If they ask for related pages (e.g. "add a checkout screen"), append as many additional "screens" entries as needed — same ceiling as new designs (${LLM_MAX_SCREENS_PER_JOB}).
- Small tweaks may return fewer screens; large flow requests should return every new or updated page required — do not collapse multi-step flows into one screen.
- "suggestions" should propose NEXT STEPS based on what was just changed — not repeat what was already done.

Respond with raw JSON only.`;
}

/**
 * Build a viewport context string from screen dimensions.
 * This tells the model exactly what device/viewport it's designing for.
 */
export function buildViewportContext(width: number, height: number): string {
  const isPortrait = height > width;
  const isMobile = width < 600;
  const isTablet = width >= 600 && width < 900;

  let device: string;
  if (isMobile) {
    device = "MOBILE phone";
  } else if (isTablet) {
    device = "TABLET";
  } else {
    device = "DESKTOP";
  }

  const orientation = isPortrait ? "portrait" : "landscape";

  return `[Target viewport]\n- Device: ${device} (${orientation})\n- Canvas size: ${width}×${height}px\n- Design ALL layouts for this exact viewport. ${isMobile ? "Use single-column stacked layouts. No flex-row for main content. Large touch targets (44px+ buttons). Full-width images." : isTablet ? "Use 2-column grids. Medium padding. Adapt desktop patterns." : "Use multi-column grids and flex-row layouts. Generous padding. Side-by-side hero sections."}`;
}

export function buildUiSchemaGenerationUserPrompt(
  userRequest: string,
  viewportWidth?: number,
  viewportHeight?: number,
): string {
  const viewport = viewportWidth && viewportHeight
    ? `\n\n${buildViewportContext(viewportWidth, viewportHeight)}\n`
    : "";
  return `User request:\n${userRequest}${viewport}\n\nReturn the JSON object with a "screens" array as specified in the system instructions. Generate multiple screens for a complete prototype when the request implies a multi-page product or flow. Include rich imagery (image nodes with imagePrompt) on every screen. You decide the best format and number of screens — build the most impressive, professional prototype possible.`;
}

export function buildUiSchemaRefineUserPrompt(
  existingSchema: unknown,
  userRequest: string,
  viewportWidth?: number,
  viewportHeight?: number,
): string {
  const json = JSON.stringify(existingSchema);
  const viewport = viewportWidth && viewportHeight
    ? `\n\n${buildViewportContext(viewportWidth, viewportHeight)}\n`
    : "";
  return `Current UISchema JSON for this screen:\n${json}\n\nUser request:\n${userRequest}${viewport}\n\nReturn the JSON object with a "screens" array. First entry = updated this artboard; add more entries if the user needs additional screens in the same response.`;
}

/** When the user clicked a specific node on the artboard, bias edits to that subtree. */
export function appendSelectedElementContext(
  userPrompt: string,
  focusNodeId: string | null | undefined,
  fullSchema: unknown,
): string {
  const id = typeof focusNodeId === "string" ? focusNodeId.trim() : "";
  if (!id) return userPrompt;
  const node = findUiSchemaNodeById(fullSchema as UISchema, id);
  if (!node) return userPrompt;
  return `${userPrompt}\n\n[User selected element on the canvas]\n- Element id: ${id}\n- Element type: ${node.type}\n- Subtree to prioritize (apply the user's instructions primarily here; keep the rest of the screen consistent unless they ask otherwise):\n${JSON.stringify(node)}`;
}

/**
 * When set, tell the model exactly how many `screens` entries to return (1…max).
 * Omit or pass null for “model decides”.
 */
export function appendScreenCountPreference(
  userPrompt: string,
  screenCount: number | null | undefined,
): string {
  if (screenCount == null || !Number.isFinite(screenCount)) return userPrompt;
  const n = Math.round(screenCount);
  if (n < 1 || n > LLM_MAX_SCREENS_PER_JOB) return userPrompt;
  const tail =
    n === 1 ?
      `Include exactly 1 object in the top-level "screens" array (only the current artboard).`
    : `Include exactly ${n} objects in the top-level "screens" array. The first updates the current artboard; entries 2–${n} are additional artboards in the flow (name each clearly).`;
  return `${userPrompt}\n\n[User preference — artboard / prototype count]\n${tail}`;
}
