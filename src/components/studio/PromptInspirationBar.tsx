"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ImagePlus, Link2, X } from "lucide-react";

const MAX_URLS = 5;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

type Props = {
  variant?: "marketing" | "workspace";
  className?: string;
  referenceUrls: string[];
  onReferenceUrlsChange: (urls: string[]) => void;
  inspirationFiles: File[];
  onInspirationFilesChange: (files: File[]) => void;
};

export function PromptInspirationBar({
  variant = "workspace",
  className,
  referenceUrls,
  onReferenceUrlsChange,
  inspirationFiles,
  onInspirationFilesChange,
}: Props) {
  const isMarketing = variant === "marketing";
  const [urlDraft, setUrlDraft] = useState("");
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const addUrl = useCallback(() => {
    const raw = urlDraft.trim();
    if (!raw) return;
    const withProto =
      raw.startsWith("http://") || raw.startsWith("https://") ?
        raw
      : `https://${raw}`;
    try {
      const u = new URL(withProto);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      const href = u.toString();
      if (referenceUrls.includes(href)) return;
      if (referenceUrls.length >= MAX_URLS) return;
      onReferenceUrlsChange([...referenceUrls, href]);
      setUrlDraft("");
    } catch {
      /* invalid */
    }
  }, [urlDraft, referenceUrls, onReferenceUrlsChange]);

  const onPickFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      e.target.value = "";
      if (!list?.length) return;
      const next = [...inspirationFiles];
      for (const f of Array.from(list)) {
        if (next.length >= MAX_FILES) break;
        if (f.size > MAX_FILE_BYTES) continue;
        next.push(f);
      }
      onInspirationFilesChange(next);
    },
    [inspirationFiles, onInspirationFilesChange],
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-2.5 text-left",
        isMarketing ?
          "border-white/10 bg-black/25"
        : "border-border/50 bg-muted/20",
        className,
      )}
    >
      <p
        className={cn(
          "text-[0.65rem] font-semibold uppercase tracking-widest",
          isMarketing ? "text-white/65" : "text-muted-foreground",
        )}
      >
        Inspiration
      </p>
      <p
        className={cn(
          "text-[0.7rem] leading-relaxed",
          isMarketing ? "text-white/70" : "text-muted-foreground",
        )}
      >
        Add reference sites (we fetch Open Graph previews when possible) and
        images to steer layout and visuals.
      </p>

      <div className="flex flex-wrap gap-1.5">
        <div className="flex min-w-0 flex-1 gap-1">
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
            placeholder="https://example.com"
            className={cn(
              "h-8 min-w-0 flex-1 text-xs",
              isMarketing &&
                "border-white/12 bg-black/30 text-white placeholder:text-white/50",
            )}
          />
          <Button
            type="button"
            size="sm"
            variant={isMarketing ? "secondary" : "outline"}
            className={cn("h-8 shrink-0", isMarketing && "bg-white/10 text-white")}
            onClick={addUrl}
            disabled={referenceUrls.length >= MAX_URLS}
          >
            <Link2 className="size-3.5" />
          </Button>
        </div>
        <input
          ref={fileRef}
          id={fileId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={onPickFiles}
        />
        <Button
          type="button"
          size="sm"
          variant={isMarketing ? "secondary" : "outline"}
          className={cn("h-8", isMarketing && "bg-white/10 text-white")}
          onClick={() => fileRef.current?.click()}
          disabled={inspirationFiles.length >= MAX_FILES}
        >
          <ImagePlus className="size-3.5" />
          <span className="ml-1 hidden sm:inline">Images</span>
        </Button>
      </div>

      {(referenceUrls.length > 0 || inspirationFiles.length > 0) && (
        <ul className="flex flex-wrap gap-1.5">
          {referenceUrls.map((u) => (
            <li
              key={u}
              className={cn(
                "flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem]",
                isMarketing ?
                  "border-white/15 bg-white/8 text-white/85"
                : "border-border/60 bg-background/80",
              )}
            >
              <span className="truncate">{u.replace(/^https?:\/\//, "")}</span>
              <button
                type="button"
                className={cn(
                  "shrink-0 rounded-full p-0.5",
                  isMarketing ? "hover:bg-white/15" : "hover:bg-muted",
                )}
                aria-label="Remove URL"
                onClick={() =>
                  onReferenceUrlsChange(referenceUrls.filter((x) => x !== u))
                }
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
          {inspirationFiles.map((f) => (
            <li
              key={`${f.name}-${f.size}`}
              className={cn(
                "flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem]",
                isMarketing ?
                  "border-white/15 bg-white/8 text-white/85"
                : "border-border/60 bg-background/80",
              )}
            >
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                className={cn(
                  "shrink-0 rounded-full p-0.5",
                  isMarketing ? "hover:bg-white/15" : "hover:bg-muted",
                )}
                aria-label="Remove file"
                onClick={() =>
                  onInspirationFilesChange(
                    inspirationFiles.filter((x) => x !== f),
                  )
                }
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
