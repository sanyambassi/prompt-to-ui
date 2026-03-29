import * as fs from "fs";
import * as path from "path";
import { fetchReferenceSitePreview } from "@/lib/studio/fetch-reference-preview";
import { normalizeStudioJobContext } from "@/lib/studio/job-context";
import { query } from "@/lib/db/pool";

export type ResolvedVisionImage = {
  mimeType: string;
  base64: string;
  label: string;
};

const MAX_VISION_IMAGES = 6;
const MAX_ASSET_BYTES = 2_500_000;

export type ResolveGenerationAttachmentsResult = {
  preamble: string;
  images: ResolvedVisionImage[];
};

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

export async function resolveGenerationAttachments(
  userId: string,
  projectId: string,
  contextRaw: unknown,
): Promise<ResolveGenerationAttachmentsResult> {
  const ctx = normalizeStudioJobContext(contextRaw);
  const lines: string[] = [];
  const images: ResolvedVisionImage[] = [];

  lines.push("[Inspiration & references]");
  lines.push(
    "Use the following only as visual/brand/layout inspiration. Do not copy trademarked logos or proprietary assets verbatim unless the user explicitly asked. Produce original HTML as instructed.",
  );

  const urls = ctx.reference_urls ?? [];
  if (urls.length > 0) {
    lines.push("");
    lines.push("Reference websites & images (match overall look, hierarchy, and tone):");
    for (const u of urls) {
      const prev = await fetchReferenceSitePreview(u);
      if (prev.ok) {
        if (prev.directImageUrl) {
          lines.push(`- ${prev.directImageUrl} — DIRECT IMAGE (attached as vision input)`);
          lines.push(
            `  CRITICAL: Use this EXACT URL as the \`src\` attribute in \`<img>\` tags when the user wants this image embedded. Do NOT substitute with a placeholder or external service.`,
          );
        } else {
          const parts = [prev.pageUrl];
          if (prev.title) parts.push(`\u2014 "${prev.title}"`);
          if (prev.description) parts.push(`\u2014 ${prev.description}`);
          if (prev.themeColor) parts.push(`(brand color: ${prev.themeColor})`);
          if (prev.image) parts.push("(OG preview image attached below)");
          else parts.push("(no preview image \u2014 infer from URL/domain)");
          lines.push(`- ${parts.join(" ")}`);
          if (prev.structuralHints) {
            lines.push(`  ${prev.structuralHints}`);
          }
        }
        if (prev.image && images.length < MAX_VISION_IMAGES) {
          images.push({
            mimeType: prev.image.mimeType,
            base64: prev.image.base64,
            label: prev.image.label,
          });
        }
      } else {
        lines.push(
          `- ${u} (could not fetch: ${prev.reason} \u2014 still treat as a style reference from the domain/path)`,
        );
      }
    }
  }

  const assetIds = ctx.inspiration_asset_ids ?? [];
  if (assetIds.length > 0) {
    lines.push("");
    lines.push("Uploaded inspiration files (images attached when possible):");
    const { rows } = await query<{
      id: string;
      url: string;
      filename: string;
      mime_type: string;
    }>(
      `SELECT id, url, filename, mime_type FROM studio_assets
       WHERE project_id = $1 AND user_id = $2 AND id = ANY($3::uuid[])`,
      [projectId, userId, assetIds],
    );

    for (const row of rows) {
      const storedPath = row.url;
      const filename = row.filename || "file";
      const mime = row.mime_type || "application/octet-stream";
      lines.push(`- ${filename} (${mime})`);

      if (!mime.startsWith("image/") || images.length >= MAX_VISION_IMAGES) {
        continue;
      }

      try {
        const filePath = path.join(UPLOADS_DIR, storedPath);
        if (!fs.existsSync(filePath)) continue;
        const buf = fs.readFileSync(filePath);
        if (buf.byteLength > MAX_ASSET_BYTES) continue;
        images.push({
          mimeType: mime,
          base64: buf.toString("base64"),
          label: filename,
        });
      } catch {
        /* skip */
      }
    }
  }

  if (urls.length === 0 && assetIds.length === 0) {
    return { preamble: "", images: [] };
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  return {
    preamble: lines.join("\n"),
    images,
  };
}
