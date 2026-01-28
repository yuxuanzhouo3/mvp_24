-- ================================================
-- Migration: Add Token Usage Tracking
-- Description: 创建token_usage表用于记录AI Token使用和计费
-- Date: 2025-01-26
-- ================================================

-- 创建token_usage表
CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES gpt_sessions(id) ON DELETE CASCADE,

  -- 模型信息
  model VARCHAR(100) NOT NULL,

  -- Token使用量
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  -- 费用（美元）
  cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0.000000,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_token_usage_user_id
  ON token_usage(user_id);

CREATE INDEX IF NOT EXISTS idx_token_usage_session_id
  ON token_usage(session_id);

CREATE INDEX IF NOT EXISTS idx_token_usage_created_at
  ON token_usage(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_usage_user_created
  ON token_usage(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_usage_model
  ON token_usage(model);

-- 添加注释
COMMENT ON TABLE token_usage IS 'AI Token使用记录和计费表';
COMMENT ON COLUMN token_usage.user_id IS '用户ID';
COMMENT ON COLUMN token_usage.session_id IS '会话ID';
COMMENT ON COLUMN token_usage.model IS 'AI模型名称（如gpt-4-turbo, claude-3-5-sonnet）';
COMMENT ON COLUMN token_usage.prompt_tokens IS '输入token数';
COMMENT ON COLUMN token_usage.completion_tokens IS '输出token数';
COMMENT ON COLUMN token_usage.total_tokens IS '总token数';
COMMENT ON COLUMN token_usage.cost_usd IS '费用（美元）';

-- ================================================
-- Row Level Security (RLS) 策略
-- ================================================

-- 启用RLS
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- 策略1: 用户只能查看自己的使用记录
CREATE POLICY "Users can view own token usage"
  ON token_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- 策略2: 系统可以插入使用记录（通过service_role）
CREATE POLICY "System can insert token usage"
  ON token_usage
  FOR INSERT
  WITH CHECK (true);

-- 策略3: 用户不能修改使用记录
CREATE POLICY "Users cannot update token usage"
  ON token_usage
  FOR UPDATE
  USING (false);

-- 策略4: 用户不能删除使用记录
CREATE POLICY "Users cannot delete token usage"
  ON token_usage
  FOR DELETE
  USING (false);

-- ================================================
-- 添加user_id字段到gpt_messages表（如果不存在）
-- ================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gpt_messages' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE gpt_messages ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

    -- 更新现有记录的user_id（从gpt_sessions关联）
    UPDATE gpt_messages gm
    SET user_id = gs.user_id
    FROM gpt_sessions gs
    WHERE gm.session_id = gs.id AND gm.user_id IS NULL;

    -- 创建索引
    CREATE INDEX IF NOT EXISTS idx_gpt_messages_user_id ON gpt_messages(user_id);

    RAISE NOTICE 'Added user_id column to gpt_messages table';
  END IF;
END $$;

-- ================================================
-- 创建视图：用户使用统计
-- ================================================

CREATE OR REPLACE VIEW user_usage_stats AS
SELECT
  user_id,
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) AS total_requests,
  SUM(total_tokens) AS total_tokens,
  SUM(prompt_tokens) AS total_prompt_tokens,
  SUM(completion_tokens) AS total_completion_tokens,
  SUM(cost_usd) AS total_cost_usd,
  model,
  COUNT(DISTINCT session_id) AS unique_sessions
FROM token_usage
GROUP BY user_id, DATE_TRUNC('month', created_at), model
ORDER BY month DESC, total_cost_usd DESC;

COMMENT ON VIEW user_usage_stats IS '用户AI使用统计（按月、按模型）';

-- ================================================
-- 创建函数：获取用户本月使用量
-- ================================================

CREATE OR REPLACE FUNCTION get_user_monthly_usage(p_user_id UUID)
RETURNS TABLE (
  total_requests BIGINT,
  total_tokens BIGINT,
  total_cost_usd NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_requests,
    COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
    COALESCE(SUM(cost_usd), 0)::NUMERIC AS total_cost_usd
  FROM token_usage
  WHERE
    user_id = p_user_id
    AND created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP)
    AND created_at < DATE_TRUNC('month', CURRENT_TIMESTAMP) + INTERVAL '1 month';
END;
$$;

COMMENT ON FUNCTION get_user_monthly_usage IS '获取用户本月的AI使用量统计';

-- ================================================
-- 创建函数：检查用户是否超过免费额度
-- ================================================

CREATE OR REPLACE FUNCTION check_free_limit_exceeded(
  p_user_id UUID,
  p_free_limit INTEGER DEFAULT 100
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message_count INTEGER;
BEGIN
  -- 计算本月AI回复消息数
  SELECT COUNT(*)::INTEGER
  INTO v_message_count
  FROM gpt_messages
  WHERE
    user_id = p_user_id
    AND role = 'assistant'
    AND created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP)
    AND created_at < DATE_TRUNC('month', CURRENT_TIMESTAMP) + INTERVAL '1 month';

  RETURN v_message_count >= p_free_limit;
END;
$$;

COMMENT ON FUNCTION check_free_limit_exceeded IS '检查用户是否超过免费额度（默认100次）';

-- ================================================
-- 完成
-- ================================================

-- 记录迁移完成
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: token_usage table and related objects created successfully';
END $$;
