-- Remove provider balance pools and l6edger tables (no longer used)

DROP TABLE IF EXISTS public.provider_balance_ledger;
DROP TABLE IF EXISTS public.provider_balance_pools;
