-- Initialize credit wallets for all existing users who don't have one yet
-- This ensures old users get their free monthly credits

insert into public.credit_wallets (
  user_id,
  plan_id,
  month_key,
  monthly_grant_total,
  monthly_grant_balance,
  recharge_balance,
  bonus_balance,
  frozen_credits,
  lifetime_credited,
  lifetime_debited,
  created_at,
  updated_at
)
select
  u.id as user_id,
  'free' as plan_id,
  to_char(now() at time zone 'utc', 'YYYY-MM') as month_key,
  2000 as monthly_grant_total,
  2000 as monthly_grant_balance,
  0 as recharge_balance,
  0 as bonus_balance,
  0 as frozen_credits,
  2000 as lifetime_credited,
  0 as lifetime_debited,
  now() at time zone 'utc' as created_at,
  now() at time zone 'utc' as updated_at
from auth.users u
where not exists (
  select 1 from public.credit_wallets w where w.user_id = u.id
)
on conflict (user_id) do nothing;
