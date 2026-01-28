-- Add multi_ai_config column to gpt_sessions table for session AI configuration locking
-- This column stores the multi-AI configuration when a session is created with multiple AIs

BEGIN;

-- 1. Add multi_ai_config column to gpt_sessions
ALTER TABLE gpt_sessions
ADD COLUMN IF NOT EXISTS multi_ai_config JSONB DEFAULT NULL;

-- Add comment explaining the column structure
COMMENT ON COLUMN gpt_sessions.multi_ai_config IS
'Stores multi-AI configuration for the session. Structure: {
  "isMultiAI": boolean,
  "selectedAgentIds": string[],
  "collaborationMode": "parallel" | "sequential" | "debate" | "synthesis",
  "lockedAt": ISO8601 timestamp,
  "lockedBy": user_id
}';

-- 2. Create index for faster queries on multi_ai_config
CREATE INDEX IF NOT EXISTS idx_gpt_sessions_multi_ai_config
ON gpt_sessions USING gin(multi_ai_config);

-- 3. Create index for queries by isMultiAI flag
CREATE INDEX IF NOT EXISTS idx_gpt_sessions_is_multi_ai
ON gpt_sessions ((multi_ai_config->>'isMultiAI'));

COMMIT;
