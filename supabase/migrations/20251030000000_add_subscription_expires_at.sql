-- Add subscription expiration time to user_profiles for time-based subscription model
-- Migration: 20251030000000_add_subscription_expires_at.sql

-- Add subscription_expires_at field to user_profiles table
alter table public.user_profiles
add column if not exists subscription_expires_at timestamp with time zone;

-- Update existing active subscriptions to set expiration time
update public.user_profiles
set subscription_expires_at = s.current_period_end
from public.subscriptions s
where user_profiles.id = s.user_id
and s.status = 'active'
and user_profiles.subscription_status = 'active'
and user_profiles.subscription_plan != 'free';

-- For users without active subscriptions, set expiration to null (free users)
update public.user_profiles
set subscription_expires_at = null
where subscription_plan = 'free' or subscription_status != 'active';

-- Create index for subscription expiration queries
create index if not exists idx_user_profiles_subscription_expires_at
on public.user_profiles(subscription_expires_at);

-- Update RLS policy to allow users to view their own subscription expiration
-- (The existing policy already covers this)