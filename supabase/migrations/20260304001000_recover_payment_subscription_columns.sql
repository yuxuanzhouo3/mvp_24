-- ============================================================================
-- Recovery migration: align subscriptions/payments columns for INTL payment flow
-- ============================================================================

-- 1) subscriptions.plan_id compatibility (legacy code still reads/writes plan_id)
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RAISE NOTICE 'public.subscriptions does not exist, skip subscriptions recovery.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'plan_id'
  ) THEN
    ALTER TABLE public.subscriptions ADD COLUMN plan_id text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'plan'
  ) THEN
    UPDATE public.subscriptions
    SET plan_id = lower(plan)
    WHERE (plan_id IS NULL OR btrim(plan_id) = '')
      AND plan IS NOT NULL
      AND btrim(plan) <> '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_plan_id_status
  ON public.subscriptions(user_id, plan_id, status, current_period_end DESC);

-- 2) payments compatibility columns used by current API handlers
DO $$
BEGIN
  IF to_regclass('public.payments') IS NULL THEN
    RAISE NOTICE 'public.payments does not exist, skip payments recovery.';
    RETURN;
  END IF;

  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS type text DEFAULT 'SUBSCRIPTION';
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS addon_package_id text;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS image_credits integer DEFAULT 0;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS video_audio_credits integer DEFAULT 0;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS out_trade_no text;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS client_type text;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS code_url text;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS provider text;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS provider_order_id text;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_user_method_created
  ON public.payments(user_id, payment_method, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_out_trade_no
  ON public.payments(out_trade_no);

