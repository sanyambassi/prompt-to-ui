import * as fs from "fs";
import * as path from "path";
import { NextResponse, type NextRequest } from "next/server";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filepath: string[] }> },
) {
  const { filepath } = await params;
  const relative = filepath.join("/");

  if (relative.includes("..")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const fullPath = path.join(UPLOADS_DIR, relative);

  if (!fs.existsSync(fullPath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  const buffer = fs.readFileSync(fullPath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
