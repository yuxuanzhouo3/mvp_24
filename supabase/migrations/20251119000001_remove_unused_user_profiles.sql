-- Optional: Remove unused user_profiles table if you don't need it anymore
-- CAUTION: Only run this if you're sure user_profiles is not being used anywhere

-- First, check if there are any other tables still referencing user_profiles
-- SELECT constraint_name, table_name, column_name
-- FROM information_schema.key_column_usage
-- WHERE table_name='user_profiles';

-- Drop all RLS policies on user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

-- Drop the trigger and function if only used by user_profiles
DROP TRIGGER IF EXISTS handle_updated_at_user_profiles ON public.user_profiles;

-- Drop the table
DROP TABLE IF EXISTS public.user_profiles CASCADE;
