-- Create plan_quota_settings table for plan-level quotas (tokens + media counts)
-- Tokens are monthly limits; image/video/audio quotas are per-month counts.

create table if not exists public.plan_quota_settings (
  plan_id text primary key,
  token_limit bigint not null default 0,
  image_limit integer not null default 0,
  video_audio_limit integer not null default 0,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

comment on table public.plan_quota_settings is 'Plan quota settings (tokens + media counts)';
comment on column public.plan_quota_settings.plan_id is 'Plan identifier: free/basic/pro/enterprise';
comment on column public.plan_quota_settings.token_limit is 'Monthly token limit (0 = unlimited)';
comment on column public.plan_quota_settings.image_limit is 'Monthly image limit (count)';
comment on column public.plan_quota_settings.video_audio_limit is 'Monthly video/audio limit (count)';

alter table public.plan_quota_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_plan_quota_settings'
  ) then
    create trigger handle_updated_at_plan_quota_settings
      before update on public.plan_quota_settings
      for each row execute function public.handle_updated_at();
  end if;
end $$;

insert into public.plan_quota_settings (plan_id, token_limit, image_limit, video_audio_limit)
values
  ('free', 50000, 30, 5),
  ('basic', 200000, 100, 20),
  ('pro', 1000000, 500, 100),
  ('enterprise', 5000000, 1500, 200)
on conflict (plan_id) do nothing;
