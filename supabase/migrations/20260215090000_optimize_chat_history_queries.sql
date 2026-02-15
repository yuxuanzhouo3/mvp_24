-- Optimize chat history/session listing queries for gpt_sessions JSONB storage.
-- 1) Add covering index for common session list path (user_id + updated_at desc)
-- 2) Add RPC for session summaries (without returning full messages JSON payload)
-- 3) Add RPC for paginated message reads directly in Postgres

BEGIN;

CREATE INDEX IF NOT EXISTS idx_gpt_sessions_user_updated_at
ON public.gpt_sessions (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.get_gpt_session_summaries(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  model TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  multi_ai_config JSONB,
  message_count INTEGER,
  last_message TEXT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH bounded AS (
    SELECT
      s.id,
      s.title,
      s.model,
      s.created_at,
      s.updated_at,
      s.multi_ai_config,
      COALESCE(s.messages, '[]'::jsonb) AS messages
    FROM public.gpt_sessions s
    WHERE s.user_id = p_user_id
    ORDER BY s.updated_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT
    b.id,
    b.title,
    b.model,
    b.created_at,
    b.updated_at,
    b.multi_ai_config,
    jsonb_array_length(b.messages)::INTEGER AS message_count,
    LEFT(
      regexp_replace(
        COALESCE(
          CASE
            WHEN jsonb_array_length(b.messages) = 0 THEN ''
            WHEN jsonb_typeof((b.messages->-1)->'content') = 'string'
              THEN (b.messages->-1)->>'content'
            WHEN jsonb_typeof((b.messages->-1)->'content') = 'array'
              THEN COALESCE(((b.messages->-1)->'content'->0)->>'content', '')
            ELSE ''
          END,
          ''
        ),
        '\s+',
        ' ',
        'g'
      ),
      120
    ) AS last_message
  FROM bounded b;
$$;

COMMENT ON FUNCTION public.get_gpt_session_summaries(UUID, INTEGER, INTEGER) IS
'List user sessions as lightweight summaries without returning full messages payload.';

CREATE OR REPLACE FUNCTION public.get_gpt_session_messages_page(
  p_session_id UUID,
  p_user_id UUID,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  messages JSONB,
  total INTEGER,
  session_config JSONB,
  total_tokens BIGINT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH target AS (
    SELECT
      COALESCE(s.messages, '[]'::jsonb) AS all_messages,
      s.multi_ai_config
    FROM public.gpt_sessions s
    WHERE s.id = p_session_id
      AND s.user_id = p_user_id
  ),
  expanded AS (
    SELECT
      e.elem,
      e.ordinality - 1 AS idx
    FROM target t
    CROSS JOIN LATERAL jsonb_array_elements(t.all_messages) WITH ORDINALITY AS e(elem, ordinality)
  ),
  paged AS (
    SELECT
      e.elem,
      e.idx
    FROM expanded e
    WHERE e.idx >= GREATEST(COALESCE(p_offset, 0), 0)
    ORDER BY e.idx
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
  )
  SELECT
    COALESCE((SELECT jsonb_agg(p.elem ORDER BY p.idx) FROM paged p), '[]'::jsonb) AS messages,
    COALESCE((SELECT jsonb_array_length(t.all_messages) FROM target t), 0)::INTEGER AS total,
    (SELECT t.multi_ai_config FROM target t) AS session_config,
    COALESCE(
      (
        SELECT SUM(
          CASE
            WHEN jsonb_typeof(e.elem->'tokens_used') = 'number'
              THEN (e.elem->>'tokens_used')::BIGINT
            ELSE 0
          END
        )
        FROM expanded e
      ),
      0
    ) AS total_tokens
  FROM (SELECT 1) q
  WHERE EXISTS (SELECT 1 FROM target);
$$;

COMMENT ON FUNCTION public.get_gpt_session_messages_page(UUID, UUID, INTEGER, INTEGER) IS
'Read paginated messages from gpt_sessions.messages JSONB in Postgres instead of slicing in app memory.';

CREATE OR REPLACE FUNCTION public.count_gpt_assistant_messages_since(
  p_user_id UUID,
  p_start TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*), 0)::INTEGER
  FROM public.gpt_sessions s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.messages, '[]'::jsonb)) AS elem
  WHERE s.user_id = p_user_id
    AND elem->>'role' = 'assistant'
    AND (
      CASE
        WHEN COALESCE(elem->>'timestamp', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
          THEN (elem->>'timestamp')::timestamptz >= p_start
        ELSE FALSE
      END
    );
$$;

COMMENT ON FUNCTION public.count_gpt_assistant_messages_since(UUID, TIMESTAMPTZ) IS
'Count assistant messages in gpt_sessions.messages since the provided timestamp.';

COMMIT;
