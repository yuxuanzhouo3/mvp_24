import { supabaseAdmin } from "@/lib/supabase-admin";

const APPEND_MESSAGES_RPC = "append_gpt_session_messages";
const APPEND_MESSAGE_IF_ABSENT_RPC = "append_gpt_session_message_if_absent";
const MAX_RETRIES = 4;

export type SessionMessage = Record<string, unknown>;

function isRpcMissing(error: any): boolean {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    error?.code === "PGRST202" ||
    text.includes("could not find the function") ||
    text.includes("does not exist")
  );
}

async function fetchSessionForUpdate(sessionId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("gpt_sessions")
    .select("messages, updated_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Session not found or access denied");
  }

  return data;
}

async function appendMessagesWithRetry(
  sessionId: string,
  userId: string,
  messages: SessionMessage[]
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const session = await fetchSessionForUpdate(sessionId, userId);
    const existingMessages = Array.isArray(session.messages) ? session.messages : [];
    const nextUpdatedAt = new Date().toISOString();

    let updateQuery = supabaseAdmin
      .from("gpt_sessions")
      .update({
        messages: [...existingMessages, ...messages],
        updated_at: nextUpdatedAt,
      })
      .eq("id", sessionId)
      .eq("user_id", userId);

    if (session.updated_at) {
      updateQuery = updateQuery.eq("updated_at", session.updated_at);
    }

    const { data: updatedRows, error: updateError } = await updateQuery
      .select("id");

    if (updateError) {
      throw new Error(`Failed to append messages: ${updateError.message}`);
    }

    if (updatedRows && updatedRows.length > 0) {
      return;
    }
  }

  throw new Error("Concurrent update conflict while saving messages");
}

async function appendMessageIfAbsentWithRetry(
  sessionId: string,
  userId: string,
  message: SessionMessage,
  role: string,
  content: string
): Promise<"appended" | "duplicate"> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const session = await fetchSessionForUpdate(sessionId, userId);
    const existingMessages = Array.isArray(session.messages) ? session.messages : [];

    const isDuplicate = existingMessages.some(
      (item: any) => item?.role === role && item?.content === content
    );

    if (isDuplicate) {
      return "duplicate";
    }

    const nextUpdatedAt = new Date().toISOString();

    let updateQuery = supabaseAdmin
      .from("gpt_sessions")
      .update({
        messages: [...existingMessages, message],
        updated_at: nextUpdatedAt,
      })
      .eq("id", sessionId)
      .eq("user_id", userId);

    if (session.updated_at) {
      updateQuery = updateQuery.eq("updated_at", session.updated_at);
    }

    const { data: updatedRows, error: updateError } = await updateQuery
      .select("id");

    if (updateError) {
      throw new Error(`Failed to append message: ${updateError.message}`);
    }

    if (updatedRows && updatedRows.length > 0) {
      return "appended";
    }
  }

  throw new Error("Concurrent update conflict while saving messages");
}

export async function appendSessionMessages(params: {
  sessionId: string;
  userId: string;
  messages: SessionMessage[];
}): Promise<void> {
  const { sessionId, userId, messages } = params;

  if (!Array.isArray(messages) || messages.length === 0) {
    return;
  }

  const { data, error } = await supabaseAdmin.rpc(APPEND_MESSAGES_RPC, {
    p_session_id: sessionId,
    p_user_id: userId,
    p_messages: messages,
  });

  if (error) {
    if (isRpcMissing(error)) {
      await appendMessagesWithRetry(sessionId, userId, messages);
      return;
    }
    throw new Error(`Failed to append messages: ${error.message}`);
  }

  if (data !== true) {
    throw new Error("Session not found or access denied");
  }
}

export async function appendSessionMessageIfAbsent(params: {
  sessionId: string;
  userId: string;
  message: SessionMessage;
  role: string;
  content: string;
}): Promise<"appended" | "duplicate"> {
  const { sessionId, userId, message, role, content } = params;

  const { data, error } = await supabaseAdmin.rpc(APPEND_MESSAGE_IF_ABSENT_RPC, {
    p_session_id: sessionId,
    p_user_id: userId,
    p_message: message,
    p_role: role,
    p_content: content,
  });

  if (error) {
    if (isRpcMissing(error)) {
      return appendMessageIfAbsentWithRetry(sessionId, userId, message, role, content);
    }
    throw new Error(`Failed to append message: ${error.message}`);
  }

  const updated = !!(data as any)?.updated;
  const reason = typeof (data as any)?.reason === "string" ? (data as any).reason : "";

  if (!updated && reason === "not_found") {
    throw new Error("Session not found or access denied");
  }

  return updated ? "appended" : "duplicate";
}
