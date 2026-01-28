-- 添加数据库约束防止支付记录重复
-- 此脚本为payments表添加唯一约束，防止相同transaction_id的重复记录

-- 步骤1: 首先检查并清理现有的重复数据
-- 保留每个transaction_id最早创建的记录（通常是pending状态）
-- 删除较晚创建的重复记录

-- 查看重复记录（仅用于审查，不执行删除）
SELECT 
    transaction_id, 
    user_id,
    COUNT(*) as count,
    array_agg(id ORDER BY created_at) as payment_ids,
    array_agg(status ORDER BY created_at) as statuses,
    array_agg(created_at ORDER BY created_at) as created_dates
FROM payments
WHERE transaction_id IS NOT NULL
GROUP BY transaction_id, user_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 步骤2: 创建临时表来标识要保留的记录
CREATE TEMP TABLE payments_to_keep AS
SELECT DISTINCT ON (transaction_id, user_id)
    id
FROM payments
WHERE transaction_id IS NOT NULL
ORDER BY transaction_id, user_id, created_at ASC;

-- 步骤3: 标记重复记录（不直接删除，先标记以便审查）
-- 为了安全起见，我们先将重复记录的status改为'duplicate'
UPDATE payments
SET status = 'duplicate'
WHERE transaction_id IS NOT NULL
  AND id NOT IN (SELECT id FROM payments_to_keep)
  AND status IN ('pending', 'completed');

-- 步骤4: 审查被标记为重复的记录
SELECT 
    id,
    user_id,
    transaction_id,
    amount,
    currency,
    status,
    payment_method,
    created_at
FROM payments
WHERE status = 'duplicate'
ORDER BY created_at DESC;

-- 步骤5: 如果确认无误，可以删除重复记录
-- 取消下面的注释来执行删除
-- DELETE FROM payments WHERE status = 'duplicate';

-- 步骤6: 添加唯一约束（确保没有重复后再执行）
-- 注意：如果仍有重复记录，此步骤会失败
-- ALTER TABLE payments 
-- ADD CONSTRAINT payments_transaction_id_user_id_unique 
-- UNIQUE (transaction_id, user_id);

-- 步骤7: 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id 
ON payments(transaction_id) 
WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_user_status_created 
ON payments(user_id, status, created_at DESC);

-- 使用说明：
-- 1. 首先运行步骤1查看重复记录
-- 2. 运行步骤2-3标记重复记录
-- 3. 运行步骤4审查被标记的记录
-- 4. 确认无误后，取消步骤5的注释并执行删除
-- 5. 最后取消步骤6的注释并添加唯一约束
