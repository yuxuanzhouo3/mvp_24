-- =====================================================
-- Ensure token_usage table exists (idempotent)
-- Date: 2026-02-15
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.token_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_user_id
  ON public.token_usage(user_id);

CREATE INDEX IF NOT EXISTS idx_token_usage_session_id
  ON public.token_usage(session_id);

CREATE INDEX IF NOT EXISTS idx_token_usage_created_at
  ON public.token_usage(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_usage_user_created
  ON public.token_usage(user_id, created_at DESC);

ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'token_usage'
      AND policyname = 'Users can view own token usage'
  ) THEN
    CREATE POLICY "Users can view own token usage"
      ON public.token_usage
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'token_usage'
      AND policyname = 'System can insert token usage'
  ) THEN
    CREATE POLICY "System can insert token usage"
      ON public.token_usage
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;
