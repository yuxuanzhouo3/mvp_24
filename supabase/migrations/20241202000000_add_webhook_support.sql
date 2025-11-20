-- 创建webhook事件表用于跟踪和去重webhook事件
create table if not exists public.webhook_events (
  id text primary key,
  provider text not null check (provider in ('paypal', 'stripe', 'alipay', 'wechat')),
  event_type text not null,
  event_data jsonb not null,
  processed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  processed_at timestamp with time zone
);

-- 为webhook_events表启用行级安全
alter table public.webhook_events enable row level security;

-- 创建索引以提高查询性能
create index if not exists idx_webhook_events_provider on public.webhook_events(provider);
create index if not exists idx_webhook_events_processed on public.webhook_events(processed);
create index if not exists idx_webhook_events_created_at on public.webhook_events(created_at);

-- 为subscriptions表添加provider_subscription_id字段
alter table public.subscriptions
add column if not exists provider_subscription_id text;

-- 创建索引
create index if not exists idx_subscriptions_provider_subscription_id on public.subscriptions(provider_subscription_id);

-- 为payments表添加transaction_id索引（如果不存在）
create index if not exists idx_payments_transaction_id on public.payments(transaction_id);