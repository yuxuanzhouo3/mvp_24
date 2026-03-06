-- ============================================================================
-- Market Referral System (membership-day rewards)
-- ============================================================================

-- 1) Extend user_wallets with referral identity fields
ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallets_referral_code_unique
  ON public.user_wallets (referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_wallets_referred_by
  ON public.user_wallets (referred_by);

-- 2) referral_links
CREATE TABLE IF NOT EXISTS public.referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_slug text NOT NULL,
  share_code text NOT NULL UNIQUE,
  source_default text,
  is_active boolean NOT NULL DEFAULT true,
  click_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_referral_links_creator_created
  ON public.referral_links (creator_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_links_share_active
  ON public.referral_links (share_code, is_active);

-- 3) referral_clicks
CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_code text NOT NULL,
  source text,
  ip_hash text,
  user_agent_hash text,
  landing_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  registered_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_share_created
  ON public.referral_clicks (share_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_created
  ON public.referral_clicks (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_registered_user
  ON public.referral_clicks (registered_user_id);

-- 4) referral_relations
CREATE TABLE IF NOT EXISTS public.referral_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_code text NOT NULL,
  tool_slug text,
  first_tool_id text,
  status text NOT NULL DEFAULT 'bound',
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  first_paid_at timestamptz,
  first_paid_transaction_id text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_relations_invited_unique
  ON public.referral_relations (invited_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_relations_pair_unique
  ON public.referral_relations (inviter_user_id, invited_user_id);

CREATE INDEX IF NOT EXISTS idx_referral_relations_inviter_created
  ON public.referral_relations (inviter_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_relations_activated
  ON public.referral_relations (activated_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_relations_first_paid
  ON public.referral_relations (first_paid_at DESC);

-- 5) referral_rewards
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relation_id uuid REFERENCES public.referral_relations(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_type text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  unit text NOT NULL DEFAULT 'membership_days',
  status text NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'revoked', 'rollback_pending')),
  reference_id text NOT NULL UNIQUE,
  related_transaction_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  granted_at timestamptz,
  revoked_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_user_created
  ON public.referral_rewards (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_relation
  ON public.referral_rewards (relation_id);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_related_tx
  ON public.referral_rewards (related_transaction_id);

-- 6) RLS: keep tables server-side only (service_role bypasses RLS)
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- Cleanup any old broad policies if they exist (defensive)
DROP POLICY IF EXISTS "Allow authenticated read referral_links" ON public.referral_links;
DROP POLICY IF EXISTS "Allow authenticated read referral_clicks" ON public.referral_clicks;
DROP POLICY IF EXISTS "Allow authenticated read referral_relations" ON public.referral_relations;
DROP POLICY IF EXISTS "Allow authenticated read referral_rewards" ON public.referral_rewards;

-- Service role grants
GRANT ALL PRIVILEGES ON TABLE public.referral_links TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.referral_clicks TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.referral_relations TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.referral_rewards TO service_role;
