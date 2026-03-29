"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getSettings,
  updateSetting,
  type AppSetting,
} from "@/actions/studio/settings";
import { MASKED_SENTINEL } from "@/lib/constants/settings";
import { ArrowLeft, Loader2, Key, Check } from "lucide-react";

const API_KEY_FIELDS = [
  { key: "openai_api_key", label: "OpenAI", placeholder: "sk-..." },
  { key: "anthropic_api_key", label: "Anthropic", placeholder: "sk-ant-..." },
  { key: "google_ai_api_key", label: "Google AI", placeholder: "AI..." },
  { key: "xai_api_key", label: "xAI", placeholder: "xai-..." },
];

const PIPELINE_FIELDS = [
  { key: "pipeline_ui_model", label: "UI Model Override", placeholder: "Leave blank for default" },
  { key: "pipeline_image_provider", label: "Image Provider Override", placeholder: "auto / openai / google / xai" },
];

const API_KEY_SET = new Set(API_KEY_FIELDS.map((f) => f.key));

function isMasked(value: string): boolean {
  return value.startsWith(MASKED_SENTINEL);
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const res = await getSettings();
      if (res.ok) {
        const map: Record<string, string> = {};
        for (const s of res.data) {
          map[s.key] = s.value;
        }
        setSettings(map);
        setInitial(map);
      }
      setLoaded(true);
    });
  }, []);

  const handleSaveAll = useCallback(async () => {
    const allFields = [...API_KEY_FIELDS, ...PIPELINE_FIELDS];
    const changed = allFields.filter((f) => {
      const cur = settings[f.key] ?? "";
      const orig = initial[f.key] ?? "";
      if (cur === orig) return false;
      if (API_KEY_SET.has(f.key) && isMasked(cur)) return false;
      return true;
    });
    if (changed.length === 0) {
      router.back();
      return;
    }
    setSavingAll(true);
    let ok = true;
    for (const f of changed) {
      const res = await updateSetting(f.key, settings[f.key] ?? "");
      if (!res.ok) {
        toast.error(`Failed to save ${f.label}`);
        ok = false;
        break;
      }
    }
    setSavingAll(false);
    if (ok) {
      toast.success("Settings saved");
      router.back();
    }
  }, [settings, initial, router]);

  const handleKeyFocus = useCallback((fieldKey: string) => {
    setSettings((s) => {
      const cur = s[fieldKey] ?? "";
      if (isMasked(cur)) {
        return { ...s, [fieldKey]: "" };
      }
      return s;
    });
    setEditing((e) => ({ ...e, [fieldKey]: true }));
  }, []);

  const handleKeyBlur = useCallback(
    (fieldKey: string) => {
      const cur = settings[fieldKey] ?? "";
      if (cur.trim() === "") {
        setSettings((s) => ({ ...s, [fieldKey]: initial[fieldKey] ?? "" }));
        setEditing((e) => ({ ...e, [fieldKey]: false }));
      }
    },
    [settings, initial],
  );

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:py-12 sm:px-6">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/"
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure API keys and generation pipeline
          </p>
        </div>
      </div>

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Key className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-medium">API Keys</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          You need at least one API key to generate designs. Keys are stored locally in your PostgreSQL database.
        </p>
        <div className="space-y-4">
          {API_KEY_FIELDS.map((field) => {
            const value = settings[field.key] ?? "";
            const isCurrentlyMasked = isMasked(value);
            const isEditing = editing[field.key];

            return (
              <div key={field.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <label className="text-sm font-medium shrink-0 sm:w-24">
                  {field.label}
                </label>
                <div className="relative flex-1">
                  {isCurrentlyMasked && !isEditing ? (
                    <input
                      type="text"
                      readOnly
                      value={value}
                      onFocus={() => handleKeyFocus(field.key)}
                      placeholder={field.placeholder}
                      className="w-full rounded-lg border bg-muted/50 px-3 py-2 text-base sm:text-sm tracking-wider text-muted-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  ) : (
                    <input
                      type="text"
                      value={value}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, [field.key]: e.target.value }))
                      }
                      onFocus={() => handleKeyFocus(field.key)}
                      onBlur={() => handleKeyBlur(field.key)}
                      placeholder={field.placeholder}
                      autoFocus={isEditing}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  )}
                  {isCurrentlyMasked && !isEditing && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/60">
                      click to change
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-4">Pipeline Overrides</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Override the default model or image provider for all generations. Leave blank for defaults.
        </p>
        <div className="space-y-4">
          {PIPELINE_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <label className="text-sm font-medium shrink-0 leading-tight sm:w-24">
                {field.label}
              </label>
              <input
                type="text"
                value={settings[field.key] ?? ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, [field.key]: e.target.value }))
                }
                placeholder={field.placeholder}
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10 flex items-center justify-end gap-3 border-t pt-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={savingAll}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {savingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Save &amp; Close
        </button>
      </div>
    </div>
  );
}
