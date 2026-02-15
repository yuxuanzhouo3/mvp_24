-- ============================================================================
-- Payment & Membership Consistency Hardening
-- 1) Backfill subscriptions.plan / subscriptions.expires_at
-- 2) Add indexes for membership lookup and payment idempotency checks
-- ============================================================================

-- 回填 expires_at，统一以 current_period_end 为源
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'expires_at'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'current_period_end'
  ) THEN
    UPDATE public.subscriptions
    SET expires_at = current_period_end
    WHERE expires_at IS NULL
      AND current_period_end IS NOT NULL;
  END IF;
END $$;

-- 回填 plan，优先使用 plan_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'plan'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'plan_id'
  ) THEN
    UPDATE public.subscriptions
    SET plan = lower(plan_id)
    WHERE (plan IS NULL OR btrim(plan) = '')
      AND plan_id IS NOT NULL;
  END IF;
END $$;

-- 会员查询主路径索引（/api/profile、/api/account/settings、wallet 自愈）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'user_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'status'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'current_period_end'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_period_end
    ON public.subscriptions(user_id, status, current_period_end DESC);
  END IF;
END $$;

-- 支付幂等检查索引（confirm/webhook 对 completed transaction_id 查重）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'transaction_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'status'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_payments_transaction_status_created
    ON public.payments(transaction_id, status, created_at DESC);
  END IF;
END $$;
