-- Atomic append helpers for gpt_sessions.messages
-- Avoids lost updates caused by read-modify-write in application code

BEGIN;

CREATE OR REPLACE FUNCTION public.append_gpt_session_messages(
  p_session_id UUID,
  p_user_id UUID,
  p_messages JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_count INTEGER;
BEGIN
  IF p_messages IS NULL OR jsonb_typeof(p_messages) <> 'array' THEN
    RAISE EXCEPTION 'p_messages must be a JSON array';
  END IF;

  UPDATE public.gpt_sessions
  SET
    messages = COALESCE(messages, '[]'::jsonb) || p_messages,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_session_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count = 1;
END;
$$;

COMMENT ON FUNCTION public.append_gpt_session_messages(UUID, UUID, JSONB) IS
'Atomically append one or more chat messages into gpt_sessions.messages.';

CREATE OR REPLACE FUNCTION public.append_gpt_session_message_if_absent(
  p_session_id UUID,
  p_user_id UUID,
  p_message JSONB,
  p_role TEXT,
  p_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_messages JSONB;
BEGIN
  IF p_message IS NULL OR jsonb_typeof(p_message) <> 'object' THEN
    RAISE EXCEPTION 'p_message must be a JSON object';
  END IF;

  SELECT COALESCE(messages, '[]'::jsonb)
  INTO v_messages
  FROM public.gpt_sessions
  WHERE id = p_session_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'not_found');
  END IF;

  IF p_role IS NOT NULL
    AND p_content IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_messages) AS elem
      WHERE elem->>'role' = p_role
        AND elem->>'content' = p_content
    ) THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'duplicate');
  END IF;

  UPDATE public.gpt_sessions
  SET
    messages = v_messages || jsonb_build_array(p_message),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_session_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object('updated', true, 'reason', 'appended');
END;
$$;

COMMENT ON FUNCTION public.append_gpt_session_message_if_absent(UUID, UUID, JSONB, TEXT, TEXT) IS
'Append a single message only when a role+content match is not already present in the session.';

COMMIT;
