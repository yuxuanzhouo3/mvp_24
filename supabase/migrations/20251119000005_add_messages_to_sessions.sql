-- Add messages column to gpt_sessions (like CloudBase structure)
-- This unifies the data structure between domestic and international versions

-- 1. Add messages column to gpt_sessions
ALTER TABLE public.gpt_sessions
ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;

-- 2. Create index on messages for better query performance
CREATE INDEX IF NOT EXISTS idx_gpt_sessions_messages ON public.gpt_sessions USING gin(messages);

-- 3. Drop the old gpt_messages table (no longer needed)
-- Keep this commented if you want to preserve data temporarily
-- DROP TABLE IF EXISTS public.gpt_messages CASCADE;

-- 4. Ensure updated_at timestamp is maintained
-- The trigger should already exist from initial schema
