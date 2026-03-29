import * as fs from "fs";
import * as path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { generateImage, getStudioGeminiImageModelId, resolveBestImageSynthesisProvider } from "@/lib/llm/generate-image";
import { query, queryOne } from "@/lib/db/pool";
import { getUser } from "@/lib/auth/anonymous-user";
import type { LLMProvider } from "@/lib/llm/studio-models";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const user = getUser();

  let body: {
    projectId?: string;
    prompt?: string;
    provider?: string;
    size?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, prompt, provider, size } = body;

  if (!projectId || !prompt?.trim()) {
    return NextResponse.json(
      { ok: false, error: "projectId and prompt are required" },
      { status: 400 },
    );
  }

  const validProviders = ["openai", "google", "xai", "anthropic"];
  const hintProvider = (validProviders.includes(provider ?? "") ? provider : "google") as LLMProvider;
  const imageProvider = await resolveBestImageSynthesisProvider(hintProvider);
  const imageSize = (
    size === "1024x1536" || size === "1536x1024" ? size : "1024x1024"
  ) as "1024x1024" | "1024x1536" | "1536x1024";

  const IMAGE_MODEL_MAP: Record<string, string> = {
    openai: "gpt-image-1.5",
    google: getStudioGeminiImageModelId(),
    xai: "grok-imagine-image-pro",
    anthropic: "gpt-image-1.5",
  };

  try {
    console.log(`[image-gen] provider=${imageProvider} prompt="${prompt.trim().slice(0, 60)}..."`);
    const result = await generateImage(
      imageProvider,
      prompt.trim(),
      imageSize,
    );
    console.log(`[image-gen] success: ${result.width}x${result.height}, base64 length=${result.base64.length}`);

    const fileName = `${user.id}/${projectId}/${crypto.randomUUID()}.png`;
    const buffer = Buffer.from(result.base64, "base64");

    const dir = path.join(UPLOADS_DIR, user.id, projectId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, fileName), buffer);

    const imageUrl = `/uploads/${fileName}`;

    const row = await queryOne<{ id: string }>(
      `INSERT INTO studio_canvas_images (project_id, user_id, prompt, provider, model, storage_path, public_url, width, height)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        projectId,
        user.id,
        prompt.trim(),
        imageProvider,
        IMAGE_MODEL_MAP[imageProvider] || "gpt-image-1.5",
        fileName,
        imageUrl,
        result.width,
        result.height,
      ],
    );

    if (!row) {
      return NextResponse.json(
        { ok: false, error: "DB insert failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      imageUrl,
      canvasImageId: row.id,
      width: result.width,
      height: result.height,
      revisedPrompt: result.revisedPrompt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Image generation failed";
    console.error(`[image-gen] error: ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
