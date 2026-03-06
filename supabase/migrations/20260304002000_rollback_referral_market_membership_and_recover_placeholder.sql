-- ============================================================================
-- Rollback Migration
-- Revert:
--   1) 20260223000100_referral_market_membership.sql
--   2) 20260304001000_recover_payment_subscription_columns.sql (no-op: empty)
-- ============================================================================

-- 1) Drop referral system tables introduced by 20260223000100
-- Drop in dependency order to avoid FK conflicts.
DROP TABLE IF EXISTS public.referral_rewards;
DROP TABLE IF EXISTS public.referral_relations;
DROP TABLE IF EXISTS public.referral_clicks;
DROP TABLE IF EXISTS public.referral_links;

-- 2) Remove user_wallets extension fields introduced by 20260223000100
DROP INDEX IF EXISTS public.idx_user_wallets_referral_code_unique;
DROP INDEX IF EXISTS public.idx_user_wallets_referred_by;

ALTER TABLE public.user_wallets
  DROP COLUMN IF EXISTS referred_at,
  DROP COLUMN IF EXISTS referred_by,
  DROP COLUMN IF EXISTS referral_code;

-- 3) 20260304001000_recover_payment_subscription_columns.sql is an empty file.
-- No schema/data rollback needed for that migration.
