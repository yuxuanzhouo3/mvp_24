-- 修复订阅和支付表的RLS策略以允许用户管理自己的记录
-- 这个迁移修复了支付确认API无法插入订阅和支付记录的问题

-- 订阅策略 - 允许用户插入和更新自己的订阅
create policy "Users can insert own subscriptions" on public.subscriptions
  for insert with check (auth.uid() = user_id);

create policy "Users can update own subscriptions" on public.subscriptions
  for update using (auth.uid() = user_id);

-- 支付策略 - 允许用户插入自己的支付记录
create policy "Users can insert own payments" on public.payments
  for insert with check (auth.uid() = user_id);