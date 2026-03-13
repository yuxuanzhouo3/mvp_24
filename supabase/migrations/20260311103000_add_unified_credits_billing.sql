-- Unified Credits billing layer
-- Adds region-scoped billing settings, model catalog, credits wallets, ledgers,
-- usage events, provider pools, and extends plan quotas with monthly credits.

alter table public.plan_quota_settings
  add column if not exists monthly_credit_grant integer not null default 0,
  add column if not exists daily_credit_cap integer not null default 0;

comment on column public.plan_quota_settings.monthly_credit_grant is 'Monthly plan credit grant';
comment on column public.plan_quota_settings.daily_credit_cap is 'Optional daily credit cap (0 = unlimited)';

update public.plan_quota_settings
set monthly_credit_grant = case plan_id
  when 'free' then greatest(monthly_credit_grant, 2000)
  when 'basic' then greatest(monthly_credit_grant, 30000)
  when 'pro' then greatest(monthly_credit_grant, 120000)
  when 'enterprise' then greatest(monthly_credit_grant, 600000)
  else monthly_credit_grant
end,
daily_credit_cap = case plan_id
  when 'free' then greatest(daily_credit_cap, 500)
  when 'basic' then greatest(daily_credit_cap, 5000)
  when 'pro' then greatest(daily_credit_cap, 25000)
  when 'enterprise' then daily_credit_cap
  else daily_credit_cap
end;

create table if not exists public.billing_settings (
  region text primary key,
  profit_multiplier numeric(12,6) not null default 2.5,
  credit_exchange_rate numeric(12,6) not null default 10000,
  recharge_credit_rate numeric(12,6) not null default 10000,
  minimum_charge_credits integer not null default 1,
  default_currency text not null default 'USD',
  enforce_provider_pool boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

comment on table public.billing_settings is 'Region-level unified billing settings';

alter table public.billing_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'handle_updated_at_billing_settings'
  ) then
    create trigger handle_updated_at_billing_settings
      before update on public.billing_settings
      for each row execute function public.handle_updated_at();
  end if;
end $$;

insert into public.billing_settings (
  region,
  profit_multiplier,
  credit_exchange_rate,
  recharge_credit_rate,
  minimum_charge_credits,
  default_currency,
  enforce_provider_pool
)
values
  ('CN', 2.5, 10000, 10000, 1, 'CNY', false),
  ('INTL', 2.5, 10000, 10000, 1, 'USD', false)
on conflict (region) do nothing;

create table if not exists public.ai_model_catalog (
  id uuid primary key default gen_random_uuid(),
  model_key text not null,
  provider text not null,
  provider_model text not null,
  display_name text not null,
  region text not null,
  modality text not null default 'text',
  billing_mode text not null default 'metered',
  currency text not null default 'USD',
  input_price numeric(18,8) not null default 0,
  output_price numeric(18,8) not null default 0,
  pricing_unit text not null default 'per_1k_tokens',
  pricing_rules jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint ai_model_catalog_model_region_unique unique (model_key, region)
);

comment on table public.ai_model_catalog is 'Unified model catalog with real provider prices and metered billing rules';

alter table public.ai_model_catalog enable row level security;

create index if not exists idx_ai_model_catalog_region_provider
  on public.ai_model_catalog(region, provider, enabled);

create index if not exists idx_ai_model_catalog_model_key
  on public.ai_model_catalog(model_key);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'handle_updated_at_ai_model_catalog'
  ) then
    create trigger handle_updated_at_ai_model_catalog
      before update on public.ai_model_catalog
      for each row execute function public.handle_updated_at();
  end if;
end $$;

create table if not exists public.ai_model_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  model_key text not null,
  region text not null,
  currency text not null default 'USD',
  input_price numeric(18,8) not null default 0,
  output_price numeric(18,8) not null default 0,
  pricing_rules jsonb not null default '[]'::jsonb,
  source text,
  snapshot_hash text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.ai_model_price_snapshots enable row level security;

create index if not exists idx_ai_model_price_snapshots_model_region_created
  on public.ai_model_price_snapshots(model_key, region, created_at desc);

create table if not exists public.credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null default 'free',
  month_key text not null default '',
  monthly_grant_total integer not null default 0,
  monthly_grant_balance bigint not null default 0,
  recharge_balance bigint not null default 0,
  bonus_balance bigint not null default 0,
  frozen_credits bigint not null default 0,
  lifetime_credited bigint not null default 0,
  lifetime_debited bigint not null default 0,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now())
);

comment on table public.credit_wallets is 'Unified credits wallet per user';

alter table public.credit_wallets enable row level security;

create index if not exists idx_credit_wallets_plan_month
  on public.credit_wallets(plan_id, month_key);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'handle_updated_at_credit_wallets'
  ) then
    create trigger handle_updated_at_credit_wallets
      before update on public.credit_wallets
      for each row execute function public.handle_updated_at();
  end if;
end $$;

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null,
  entry_type text not null,
  credits bigint not null,
  balance_after bigint,
  idempotency_key text,
  request_id text,
  related_usage_event_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.credit_ledger enable row level security;

create unique index if not exists idx_credit_ledger_idempotency_unique
  on public.credit_ledger(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_credit_ledger_user_created
  on public.credit_ledger(user_id, created_at desc);

create index if not exists idx_credit_ledger_request_id
  on public.credit_ledger(request_id);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text,
  request_id text not null,
  model_key text not null,
  provider text,
  region text not null,
  status text not null default 'reserved',
  cost_amount numeric(18,8) not null default 0,
  cost_currency text not null default 'USD',
  credits_reserved integer not null default 0,
  credits_charged integer not null default 0,
  usage_metrics jsonb not null default '{}'::jsonb,
  pricing_rules jsonb not null default '[]'::jsonb,
  wallet_breakdown jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz
);

comment on table public.ai_usage_events is 'Per-request unified AI billing events';

alter table public.ai_usage_events enable row level security;

create unique index if not exists idx_ai_usage_events_request_id_unique
  on public.ai_usage_events(request_id);

create index if not exists idx_ai_usage_events_user_created
  on public.ai_usage_events(user_id, created_at desc);

create index if not exists idx_ai_usage_events_status
  on public.ai_usage_events(status);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'handle_updated_at_ai_usage_events'
  ) then
    create trigger handle_updated_at_ai_usage_events
      before update on public.ai_usage_events
      for each row execute function public.handle_updated_at();
  end if;
end $$;

create table if not exists public.provider_balance_pools (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  region text not null,
  currency text not null,
  available_amount numeric(18,8) not null default 0,
  reserved_amount numeric(18,8) not null default 0,
  total_debited numeric(18,8) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint provider_balance_pools_provider_region_currency_unique unique (provider, region, currency)
);

comment on table public.provider_balance_pools is 'Platform provider fund pools';

alter table public.provider_balance_pools enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'handle_updated_at_provider_balance_pools'
  ) then
    create trigger handle_updated_at_provider_balance_pools
      before update on public.provider_balance_pools
      for each row execute function public.handle_updated_at();
  end if;
end $$;

create table if not exists public.provider_balance_ledger (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid references public.provider_balance_pools(id) on delete cascade,
  provider text not null,
  region text not null,
  currency text not null,
  direction text not null,
  entry_type text not null,
  amount numeric(18,8) not null,
  idempotency_key text,
  related_usage_event_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.provider_balance_ledger enable row level security;

create unique index if not exists idx_provider_balance_ledger_idempotency_unique
  on public.provider_balance_ledger(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_provider_balance_ledger_pool_created
  on public.provider_balance_ledger(pool_id, created_at desc);
