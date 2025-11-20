-- Fix gpt_messages table to reference auth.users directly
-- This migration updates the user_id foreign key to point to auth.users instead of user_profiles

-- 1. Drop the old foreign key constraint
ALTER TABLE public.gpt_messages
DROP CONSTRAINT IF EXISTS gpt_messages_user_id_fkey;

-- 2. Add the new foreign key that references auth.users
ALTER TABLE public.gpt_messages
ADD CONSTRAINT gpt_messages_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Update RLS policies to ensure they work correctly
DROP POLICY IF EXISTS "Users can view own messages" ON public.gpt_messages;
DROP POLICY IF EXISTS "Users can create own messages" ON public.gpt_messages;
DROP POLICY IF EXISTS "Users can update own messages" ON public.gpt_messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON public.gpt_messages;
DROP POLICY IF EXISTS "Users can view messages from own sessions" ON public.gpt_messages;
DROP POLICY IF EXISTS "Users can create messages in own sessions" ON public.gpt_messages;

-- Create new policies using direct user_id reference
CREATE POLICY "Users can view own messages" ON public.gpt_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own messages" ON public.gpt_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own messages" ON public.gpt_messages
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages" ON public.gpt_messages
  FOR DELETE USING (auth.uid() = user_id);
