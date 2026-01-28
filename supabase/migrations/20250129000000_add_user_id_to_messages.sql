-- 添加 user_id 列到 gpt_messages 表
-- 这样可以直接通过消息查询用户，提高性能

-- 1. 添加 user_id 列（允许 NULL，因为现有数据可能没有这个字段）
alter table public.gpt_messages 
add column if not exists user_id uuid references public.user_profiles(id) on delete cascade;

-- 2. 为现有数据填充 user_id（从关联的 session 中获取）
update public.gpt_messages
set user_id = gpt_sessions.user_id
from public.gpt_sessions
where gpt_messages.session_id = gpt_sessions.id
and gpt_messages.user_id is null;

-- 3. 现在将 user_id 设置为 NOT NULL（所有数据都已填充）
alter table public.gpt_messages 
alter column user_id set not null;

-- 4. 创建索引以提高查询性能
create index if not exists idx_gpt_messages_user_id on public.gpt_messages(user_id);

-- 5. 更新 RLS 策略以使用新的 user_id 列（性能更好）
drop policy if exists "Users can view messages from own sessions" on public.gpt_messages;
drop policy if exists "Users can create messages in own sessions" on public.gpt_messages;

-- 新策略：直接使用 user_id 而不是 join session 表
create policy "Users can view own messages" on public.gpt_messages
  for select using (auth.uid() = user_id);

create policy "Users can create own messages" on public.gpt_messages
  for insert with check (auth.uid() = user_id);

create policy "Users can update own messages" on public.gpt_messages
  for update using (auth.uid() = user_id);

create policy "Users can delete own messages" on public.gpt_messages
  for delete using (auth.uid() = user_id);
