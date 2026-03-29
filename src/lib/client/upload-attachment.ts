"use client";

import type { PendingAttachment } from "@/store/pending-attachments";

function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return map[mime] ?? "png";
}

/**
 * Upload a pending attachment to the local server (`public/uploads/`)
 * and return a URL the LLM can embed in `<img src="...">`.
 * Returns `null` if the upload fails.
 */
export async function uploadAttachmentToLocal(
  attachment: PendingAttachment,
  projectId: string,
): Promise<string | null> {
  try {
    if (!attachment.base64 || attachment.base64.length < 10) {
      console.warn("[upload-attachment] base64 is empty or too short, skipping");
      return null;
    }

    const ext = mimeToExt(attachment.mimeType);
    const storagePath = `attachments/${projectId}/${uid()}.${ext}`;

    const binary = Uint8Array.from(atob(attachment.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([binary], { type: attachment.mimeType });

    const form = new FormData();
    form.append("file", blob, attachment.filename);
    form.append("path", storagePath);

    const res = await fetch("/api/studio/upload", { method: "POST", body: form });
    if (!res.ok) {
      console.error("[upload-attachment] upload failed:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const json = (await res.json()) as { ok: boolean; url?: string };
    if (!json.ok || !json.url) {
      console.error("[upload-attachment] server returned error:", json);
      return null;
    }

    const fullUrl = `${window.location.origin}${json.url}`;
    console.log("[upload-attachment] success:", fullUrl);
    return fullUrl;
  } catch (err) {
    console.error("[upload-attachment] exception:", err);
    return null;
  }
}
