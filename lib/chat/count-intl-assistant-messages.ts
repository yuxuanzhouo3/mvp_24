import { supabaseAdmin } from "@/lib/supabase-admin";
import { countAssistantMessagesInMonth } from "@/lib/usage/count-assistant-messages";

const COUNT_ASSISTANT_MESSAGES_RPC = "count_gpt_assistant_messages_since";

function isRpcMissing(error: any): boolean {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    error?.code === "PGRST202" ||
    text.includes("could not find the function") ||
    text.includes("does not exist")
  );
}

function parseRpcCount(data: unknown): number {
  if (typeof data === "number") {
    return data;
  }

  if (typeof data === "string") {
    const parsed = Number(data);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (typeof first === "number") {
      return first;
    }
    if (typeof first === "string") {
      const parsed = Number(first);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (first && typeof first === "object") {
      const record = first as Record<string, unknown>;
      const value =
        record.count ??
        record.count_gpt_assistant_messages_since ??
        Object.values(record)[0];
      if (typeof value === "number") {
        return value;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
    }
  }

  return 0;
}

export async function countIntlAssistantMessagesSince(
  userId: string,
  start: Date
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc(COUNT_ASSISTANT_MESSAGES_RPC, {
    p_user_id: userId,
    p_start: start.toISOString(),
  });

  if (!error) {
    return parseRpcCount(data);
  }

  if (!isRpcMissing(error)) {
    throw new Error(`Failed to count assistant messages: ${error.message}`);
  }

  // Migration not applied yet: fallback to legacy in-memory counting.
  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from("gpt_sessions")
    .select("messages")
    .eq("user_id", userId);

  if (sessionsError) {
    throw new Error(`Failed to fetch sessions for usage count: ${sessionsError.message}`);
  }

  if (!sessions || !Array.isArray(sessions)) {
    return 0;
  }

  return countAssistantMessagesInMonth(sessions, start);
}
