import * as fs from "fs";
import * as path from "path";
import { NextResponse, type NextRequest } from "next/server";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob | null;
    const storagePath = formData.get("path") as string | null;

    if (!file || !storagePath) {
      return NextResponse.json(
        { ok: false, error: "file and path are required" },
        { status: 400 },
      );
    }

    if (storagePath.includes("..")) {
      return NextResponse.json(
        { ok: false, error: "Invalid path" },
        { status: 400 },
      );
    }

    const fullPath = path.join(UPLOADS_DIR, storagePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(fullPath, buffer);

    return NextResponse.json({ ok: true, url: `/uploads/${storagePath}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
