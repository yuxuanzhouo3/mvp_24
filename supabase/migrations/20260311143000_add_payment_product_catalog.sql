create table if not exists public.payment_product_catalog (
  id uuid primary key default gen_random_uuid(),
  product_key text not null,
  region text not null,
  product_type text not null,
  plan_id text,
  addon_package_id text,
  billing_cycle text,
  currency text not null,
  amount numeric(18,6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint payment_product_catalog_key_region_unique unique (product_key, region)
);

comment on table public.payment_product_catalog is 'Region-isolated subscription and addon product pricing catalog';

alter table public.payment_product_catalog enable row level security;

create index if not exists idx_payment_product_catalog_region_type
  on public.payment_product_catalog(region, product_type);

create index if not exists idx_payment_product_catalog_plan_cycle
  on public.payment_product_catalog(plan_id, billing_cycle);

create index if not exists idx_payment_product_catalog_addon
  on public.payment_product_catalog(addon_package_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'handle_updated_at_payment_product_catalog'
  ) then
    create trigger handle_updated_at_payment_product_catalog
      before update on public.payment_product_catalog
      for each row execute function public.handle_updated_at();
  end if;
end $$;
