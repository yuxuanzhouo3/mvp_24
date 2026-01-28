-- ===========================================================================
-- 订阅系统迁移：添加 user_wallets 表和相关功能
-- 从 mvp_28-master 迁移订阅系统到当前项目
-- ===========================================================================

-- ===========================================================================
-- 1. 创建 user_wallets 表
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.user_wallets (
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  plan text DEFAULT 'Free',
  subscription_tier text DEFAULT 'Free',
  plan_exp timestamptz,
  pro boolean DEFAULT false,
  pending_downgrade text,
  monthly_image_balance integer DEFAULT 30,
  monthly_video_balance integer DEFAULT 5,
  monthly_reset_at timestamptz DEFAULT now(),
  billing_cycle_anchor integer,
  addon_image_balance integer DEFAULT 0,
  addon_video_balance integer DEFAULT 0,
  daily_external_day date DEFAULT current_date,
  daily_external_plan text DEFAULT 'free',
  daily_external_used integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT user_wallets_pkey PRIMARY KEY (user_id)
);

-- ===========================================================================
-- 2. 修改 subscriptions 表（添加新字段）
-- ===========================================================================
-- 添加 plan 字段（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'plan') THEN
    ALTER TABLE public.subscriptions ADD COLUMN plan text;
  END IF;
END $$;

-- 添加 period 字段（monthly/annual）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'period') THEN
    ALTER TABLE public.subscriptions ADD COLUMN period text DEFAULT 'monthly';
  END IF;
END $$;

-- 添加 type 字段（SUBSCRIPTION/ADDON）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'type') THEN
    ALTER TABLE public.subscriptions ADD COLUMN type text DEFAULT 'SUBSCRIPTION';
  END IF;
END $$;

-- 添加 provider 字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'provider') THEN
    ALTER TABLE public.subscriptions ADD COLUMN provider text;
  END IF;
END $$;

-- 添加 provider_order_id 字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'provider_order_id') THEN
    ALTER TABLE public.subscriptions ADD COLUMN provider_order_id text;
  END IF;
END $$;

-- 添加 started_at 字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'started_at') THEN
    ALTER TABLE public.subscriptions ADD COLUMN started_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 添加 expires_at 字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'expires_at') THEN
    ALTER TABLE public.subscriptions ADD COLUMN expires_at timestamptz;
  END IF;
END $$;

-- ===========================================================================
-- 3. 修改 payments 表（添加新字段）
-- ===========================================================================
-- 添加 type 字段（SUBSCRIPTION/ADDON/ONETIME）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'type') THEN
    ALTER TABLE public.payments ADD COLUMN type text DEFAULT 'ONETIME';
  END IF;
END $$;

-- 添加 addon_package_id 字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'addon_package_id') THEN
    ALTER TABLE public.payments ADD COLUMN addon_package_id text;
  END IF;
END $$;

-- 添加 image_credits 字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'image_credits') THEN
    ALTER TABLE public.payments ADD COLUMN image_credits integer DEFAULT 0;
  END IF;
END $$;

-- 添加 video_audio_credits 字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'video_audio_credits') THEN
    ALTER TABLE public.payments ADD COLUMN video_audio_credits integer DEFAULT 0;
  END IF;
END $$;

-- 添加 provider 字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'provider') THEN
    ALTER TABLE public.payments ADD COLUMN provider text;
  END IF;
END $$;

-- 添加 provider_order_id 字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'provider_order_id') THEN
    ALTER TABLE public.payments ADD COLUMN provider_order_id text;
  END IF;
END $$;

-- ===========================================================================
-- 4. 启用 RLS 并创建策略
-- ===========================================================================
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

-- 用户可以管理自己的钱包
DROP POLICY IF EXISTS "Users manage own wallet" ON public.user_wallets;
CREATE POLICY "Users manage own wallet" ON public.user_wallets
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ===========================================================================
-- 5. 创建 FEFO 原子扣费函数 (RPC)
-- 解释：保证在高并发下余额不会扣成负数
-- ===========================================================================
CREATE OR REPLACE FUNCTION deduct_quota(
  p_user_id uuid,
  p_image_count int,
  p_video_count int
) RETURNS jsonb AS $$
DECLARE
  v_wallet public.user_wallets%rowtype;
  v_deducted_monthly_image int := 0;
  v_deducted_addon_image int := 0;
  v_deducted_monthly_video int := 0;
  v_deducted_addon_video int := 0;
  v_remain_image int;
  v_remain_video int;
