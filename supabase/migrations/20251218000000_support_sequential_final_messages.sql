-- Ensure international (Supabase) schema supports sequential-mode final-only persistence
-- This migration is idempotent and safe to run multiple times.

BEGIN;

-- 1) Ensure messages JSONB array exists on gpt_sessions (unified storage with CloudBase)
ALTER TABLE public.gpt_sessions
ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;

-- Backfill existing NULLs to empty array
UPDATE public.gpt_sessions
SET messages = '[]'::jsonb
WHERE messages IS NULL;

-- Enforce that messages is always a JSON array (keeps downstream logic predictable)
ALTER TABLE public.gpt_sessions
DROP CONSTRAINT IF EXISTS gpt_sessions_messages_is_array;

ALTER TABLE public.gpt_sessions
ADD CONSTRAINT gpt_sessions_messages_is_array
CHECK (jsonb_typeof(messages) = 'array');

-- 2) Ensure multi_ai_config JSONB exists on gpt_sessions (locks selected agents + collaboration mode)
ALTER TABLE public.gpt_sessions
ADD COLUMN IF NOT EXISTS multi_ai_config JSONB DEFAULT NULL;

COMMENT ON COLUMN public.gpt_sessions.multi_ai_config IS
'Stores multi-AI configuration for the session. Structure: {
  "isMultiAI": boolean,
  "selectedAgentIds": string[],
  "collaborationMode": "parallel" | "sequential" | "debate" | "synthesis",
  "lockedAt": ISO8601 timestamp,
  "lockedBy": user_id
}';

-- 3) Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_gpt_sessions_messages
ON public.gpt_sessions USING gin(messages);

CREATE INDEX IF NOT EXISTS idx_gpt_sessions_multi_ai_config
ON public.gpt_sessions USING gin(multi_ai_config);

CREATE INDEX IF NOT EXISTS idx_gpt_sessions_collaboration_mode
ON public.gpt_sessions ((multi_ai_config->>'collaborationMode'));

CREATE INDEX IF NOT EXISTS idx_gpt_sessions_is_multi_ai
ON public.gpt_sessions ((multi_ai_config->>'isMultiAI'));

COMMIT;
