-- Convert gpt_messages content to JSONB format for unified schema
-- This allows both single AI and multi-AI responses to be stored consistently

-- 1. Add new columns
ALTER TABLE public.gpt_messages
ADD COLUMN IF NOT EXISTS content_json JSONB,
ADD COLUMN IF NOT EXISTS is_multi_ai BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS agent_name TEXT,
ADD COLUMN IF NOT EXISTS agent_id TEXT,
ADD COLUMN IF NOT EXISTS model TEXT;

-- 2. Migrate existing data from text content to JSON format
-- For existing messages, wrap them in a JSON structure
UPDATE public.gpt_messages
SET content_json = jsonb_build_object(
  'content', content,
  'agentName', agent_name,
  'agentId', agent_id,
  'model', model
)
WHERE content_json IS NULL;

-- 3. Drop the old content column
ALTER TABLE public.gpt_messages
DROP COLUMN IF EXISTS content;

-- 4. Rename content_json to content
ALTER TABLE public.gpt_messages
RENAME COLUMN content_json TO content;

-- 5. Make the content column NOT NULL
ALTER TABLE public.gpt_messages
ALTER COLUMN content SET NOT NULL;

-- 6. Create an index on is_multi_ai for better query performance
CREATE INDEX IF NOT EXISTS idx_gpt_messages_is_multi_ai ON public.gpt_messages(is_multi_ai);

-- 7. Create an index on agent_id for filtering by specific agent
CREATE INDEX IF NOT EXISTS idx_gpt_messages_agent_id ON public.gpt_messages(agent_id);
