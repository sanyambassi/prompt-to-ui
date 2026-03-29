import { isUrlSafeForServerFetch } from "@/lib/studio/ssrf-url";

const MAX_HTML_BYTES = 800_000;
const MAX_IMAGE_BYTES = 2_500_000;
const FETCH_TIMEOUT_MS = 12_000;

function extractOgImage(html: string): string | null {
  const re =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i;
  const m = re.exec(html);
  if (!m) return null;
  const u = (m[1] ?? m[2] ?? "").trim();
  return u || null;
}

function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html);
  return m?.[1]?.trim() || null;
}

function extractMetaContent(html: string, nameOrProp: string): string | null {
  const byName = new RegExp(
    `<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]+content=["']([^"']{1,500})["']`,
    "i",
  );
  const byNameReverse = new RegExp(
    `<meta[^>]+content=["']([^"']{1,500})["'][^>]+(?:name|property)=["']${nameOrProp}["']`,
    "i",
  );
  const m = byName.exec(html) ?? byNameReverse.exec(html);
  return m?.[1]?.trim() || null;
}

function extractThemeColor(html: string): string | null {
  return extractMetaContent(html, "theme-color");
}

function extractDescription(html: string): string | null {
  return (
    extractMetaContent(html, "og:description") ??
    extractMetaContent(html, "description")
  );
}

/**
 * Extract a lightweight structural hint: which major HTML5 landmarks are present,
 * and a few visible headings/nav links for flavor.
 */
function extractStructuralHints(html: string): string | null {
  const parts: string[] = [];
  const landmarks = ["header", "nav", "main", "footer", "aside", "section", "article"];
  const found = landmarks.filter((tag) =>
    new RegExp(`<${tag}[\\s>]`, "i").test(html),
  );
  if (found.length > 0) {
    parts.push(`Layout landmarks: ${found.join(", ")}`);
  }
  const headings: string[] = [];
  const hRe = /<h[1-3][^>]*>([^<]{1,120})<\/h[1-3]>/gi;
  let hm;
  while ((hm = hRe.exec(html)) !== null && headings.length < 6) {
    const t = hm[1].trim();
    if (t) headings.push(t);
  }
  if (headings.length > 0) {
    parts.push(`Key headings: ${headings.map((h) => `"${h}"`).join(", ")}`);
  }
  return parts.length > 0 ? parts.join(". ") : null;
}

export type ReferencePreviewImage = {
  label: string;
  mimeType: string;
  base64: string;
};

/**
 * Fetch page HTML (SSRF-guarded), resolve og:image, download image bytes,
 * and extract structural/meta hints for richer model context.
 */
export async function fetchReferenceSitePreview(
  pageUrl: string,
): Promise<
  | {
      ok: true;
      pageUrl: string;
      title: string | null;
      description: string | null;
      themeColor: string | null;
      structuralHints: string | null;
      image: ReferencePreviewImage | null;
      /** Set when the URL pointed directly at an image file (not an HTML page). */
      directImageUrl?: string;
    }
  | { ok: false; pageUrl: string; reason: string }
> {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return { ok: false, pageUrl, reason: "Invalid URL" };
  }
  if (!isUrlSafeForServerFetch(url)) {
    return { ok: false, pageUrl, reason: "URL not allowed" };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const htmlRes = await fetch(url.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,image/*;q=0.8,*/*;q=0.7",
        "User-Agent": "StudioBot/1.0 (reference preview; +https://studio.local)",
      },
    });
    if (!htmlRes.ok) {
      return {
        ok: false,
        pageUrl,
        reason: `Page HTTP ${htmlRes.status}`,
      };
    }

    const contentType = htmlRes.headers.get("content-type")?.split(";")[0]?.trim() ?? "";

    if (contentType.startsWith("image/")) {
      const imgBuf = await htmlRes.arrayBuffer();
      if (imgBuf.byteLength > MAX_IMAGE_BYTES) {
        return { ok: false, pageUrl, reason: "Image too large" };
      }
      const base64 = Buffer.from(imgBuf).toString("base64");
      return {
        ok: true,
        pageUrl: url.toString(),
        title: null,
        description: null,
        themeColor: null,
        structuralHints: null,
        directImageUrl: url.toString(),
        image: {
          label: url.pathname.split("/").pop() || "image",
          mimeType: contentType,
          base64,
        },
      };
    }

    const buf = await htmlRes.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) {
      return { ok: false, pageUrl, reason: "Page too large" };
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const title = extractTitle(html);
    const description = extractDescription(html);
    const themeColor = extractThemeColor(html);
    const structuralHints = extractStructuralHints(html);
    const og = extractOgImage(html);

    const baseMeta = { title, description, themeColor, structuralHints };

    if (!og) {
      return { ok: true, pageUrl: url.toString(), ...baseMeta, image: null };
    }

    let imgUrl: URL;
    try {
      imgUrl = new URL(og, url);
    } catch {
      return { ok: true, pageUrl: url.toString(), ...baseMeta, image: null };
    }
    if (!isUrlSafeForServerFetch(imgUrl)) {
      return { ok: true, pageUrl: url.toString(), ...baseMeta, image: null };
    }

    const imgRes = await fetch(imgUrl.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "StudioBot/1.0 (reference preview)",
      },
    });
    if (!imgRes.ok) {
      return { ok: true, pageUrl: url.toString(), ...baseMeta, image: null };
    }
    const imgBuf = await imgRes.arrayBuffer();
    if (imgBuf.byteLength > MAX_IMAGE_BYTES) {
      return { ok: true, pageUrl: url.toString(), ...baseMeta, image: null };
    }
    const mimeType =
      imgRes.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    if (!mimeType.startsWith("image/")) {
      return { ok: true, pageUrl: url.toString(), ...baseMeta, image: null };
    }
    const base64 = Buffer.from(imgBuf).toString("base64");
    return {
      ok: true,
      pageUrl: url.toString(),
      ...baseMeta,
      image: {
        label: `Open Graph preview for ${url.hostname}`,
        mimeType,
        base64,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, pageUrl, reason: msg };
  } finally {
    clearTimeout(t);
  }
}
