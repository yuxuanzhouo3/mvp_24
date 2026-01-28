-- 修复 payments 和 subscriptions 表的外键约束
-- 原问题：foreign key references user_profiles(id)，但 INTL 模式不使用 user_profiles
-- 解决方案：改为 references auth.users(id)

-- 1. 删除旧的外键约束
ALTER TABLE public.payments
DROP CONSTRAINT IF EXISTS payments_user_id_fkey;

ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;

-- 2. 添加新的外键约束（直接引用 auth.users）
ALTER TABLE public.payments
ADD CONSTRAINT payments_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. 验证迁移成功
-- 这两个表现在可以接受任何有效的 auth.users.id，不再依赖 user_profiles
COMMENT ON TABLE public.payments IS 'Payment records - user_id references auth.users, works with both CN (CloudBase) and INTL (Supabase) modes';
COMMENT ON TABLE public.subscriptions IS 'Subscription records - user_id references auth.users, works with both CN (CloudBase) and INTL (Supabase) modes';
