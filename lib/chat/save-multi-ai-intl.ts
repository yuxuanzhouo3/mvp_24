import { appendSessionMessages } from "../chat-session-store";
import { createMessageId } from "./message-id";
import type { MultimodalAttachmentPayload } from "@/lib/chat/multimodal-types";

export interface MultiAIResponsePayload {
  agentId: string;
  agentName: string;
  content: string;
  model: string;
  status: string;
  timestamp: Date;
  nodeId?: string;
  nodeTitle?: string;
  dependsOn?: string[];
  tokens?: number;
  cost?: number;
}

export type MultiAICollaborationMode =
  | "normal"
  | "parallel"
  | "sequential"
  | "deep"
  | "graph";

export async function saveIntlMultiAISessionTurn(params: {
  sessionId: string;
  userId: string;
  userMessageId?: string;
  assistantMessageId?: string;
  userMessage: string;
  userAttachments?: MultimodalAttachmentPayload[];
  userModelInput?: string;
  aiResponses: MultiAIResponsePayload[];
  collaborationMode?: MultiAICollaborationMode;
  taskGraph?: unknown;
}): Promise<void> {
  const {
    sessionId,
    userId,
    userMessageId,
    assistantMessageId,
    userMessage,
    userAttachments,
    userModelInput,
    aiResponses,
    collaborationMode,
    taskGraph,
  } = params;
  const timestamp = new Date().toISOString();
  const normalizeTimestamp = (value: unknown) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    return timestamp;
  };

  const normalizedUserModelInput =
    typeof userModelInput === "string" && userModelInput.trim().length > 0
      ? userModelInput.trim()
      : "";
  const userMessageContent =
    normalizedUserModelInput || (Array.isArray(userAttachments) && userAttachments.length > 0)
      ? {
          content: userMessage,
          ...(normalizedUserModelInput ? { modelInput: normalizedUserModelInput } : {}),
          ...(Array.isArray(userAttachments) && userAttachments.length > 0 ? { attachments: userAttachments } : {}),
        }
      : userMessage;

  const userMessagePayload = {
    id: userMessageId && userMessageId.trim() ? userMessageId : createMessageId("msg"),
    content: userMessageContent,
    role: "user",
    timestamp,
    tokens_used: 0,
  };

  const aiMessagePayload = {
    id:
      assistantMessageId && assistantMessageId.trim()
        ? assistantMessageId
        : createMessageId("msg"),
    content: aiResponses.map((response) => ({
      agentName: response.agentName,
      agentId: response.agentId,
      model: response.model,
      content: response.content,
      status: response.status,
      timestamp: normalizeTimestamp(response.timestamp),
      nodeId: response.nodeId,
      nodeTitle: response.nodeTitle,
      dependsOn: response.dependsOn,
      tokens: response.tokens,
      cost: response.cost,
    })),
    role: "assistant",
    timestamp,
    tokens_used: 0,
    isMultiAI: true,
    ...(collaborationMode ? { collaborationMode } : {}),
    ...(taskGraph ? { taskGraph } : {}),
  };

  // Persist user + assistant together to preserve repeated same-text prompts.
  await appendSessionMessages({
    sessionId,
    userId,
    messages: [userMessagePayload, aiMessagePayload],
  });
}
