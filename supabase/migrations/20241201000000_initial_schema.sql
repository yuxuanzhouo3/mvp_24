-- 创建用户资料表
create table if not exists public.user_profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  full_name text,
  avatar_url text,
  subscription_plan text default 'free',
  subscription_status text default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 创建GPT会话表
create table if not exists public.gpt_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.user_profiles(id) on delete cascade not null,
  title text not null,
  model text default 'gpt-3.5-turbo',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 创建GPT消息表
create table if not exists public.gpt_messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.gpt_sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  tokens_used integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 创建订阅记录表
create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.user_profiles(id) on delete cascade not null,
  plan_id text not null,
  status text default 'active' check (status in ('active', 'canceled', 'past_due', 'unpaid')),
  current_period_start timestamp with time zone not null,
  current_period_end timestamp with time zone not null,
  cancel_at_period_end boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 创建支付记录表
create table if not exists public.payments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.user_profiles(id) on delete cascade not null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  amount decimal(10,2) not null,
  currency text default 'USD',
  status text default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  payment_method text,
  transaction_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 设置行级安全策略 (RLS)
alter table public.user_profiles enable row level security;
alter table public.gpt_sessions enable row level security;
alter table public.gpt_messages enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

-- 用户资料策略
create policy "Users can view own profile" on public.user_profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.user_profiles
  for update using (auth.uid() = id);

create policy "Users can insert own profile" on public.user_profiles
  for insert with check (auth.uid() = id);

-- GPT会话策略
create policy "Users can view own sessions" on public.gpt_sessions
  for select using (auth.uid() = user_id);

create policy "Users can create own sessions" on public.gpt_sessions
  for insert with check (auth.uid() = user_id);

create policy "Users can update own sessions" on public.gpt_sessions
  for update using (auth.uid() = user_id);

create policy "Users can delete own sessions" on public.gpt_sessions
  for delete using (auth.uid() = user_id);

-- GPT消息策略
create policy "Users can view messages from own sessions" on public.gpt_messages
  for select using (
    exists (
      select 1 from public.gpt_sessions
      where id = gpt_messages.session_id
      and user_id = auth.uid()
    )
  );

create policy "Users can create messages in own sessions" on public.gpt_messages
  for insert with check (
    exists (
      select 1 from public.gpt_sessions
      where id = gpt_messages.session_id
      and user_id = auth.uid()
    )
  );

-- 订阅策略
create policy "Users can view own subscriptions" on public.subscriptions
  for select using (auth.uid() = user_id);

-- 支付策略
create policy "Users can view own payments" on public.payments
  for select using (auth.uid() = user_id);

-- 创建更新时间触发器
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger handle_updated_at_user_profiles
  before update on public.user_profiles
  for each row execute procedure public.handle_updated_at();

create trigger handle_updated_at_gpt_sessions
  before update on public.gpt_sessions
  for each row execute procedure public.handle_updated_at();

create trigger handle_updated_at_subscriptions
  before update on public.subscriptions
  for each row execute procedure public.handle_updated_at();

create trigger handle_updated_at_payments
  before update on public.payments
  for each row execute procedure public.handle_updated_at();

-- 创建索引以提高查询性能
create index if not exists idx_gpt_sessions_user_id on public.gpt_sessions(user_id);
create index if not exists idx_gpt_messages_session_id on public.gpt_messages(session_id);
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_payments_user_id on public.payments(user_id);
create index if not exists idx_payments_subscription_id on public.payments(subscription_id);