import type { UISchema } from "@/lib/schema/types";

/** DB row: public.studio_projects */
export type StudioProjectRow = {
  id: string;
  user_id: string;
  name: string;
  thumbnail_url: string | null;
  theme_config: Record<string, unknown>;
  canvas_viewport: { panX?: number; panY?: number; zoom?: number };
  canvas_document: Record<string, unknown> | null;
  is_public: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
  /** DESIGN.md markdown — the canonical design system (migration 007). */
  design_md?: string | null;
};

/** DB row: public.studio_screens */
export type StudioScreenRow = {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  ui_schema: UISchema;
  thumbnail_url: string | null;
  sort_order: number;
  canvas_x: number;
  canvas_y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
  /** Mirrored from latest job generation_log (migration 006). */
  last_generation_log?: Record<string, unknown>[] | null;
  last_generation_log_at?: string | null;
  last_generation_log_job_id?: string | null;
};

/** DB row: public.studio_variants */
export type StudioVariantRow = {
  id: string;
  project_id: string;
  screen_id: string;
  user_id: string;
  name: string;
  ui_schema: UISchema;
  is_original: boolean;
  created_at: string;
};

/** DB row: public.studio_chat_messages */
export type StudioChatMessageRow = {
  id: string;
  project_id: string;
  screen_id: string | null;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

/** DB row: public.studio_assets */
export type StudioAssetRow = {
  id: string;
  project_id: string;
  user_id: string;
  url: string;
  filename: string;
  mime_type: string;
  created_at: string;
};

/** DB row: public.studio_version_snapshots */
export type StudioVersionSnapshotRow = {
  id: string;
  project_id: string;
  user_id: string;
  label: string;
  payload: Record<string, unknown>;
  created_at: string;
};

/**
 * Optional multimodal / reference payload on `studio_generation_jobs.context`.
 * @see db/migrations/init.sql
 */
export type ColorSchemeContext = {
  name: string;
  mode: "light" | "dark";
  colors: Record<string, string>;
  fonts: { headline: string; body: string };
};

export type StudioGenerationJobContext = {
  /** Public https URLs — server may fetch Open Graph preview image (SSRF-guarded). */
  reference_urls?: string[];
  /** `studio_assets.id` rows (same project) to load as vision inputs. */
  inspiration_asset_ids?: string[];
  /** Pre-selected color scheme template to guide design_md generation. */
  color_scheme?: ColorSchemeContext;
};

/** DB row: public.studio_generation_jobs */
export type StudioGenerationJobRow = {
  id: string;
  project_id: string;
  screen_id: string | null;
  variant_id: string | null;
  user_id: string;
  status: "pending" | "running" | "success" | "error";
  prompt: string;
  provider: string | null;
  model: string | null;
  result_schema: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  /** JSON: reference URLs + inspiration asset ids (migration 003). */
  context?: StudioGenerationJobContext | Record<string, unknown> | null;
  /** Captured generation log entries (migration 005). NULL until generation completes. */
  generation_log?: Record<string, unknown>[] | null;
};

/** DB row: public.studio_canvas_images */
export type StudioCanvasImageRow = {
  id: string;
  project_id: string;
  user_id: string;
  prompt: string;
  provider: string;
  model: string;
  storage_path: string;
  public_url: string;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
};

/** DB row: public.studio_prototype_links */
export type StudioPrototypeLinkRow = {
  id: string;
  screen_id: string;
  user_id: string;
  source_node_id: string;
  target_screen_id: string;
  trigger: string;
  transition: string;
  transition_config: { duration?: number; easing?: string };
  created_at: string;
};
