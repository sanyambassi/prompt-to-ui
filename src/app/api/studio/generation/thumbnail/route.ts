import * as fs from "fs";
import * as path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { generateImage, resolveBestImageSynthesisProvider } from "@/lib/llm/generate-image";
import { query } from "@/lib/db/pool";
import { getUser } from "@/lib/auth/anonymous-user";
import type { LLMProvider } from "@/lib/llm/studio-models";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = getUser();

  let body: {
    projectId?: string;
    prompt?: string;
    provider?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, prompt, provider } = body;

  if (!projectId || !prompt?.trim()) {
    return NextResponse.json(
      { ok: false, error: "projectId and prompt are required" },
      { status: 400 },
    );
  }

  const validProviders = ["openai", "google", "xai", "anthropic"];
  const hintProvider = (validProviders.includes(provider ?? "") ? provider : "google") as LLMProvider;
  const imageProvider = await resolveBestImageSynthesisProvider(hintProvider);

  const thumbnailPrompt = `Professional thumbnail preview: ${prompt.trim().slice(0, 200)}. Clean, minimal, visually striking, suitable as a small project thumbnail icon.`;

  try {
    const result = await generateImage(
      imageProvider,
      thumbnailPrompt,
      "1024x1024",
    );

    const fileName = `${user.id}/${projectId}/thumbnail-${crypto.randomUUID()}.png`;
    const buffer = Buffer.from(result.base64, "base64");

    const dir = path.join(UPLOADS_DIR, user.id, projectId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, fileName), buffer);

    const imageUrl = `/uploads/${fileName}`;

    await query(
      `UPDATE studio_projects SET thumbnail_url = $3 WHERE id = $1 AND user_id = $2`,
      [projectId, user.id, imageUrl],
    );

    return NextResponse.json({ ok: true, thumbnailUrl: imageUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Thumbnail generation failed";
    console.error(`[thumbnail-gen] error: ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
