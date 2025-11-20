-- Fix gpt_messages table schema for unified message format
-- Ensure proper JSONB content, user_id, and RLS policies

-- 1. Add user_id column if missing
ALTER TABLE public.gpt_messages
ADD COLUMN IF NOT EXISTS user_id uuid;

-- 2. Add foreign key constraint for user_id if it doesn't exist
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.gpt_messages
    ADD CONSTRAINT fk_gpt_messages_user_id_auth
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN
    -- Constraint already exists, ignore
    NULL;
  END;
END;
$$;

-- 3. Ensure content column is JSONB NOT NULL
-- The column should already be JSONB from previous migration
ALTER TABLE public.gpt_messages
ALTER COLUMN content SET NOT NULL;

-- 4. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_gpt_messages_user_id ON public.gpt_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_gpt_messages_created_at ON public.gpt_messages(created_at);

-- 5. Drop old RLS policies that don't check user_id
DROP POLICY IF EXISTS "Users can view messages from own sessions" ON public.gpt_messages;
DROP POLICY IF EXISTS "Users can create messages in own sessions" ON public.gpt_messages;
DROP POLICY IF EXISTS "Users can view own messages" ON public.gpt_messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON public.gpt_messages;

-- 6. Create new RLS policies with user_id check for better security
CREATE POLICY "Users can view own messages" ON public.gpt_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages" ON public.gpt_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 7. Ensure is_multi_ai column exists with proper default
ALTER TABLE public.gpt_messages
ADD COLUMN IF NOT EXISTS is_multi_ai BOOLEAN DEFAULT false;

-- 8. Ensure metadata columns exist
ALTER TABLE public.gpt_messages
ADD COLUMN IF NOT EXISTS agent_name TEXT,
ADD COLUMN IF NOT EXISTS agent_id TEXT,
ADD COLUMN IF NOT EXISTS model TEXT;

-- 9. Ensure tokens_used column exists
ALTER TABLE public.gpt_messages
ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0;
