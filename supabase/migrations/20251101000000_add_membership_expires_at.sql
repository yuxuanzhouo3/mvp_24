-- 添加一次性支付需要的字段到 user_profiles 表
-- 这个迁移文件为一次性支付系统添加必要的数据库字段

-- 1. 添加 membership_expires_at 字段(会员到期时间)
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMP WITH TIME ZONE;

-- 2. 添加索引以优化查询
CREATE INDEX IF NOT EXISTS idx_user_profiles_membership_expires_at 
ON user_profiles (membership_expires_at);

-- 3. 添加 metadata 字段到 payments 表(可选,用于存储额外信息)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 4. 添加 GIN 索引优化 JSONB 查询
CREATE INDEX IF NOT EXISTS idx_payments_metadata 
ON payments USING gin (metadata);

-- 5. 添加注释说明
COMMENT ON COLUMN user_profiles.membership_expires_at IS '会员到期时间。一次性支付模式下,用于判断用户会员是否有效';
COMMENT ON COLUMN payments.metadata IS '支付元数据。存储天数、支付类型等额外信息 (可选)';