BEGIN
  -- 锁定行 (Row-level locking) 防止并发修改
  SELECT * INTO v_wallet FROM public.user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  -- === 图片扣减逻辑 (FEFO: 先扣月度，再扣加油包) ===
  v_remain_image := p_image_count;

  IF v_remain_image > 0 AND v_wallet.monthly_image_balance > 0 THEN
    v_deducted_monthly_image := least(v_remain_image, v_wallet.monthly_image_balance);
    v_remain_image := v_remain_image - v_deducted_monthly_image;
  END IF;

  IF v_remain_image > 0 AND v_wallet.addon_image_balance > 0 THEN
    v_deducted_addon_image := least(v_remain_image, v_wallet.addon_image_balance);
    v_remain_image := v_remain_image - v_deducted_addon_image;
  END IF;

  IF v_remain_image > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient image quota');
  END IF;

  -- === 视频扣减逻辑 (FEFO) ===
  v_remain_video := p_video_count;

  IF v_remain_video > 0 AND v_wallet.monthly_video_balance > 0 THEN
    v_deducted_monthly_video := least(v_remain_video, v_wallet.monthly_video_balance);
    v_remain_video := v_remain_video - v_deducted_monthly_video;
  END IF;

  IF v_remain_video > 0 AND v_wallet.addon_video_balance > 0 THEN
    v_deducted_addon_video := least(v_remain_video, v_wallet.addon_video_balance);
    v_remain_video := v_remain_video - v_deducted_addon_video;
  END IF;

  IF v_remain_video > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient video quota');
  END IF;

  -- === 执行更新 ===
  UPDATE public.user_wallets
  SET
    monthly_image_balance = monthly_image_balance - v_deducted_monthly_image,
    addon_image_balance = addon_image_balance - v_deducted_addon_image,
    monthly_video_balance = monthly_video_balance - v_deducted_monthly_video,
    addon_video_balance = addon_video_balance - v_deducted_addon_video,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deducted', jsonb_build_object(
      'monthly_image', v_deducted_monthly_image,
      'addon_image', v_deducted_addon_image,
      'monthly_video', v_deducted_monthly_video,
      'addon_video', v_deducted_addon_video
    ),
    'remaining', jsonb_build_object(
      'monthly_image_balance', v_wallet.monthly_image_balance - v_deducted_monthly_image,
      'monthly_video_balance', v_wallet.monthly_video_balance - v_deducted_monthly_video,
      'addon_image_balance', v_wallet.addon_image_balance - v_deducted_addon_image,
      'addon_video_balance', v_wallet.addon_video_balance - v_deducted_addon_video
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================================================
-- 6. 创建/更新触发器：新用户自动创建钱包
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_wallets (
    user_id,
    plan,
    subscription_tier,
    monthly_image_balance,
    monthly_video_balance,
    addon_image_balance,
    addon_video_balance,
    daily_external_plan,
    daily_external_used,
    billing_cycle_anchor
  )
  VALUES (
    NEW.id,
    'Free',
    'Free',
    30,  -- 免费用户每月30张图片
    5,   -- 免费用户每月5个视频/音频
    0,
    0,
    'free',
    0,
    EXTRACT(DAY FROM NOW())::integer
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Handle new user wallet trigger failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS on_auth_user_created_wallet ON auth.users;

-- 创建新触发器
CREATE TRIGGER on_auth_user_created_wallet
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_wallet();

-- ===========================================================================
-- 7. 授权
-- ===========================================================================
GRANT ALL PRIVILEGES ON public.user_wallets TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_quota(uuid, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user_wallet() TO service_role;

-- ===========================================================================
-- 8. 创建索引
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_user_wallets_plan ON public.user_wallets(plan);
CREATE INDEX IF NOT EXISTS idx_user_wallets_plan_exp ON public.user_wallets(plan_exp);
