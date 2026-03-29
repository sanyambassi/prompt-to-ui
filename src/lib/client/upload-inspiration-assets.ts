"use client";

import * as fs from "fs";
import * as path from "path";
import { registerStudioAsset } from "@/actions/studio/assets";
import type { WelcomeInspirationFile } from "@/lib/client/welcome-inspiration-idb";

/**
 * Upload inspiration blobs to local filesystem and register rows. Returns new asset ids.
 */
export async function uploadInspirationAssetsToProject(
  projectId: string,
  files: WelcomeInspirationFile[],
): Promise<string[]> {
  const ids: string[] = [];
  if (files.length === 0) return ids;

  for (const f of files) {
    const safeName = f.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
    const storagePath = `assets/${crypto.randomUUID()}-${safeName}`;

    const formData = new FormData();
    formData.append("file", new Blob([f.data], { type: f.mime || "application/octet-stream" }), safeName);
    formData.append("path", storagePath);

    try {
      const res = await fetch("/api/studio/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) continue;
    } catch {
      continue;
    }

    const reg = await registerStudioAsset(projectId, {
      url: storagePath,
      filename: f.name,
      mime_type: f.mime || "application/octet-stream",
    });
    if (reg.ok) ids.push(reg.data.id);
  }
  return ids;
}
