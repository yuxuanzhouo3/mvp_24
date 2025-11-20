-- 添加 metadata 字段到 payments 表
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_payments_metadata ON public.payments USING gin (metadata);

-- 添加注释
COMMENT ON COLUMN public.payments.metadata IS 'JSON metadata containing payment details like days, paymentType, billingCycle';
