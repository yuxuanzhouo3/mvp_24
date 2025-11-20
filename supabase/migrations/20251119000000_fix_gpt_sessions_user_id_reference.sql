-- Fix gpt_sessions to reference auth.users directly instead of user_profiles
-- This migration removes the unnecessary user_profiles foreign key

-- Drop the existing foreign key constraint
ALTER TABLE public.gpt_sessions
DROP CONSTRAINT IF EXISTS gpt_sessions_user_id_fkey;

-- Drop the index if it exists
DROP INDEX IF EXISTS idx_gpt_sessions_user_id;

-- Add the new foreign key that references auth.users
ALTER TABLE public.gpt_sessions
ADD CONSTRAINT gpt_sessions_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Recreate the index
CREATE INDEX idx_gpt_sessions_user_id ON public.gpt_sessions(user_id);

-- Update RLS policies to ensure they still work with auth.users
DROP POLICY IF EXISTS "Users can view own sessions" ON public.gpt_sessions;
DROP POLICY IF EXISTS "Users can create own sessions" ON public.gpt_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.gpt_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.gpt_sessions;

-- Create new policies
CREATE POLICY "Users can view own sessions" ON public.gpt_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sessions" ON public.gpt_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON public.gpt_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON public.gpt_sessions
  FOR DELETE USING (auth.uid() = user_id);
