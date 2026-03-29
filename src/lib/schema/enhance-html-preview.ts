/**
 * Runtime enhancements applied to LLM-generated HTML before it is rendered
 * inside an iframe srcDoc. These are display-time only — the stored HTML in
 * the database is never mutated.
 */

const PRECONNECT_ORIGINS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://cdn.tailwindcss.com",
  "https://unpkg.com",
];

function buildPreconnectTags(): string {
  return PRECONNECT_ORIGINS.map(
    (o) => `<link rel="preconnect" href="${o}" crossorigin>`,
  ).join("\n");
}

const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1">';

const HEAD_INJECTIONS = `
${buildPreconnectTags()}
<style>
:root { color-scheme: light only; }
@font-face { font-display: swap !important; }
</style>
`;

const BODY_SCRIPT = `<script>
(function(){
  document.querySelectorAll('img').forEach(function(img){
    if(img.complete && img.naturalWidth===0) handleImgError(img);
    else img.addEventListener('error',function(){handleImgError(this)},{once:true});
  });
  function handleImgError(el){
    el.style.background='#f4f4f5';
    el.style.display='inline-flex';
    el.style.alignItems='center';
    el.style.justifyContent='center';
    el.style.minHeight='48px';
    el.style.minWidth='48px';
    el.style.color='#a1a1aa';
    el.style.fontSize='11px';
    el.style.borderRadius='8px';
    el.removeAttribute('src');
    el.textContent=el.alt||'Image';
  }
})();
</script>`;

const CSS_NORMALIZE = `<style data-enhance="normalize">
*,*::before,*::after{box-sizing:border-box}
img,video,svg{max-width:100%;height:auto}
</style>`;

function hasTailwind(html: string): boolean {
  return html.includes("tailwindcss") || html.includes("tailwind.min");
}

function hasViewportMeta(html: string): boolean {
  return /meta\s[^>]*name\s*=\s*["']viewport["']/i.test(html);
}

function hasBoxSizingReset(html: string): boolean {
  return /box-sizing\s*:\s*border-box/i.test(html);
}

export function enhanceHtmlForPreview(html: string): string {
  let result = html;

  // 1. Inject viewport meta if missing
  if (!hasViewportMeta(result)) {
    result = injectIntoHead(result, VIEWPORT_META);
  }

  // 2. Inject preconnect hints + color-scheme lock + font-display
  result = injectIntoHead(result, HEAD_INJECTIONS);

  // 3. Inject CSS normalization only when Tailwind preflight is absent
  if (!hasTailwind(result) || !hasBoxSizingReset(result)) {
    result = injectIntoHead(result, CSS_NORMALIZE);
  }

  // 4. Inject broken-image fallback script before </body>
  result = injectBeforeBodyClose(result, BODY_SCRIPT);

  return result;
}

function injectIntoHead(html: string, snippet: string): string {
  const headClose = html.indexOf("</head>");
  if (headClose !== -1) {
    return html.slice(0, headClose) + snippet + "\n" + html.slice(headClose);
  }
  const headOpen = html.indexOf("<head");
  if (headOpen !== -1) {
    const headEnd = html.indexOf(">", headOpen);
    if (headEnd !== -1) {
      return html.slice(0, headEnd + 1) + "\n" + snippet + html.slice(headEnd + 1);
    }
  }
  return snippet + "\n" + html;
}

function injectBeforeBodyClose(html: string, snippet: string): string {
  const bodyClose = html.lastIndexOf("</body>");
  if (bodyClose !== -1) {
    return html.slice(0, bodyClose) + snippet + "\n" + html.slice(bodyClose);
  }
  return html + "\n" + snippet;
}
