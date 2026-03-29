-- =============================================================================
-- Studio Open Source — PostgreSQL schema init
-- Auto-runs on first container start via docker-entrypoint-initdb.d
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Anonymous single-user ID (all rows belong to this user)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uuid') THEN
    NULL; -- uuid type always exists in modern PG
  END IF;
END $$;

-- Default user_id for all rows
-- No auth.users table — just a fixed UUID constant
CREATE OR REPLACE FUNCTION default_user_id() RETURNS uuid
  LANGUAGE sql IMMUTABLE AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$;

-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.studio_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- TABLES
-- =============================================================================

-- studio_projects
CREATE TABLE IF NOT EXISTS public.studio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT default_user_id(),
  name text NOT NULL DEFAULT 'Untitled Project',
  thumbnail_url text,
  theme_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  canvas_viewport jsonb NOT NULL DEFAULT '{"panX":0,"panY":0,"zoom":1}'::jsonb,
  canvas_document jsonb DEFAULT '{}',
  design_md text DEFAULT NULL,
  is_public boolean NOT NULL DEFAULT false,
  share_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_projects_share_token_unique
  ON public.studio_projects (share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS studio_projects_user_updated_idx
  ON public.studio_projects (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS studio_projects_user_id_idx
  ON public.studio_projects (user_id);

DROP TRIGGER IF EXISTS studio_projects_set_updated_at ON public.studio_projects;
CREATE TRIGGER studio_projects_set_updated_at
  BEFORE UPDATE ON public.studio_projects
  FOR EACH ROW EXECUTE FUNCTION public.studio_set_updated_at();

-- studio_screens
CREATE TABLE IF NOT EXISTS public.studio_screens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT default_user_id(),
  name text NOT NULL DEFAULT 'Screen',
  ui_schema jsonb NOT NULL DEFAULT '{"schema_version":1,"id":"root","type":"page"}'::jsonb,
  thumbnail_url text,
  sort_order int NOT NULL DEFAULT 0,
  canvas_x double precision NOT NULL DEFAULT 0,
  canvas_y double precision NOT NULL DEFAULT 0,
  width int NOT NULL DEFAULT 1280,
  height int NOT NULL DEFAULT 800,
  last_generation_log jsonb DEFAULT NULL,
  last_generation_log_at timestamptz DEFAULT NULL,
  last_generation_log_job_id uuid DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studio_screens_project_sort_idx
  ON public.studio_screens (project_id, sort_order);
CREATE INDEX IF NOT EXISTS studio_screens_project_id_idx
  ON public.studio_screens (project_id);
CREATE INDEX IF NOT EXISTS studio_screens_user_id_idx
  ON public.studio_screens (user_id);

DROP TRIGGER IF EXISTS studio_screens_set_updated_at ON public.studio_screens;
CREATE TRIGGER studio_screens_set_updated_at
  BEFORE UPDATE ON public.studio_screens
  FOR EACH ROW EXECUTE FUNCTION public.studio_set_updated_at();

-- studio_variants
CREATE TABLE IF NOT EXISTS public.studio_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  screen_id uuid NOT NULL REFERENCES public.studio_screens (id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT default_user_id(),
  name text NOT NULL DEFAULT 'Variant',
  ui_schema jsonb NOT NULL DEFAULT '{"schema_version":1,"id":"root","type":"page"}'::jsonb,
  is_original boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studio_variants_screen_id_idx
  ON public.studio_variants (screen_id);
CREATE INDEX IF NOT EXISTS studio_variants_project_id_idx
  ON public.studio_variants (project_id);
CREATE INDEX IF NOT EXISTS studio_variants_project_screen_idx
  ON public.studio_variants (project_id, screen_id);

-- studio_chat_messages
CREATE TABLE IF NOT EXISTS public.studio_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  screen_id uuid REFERENCES public.studio_screens (id) ON DELETE SET NULL,
  user_id uuid NOT NULL DEFAULT default_user_id(),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studio_chat_messages_project_created_idx
  ON public.studio_chat_messages (project_id, created_at);
CREATE INDEX IF NOT EXISTS studio_chat_messages_project_screen_idx
  ON public.studio_chat_messages (project_id, screen_id, created_at);

-- studio_assets
CREATE TABLE IF NOT EXISTS public.studio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT default_user_id(),
  url text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studio_assets_project_created_idx
  ON public.studio_assets (project_id, created_at DESC);

-- studio_version_snapshots
CREATE TABLE IF NOT EXISTS public.studio_version_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT default_user_id(),
  label text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studio_version_snapshots_project_created_idx
  ON public.studio_version_snapshots (project_id, created_at DESC);

-- studio_generation_jobs
CREATE TABLE IF NOT EXISTS public.studio_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  screen_id uuid REFERENCES public.studio_screens (id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.studio_variants (id) ON DELETE SET NULL,
  user_id uuid NOT NULL DEFAULT default_user_id(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'error')),
  prompt text NOT NULL DEFAULT '',
  provider text,
  model text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_schema jsonb,
  error_message text,
  generation_log jsonb DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS studio_generation_jobs_project_created_idx
  ON public.studio_generation_jobs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS studio_generation_jobs_project_status_idx
  ON public.studio_generation_jobs (project_id, status);
CREATE INDEX IF NOT EXISTS studio_generation_jobs_screen_log_created_idx
  ON public.studio_generation_jobs (screen_id, created_at DESC)
  WHERE generation_log IS NOT NULL AND screen_id IS NOT NULL;

-- studio_prototype_links
CREATE TABLE IF NOT EXISTS public.studio_prototype_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id uuid NOT NULL REFERENCES public.studio_screens (id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT default_user_id(),
  source_node_id text NOT NULL,
  target_screen_id uuid NOT NULL REFERENCES public.studio_screens (id) ON DELETE CASCADE,
  trigger text NOT NULL DEFAULT 'click',
  transition text NOT NULL DEFAULT 'instant',
  transition_config jsonb NOT NULL DEFAULT '{"duration":200,"easing":"ease-out"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studio_prototype_links_screen_id_idx
  ON public.studio_prototype_links (screen_id);
CREATE INDEX IF NOT EXISTS studio_prototype_links_target_idx
  ON public.studio_prototype_links (target_screen_id);

-- studio_canvas_images
CREATE TABLE IF NOT EXISTS public.studio_canvas_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT default_user_id(),
  prompt text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  storage_path text NOT NULL DEFAULT '',
  public_url text NOT NULL DEFAULT '',
  width integer NOT NULL DEFAULT 1024,
  height integer NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canvas_images_project
  ON public.studio_canvas_images (project_id);

DROP TRIGGER IF EXISTS studio_canvas_images_updated_at ON public.studio_canvas_images;
CREATE TRIGGER studio_canvas_images_updated_at
  BEFORE UPDATE ON public.studio_canvas_images
  FOR EACH ROW EXECUTE FUNCTION public.studio_set_updated_at();

-- =============================================================================
-- app_settings — key-value store for API keys and configuration
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (key, value) VALUES
  ('openai_api_key', ''),
  ('anthropic_api_key', ''),
  ('google_ai_api_key', ''),
  ('xai_api_key', ''),
  ('pipeline_ui_model', ''),
  ('pipeline_image_provider', '')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- Done.
-- =============================================================================
