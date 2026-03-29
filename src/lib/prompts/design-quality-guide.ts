/**
 * Generation constraints for high-quality HTML prototypes.
 * Encourages editorial-grade visual quality with semantic tokens,
 * while letting the model freely choose fonts, colors, and creative direction
 * based on the user's request and the project's DESIGN.md.
 */

export function designQualityGuide(): string {
  return `
**HIGH-QUALITY DESIGN STANDARDS (mandatory visual language):**
Your output should feel like a premium, hand-crafted design — not a generic template. Follow these quality rules:

1. **Surfaces & hierarchy (no cheap dividers)**
   - Prefer **tonal layering** over 1px section borders. Alternate background colors between a base surface, a slightly shifted container tone, and pure white for lifted cards.
   - Avoid harsh #000 text. Use a dark but not pure-black color for headlines (e.g. #191c1e) and slightly softer tones for body text.
   - Primary CTAs: **linear-gradient** (e.g. 135deg) from primary to a deeper tone for depth.

2. **Glass & depth**
   - For navbars, floating bars, or modals: semi-opaque background + \`backdrop-filter: blur(20px)\` for glassmorphism.
   - Shadows: **soft, tinted** ambient shadows (e.g. \`0 8px 24px rgba(31, 26, 111, 0.06)\`) — not heavy neutral grey drops.

3. **Typography (model chooses fonts freely)**
   - Pick a **headline/display font** and a **body font** that match the product's personality. These are YOUR creative choice based on the user's request and the design_md you write.
   - Use Google Fonts — include the appropriate \`<link>\` in each HTML \`<head>\`.
   - Pair fonts with intentional contrast (e.g. serif headline + sans body, or geometric display + humanist body).
   - Use \`letter-spacing: -0.02em\` on large headlines for a "locked" editorial feel when appropriate.
   - Design System screen: show **both** font families in typography samples with names, weights, and sizes.

4. **Icons (Lucide — SVG-based, always renders)**
   - Use Lucide icons via CDN. Add this script in \`<head>\`: \`<script src="https://unpkg.com/lucide@latest"></script>\`.
   - Place icons as: \`<i data-lucide="icon-name" class="size-5"></i>\`. After the page loads, call \`<script>lucide.createIcons();</script>\` before \`</body>\`.
   - Common icon names: home, menu, x, search, user, mail, heart, plus, arrow-right, settings, bell, pencil, trash-2, share-2, more-vertical, cloud, key-round, shield-check, chart-bar, refresh-cw, clock, alert-triangle, check-circle, circle-x.
   - DO NOT use Material Symbols or any other font-based icon library — they fail to load reliably inside sandboxed iframes.

5. **Design System screen (MANDATORY for new/fresh projects — MUST BE INDEX 0)**
   When generating a brand-new project (the user's first prompt, no existing screens), the FIRST screen (index 0) in your "screens" JSON array MUST be named "Design System". Write its COMPLETE HTML before writing any product screen HTML. The pipeline materializes screens sequentially — product screens are BLOCKED until the Design System is ready, so placing it anywhere other than index 0 causes failures. Output at least 2 screens: the Design System at index 0, followed by one or more product screens. Finalize colors, fonts, and tokens in the Design System first, then apply them consistently to every subsequent page. Never emit a second design-system-like page; index 1+ are product screens only.
   When the user is adding a single screen to an existing project, do NOT include a Design System screen — generate only the requested screen.
   **Viewport:** Always lay out the Design System as a **desktop / web** page (wide ~1280px artboard): horizontal rows of swatches and samples. Do NOT use a narrow mobile-only column for the Design System, even when later screens are phone-sized.
   **Design System screen layout (PRESCRIPTIVE — follow this structure exactly):**

   The screen MUST follow this vertical section order. Use CSS variables for all colors and fonts so product screens inherit them.

   **Section 1 — Color Palette**
   A horizontal row of 5-7 color swatches. Each swatch is a rounded rectangle (min 120×80px) filled with the color. Below each swatch show:
   - Token name in small caps (e.g. "PRIMARY", "SURFACE", "ACCENT")
   - Hex code (e.g. #4F46E5)
   Include tonal strips: for Primary, show a row of 5 tones from lightest (10%) to darkest (90%). Repeat for Secondary and Tertiary. This mirrors Material Design 3 tonal palettes.

   **Section 2 — Typography**
   Show each font family with "Aa" samples at multiple sizes, structured as:
   - **Headline font**: Display the text "Aa" in sizes 48px, 36px, 24px. Next to each, show the font name, weight, and size label (e.g. "Manrope · Bold · 48px / Headline Large").
   - **Body font**: Same "Aa" pattern at 18px, 16px, 14px with labels like "Inter · Regular · 16px / Body Medium".
   - **Label font** (if different): Show at 12px, 11px with "Aa" and labels.
   Each row should clearly show: the "Aa" sample, then the font metadata to the right.

   **Section 3 — Button Variants**
   A horizontal row of 3-4 buttons:
   - **Filled** (gradient pill, primary color, white text)
   - **Tonal** (lighter primary bg, primary text)
   - **Outlined** (transparent bg, primary border, primary text)
   - **Text** (no bg, no border, primary text, underline on hover)

   **Section 4 — Component Samples (optional)**
   If space allows, show 2-3 small component previews: a card, an input field, a chip/tag — using the palette colors.

   **Section 5 — Spacing & Radius**
   Show the spacing scale (4px, 8px, 12px, 16px, 24px, 32px, 48px) as horizontal bars of increasing width. Show border-radius tokens as squares with different corner radii.

   This screen does NOT need images. It is purely a visual reference of your design tokens.
   Define all colors as CSS custom properties (e.g. \`--color-primary: #4F46E5\`) in a \`<style>\` block, then reference them throughout.
   All product screens (index 1+) MUST use the palette and tokens defined in the Design System and design_md.

6. **Numeric layout for image synthesis**
   - Set explicit **width** and **height** attributes on \`<img>\` tags so the image pipeline picks the correct aspect ratio.

7. **Rendering best practices (mandatory for every screen)**
   - Always include \`<meta name="viewport" content="width=device-width, initial-scale=1">\` in \`<head>\`.
   - Always include \`<meta charset="UTF-8">\` as the first element inside \`<head>\`.
   - Google Fonts \`<link>\` tags: append \`&display=swap\` to the URL so text is visible while fonts load. Example: \`https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap\`.
   - Every \`<img>\` must have numeric \`width\` and \`height\` attributes to prevent layout shift (CLS). Also provide a meaningful \`alt\` attribute.
   - Use \`<button type="button">\` for interactive elements that are not form submits — avoids unexpected form submissions.
   - Keep all styling within a Tailwind config + utility classes or an inline \`<style>\` block. Never rely on external CSS files that may not load in a sandboxed iframe.
   - Ensure the \`<body>\` has explicit \`background-color\` (or a Tailwind bg- class) — transparent backgrounds show grey in iframes.
   - Constrain page content: use \`max-width\` on the main container and center it so wide viewports don't stretch layouts edge-to-edge beyond the intended design width. Add \`overflow-x: hidden\` on \`<body>\` if horizontal scroll is not intended.

Apply these rules on **every** product screen, not only the Design System.
`.trim();
}
