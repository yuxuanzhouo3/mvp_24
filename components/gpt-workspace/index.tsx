"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { getClientAuthToken } from "@/lib/client-auth";
import { useWorkspaceMessages } from "@/components/workspace-messages-context";
import { RightNavDock } from "./right-nav-dock";
import { WorkspaceMessageList } from "./workspace-message-list";
import { LiveCollaborationPanel } from "./live-collaboration-panel";
import { ChatInputPanel } from "./chat-input-panel";
import { TASK_GRAPH_PRESETS } from "@/data/task-graph-presets";
import {
  clearPendingFavoriteScroll,
  peekPendingFavoriteScroll,
  rewriteFavoriteAnchor,
  useMessageFavorites,
} from "@/hooks/use-message-favorites";
import {
  topoLayers,
  type TaskGraphExecutionRun,
  type TaskGraphSpec,
} from "@/types/task-graph";
import type {
  AIResponse,
  AIAgent,
  Message,
  GPTWorkspaceProps,
  CollaborationMode,
} from "./types";
import {
  buildModalityFallbackPrompt,
  detectInputModalities,
  getIncompatibleModalities,
  type InputModality,
} from "@/lib/ai/capability-routing";
import { SSEJSONParser } from "@/lib/chat/sse-json-parser";
import type {
  MultimodalAttachmentPayload,
  MultimodalPreprocessResult,
} from "@/lib/chat/multimodal-types";

interface ChatApiErrorPayload {
  error?: string;
  code?: string;
  message?: string;
  credits?: {
    required?: number;
    balance?: number;
    shortfall?: number;
  };
  quota?: {
    dailyCap?: number;
    spentToday?: number;
    monthlyGrant?: number;
    spentThisMonth?: number;
  };
  remaining?: {
    image?: number;
    videoAudio?: number;
  };
}

const SMART_RUNTIME_AGENT_PREFIX = "smart-model-runtime";
const SMART_DEEPSEEK_MODEL = "deepseek-v3.2";
const SMART_COLLABORATION_MODELS = [
  { key: "deepseek", model: "deepseek-v3.2" },
  { key: "qwen3-max", model: "qwen3-max-2026-01-23" },
  { key: "qwen-plus", model: "qwen-plus-2025-12-01" },
] as const;

const isSmartAIAgent = (agent?: AIAgent | null) => {
  if (!agent) return false;
  const normalizedId = (agent.id || "").trim().toLowerCase();
  const normalizedModel = (agent.model || "").trim().toLowerCase();
  return normalizedId === "smart-model" || normalizedModel === "smart-auto";
};

const isChinaSmartAIAgent = (agent?: AIAgent | null) => {
  if (!isSmartAIAgent(agent)) return false;
  return (agent?.provider || "").trim().toLowerCase() === "qwen";
};

const isSmartRuntimeAgent = (agent?: AIAgent | null) => {
  if (!agent) return false;
  const normalizedId = (agent.id || "").trim().toLowerCase();
  return normalizedId.startsWith(`${SMART_RUNTIME_AGENT_PREFIX}-`);
};

const buildSmartRuntimeAgents = (
  smartAgent: AIAgent,
  mode: CollaborationMode
): AIAgent[] => {
  const deepseekRuntimeAgent: AIAgent = {
    ...smartAgent,
    id: `${SMART_RUNTIME_AGENT_PREFIX}-deepseek`,
    model: SMART_DEEPSEEK_MODEL,
  };

  if (mode === "normal" || mode === "deep" || mode === "graph") {
    return [deepseekRuntimeAgent];
  }

  if (mode === "parallel" || mode === "sequential") {
    return SMART_COLLABORATION_MODELS.map((entry, index) => ({
      ...smartAgent,
      id: `${SMART_RUNTIME_AGENT_PREFIX}-${entry.key}`,
      name: `${smartAgent.name} ${String.fromCharCode(65 + index)}`,
      model: entry.model,
    }));
  }

  return [deepseekRuntimeAgent];
};

const resolveExecutionAgents = (
  lockedAIs: AIAgent[],
  mode: CollaborationMode
) => {
  if (lockedAIs.length === 1 && isChinaSmartAIAgent(lockedAIs[0])) {
    return buildSmartRuntimeAgents(lockedAIs[0], mode);
  }
  return lockedAIs;
};

export function GPTWorkspace({
  selectedGPTs,
  setSelectedGPTs,
  availableAIs,
  collaborationMode,
  setCollaborationMode,
}: GPTWorkspaceProps) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSessionId, setProcessingSessionId] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [aiResponses, setAIResponses] = useState<AIResponse[]>([]);
  const [activeTaskGraphSpec, setActiveTaskGraphSpec] = useState<TaskGraphSpec | null>(null);
  const [taskGraphPresetId, setTaskGraphPresetId] = useState<string>(TASK_GRAPH_PRESETS[0]?.id || "general");
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [sessionConfig, setSessionConfig] = useState<any>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [taskGraphNavOpen, setTaskGraphNavOpen] = useState(true);
  const [taskGraphNavDismissed, setTaskGraphNavDismissed] = useState(false);
  const [selectedTaskGraphMessageId, setSelectedTaskGraphMessageId] = useState<string | null>(null);
  const [resultNavOpen, setResultNavOpen] = useState(true);
  const [resultNavDismissed, setResultNavDismissed] = useState(false);
  const [selectedResultMessageId, setSelectedResultMessageId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<MultimodalAttachmentPayload[]>([]);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showMultimodalPreprocessHint, setShowMultimodalPreprocessHint] =
    useState(false);
  const [isSessionHistoryLoading, setIsSessionHistoryLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef(0);
  const isProcessingRef = useRef(false);
  const processingSessionIdRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | undefined>(undefined);
  const visibleMessagesSessionIdRef = useRef<string | undefined>(undefined);
  const sessionLoadSeqRef = useRef(0);
  const sessionSwitchStartedAtRef = useRef(0);
  const messagesRef = useRef<Message[]>([]);
  const sessionMessageCacheRef = useRef<Record<string, Message[]>>({});
  const attachmentsRef = useRef<MultimodalAttachmentPayload[]>([]);
  const lastFailedRequestRef = useRef<{
    input: string;
    attachments: MultimodalAttachmentPayload[];
    sessionId?: string;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const shouldPersistRecordingRef = useRef(false);
  const { language } = useLanguage();
  const t = useTranslations(language);
  const MAX_ATTACHMENTS = 8;
  const MAX_SINGLE_FILE_BYTES = 12 * 1024 * 1024;
  const MAX_TOTAL_FILE_BYTES = 24 * 1024 * 1024;
  const MAX_TEXT_EXTRACT_CHARS = 12000;
  const MAX_DATA_URL_BYTES = 2 * 1024 * 1024;
  const MAX_RECORDING_SECONDS = 120;
  const RECORDING_AUDIO_BITS_PER_SECOND = 24000;
  const TARGET_RECORDING_WAV_SAMPLE_RATE = 8000;

  const formatFileSize = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "0 B";
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  };

  const stopRecordingTicker = () => {
    if (recordingIntervalRef.current !== null) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  };

  const releaseRecordingStream = () => {
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      recordingStreamRef.current = null;
    }
  };

  const getSupportedRecordingMimeType = () => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      return "";
    }

    const candidates = [
      "audio/webm",
      "audio/mp4",
      "audio/ogg",
      "audio/wav",
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
    ];

    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }

    return "";
  };

  const getAudioExtensionByMime = (mimeType: string) => {
    const type = (mimeType || "").toLowerCase();
    if (type.includes("mp4") || type.includes("m4a")) return "m4a";
    if (type.includes("ogg")) return "ogg";
    if (type.includes("wav")) return "wav";
    if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
    return "webm";
  };

  const isTextLikeFile = (file: File) => {
    const type = (file.type || "").toLowerCase();
    if (
      type.startsWith("text/") ||
      type.includes("json") ||
      type.includes("xml") ||
      type.includes("yaml") ||
      type.includes("csv") ||
      type.includes("javascript") ||
      type.includes("typescript")
    ) {
      return true;
    }
    const lowerName = (file.name || "").toLowerCase();
    return (
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".markdown") ||
      lowerName.endsWith(".json") ||
      lowerName.endsWith(".csv") ||
      lowerName.endsWith(".sql") ||
      lowerName.endsWith(".xml") ||
      lowerName.endsWith(".yaml") ||
      lowerName.endsWith(".yml") ||
      lowerName.endsWith(".js") ||
      lowerName.endsWith(".jsx") ||
      lowerName.endsWith(".ts") ||
      lowerName.endsWith(".tsx") ||
      lowerName.endsWith(".py") ||
      lowerName.endsWith(".java") ||
      lowerName.endsWith(".go") ||
      lowerName.endsWith(".rs")
    );
  };

  const detectAttachmentKind = (file: File): MultimodalAttachmentPayload["kind"] => {
    const type = (file.type || "").toLowerCase();
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("audio/")) return "audio";
    if (type.startsWith("video/")) return "video";
    const name = (file.name || "").toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/.test(name)) return "image";
    if (/\.(mp3|wav|m4a|aac|ogg|flac|amr)$/.test(name)) return "audio";
    if (/\.(mp4|mov|webm|mkv|avi|mpeg|mpg)$/.test(name)) return "video";
    return "file";
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(reader.error || new Error("Failed to read file as data URL"));
      reader.readAsDataURL(file);
    });

  const readFileAsTextExcerpt = (file: File, maxChars: number) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        resolve(text.slice(0, maxChars));
      };
      reader.onerror = () => reject(reader.error || new Error("Failed to read file as text"));
      reader.readAsText(file);
    });

  const extractVideoPosterDataUrl = (file: File) =>
    new Promise<string | undefined>((resolve) => {
      if (typeof window === "undefined") {
        resolve(undefined);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.src = objectUrl;

      let settled = false;
      const finish = (value?: string) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(objectUrl);
        resolve(value);
      };

      const timeoutId = window.setTimeout(() => finish(undefined), 4000);

      video.onloadeddata = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, video.videoWidth || 1);
          canvas.height = Math.max(1, video.videoHeight || 1);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            window.clearTimeout(timeoutId);
            finish(undefined);
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const previewUrl = canvas.toDataURL("image/jpeg", 0.75);
          window.clearTimeout(timeoutId);
          finish(previewUrl);
        } catch {
          window.clearTimeout(timeoutId);
          finish(undefined);
        }
      };

      video.onerror = () => {
        window.clearTimeout(timeoutId);
        finish(undefined);
      };
    });

  const encodeMonoSamplesToWav = (
    samples: Float32Array,
    sampleRate: number
  ): Blob => {
    const channelCount = 1;
    const bytesPerSample = 2;
    const blockAlign = channelCount * bytesPerSample;
    const dataSize = samples.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset + i, value.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      const sample = Math.max(-1, Math.min(1, samples[sampleIndex]));
      const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, pcm, true);
      offset += bytesPerSample;
    }

    return new Blob([buffer], { type: "audio/wav" });
  };

  const downmixAndResampleToMono = (
    audioBuffer: AudioBuffer,
    targetSampleRate: number
  ) => {
    const sourceRate = audioBuffer.sampleRate;
    const sourceLength = audioBuffer.length;
    const channelCount = Math.max(1, audioBuffer.numberOfChannels);
    const sourceChannels = Array.from({ length: channelCount }, (_, index) =>
      audioBuffer.getChannelData(index)
    );
    const targetLength = Math.max(
      1,
      Math.round((sourceLength / sourceRate) * targetSampleRate)
    );
    const mixed = new Float32Array(targetLength);

    const getMixedSample = (index: number) => {
      const clampedIndex = Math.max(0, Math.min(sourceLength - 1, index));
      let sum = 0;
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        sum += sourceChannels[channelIndex][clampedIndex] || 0;
      }
      return sum / channelCount;
    };

    for (let i = 0; i < targetLength; i += 1) {
      const sourceIndex = (i * sourceRate) / targetSampleRate;
      const leftIndex = Math.floor(sourceIndex);
      const rightIndex = Math.min(sourceLength - 1, leftIndex + 1);
      const weight = sourceIndex - leftIndex;
      const left = getMixedSample(leftIndex);
      const right = getMixedSample(rightIndex);
      mixed[i] = left + (right - left) * weight;
    }

    return { samples: mixed, sampleRate: targetSampleRate };
  };

  const transcodeAudioBlobToWav = async (blob: Blob): Promise<Blob | null> => {
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;

    const context = new Ctx();
    try {
      const source = await blob.arrayBuffer();
      const decoded = await context.decodeAudioData(source.slice(0));
      const monoResampled = downmixAndResampleToMono(
        decoded,
        TARGET_RECORDING_WAV_SAMPLE_RATE
      );
      return encodeMonoSamplesToWav(
        monoResampled.samples,
        monoResampled.sampleRate
      );
    } catch (error) {
      console.warn("[GPTWorkspace] Failed to transcode recording to wav:", error);
      return null;
    } finally {
      try {
        await context.close();
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const favorites = useMessageFavorites();

  const getMessageAnchorId = (messageId: string) => `chat-message-${messageId}`;

  const buildFavoriteId = (sessionId: string | undefined, anchorId: string) =>
    `${sessionId || "no-session"}:${anchorId}`;

  const getTaskGraphNodeAnchorId = (messageId: string, nodeId: string) =>
    `task-graph-${messageId}-node-${nodeId}`;

  const getMultiAIResponseAnchorId = (
    messageId: string,
    response: AIResponse,
    index: number
  ) =>
    response.nodeId
      ? getTaskGraphNodeAnchorId(messageId, response.nodeId)
      : `chat-message-${messageId}-ai-${response.agentId}-${index}`;

  const getLiveResponseAnchorId = (response: AIResponse, index: number) =>
    `live-ai-${response.nodeId || response.agentId}-${index}`;

  const effectiveCollaborationMode: CollaborationMode =
    collaborationMode === "normal"
      ? "normal"
      : collaborationMode === "sequential"
      ? "sequential"
      : collaborationMode === "parallel"
        ? "parallel"
        : collaborationMode === "deep"
          ? "deep"
          : collaborationMode === "graph"
            ? "graph"
            : sessionConfig?.collaborationMode === "normal"
              ? "normal"
              : sessionConfig?.collaborationMode === "sequential"
              ? "sequential"
              : sessionConfig?.collaborationMode === "parallel"
                ? "parallel"
                : sessionConfig?.collaborationMode === "deep"
                  ? "deep"
                  : sessionConfig?.collaborationMode === "graph"
                    ? "graph"
                    : "parallel";

  // 使用全局 Context 管理消息和会话 ID
  const {
    messages,
    setMessages,
    addMessage,
    currentSessionId,
    setCurrentSessionId,
  } = useWorkspaceMessages();

  const isCurrentSessionProcessing =
    isProcessing &&
    Boolean(currentSessionId) &&
    Boolean(processingSessionId) &&
    currentSessionId === processingSessionId;
  const isPreflightProcessing =
    isProcessing && !processingSessionId && !currentSessionId;
  const showWorkspaceProcessing =
    isCurrentSessionProcessing || isPreflightProcessing;

  const visibleAIResponses = isCurrentSessionProcessing ? aiResponses : [];
  const visibleActiveTaskGraphSpec = isCurrentSessionProcessing
    ? activeTaskGraphSpec
    : null;

  const mergeSessionMessages = (
    remoteMessages: Message[],
    localMessages: Message[]
  ) => {
    if (localMessages.length === 0) return remoteMessages;
    if (remoteMessages.length === 0) return localMessages;

    const byId = new Map<string, Message>();
    for (const message of remoteMessages) {
      byId.set(message.id, message);
    }
    for (const message of localMessages) {
      if (!byId.has(message.id)) {
        byId.set(message.id, message);
      }
    }

    return Array.from(byId.values()).sort((a, b) => {
      const left = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
      const right = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
      return left - right;
    });
  };

  const setMessagesForSessionView = (
    sessionId: string | undefined,
    nextMessages: Message[]
  ) => {
    visibleMessagesSessionIdRef.current = sessionId;
    setMessages(nextMessages);
  };

  const appendMessageForSession = (
    sessionId: string,
    message: Message
  ) => {
    const activeSessionId = currentSessionIdRef.current;
    const visibleMessages = messagesRef.current;
    const fallbackBase =
      activeSessionId === sessionId ? visibleMessages : [];
    const cached = sessionMessageCacheRef.current[sessionId] || fallbackBase;
    const nextCache = cached.some((item) => item.id === message.id)
      ? cached
      : [...cached, message];
    sessionMessageCacheRef.current[sessionId] = nextCache;

    if (
      activeSessionId === sessionId &&
      !visibleMessages.some((item) => item.id === message.id)
    ) {
      visibleMessagesSessionIdRef.current = sessionId;
      addMessage(message);
    }
  };

  const removeMessageForSession = (sessionId: string, messageId: string) => {
    const activeSessionId = currentSessionIdRef.current;
    const visibleMessages = messagesRef.current;
    const fallbackBase = activeSessionId === sessionId ? visibleMessages : [];
    const cached = sessionMessageCacheRef.current[sessionId] || fallbackBase;
    const nextCache = cached.filter((item) => item.id !== messageId);
    sessionMessageCacheRef.current[sessionId] = nextCache;

    if (
      activeSessionId === sessionId &&
      visibleMessages.some((item) => item.id === messageId)
    ) {
      setMessagesForSessionView(
        sessionId,
        visibleMessages.filter((item) => item.id !== messageId)
      );
    }
  };

  const normalizePreviewText = (value: string) =>
    value.replace(/\s+/g, " ").trim();

  const truncatePreview = (value: string, maxLength: number = 30) =>
    value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

  const findRelatedUserMessage = (message: Message): Message | null => {
    const messageIndex = messages.findIndex((m) => m.id === message.id);
    if (messageIndex <= 0) return null;

    for (let i = messageIndex - 1; i >= 0; i -= 1) {
      const prevMessage = messages[i];
      if (
        prevMessage.role === "user" &&
        typeof prevMessage.content === "string" &&
        prevMessage.content.trim()
      ) {
        return prevMessage;
      }
    }
    return null;
  };

  const getConversationPreview = (message: Message): string => {
    let sourceText = "";
    const relatedUserMessage = findRelatedUserMessage(message);
    if (relatedUserMessage && typeof relatedUserMessage.content === "string") {
      sourceText = relatedUserMessage.content;
    }

    if (!sourceText) {
      if (typeof message.content === "string") {
        sourceText = message.content;
      } else if (Array.isArray(message.content)) {
        const firstResponseWithContent = message.content.find(
          (item) => typeof item.content === "string" && item.content.trim()
        );
        sourceText = firstResponseWithContent?.content || "";
      }
    }

    const normalized = normalizePreviewText(sourceText);
    if (!normalized) {
      return language === "zh" ? "（空内容）" : "(empty)";
    }
    return truncatePreview(normalized);
  };

  const getConversationAnchorId = (message: Message) => {
    const relatedUserMessage = findRelatedUserMessage(message);
    if (relatedUserMessage) {
      return getMessageAnchorId(relatedUserMessage.id);
    }
    return getMessageAnchorId(message.id);
  };

  const buildVisibleUserInput = (
    text: string,
    selectedAttachments: MultimodalAttachmentPayload[]
  ) => {
    const cleanText = text.trim();
    if (selectedAttachments.length === 0) return cleanText;
    const names = selectedAttachments.map((item) => item.name).join("、");
    const attachmentLine =
      language === "zh" ? `[附件] ${names}` : `[Attachments] ${names}`;
    if (!cleanText) return attachmentLine;
    return `${cleanText}\n\n${attachmentLine}`;
  };

  const buildChatApiError = (
    status: number,
    payload: ChatApiErrorPayload | null,
    rawText: string,
    fallback: string
  ): { message: string; openSubscriptionModal: boolean; payload: ChatApiErrorPayload | null } => {
    const code = typeof payload?.code === "string" ? payload.code : "";
    const required = Number(payload?.credits?.required ?? 0);
    const balance = Number(payload?.credits?.balance ?? 0);
    const spentToday = Number(payload?.quota?.spentToday ?? 0);
    const dailyCap = Number(payload?.quota?.dailyCap ?? 0);
    const payloadMessage =
      typeof payload?.message === "string" && payload.message.trim().length > 0
        ? payload.message.trim()
        : typeof payload?.error === "string" && payload.error.trim().length > 0
          ? payload.error.trim()
          : "";

    if (status === 402 && code === "daily_credit_cap_exceeded") {
      return {
        message:
          language === "zh"
            ? dailyCap > 0
              ? `今日 Credits 已达上限（已用 ${spentToday}/${dailyCap}）。请明天再试，或升级套餐。`
              : "今日 Credits 已达上限，请明天再试或升级套餐。"
            : dailyCap > 0
              ? `Today's credit limit has been reached (${spentToday}/${dailyCap}). Try again tomorrow or upgrade your plan.`
              : "Today's credit limit has been reached. Try again tomorrow or upgrade your plan.",
        openSubscriptionModal: false,
        payload,
      };
    }

    if (status === 402) {
      return {
        message:
          language === "zh"
            ? required > 0
              ? `当前 Credits 不足：本次预计需要 ${required}，当前余额 ${balance}。请切换更便宜的模型，或购买/升级额度。`
              : "当前 Credits 不足，请切换更便宜的模型，或购买/升级额度。"
            : required > 0
              ? `Not enough credits for this request. Need ${required}, available ${balance}. Try a cheaper model or add more credits.`
              : "Not enough credits for this request. Try a cheaper model or add more credits.",
        openSubscriptionModal: true,
        payload,
      };
    }

    if (status === 403) {
      return {
        message:
          language === "zh"
            ? payloadMessage || "当前所选模型需要更高套餐，请升级后再试。"
            : payloadMessage || "This model requires a higher plan. Please upgrade and try again.",
        openSubscriptionModal: true,
        payload,
      };
    }

    return {
      message: payloadMessage || rawText || fallback,
      openSubscriptionModal: false,
      payload,
    };
  };

  const readChatApiError = async (
    response: Response,
    fallback: string
  ): Promise<{ message: string; openSubscriptionModal: boolean; payload: ChatApiErrorPayload | null }> => {
    const rawText = await response.text();
    let payload: ChatApiErrorPayload | null = null;

    if (rawText) {
      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === "object") {
          payload = parsed as ChatApiErrorPayload;
        }
      } catch {}
    }

    return buildChatApiError(response.status, payload, rawText, fallback);
  };

  const maybeShowSubscriptionModal = (shouldOpen: boolean) => {
    if (!shouldOpen || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("show-subscription-modal"));
  };

  const preprocessMultimodalInput = async (
    authToken: string,
    rawInput: string,
    selectedAttachments: MultimodalAttachmentPayload[],
    signal: AbortSignal
  ): Promise<MultimodalPreprocessResult> => {
    const response = await fetch("/api/chat/multimodal-preprocess", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        message: rawInput,
        attachments: selectedAttachments,
      }),
    });

    if (!response.ok) {
      const rawText = await response.text();
      let payload: ChatApiErrorPayload | null = null;
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText);
          if (parsed && typeof parsed === "object") {
            payload = parsed as ChatApiErrorPayload;
          }
        } catch {}
      }
      const quotaPayload = payload?.quota;
      const hasMediaQuotaShape =
        quotaPayload &&
        typeof quotaPayload === "object" &&
        ("image" in quotaPayload || "videoAudio" in quotaPayload);
      if (response.status === 402 && hasMediaQuotaShape) {
        const imageRemaining =
          typeof (quotaPayload as any)?.image?.remaining === "number"
            ? (quotaPayload as any).image.remaining
            : 0;
        const videoRemaining =
          typeof (quotaPayload as any)?.videoAudio?.remaining === "number"
            ? (quotaPayload as any).videoAudio.remaining
            : 0;
        throw new Error(
          language === "zh"
            ? `多模态额度不足：图片剩余 ${imageRemaining}，视频/音频剩余 ${videoRemaining}`
            : `Insufficient multimodal quota: image ${imageRemaining}, video/audio ${videoRemaining}`
        );
      }

      const errorInfo = buildChatApiError(
        response.status,
        payload,
        rawText,
        language === "zh"
          ? "多模态预处理失败，请稍后重试"
          : "Multimodal preprocess failed"
      );
      maybeShowSubscriptionModal(errorInfo.openSubscriptionModal);
      throw new Error(errorInfo.message);
    }

    const data = await response.json();
    return {
      enhancedMessage:
        typeof data?.enhancedMessage === "string" ? data.enhancedMessage : rawInput,
      summary: typeof data?.summary === "string" ? data.summary : "",
      quota: data?.quota,
    };
  };

  const buildAttachmentFromFile = async (
    file: File
  ): Promise<MultimodalAttachmentPayload> => {
    const kind = detectAttachmentKind(file);
    const attachment: MultimodalAttachmentPayload = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      kind,
    };

    if (kind === "video") {
      const poster = await extractVideoPosterDataUrl(file);
      if (poster && poster.length <= MAX_DATA_URL_BYTES) {
        attachment.dataUrl = poster;
      }
      attachment.textContent =
        language === "zh"
          ? "视频文件（已提取首帧预览）"
          : "Video file (first-frame preview extracted)";
      return attachment;
    }

    if ((kind === "image" || kind === "audio") && file.size <= MAX_DATA_URL_BYTES) {
      try {
        attachment.dataUrl = await readFileAsDataUrl(file);
      } catch {
        // keep metadata only
      }
    }

    if (isTextLikeFile(file)) {
      try {
        attachment.textContent = await readFileAsTextExcerpt(
          file,
          MAX_TEXT_EXTRACT_CHARS
        );
      } catch {
        // keep metadata only
      }
    }

    return attachment;
  };

  const appendFilesAsAttachments = async (incoming: File[]) => {
    if (incoming.length === 0) return;

    let merged = [...attachmentsRef.current];
    let totalBytes = merged.reduce((sum, item) => sum + (item.size || 0), 0);

    for (const file of incoming) {
      if (merged.length >= MAX_ATTACHMENTS) {
        toast.warning(
          language === "zh"
            ? `最多上传 ${MAX_ATTACHMENTS} 个附件`
            : `Maximum ${MAX_ATTACHMENTS} attachments`
        );
        break;
      }

      if (file.size > MAX_SINGLE_FILE_BYTES) {
        toast.error(
          language === "zh"
            ? `文件过大：${file.name}（${formatFileSize(file.size)}）`
            : `File too large: ${file.name} (${formatFileSize(file.size)})`
        );
        continue;
      }

      if (totalBytes + file.size > MAX_TOTAL_FILE_BYTES) {
        toast.error(
          language === "zh"
            ? `附件总大小不能超过 ${formatFileSize(MAX_TOTAL_FILE_BYTES)}`
            : `Total attachments exceed ${formatFileSize(MAX_TOTAL_FILE_BYTES)}`
        );
        break;
      }

      try {
        const built = await buildAttachmentFromFile(file);
        if (built.kind === "audio" && !built.dataUrl) {
          toast.warning(
            language === "zh"
              ? `音频 ${file.name} 体积较大，未嵌入可转写内容。建议缩短录音或分段发送。`
              : `Audio ${file.name} is too large for inline transcription. Try a shorter recording.`
          );
        }
        merged = [...merged, built];
        totalBytes += file.size;
      } catch (error) {
        console.error("[GPTWorkspace] Failed to process file:", file.name, error);
        toast.error(
          language === "zh"
            ? `处理文件失败：${file.name}`
            : `Failed to process file: ${file.name}`
        );
      }
    }

    setAttachments(merged);
  };

  const handlePickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await appendFilesAsAttachments(Array.from(files));
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const clearAttachments = () => {
    setAttachments([]);
  };

  const stopAudioRecording = (persist: boolean = true) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    shouldPersistRecordingRef.current = persist;
    stopRecordingTicker();
    setIsRecordingAudio(false);

    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (error) {
        console.error("[GPTWorkspace] Failed to stop recorder:", error);
        releaseRecordingStream();
        mediaRecorderRef.current = null;
      }
      return;
    }

    releaseRecordingStream();
    mediaRecorderRef.current = null;
  };

  const getMicrophonePermissionState = async (): Promise<
    PermissionState | "unsupported"
  > => {
    if (
      typeof navigator === "undefined" ||
      !navigator.permissions ||
      typeof navigator.permissions.query !== "function"
    ) {
      return "unsupported";
    }

    try {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      return status.state;
    } catch {
      return "unsupported";
    }
  };

  const startAudioRecording = async () => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error(
        language === "zh"
          ? "当前浏览器不支持麦克风录音"
          : "Microphone recording is not supported in this browser"
      );
      return;
    }

    if (!window.isSecureContext) {
      toast.error(
        language === "zh"
          ? "当前页面不是安全上下文（需 HTTPS 或 localhost），浏览器不会弹出麦克风授权"
          : "This page is not a secure context (HTTPS or localhost required), so browser won't request microphone permission."
      );
      return;
    }

    const permissionState = await getMicrophonePermissionState();
    if (permissionState === "denied") {
      toast.error(
        language === "zh"
          ? "麦克风权限已被浏览器永久拒绝。请点地址栏锁图标 → 站点设置 → 麦克风改为“允许”，然后刷新页面"
          : "Microphone permission is blocked. Click the lock icon, allow microphone in site settings, then refresh."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedRecordingMimeType();
      const recorderOptions: MediaRecorderOptions = {};
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
        if (mimeType.includes("webm") || mimeType.includes("ogg")) {
          recorderOptions.audioBitsPerSecond = RECORDING_AUDIO_BITS_PER_SECOND;
        }
      }
      const recorder =
        Object.keys(recorderOptions).length > 0
          ? new MediaRecorder(stream, recorderOptions)
          : new MediaRecorder(stream);

      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      shouldPersistRecordingRef.current = true;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("[GPTWorkspace] Recorder error:", event);
        shouldPersistRecordingRef.current = false;
        toast.error(
          language === "zh" ? "录音失败，请重试" : "Recording failed, please retry"
        );
      };

      recorder.onstop = async () => {
        const persist = shouldPersistRecordingRef.current;
        const chunks = [...recordingChunksRef.current];
        const effectiveMimeType =
          mimeType || chunks[0]?.type || recorder.mimeType || "audio/webm";

        recordingChunksRef.current = [];
        shouldPersistRecordingRef.current = false;
        mediaRecorderRef.current = null;
        releaseRecordingStream();
        stopRecordingTicker();
        setIsRecordingAudio(false);
        setRecordingSeconds(0);

        if (!persist) return;
        if (chunks.length === 0) {
          toast.error(language === "zh" ? "未录到音频内容" : "No audio recorded");
          return;
        }

        try {
          const blob = new Blob(chunks, { type: effectiveMimeType || "audio/webm" });
          if (blob.size <= 0) {
            toast.error(language === "zh" ? "录音为空，请重试" : "Recording is empty");
            return;
          }

          let uploadBlob = blob;
          let uploadMimeType = effectiveMimeType || "audio/webm";
          const lowerType = uploadMimeType.toLowerCase();
          if (
            lowerType.includes("webm") ||
            lowerType.includes("ogg") ||
            lowerType.includes("opus")
          ) {
            const wavBlob = await transcodeAudioBlobToWav(blob);
            if (
              wavBlob &&
              wavBlob.size > 0 &&
              wavBlob.size <= MAX_DATA_URL_BYTES
            ) {
              uploadBlob = wavBlob;
              uploadMimeType = "audio/wav";
            }
          }

          const extension = getAudioExtensionByMime(uploadMimeType);
          const file = new File(
            [uploadBlob],
            `recording-${Date.now()}.${extension}`,
            { type: uploadMimeType }
          );
          await appendFilesAsAttachments([file]);
          toast.success(
            language === "zh" ? "录音已添加为附件" : "Recording added as attachment"
          );
        } catch (error) {
          console.error("[GPTWorkspace] Failed to append recording:", error);
          toast.error(
            language === "zh"
              ? "录音处理失败，请重试"
              : "Failed to process recording, please retry"
          );
        }
      };

      recorder.start(200);
      mediaRecorderRef.current = recorder;
      setIsRecordingAudio(true);
      setRecordingSeconds(0);
      stopRecordingTicker();

      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            window.setTimeout(() => {
              toast.info(
                language === "zh"
                  ? "已达到录音时长上限，自动停止"
                  : "Recording duration limit reached, stopped automatically"
              );
              stopAudioRecording(true);
            }, 0);
            return MAX_RECORDING_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch (error) {
      const isEmbedded = window.top !== window;
      console.error("[GPTWorkspace] Failed to start recording:", {
        error,
        isSecureContext: window.isSecureContext,
        permissionState,
        isEmbedded,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      });
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? language === "zh"
            ? !window.isSecureContext
              ? "当前页面不是 HTTPS 安全上下文，浏览器不会弹出麦克风权限"
              : isEmbedded
                ? "当前页面在内嵌容器中，容器可能禁用了麦克风权限。请在独立浏览器页打开重试"
                : "麦克风权限被拒绝。请检查地址栏权限、系统麦克风权限后重试"
            : !window.isSecureContext
              ? "This page is not a secure context (HTTPS required), so microphone permission cannot be requested."
              : isEmbedded
                ? "This page is embedded and the container may block microphone permission. Open in a standalone browser tab."
                : "Microphone permission denied. Check browser and OS microphone permissions."
          : language === "zh"
            ? "无法启动录音，请检查设备或权限"
            : "Unable to start recording. Check device or permissions.";
      toast.error(message);
      releaseRecordingStream();
      stopRecordingTicker();
      setIsRecordingAudio(false);
      setRecordingSeconds(0);
    }
  };

  const toggleAudioRecording = async () => {
    if (isRecordingAudio) {
      stopAudioRecording(true);
      return;
    }
    await startAudioRecording();
  };

  const findAnchorIdByFavoritePreview = (preview?: string): string | null => {
    if (!preview) return null;
    const query = normalizePreviewText(preview).replace(/…+$/, "").toLowerCase();
    if (!query) return null;

    const isPreviewMatch = (text: string) => {
      const normalized = normalizePreviewText(text).toLowerCase();
      if (!normalized) return false;
      return normalized.includes(query) || query.includes(normalized);
    };

    for (const message of messages) {
      if (
        message.role === "user" &&
        typeof message.content === "string" &&
        isPreviewMatch(message.content)
      ) {
        return getMessageAnchorId(message.id);
      }

      if (message.isMultiAI && Array.isArray(message.content)) {
        for (let idx = 0; idx < message.content.length; idx += 1) {
          const response = message.content[idx];
          if (isPreviewMatch(response.content)) {
            return getMultiAIResponseAnchorId(message.id, response, idx);
          }
        }
      } else if (
        message.role === "assistant" &&
        typeof message.content === "string" &&
        isPreviewMatch(message.content)
      ) {
        return getMessageAnchorId(message.id);
      }
    }

    return null;
  };

  const jumpToMessage = (messageId: string) => {
    setShouldAutoScroll(false);
    const anchorId = getMessageAnchorId(messageId);
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const parseSafeDate = (value: unknown): Date => {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? new Date() : value;
    }

    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date();
  };

  const normalizeResponseStatus = (value: unknown): AIResponse["status"] => {
    if (value === "pending" || value === "processing" || value === "completed" || value === "error") {
      return value;
    }
    return "completed";
  };

  const normalizeCollaborationMode = (value: unknown): CollaborationMode | undefined => {
    if (
      value === "normal" ||
      value === "parallel" ||
      value === "sequential" ||
      value === "deep" ||
      value === "graph"
    ) {
      return value;
    }
    return undefined;
  };

  const normalizeAIResponsesFromAny = (
    rawContent: unknown,
    fallbackTimestamp: unknown
  ): AIResponse[] => {
    if (!Array.isArray(rawContent)) return [];

    return rawContent
      .map((item: any) => {
        const agentId =
          typeof item?.agentId === "string"
            ? item.agentId
            : typeof item?.agent_id === "string"
              ? item.agent_id
              : "unknown-agent";
        const agentName =
          typeof item?.agentName === "string"
            ? item.agentName
            : typeof item?.agent_name === "string"
              ? item.agent_name
              : "AI";
        const content =
          typeof item?.content === "string"
            ? item.content
            : item?.content && typeof item.content === "object" && typeof item.content.content === "string"
              ? item.content.content
              : "";

        return {
          agentId,
          agentName,
          content,
          model:
            typeof item?.model === "string"
              ? item.model
              : typeof item?.model_name === "string"
                ? item.model_name
                : undefined,
          tokens: typeof item?.tokens === "number" ? item.tokens : 0,
          cost: typeof item?.cost === "number" ? item.cost : 0,
          status: normalizeResponseStatus(item?.status),
          timestamp: parseSafeDate(item?.timestamp ?? fallbackTimestamp),
          nodeId:
            typeof item?.nodeId === "string"
              ? item.nodeId
              : typeof item?.node_id === "string"
                ? item.node_id
                : undefined,
          nodeTitle:
            typeof item?.nodeTitle === "string"
              ? item.nodeTitle
              : typeof item?.node_title === "string"
                ? item.node_title
                : undefined,
          dependsOn: Array.isArray(item?.dependsOn)
            ? item.dependsOn
            : Array.isArray(item?.depends_on)
              ? item.depends_on
              : undefined,
        } satisfies AIResponse;
      })
      .filter((item) => {
        return (
          typeof item.content === "string" &&
          item.content.trim().length > 0
        );
      });
  };

  // 检测用户是否手动向上滚动
  const handleChatScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    setShouldAutoScroll(isNearBottom);
  };

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    processingSessionIdRef.current = processingSessionId;
  }, [processingSessionId]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    setError(null);
    lastFailedRequestRef.current = null;
    setShowMultimodalPreprocessHint(false);
    if (!currentSessionId) {
      setSessionConfig(null);
      setAIResponses([]);
      setIsSessionHistoryLoading(false);
    }
  }, [currentSessionId]);

  useEffect(() => {
    sessionSwitchStartedAtRef.current = Date.now();
    setShouldAutoScroll(true);
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [currentSessionId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!currentSessionId) {
      setIsSessionHistoryLoading(false);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (!currentSessionId) return;
    if (visibleMessagesSessionIdRef.current !== currentSessionId) return;
    sessionMessageCacheRef.current[currentSessionId] = messages;
  }, [currentSessionId, messages]);

  // 在消息或 AI 回复更新时滚动到底部（如果用户未手动向上滚动）
  useLayoutEffect(() => {
    if (!shouldAutoScroll) return;
    const container = chatContainerRef.current;
    if (!container) return;
    const hasStreamingOutput =
      isCurrentSessionProcessing &&
      aiResponses.some((resp) => resp.status === "processing");
    const isRecentSessionSwitch =
      Date.now() - sessionSwitchStartedAtRef.current < 1600;
    const instantScroll =
      hasStreamingOutput || isSessionHistoryLoading || isRecentSessionSwitch;
    if (instantScroll) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [
    messages,
    aiResponses,
    shouldAutoScroll,
    isCurrentSessionProcessing,
    isSessionHistoryLoading,
  ]);

  // 从“收藏对话”点击进入会话后，自动滚动到收藏的那条消息
  useEffect(() => {
    if (!currentSessionId) return;
    const pending = peekPendingFavoriteScroll();
    if (!pending) return;
    if (pending.sessionId !== currentSessionId) return;

    // Prevent auto-scroll-to-bottom from fighting the jump.
    setShouldAutoScroll(false);

    const tryScroll = () => {
      let resolvedAnchorId = pending.anchorId;
      let el = document.getElementById(resolvedAnchorId);
      if (!el && pending.preview) {
        const recoveredAnchorId = findAnchorIdByFavoritePreview(pending.preview);
        if (recoveredAnchorId) {
          resolvedAnchorId = recoveredAnchorId;
          el = document.getElementById(resolvedAnchorId);
          if (el) {
            rewriteFavoriteAnchor(currentSessionId, pending.anchorId, resolvedAnchorId);
          }
        }
      }
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      clearPendingFavoriteScroll();
      return true;
    };

    // Try immediately; if messages haven't rendered yet, retry for a short window.
    if (tryScroll()) return;

    let attempts = 0;
    const maxAttempts = 25; // ~5s at 200ms
    const intervalMs = 200;
    const intervalId = window.setInterval(() => {
      attempts += 1;
      if (tryScroll()) {
        window.clearInterval(intervalId);
        return;
      }
      if (attempts >= maxAttempts) {
        window.clearInterval(intervalId);
      }
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [currentSessionId, messages]);

  useEffect(() => {
    if (!currentSessionId) {
      setTaskGraphNavDismissed(false);
      return;
    }

    try {
      const dismissed =
        localStorage.getItem(`task-graph-nav-dismissed:${currentSessionId}`) ===
        "1";
      setTaskGraphNavDismissed(dismissed);
    } catch {
      setTaskGraphNavDismissed(false);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (!currentSessionId) {
      setResultNavDismissed(false);
      return;
    }

    try {
      const dismissed =
        localStorage.getItem(`multi-ai-nav-dismissed:${currentSessionId}`) ===
        "1";
      setResultNavDismissed(dismissed);
    } catch {
      setResultNavDismissed(false);
    }
  }, [currentSessionId]);

  useEffect(() => {
    return () => {
      shouldPersistRecordingRef.current = false;
      stopRecordingTicker();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      } else {
        releaseRecordingStream();
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("workspace-processing-state", {
        detail: { isProcessing },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("workspace-processing-state", {
          detail: { isProcessing: false },
        })
      );
    };
  }, [isProcessing]);

  // 当会话ID改变时，从数据库加载历史消息
  useEffect(() => {
    let cancelled = false;
    const loadMessagesFromDatabase = async () => {
      if (!currentSessionId) return;
      const targetSessionId = currentSessionId;
      const loadSeq = sessionLoadSeqRef.current + 1;
      sessionLoadSeqRef.current = loadSeq;
      const pageLimit = 500;
      const maxPages = 200;
      setIsSessionHistoryLoading(true);

      const cachedMessages = sessionMessageCacheRef.current[targetSessionId];
      if (cachedMessages && cachedMessages.length > 0) {
        setMessagesForSessionView(targetSessionId, cachedMessages);
      } else {
        setMessagesForSessionView(targetSessionId, []);
      }

      try {
        const { token } = await getClientAuthToken();
        if (!token) return;
        let offset = 0;
        let pageCount = 0;
        let totalMessages: number | null = null;
        let loadedSessionConfig: any = null;
        let loadedSessionModel = "";
        const loadedMessages: any[] = [];

        while (pageCount < maxPages) {
          if (cancelled || currentSessionIdRef.current !== targetSessionId) {
            return;
          }

          const response = await fetch(
            `/api/chat/sessions/${targetSessionId}/messages?limit=${pageLimit}&offset=${offset}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            const serverMessage =
              typeof payload?.error === "string" ? payload.error : "";

            if (response.status === 404) {
              // Session may be removed or inaccessible. Keep UI stable without error noise.
              sessionMessageCacheRef.current[targetSessionId] = [];
              if (currentSessionIdRef.current === targetSessionId) {
                setMessagesForSessionView(targetSessionId, []);
              }
              return;
            }

            if (response.status === 401) {
              // Auth could be refreshing; avoid spamming console errors for expected auth churn.
              return;
            }

            console.error(
              "Failed to load messages:",
              response.status,
              serverMessage || response.statusText
            );
            return;
          }

          const data = await response.json();
          const pageMessages = Array.isArray(data?.messages) ? data.messages : [];
          loadedMessages.push(...pageMessages);

          if (loadedSessionConfig === null && data?.sessionConfig !== undefined) {
            loadedSessionConfig = data.sessionConfig ?? null;
          }
          if (!loadedSessionModel && typeof data?.sessionModel === "string") {
            loadedSessionModel = data.sessionModel;
          }

          const parsedTotal =
            typeof data?.total === "number"
              ? data.total
              : Number.parseInt(String(data?.total ?? ""), 10);
          if (Number.isFinite(parsedTotal) && parsedTotal >= 0) {
            totalMessages = parsedTotal;
          }

          offset += pageMessages.length;
          pageCount += 1;

          if (pageMessages.length === 0) break;
          if (pageMessages.length < pageLimit) break;
          if (totalMessages !== null && offset >= totalMessages) break;
        }

        if (cancelled || currentSessionIdRef.current !== targetSessionId) {
          return;
        }

        // 转换数据库消息格式为前端格式
        const formattedMessages = loadedMessages.map((msg: any, idx: number) => {
          const fallbackId = `legacy-${targetSessionId || "no-session"}-${idx}-${msg?.role || "unknown"}-${msg?.timestamp || "no-ts"}`;
          const role: Message["role"] = msg?.role === "user" ? "user" : "assistant";
          const rawTaskGraph = msg?.taskGraph ?? msg?.task_graph;
          const rawCollaborationMode =
            msg?.collaborationMode ?? msg?.collaboration_mode;
          const collaborationMode = normalizeCollaborationMode(rawCollaborationMode);
          const normalizedResponses = normalizeAIResponsesFromAny(
            msg?.content,
            msg?.timestamp
          );
          const rawIsMultiAI =
            typeof msg?.isMultiAI === "boolean"
              ? msg.isMultiAI
              : typeof msg?.is_multi_ai === "boolean"
                ? msg.is_multi_ai
                : false;
          const isMultiAIStructured =
            role === "assistant" && normalizedResponses.length > 0;
          const isMultiAI =
            role === "assistant" &&
            (rawIsMultiAI ||
              isMultiAIStructured ||
              collaborationMode !== undefined ||
              Boolean((rawTaskGraph as any)?.spec));
          const normalizedContent =
            typeof msg?.content === "string"
              ? msg.content
              : msg?.content && typeof msg.content === "object" && typeof msg.content.content === "string"
                ? msg.content.content
                : "";
          const normalizedAttachments =
            role === "user" && msg?.content && typeof msg.content === "object" && Array.isArray(msg.content.attachments)
              ? msg.content.attachments.filter((item: any) => item && typeof item === "object")
              : [];

          return {
            id: typeof msg?.id === "string" && msg.id.trim().length > 0 ? msg.id : fallbackId,
            role,
            content: isMultiAIStructured ? normalizedResponses : normalizedContent,
            attachments: normalizedAttachments,
            isMultiAI,
            collaborationMode,
            taskGraph: rawTaskGraph,
            finalAgentId:
              typeof msg?.finalAgentId === "string"
                ? msg.finalAgentId
                : typeof msg?.final_agent_id === "string"
                  ? msg.final_agent_id
                  : undefined,
            finalAgentName:
              typeof msg?.finalAgentName === "string"
                ? msg.finalAgentName
                : typeof msg?.final_agent_name === "string"
                  ? msg.final_agent_name
                  : undefined,
            model:
              typeof msg?.model === "string"
                ? msg.model
                : typeof msg?.model_name === "string"
                  ? msg.model_name
                  : undefined,
            timestamp: parseSafeDate(msg?.timestamp),
          };
        });
        const cachedMessagesForTarget = sessionMessageCacheRef.current[targetSessionId] || [];
        const visibleMessagesForTarget =
          isProcessingRef.current &&
          processingSessionIdRef.current === targetSessionId &&
          visibleMessagesSessionIdRef.current === targetSessionId
            ? messagesRef.current
            : [];
        const latestCached = mergeSessionMessages(
          cachedMessagesForTarget,
          visibleMessagesForTarget
        );
        const mergedMessages = mergeSessionMessages(
          formattedMessages,
          latestCached
        );

        // 当前会话仍在生成中时，优先保留本地缓存（包含尚未落库的流式上下文）
        const isActiveRunForCurrentSession =
          isProcessingRef.current &&
          processingSessionIdRef.current === targetSessionId;
        const nextMessages = mergedMessages;

        if (
          isActiveRunForCurrentSession &&
          latestCached.length > 0 &&
          formattedMessages.length === 0
        ) {
          console.log(
            "[GPTWorkspace] Using local in-progress cache for active session"
          );
        }

        setMessagesForSessionView(targetSessionId, nextMessages);
        sessionMessageCacheRef.current[targetSessionId] = nextMessages;

        // 加载会话配置（用于显示AI锁定状态）
        if (loadedSessionConfig) {
          setSessionConfig(loadedSessionConfig);
          console.log("[GPTWorkspace] Loaded session config:", loadedSessionConfig);
          if (
            loadedSessionConfig.collaborationMode === "normal" ||
            loadedSessionConfig.collaborationMode === "parallel" ||
            loadedSessionConfig.collaborationMode === "sequential" ||
            loadedSessionConfig.collaborationMode === "deep" ||
            loadedSessionConfig.collaborationMode === "graph"
          ) {
            setCollaborationMode(loadedSessionConfig.collaborationMode);
          }

          const lockedAgentIds = Array.isArray(loadedSessionConfig?.selectedAgentIds)
            ? loadedSessionConfig.selectedAgentIds
                .map((agentId: string) => String(agentId || "").trim())
                .filter(Boolean)
            : [];

          if (lockedAgentIds.length > 0) {
            const restoredAIs = lockedAgentIds
              .map((agentId: string) =>
                availableAIs.find((ai) => ai.id === agentId || ai.model === agentId)
              )
              .filter((ai: any) => ai !== undefined);

            if (restoredAIs.length > 0) {
              setSelectedGPTs(restoredAIs);
              console.log("[GPTWorkspace] Restored locked AIs:", restoredAIs);
            } else if ((typeof loadedSessionModel === "string" && loadedSessionModel.trim()) || (typeof loadedSessionConfig?.model === "string" && loadedSessionConfig.model.trim())) {
              const fallbackModel = loadedSessionModel || loadedSessionConfig.model;
              const fallbackAI = availableAIs.find(
                (ai) => ai.id === fallbackModel || ai.model === fallbackModel
              );
              if (fallbackAI) {
                setSelectedGPTs([fallbackAI]);
                console.log("[GPTWorkspace] Restored fallback locked AI:", fallbackAI);
              }
            }
          }
        } else {
          setSessionConfig(null);
        }

        console.log(
          "[GPTWorkspace] Loaded",
          mergedMessages.length,
          "messages from database"
        );
      } catch (error) {
        console.error("[GPTWorkspace] Failed to load messages from database:", error);
      } finally {
        if (!cancelled && sessionLoadSeqRef.current === loadSeq) {
          setIsSessionHistoryLoading(false);
        }
      }
    };

    void loadMessagesFromDatabase();
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, availableAIs]);

  const updateSessionCollaborationMode = async (
    sessionId: string,
    token: string,
    mode: CollaborationMode
  ) => {
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          collaborationMode: mode,
        }),
      });

      if (!res.ok) return;
      const data = await res.json();
      if (data?.session?.multi_ai_config) {
        setSessionConfig(data.session.multi_ai_config);
      }
    } catch (err) {
      console.error("[GPTWorkspace] Failed to sync collaboration mode:", err);
    }
  };

  const handleCollaborationModeChange = async (
    mode: CollaborationMode
  ) => {
    setCollaborationMode(mode);
    setModeMenuOpen(false);

    if (!currentSessionId || !sessionConfig?.isMultiAI) return;

    try {
      const { token } = await getClientAuthToken();
      if (!token) return;
      await updateSessionCollaborationMode(currentSessionId, token, mode);
      toast.success(
        language === "zh"
          ? "协作模式已切换，新一轮对话生效"
          : "Collaboration mode updated for the next turn"
      );
    } catch (err) {
      console.error("[GPTWorkspace] Failed to switch collaboration mode:", err);
    }
  };

  const createStreamFrameUpdater = (matcher: (resp: AIResponse) => boolean) => {
    let rafId: number | null = null;
    let pendingPatch: Partial<AIResponse> = {};

    const applyPending = () => {
      const patch = pendingPatch;
      pendingPatch = {};
      if (Object.keys(patch).length === 0) return;
      setAIResponses((prev) => prev.map((r) => (matcher(r) ? { ...r, ...patch } : r)));
    };

    return {
      enqueue: (patch: Partial<AIResponse>) => {
        pendingPatch = { ...pendingPatch, ...patch };
        if (rafId !== null) return;
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          applyPending();
        });
      },
      flush: () => {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
        applyPending();
      },
      cancel: () => {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
        pendingPatch = {};
      },
    };
  };

  const handleSend = async (override?: {
    input?: string;
    attachments?: MultimodalAttachmentPayload[];
    sessionId?: string;
  }) => {
    const originalInput = override?.input ?? input;
    const rawInput = originalInput.trim();
    const attachmentSnapshot = override?.attachments ?? [...attachments];
    if ((!rawInput && attachmentSnapshot.length === 0) || isProcessing) return;
    if (isRecordingAudio) {
      toast.info(
        language === "zh"
          ? "请先停止录音，再发送消息"
          : "Please stop recording before sending"
      );
      return;
    }

    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    if (selectedGPTs.length === 0) {
      toast.error(t.workspace.selectAI);
      return;
    }

    const visibleUserInput = buildVisibleUserInput(rawInput, attachmentSnapshot);
    const fallbackModelMessage =
      rawInput ||
      (language === "zh"
        ? "请根据我上传的附件内容进行分析并给出答案。"
        : "Please analyze the uploaded attachments and provide the answer.");
    let effectiveMessageForModels = fallbackModelMessage;
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: visibleUserInput || fallbackModelMessage,
      attachments: attachmentSnapshot,
      timestamp: new Date(),
    };
    const restoreComposer = () => {
      setInput(originalInput);
      setAttachments(attachmentSnapshot);
    };
    let sessId: string | null = override?.sessionId || currentSessionId || null;
    let isNewSession = false;
    let userMessageCommitted = false;
    let userMessageAttachedToSession = false;
    let modelExecutionStarted = false;
    let authTokenForFailure: string | null = null;
    const hasMultimodalInput = attachmentSnapshot.length > 0;
    const appendVisibleMessage = (message: Message) => {
      const visibleMessages = messagesRef.current;
      if (!visibleMessages.some((item) => item.id === message.id)) {
        setMessagesForSessionView(
          currentSessionIdRef.current,
          [...visibleMessages, message]
        );
      }
    };
    const removeVisibleMessageById = (messageId: string) => {
      const visibleMessages = messagesRef.current;
      if (visibleMessages.some((item) => item.id === messageId)) {
        setMessagesForSessionView(
          currentSessionIdRef.current,
          visibleMessages.filter((item) => item.id !== messageId)
        );
      }
    };
    const removeCommittedUserMessage = () => {
      if (sessId) {
        removeMessageForSession(sessId, userMessage.id);
      } else {
        removeVisibleMessageById(userMessage.id);
      }
    };

    setIsProcessing(true);
    setShowMultimodalPreprocessHint(hasMultimodalInput);
    setError(null);
    lastFailedRequestRef.current = null;
    setInput("");
    setAttachments([]);

    const provisionalResponses: AIResponse[] = (
      effectiveCollaborationMode === "normal" ? selectedGPTs.slice(0, 1) : selectedGPTs
    ).map((gpt: AIAgent) => ({
      agentId: gpt.id,
      agentName: gpt.name,
      content: "",
      status: "processing",
      timestamp: new Date(),
      model: gpt.model,
    }));
    setAIResponses(provisionalResponses);
    if (sessId) {
      setProcessingSessionId(sessId);
      processingSessionIdRef.current = sessId;
      appendMessageForSession(sessId, userMessage);
      userMessageAttachedToSession = true;
    } else {
      appendVisibleMessage(userMessage);
    }
    userMessageCommitted = true;

    try {
      // 获取认证 Token（支持 CloudBase 和 Supabase）
      const { token: authToken, error: authError } = await getClientAuthToken();
      authTokenForFailure = authToken || null;

      if (authError || !authToken) {
        toast.error("请先登录", {
          description: "您需要登录后才能使用 AI 对话功能",
        });
        removeCommittedUserMessage();
        restoreComposer();
        return;
      }

      // 如果没有sessionId，先创建会话，并立刻渲染用户消息
      if (!sessId) {
        isNewSession = true;
        if (abortController.signal.aborted || runId !== activeRunIdRef.current) {
          throw createAbortError();
        }
        sessId = await createSession(authToken, userMessage.content as string);
        setCurrentSessionId(sessId);
        // Avoid session-switch race that may drop the optimistic first user message.
        currentSessionIdRef.current = sessId;
      }
      if (!sessId) {
        throw new Error("Failed to create session");
      }
      setProcessingSessionId(sessId);
      processingSessionIdRef.current = sessId;
      if (!userMessageAttachedToSession) {
        appendMessageForSession(sessId, userMessage);
        userMessageAttachedToSession = true;
      }

      // 检查额度
      try {
        const usageRes = await fetch("/api/user/usage", {
          signal: abortController.signal,
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (usageRes.ok) {
          const usageData = await usageRes.json();
          const creditBalance = Number(usageData?.credits?.balance ?? 0);
          if (creditBalance <= 0) {
            window.dispatchEvent(new CustomEvent("show-subscription-modal"));
            removeCommittedUserMessage();
            restoreComposer();
            setIsProcessing(false);
            return;
          }
        }
      } catch (e) {
        console.error("Failed to check usage before sending:", e);
      }

      if (attachmentSnapshot.length > 0) {
        const preprocessResult = await preprocessMultimodalInput(
          authToken,
          rawInput,
          attachmentSnapshot,
          abortController.signal
        );
        effectiveMessageForModels =
          preprocessResult.enhancedMessage?.trim() || fallbackModelMessage;
      }

      // ✅ 改进：使用 sessionConfig 中锁定的 AI，而不是当前的 selectedGPTs
      // 这样确保一旦创建会话，就不能再改 AI
      // 对于新建会话，必须使用 selectedGPTs（sessionConfig还没有更新）
      const lockedAgentIds = !isNewSession && sessionConfig?.selectedAgentIds
                             ? sessionConfig.selectedAgentIds
                             : selectedGPTs.map((gpt: AIAgent) => gpt.id);

      const lockedAIs = lockedAgentIds
        .map((agentId: string) => availableAIs.find((ai: AIAgent) => ai.id === agentId))
        .filter((ai: AIAgent | undefined): ai is AIAgent => ai !== undefined);

      if (lockedAIs.length === 0) {
        toast.error("No AI selected", {
          description: "Please select at least one AI",
        });
        removeCommittedUserMessage();
        restoreComposer();
        setIsProcessing(false);
        return;
      }

      const runtimeAIs = resolveExecutionAgents(lockedAIs, effectiveCollaborationMode);
      const runtimeAgentMap = new Map(runtimeAIs.map((ai) => [ai.id, ai]));

      const requestedModalities = detectInputModalities(effectiveMessageForModels);
      const nonTextModalities = requestedModalities.filter((m) => m !== "text");
      const promptByAgentId: Record<string, string> = {};
      const missingModalitiesByAgentId: Record<string, InputModality[]> = {};
      let degradedCount = 0;

      for (const ai of runtimeAIs) {
        const lacks = getIncompatibleModalities(ai, requestedModalities);
        if (lacks.length > 0) {
          degradedCount += 1;
          missingModalitiesByAgentId[ai.id] = lacks as InputModality[];
          promptByAgentId[ai.id] = buildModalityFallbackPrompt(
            effectiveMessageForModels,
            lacks as InputModality[]
          );
        } else {
          missingModalitiesByAgentId[ai.id] = [];
          promptByAgentId[ai.id] = effectiveMessageForModels;
        }
      }

      if (nonTextModalities.length > 0 && degradedCount > 0) {
        const modalityText =
          nonTextModalities
            .map((m) => (m === "image" ? "图像" : m === "audio" ? "音频" : "文本"))
            .join("、");
        toast.info(
          language === "zh"
            ? `${degradedCount}/${runtimeAIs.length} 个模型不支持${modalityText}输入，已自动降级为文本协作`
            : `${degradedCount}/${runtimeAIs.length} agents lack ${modalityText} input support; fallback to text-only reasoning applied`
        );
      }

      if (!isNewSession && sessId && sessionConfig?.collaborationMode !== effectiveCollaborationMode) {
        updateSessionCollaborationMode(sessId, authToken, effectiveCollaborationMode);
      }

      modelExecutionStarted = true;
      setShowMultimodalPreprocessHint(false);

      if (effectiveCollaborationMode === "graph") {
        // 立刻给用户可见反馈，避免任务图规划阶段出现“空白等待”
        setActiveTaskGraphSpec(null);
        setAIResponses([
          {
            agentId: "__task-graph-planner__",
            agentName: language === "zh" ? "任务图规划器" : "Task Graph Planner",
            model: "planner",
            content:
              language === "zh"
                ? "正在分析你的目标并拆解任务图，请稍候..."
                : "Analyzing your goal and decomposing a task graph...",
            status: "processing",
            timestamp: new Date(),
            nodeId: "__planning__",
            nodeTitle: language === "zh" ? "任务分解" : "Task decomposition",
            dependsOn: [],
          },
        ]);

        const preset =
          TASK_GRAPH_PRESETS.find((p) => p.id === taskGraphPresetId) ??
          TASK_GRAPH_PRESETS[0];

        const { spec, run, nodeResponses } = await handleTaskGraphMode(
          sessId,
          authToken,
          effectiveMessageForModels,
          runtimeAIs,
          promptByAgentId,
          preset?.templateHint,
          abortController.signal,
          runId
        );

        if (abortController.signal.aborted || runId !== activeRunIdRef.current) {
          throw createAbortError();
        }

        const finalMessage: Message = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: nodeResponses,
          isMultiAI: true,
          collaborationMode: "graph",
          taskGraph: { spec, run },
          timestamp: new Date(),
        };

        setIsProcessing(false);
        setAIResponses([]);
        setActiveTaskGraphSpec(null);
        appendMessageForSession(sessId, finalMessage);

        if (sessId) {
          try {
            const saveResponse = await fetch("/api/chat/save-multi-ai", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
              },
                body: JSON.stringify({
                  sessionId: sessId,
                  userMessageId: userMessage.id,
                  assistantMessageId: finalMessage.id,
                  userMessage: userMessage.content,
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
              userAttachments: userMessage.attachments || [],
                  userModelInput: effectiveMessageForModels,
                  collaborationMode: "graph",
                  aiResponses: nodeResponses.map((r) => ({
                    agentId: r.agentId,
                  agentName: r.agentName,
                  content: r.content,
                  model: r.model || runtimeAgentMap.get(r.agentId)?.model || "",
                  status: r.status,
                  timestamp: r.timestamp,
                  nodeId: r.nodeId,
                  nodeTitle: r.nodeTitle,
                  dependsOn: r.dependsOn,
                })),
                taskGraph: { spec, run },
              }),
            });

            if (!saveResponse.ok) {
              console.error("[GPTWorkspace] Failed to save task-graph message");
            }
          } catch (error) {
            console.error("[GPTWorkspace] Error saving task-graph message:", error);
          }
        }
      } else {
        setActiveTaskGraphSpec(null);

        const executionRuntimeAIs =
          effectiveCollaborationMode === "normal"
            ? runtimeAIs.slice(0, 1)
            : runtimeAIs;

        // 初始化AI响应状态（使用运行时执行AI）
        const initialResponses: AIResponse[] = executionRuntimeAIs.map((gpt: AIAgent) => ({
          agentId: gpt.id,
          agentName: gpt.name,
          content: "",
          status: "processing",
          timestamp: new Date(),
        }));
        setAIResponses(initialResponses);

        if (effectiveCollaborationMode === "normal") {
          const finalResponses = await handleParallelMode(
            sessId,
            authToken,
            effectiveMessageForModels,
            promptByAgentId,
            executionRuntimeAIs,
            initialResponses,
            abortController.signal,
            runId
          );

          if (abortController.signal.aborted || runId !== activeRunIdRef.current) {
            throw createAbortError();
          }

          const finalMessage: Message = {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: finalResponses,
            isMultiAI: true,
            collaborationMode: "normal",
            timestamp: new Date(),
          };

          setIsProcessing(false);
          setAIResponses([]);
          appendMessageForSession(sessId, finalMessage);

          if (sessId) {
            try {
              const saveResponse = await fetch("/api/chat/save-multi-ai", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                  sessionId: sessId,
                  userMessageId: userMessage.id,
                  assistantMessageId: finalMessage.id,
                  userMessage: userMessage.content,
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
              userAttachments: userMessage.attachments || [],
                  userModelInput: effectiveMessageForModels,
                  collaborationMode: "normal",
                  aiResponses: finalResponses.map((r) => ({
                    agentId: r.agentId,
                    agentName: r.agentName,
                    content: r.content,
                    model:
                      r.model ||
                      runtimeAgentMap.get(r.agentId)?.model ||
                      "",
                    status: r.status,
                    timestamp: r.timestamp,
                    tokens: r.tokens,
                    cost: r.cost,
                  })),
                }),
              });

              if (!saveResponse.ok) {
                console.error("[GPTWorkspace] Failed to save normal mode message");
              }
            } catch (error) {
              console.error("[GPTWorkspace] Error saving normal mode message:", error);
            }
          }
        } else if (effectiveCollaborationMode === "parallel") {
          // 并行模式：多个AI同时处理（使用运行时执行AI）
          const finalResponses = await handleParallelMode(
            sessId,
            authToken,
            effectiveMessageForModels,
            promptByAgentId,
            executionRuntimeAIs,
            initialResponses,
            abortController.signal,
            runId
          );

          if (abortController.signal.aborted || runId !== activeRunIdRef.current) {
            throw createAbortError();
          }

          // 保存多AI响应为一条消息
          const finalMessage: Message = {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: finalResponses,
            isMultiAI: true,
            collaborationMode: "parallel",
            timestamp: new Date(),
          };
          console.log("[GPTWorkspace] Adding final message:", finalMessage);
          console.log("[GPTWorkspace] Final responses:", finalResponses);

          // 先清除协作状态，避免闪烁
          setIsProcessing(false);
          setAIResponses([]);

          // 然后添加最终消息
          appendMessageForSession(sessId, finalMessage);

          // 保存消息到数据库（统一使用多AI保存API）
          if (sessId) {
            try {
              const saveResponse = await fetch("/api/chat/save-multi-ai", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                  sessionId: sessId,
                  userMessageId: userMessage.id,
                  assistantMessageId: finalMessage.id,
                  userMessage: userMessage.content,
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
              userAttachments: userMessage.attachments || [],
                  userModelInput: effectiveMessageForModels,
                  collaborationMode: "parallel",
                  aiResponses: finalResponses.map((r) => ({
                    agentId: r.agentId,
                    agentName: r.agentName,
                    content: r.content,
                    model:
                      r.model ||
                      runtimeAgentMap.get(r.agentId)?.model ||
                      "",
                    status: r.status,
                    timestamp: r.timestamp,
                  })),
                }),
              });

              if (!saveResponse.ok) {
                console.error("[GPTWorkspace] Failed to save multi-AI message");
              }
            } catch (error) {
              console.error("[GPTWorkspace] Error saving multi-AI message:", error);
            }
          }
        } else if (effectiveCollaborationMode === "deep") {
          // 深度思考模式：要求显式输出思考过程与最终答案
          const deepThinkingPrompt =
            language === "zh"
              ? [
                  "你现在处于深度思考模式。请先输出可见的推理过程，再给出最终答案。",
                  "请严格使用以下结构：",
                  "## 深度思考",
                  "- 逐步拆解问题",
                  "- 列出关键假设与不确定性",
                  "- 给出可执行的判断依据",
                  "## 最终答案",
                  "- 给出结论与建议",
                  "",
                  `用户问题：${effectiveMessageForModels}`,
                ].join("\n")
              : [
                  "You are in deep-thinking mode. You must show reasoning first, then provide the final answer.",
                  "Use this exact structure:",
                  "## Deep Thinking",
                  "- break down the problem step by step",
                  "- list key assumptions and uncertainties",
                  "- provide actionable reasoning basis",
                  "## Final Answer",
                  "- provide conclusion and recommendations",
                  "",
                  `User question: ${effectiveMessageForModels}`,
                ].join("\n");

          const finalResponses = await handleParallelMode(
            sessId,
            authToken,
            deepThinkingPrompt,
            Object.fromEntries(
              Object.entries(promptByAgentId).map(([agentId]) => [
                agentId,
                (missingModalitiesByAgentId[agentId] || []).length === 0
                  ? deepThinkingPrompt
                  : buildModalityFallbackPrompt(
                      deepThinkingPrompt,
                      missingModalitiesByAgentId[agentId] || []
                    ),
              ])
            ),
            executionRuntimeAIs,
            initialResponses,
            abortController.signal,
            runId
          );

          if (abortController.signal.aborted || runId !== activeRunIdRef.current) {
            throw createAbortError();
          }

          // 保存多AI响应为一条消息
          const finalMessage: Message = {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: finalResponses,
            isMultiAI: true,
            collaborationMode: "deep",
            timestamp: new Date(),
          };

          setIsProcessing(false);
          setAIResponses([]);
          appendMessageForSession(sessId, finalMessage);

          if (sessId) {
            try {
              await fetch("/api/chat/save-multi-ai", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                  sessionId: sessId,
                  userMessageId: userMessage.id,
                  assistantMessageId: finalMessage.id,
                  userMessage: userMessage.content,
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
              userAttachments: userMessage.attachments || [],
                  userModelInput: effectiveMessageForModels,
                  collaborationMode: "deep",
                  aiResponses: finalResponses.map((r) => ({
                    agentId: r.agentId,
                    agentName: r.agentName,
                    content: r.content,
                    model:
                      r.model ||
                      runtimeAgentMap.get(r.agentId)?.model ||
                      "",
                    status: r.status,
                    timestamp: r.timestamp,
                  })),
                }),
              });
            } catch (error) {
              console.error("[GPTWorkspace] Error saving deep thinking message:", error);
            }
          }
        } else {
          // 顺序模式：逐个AI处理（失败跳过），最终保存全部 AI 回答（默认折叠展示）
          const result = await handleSequentialMode(
            sessId,
            authToken,
            effectiveMessageForModels,
            promptByAgentId,
            executionRuntimeAIs,
            initialResponses,
            abortController.signal,
            runId
          );

          if (abortController.signal.aborted || runId !== activeRunIdRef.current) {
            throw createAbortError();
          }

          if (!result.finalAnswer) {
            throw new Error("所有模型调用失败，请重试或更换模型");
          }

          // 先清除协作状态，避免闪烁
          setIsProcessing(false);
          setAIResponses([]);

          // 添加多AI结果到对话（顺序模式）
          const finalMessage: Message = {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: result.allResponses,
            isMultiAI: true,
            collaborationMode: "sequential",
            timestamp: new Date(),
          };
          appendMessageForSession(sessId, finalMessage);

          // 保存“用户问题 + 全部AI结果”到数据库
          if (sessId) {
            try {
              const saveResponse = await fetch("/api/chat/save-multi-ai", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                  sessionId: sessId,
                  userMessageId: userMessage.id,
                  assistantMessageId: finalMessage.id,
                  userMessage: userMessage.content,
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
                  userAttachments: userMessage.attachments || [],
              userAttachments: userMessage.attachments || [],
                  userModelInput: effectiveMessageForModels,
                  collaborationMode: "sequential",
                  aiResponses: result.allResponses.map((r) => ({
                    agentId: r.agentId,
                    agentName: r.agentName,
                    content: r.content,
                    model:
                      r.model ||
                      runtimeAgentMap.get(r.agentId)?.model ||
                      "",
                    status: r.status,
                    timestamp: r.timestamp,
                    tokens: r.tokens,
                    cost: r.cost,
                  })),
                }),
              });

              if (!saveResponse.ok) {
                console.error("[GPTWorkspace] Failed to save sequential multi-AI message");
              }
            } catch (error) {
              console.error("[GPTWorkspace] Error saving sequential multi-AI message:", error);
            }
          }
        }
      }
    } catch (error) {
      if (isAbortError(error) || runId !== activeRunIdRef.current) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : t.workspace.error;
      lastFailedRequestRef.current = {
        input: originalInput,
        attachments: attachmentSnapshot,
        sessionId: sessId || currentSessionIdRef.current,
      };

      const canPersistFailedTurn =
        !!sessId &&
        !!authTokenForFailure &&
        userMessageCommitted;

      if (canPersistFailedTurn) {
        const errorAssistantMessage: Message = {
          id: `ai-error-${Date.now()}`,
          role: "assistant",
          content: errorMessage,
          timestamp: new Date(),
          model: "system/error",
          finalAgentName: "System",
        };
        appendMessageForSession(sessId!, errorAssistantMessage);

        try {
          await fetch("/api/chat/save-final", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authTokenForFailure}`,
            },
            body: JSON.stringify({
              sessionId: sessId,
              userMessageId: userMessage.id,
              assistantMessageId: errorAssistantMessage.id,
              userMessage:
                typeof userMessage.content === "string"
                  ? userMessage.content
                  : visibleUserInput || fallbackModelMessage,
              userAttachments: userMessage.attachments || [],
              finalAnswer: errorMessage,
              finalAgentName: "System",
              finalModel: "system/error",
            }),
          });
        } catch (saveError) {
          console.error("[GPTWorkspace] Failed to persist error turn:", saveError);
        }
      } else if (!modelExecutionStarted && userMessageCommitted) {
        removeCommittedUserMessage();
        restoreComposer();
      }

      console.error("Multi-AI collaboration error:", error);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      if (runId !== activeRunIdRef.current) {
        return;
      }
      activeAbortControllerRef.current = null;
      // 确保状态一定会被清除
      setIsProcessing(false);
      setShowMultimodalPreprocessHint(false);
      setProcessingSessionId(null);
      processingSessionIdRef.current = null;
      setAIResponses([]);
      // 触发额度刷新事件
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("message-sent"));
      }
    }
  };

  const buildSequentialPrompt = (
    goal: string,
    prevAgentName: string,
    prevOut: string,
    currentAgentName: string,
    stepIndex: number,
    totalSteps: number
  ) => {
    // 避免参考内容过长导致模型“看不懂/看不到重点”或触发上下文截断
    const maxRefChars = 6000;
    const safePrevOut =
      prevOut.length > maxRefChars
        ? prevOut.slice(0, maxRefChars) + "\n\n(参考内容已截断)"
        : prevOut;

    return [
      `你正在与其他模型协作按顺序解决同一个问题（第 ${stepIndex}/${totalSteps} 步）。`,
      "请严格按以下格式理解与作答：",
      "",
      `【最终目标】\n${goal}`,
      "",
      `【参考信息（上一位模型：${prevAgentName}，可能有错）】\n${safePrevOut}`,
      "",
      "【你的任务】",
      `- 你是：${currentAgentName}。在参考信息的基础上，补充/纠错/改写为更好的最终答案。`,
      "- 直接给出最终结果，不要解释你在参考谁，也不要输出‘第几步’。",
      "- 如果参考内容与目标矛盾，以最终目标为准，并明确给出更正后的结论。",
    ].join("\n");
  };

  const handleSequentialMode = async (
    sessionId: string,
    token: string,
    goal: string,
    promptByAgentId: Record<string, string>,
    runtimeAIs: AIAgent[],
    responses: AIResponse[],
    signal: AbortSignal,
    runId: number
  ): Promise<{
    finalAnswer: string | null;
    finalAgentId?: string;
    finalAgentName?: string;
    finalModel?: string;
    allResponses: AIResponse[];
  }> => {
    const lockedAgentIds = responses.map((r) => r.agentId);
    const aisByAgentId = new Map(runtimeAIs.map((ai) => [ai.id, ai]));
    const allResponses: AIResponse[] = [];

    let lastSuccessOut: string | null = null;
    let lastSuccessAgentName: string | null = null;
    let finalAgentId: string | undefined;
    let finalAgentName: string | undefined;
    let finalModel: string | undefined;

    for (let idx = 0; idx < lockedAgentIds.length; idx++) {
      if (signal.aborted || runId !== activeRunIdRef.current) {
        throw createAbortError();
      }
      const agentId = lockedAgentIds[idx];
      const gpt = aisByAgentId.get(agentId);
      if (!gpt) {
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === agentId
              ? { ...r, status: "error" as const, content: "Error: AI not found" }
              : r
          )
        );
        continue;
      }

      let streamUpdater: ReturnType<typeof createStreamFrameUpdater> | null = null;
      try {
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id ? { ...r, status: "processing" as const } : r
          )
        );
        streamUpdater = createStreamFrameUpdater((resp) => resp.agentId === gpt.id);

        const baseMessage = promptByAgentId[gpt.id] || goal;
        const currentMessage =
          lastSuccessOut && lastSuccessAgentName
            ? buildSequentialPrompt(
                baseMessage,
                lastSuccessAgentName,
                lastSuccessOut,
                gpt.name,
                idx + 1,
                lockedAgentIds.length
              )
            : baseMessage;

        if (process.env.NEXT_PUBLIC_DEBUG_SEQUENTIAL === "1") {
          console.log(
            `[Sequential] Step ${idx + 1}/${lockedAgentIds.length} -> ${gpt.name} (${gpt.model}) message:`,
            currentMessage
          );
        }

        const requestBody: Record<string, unknown> = {
          sessionId,
          message: currentMessage,
          model: gpt.model,
          temperature: gpt.temperature || 0.7,
          maxTokens: gpt.maxTokens || 2048,
          agentName: gpt.name,
          skipSave: true,
        };
        if (!isSmartRuntimeAgent(gpt)) {
          requestBody.agentId = gpt.id;
        }

        const response = await fetch("/api/chat/send", {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorInfo = await readChatApiError(
            response,
            language === "zh" ? "聊天请求失败，请稍后重试" : "Chat request failed"
          );
          maybeShowSubscriptionModal(errorInfo.openSubscriptionModal);
          throw new Error(errorInfo.message);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        const parser = new SSEJSONParser<any>();
        let accumulatedContent = "";
        let totalTokens = 0;
        let cost = 0;
        let resolvedModel = gpt.model;

        if (reader) {
          while (true) {
            if (signal.aborted || runId !== activeRunIdRef.current) {
              throw createAbortError();
            }
            const { done, value } = await reader.read();
            if (done) break;

            const events = parser.push(decoder.decode(value, { stream: true }));
            for (const data of events) {
              if (data.type === "content") {
                accumulatedContent += String(data.content || "");
                streamUpdater.enqueue({
                  content: accumulatedContent,
                  status: "processing",
                });
              } else if (data.type === "done") {
                totalTokens = (data.tokens as any)?.total || data.tokens || 0;
                cost = Number(data.cost || 0);
                if (typeof data.model === "string" && data.model.trim()) {
                  resolvedModel = data.model;
                }
              } else if (data.type === "error") {
                throw new Error(String(data.error || "Unknown stream error"));
              }
            }
          }

          for (const data of parser.push(decoder.decode())) {
            if (data.type === "content") {
              accumulatedContent += String(data.content || "");
              streamUpdater.enqueue({
                content: accumulatedContent,
                status: "processing",
              });
            } else if (data.type === "done") {
              totalTokens = (data.tokens as any)?.total || data.tokens || 0;
              cost = Number(data.cost || 0);
              if (typeof data.model === "string" && data.model.trim()) {
                resolvedModel = data.model;
              }
            } else if (data.type === "error") {
              throw new Error(String(data.error || "Unknown stream error"));
            }
          }

          for (const data of parser.flush()) {
            if (data.type === "content") {
              accumulatedContent += String(data.content || "");
              streamUpdater.enqueue({
                content: accumulatedContent,
                status: "processing",
              });
            } else if (data.type === "done") {
              totalTokens = (data.tokens as any)?.total || data.tokens || 0;
              cost = Number(data.cost || 0);
              if (typeof data.model === "string" && data.model.trim()) {
                resolvedModel = data.model;
              }
            } else if (data.type === "error") {
              throw new Error(String(data.error || "Unknown stream error"));
            }
          }
        }

        streamUpdater.flush();

        if (!totalTokens && accumulatedContent) {
          totalTokens = Math.floor(accumulatedContent.length / 4);
        }

        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id
              ? {
                  ...r,
                  content: accumulatedContent,
                  model: resolvedModel,
                  tokens: totalTokens,
                  cost,
                  status: "completed" as const,
                }
              : r
          )
        );

        allResponses.push({
          agentId: gpt.id,
          agentName: gpt.name,
          model: resolvedModel,
          content: accumulatedContent,
          tokens: totalTokens,
          cost,
          status: "completed",
          timestamp: new Date(),
        });

        // success => update last-success pointer
        lastSuccessOut = accumulatedContent;
        lastSuccessAgentName = gpt.name;
        finalAgentId = gpt.id;
        finalAgentName = gpt.name;
        finalModel = resolvedModel;
      } catch (error) {
        if (isAbortError(error) || runId !== activeRunIdRef.current) {
          streamUpdater?.cancel();
          throw createAbortError();
        }
        streamUpdater?.cancel();
        console.error(`AI ${gpt.name} error (sequential):`, error);
        const errorContent =
          error instanceof Error
            ? error.message
            : language === "zh"
              ? "请求失败，请稍后重试"
              : "Request failed. Please try again.";
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id
              ? {
                  ...r,
                  status: "error" as const,
                  content: errorContent,
                }
              : r
          )
        );
        allResponses.push({
          agentId: gpt.id,
          agentName: gpt.name,
          model: gpt.model,
          content: errorContent,
          status: "error",
          timestamp: new Date(),
        });
        // 失败 => 跳过，继续下一个模型（不更新lastSuccessOut）
        continue;
      }
    }

    return {
      finalAnswer: lastSuccessOut,
      finalAgentId,
      finalAgentName,
      finalModel,
      allResponses,
    };
  };

  // 并行模式处理（真实 API 调用）
  const handleParallelMode = async (
    sessionId: string,
    token: string,
    userMessage: string,
    promptByAgentId: Record<string, string>,
    runtimeAIs: AIAgent[],
    responses: AIResponse[],
    signal: AbortSignal,
    runId: number
  ): Promise<AIResponse[]> => {
    // ✅ 改进：从 responses 中提取 agentId，确保使用锁定的 AI
    // 而不是依赖外部的 selectedGPTs（可能被用户改变）
    const lockedAgentIds = responses.map(r => r.agentId);
    const aisByAgentId = new Map(runtimeAIs.map(ai => [ai.id, ai]));

    const promises = lockedAgentIds.map(async (agentId) => {
      if (signal.aborted || runId !== activeRunIdRef.current) {
        throw createAbortError();
      }
      const gpt = aisByAgentId.get(agentId);
      if (!gpt) {
        return {
          agentId,
          agentName: agentId,
          content: "Error: AI not found",
          status: "error" as const,
          timestamp: new Date(),
        } as AIResponse;
      }
      let streamUpdater: ReturnType<typeof createStreamFrameUpdater> | null = null;
      try {
        // 更新状态为处理中
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id ? { ...r, status: "processing" as const } : r
          )
        );
        streamUpdater = createStreamFrameUpdater((resp) => resp.agentId === gpt.id);

        // 调用真实 API
        console.log(`[Frontend] Sending request for model: ${gpt.model}`);
        const requestBody: Record<string, unknown> = {
          sessionId,
          message: promptByAgentId[gpt.id] || userMessage,
          model: gpt.model || "deepseek-chat",
          temperature: gpt.temperature || 0.7,
          maxTokens: gpt.maxTokens || 2048,
          agentName: gpt.name,
          skipSave: true,
        };
        if (!isSmartRuntimeAgent(gpt)) {
          requestBody.agentId = gpt.id;
        }

        const response = await fetch("/api/chat/send", {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        });

        console.log(
          `[Frontend] Response status: ${response.status} ${response.statusText}`
        );

        if (!response.ok) {
          const errorInfo = await readChatApiError(
            response,
            language === "zh" ? "聊天请求失败，请稍后重试" : "Chat request failed"
          );
          maybeShowSubscriptionModal(errorInfo.openSubscriptionModal);
          throw new Error(errorInfo.message);
        }

        // 处理 SSE 流式响应
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        const parser = new SSEJSONParser<any>();
        let accumulatedContent = "";
        let totalTokens = 0;
        let cost = 0;
        let resolvedModel = gpt.model;

        if (reader) {
          while (true) {
            if (signal.aborted || runId !== activeRunIdRef.current) {
              throw createAbortError();
            }
            const { done, value } = await reader.read();
            if (done) break;

            const events = parser.push(decoder.decode(value, { stream: true }));
            for (const data of events) {
              if (data.type === "content") {
                accumulatedContent += String(data.content || "");
                streamUpdater.enqueue({
                  content: accumulatedContent,
                  status: "processing",
                });
              } else if (data.type === "done") {
                totalTokens = (data.tokens as any)?.total || 0;
                cost = Number(data.cost || 0);
                if (typeof data.model === "string" && data.model.trim()) {
                  resolvedModel = data.model;
                }
              }
            }
          }

          for (const data of parser.push(decoder.decode())) {
            if (data.type === "content") {
              accumulatedContent += String(data.content || "");
              streamUpdater.enqueue({
                content: accumulatedContent,
                status: "processing",
              });
            } else if (data.type === "done") {
              totalTokens = (data.tokens as any)?.total || 0;
              cost = Number(data.cost || 0);
              if (typeof data.model === "string" && data.model.trim()) {
                resolvedModel = data.model;
              }
            }
          }

          for (const data of parser.flush()) {
            if (data.type === "content") {
              accumulatedContent += String(data.content || "");
              streamUpdater.enqueue({
                content: accumulatedContent,
                status: "processing",
              });
            } else if (data.type === "done") {
              totalTokens = (data.tokens as any)?.total || 0;
              cost = Number(data.cost || 0);
              if (typeof data.model === "string" && data.model.trim()) {
                resolvedModel = data.model;
              }
            }
          }
        }

        streamUpdater.flush();

        // 如果没有收到 tokens 信息，使用估算值
        if (!totalTokens && accumulatedContent) {
          totalTokens = Math.floor(accumulatedContent.length / 4);
        }

        // 标记为完成
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id
              ? {
                  ...r,
                  content: accumulatedContent,
                  model: resolvedModel,
                  tokens: totalTokens,
                  cost: cost,
                  status: "completed" as const,
                }
              : r
          )
        );

        // 返回完成的响应
        return {
          agentId: gpt.id,
          agentName: gpt.name,
          model: resolvedModel,
          content: accumulatedContent,
          tokens: totalTokens,
          cost: cost,
          status: "completed" as const,
          timestamp: new Date(),
        } as AIResponse;
      } catch (error) {
        if (isAbortError(error) || runId !== activeRunIdRef.current) {
          streamUpdater?.cancel();
          throw createAbortError();
        }
        streamUpdater?.cancel();
        console.error(`AI ${gpt.name} error:`, error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : language === "zh"
              ? "请求失败，请稍后重试"
              : "Request failed. Please try again.";
        setAIResponses((prev) =>
          prev.map((r) =>
            r.agentId === gpt.id
              ? { ...r, status: "error" as const, content: errorMessage }
              : r
          )
        );
        return {
          agentId: gpt.id,
          agentName: gpt.name,
          content: errorMessage,
          status: "error" as const,
          timestamp: new Date(),
        } as AIResponse;
      }
    });

    const results = await Promise.all(promises);

    if (signal.aborted || runId !== activeRunIdRef.current) {
      throw createAbortError();
    }

    // 返回最终的响应状态
    console.log("[handleParallelMode] Returning results:", results);
    return results;
  };

  const truncateForContext = (text: string, maxChars: number) => {
    if (!text) return "";
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + "\n\n(内容已截断)";
  };

  const buildGraphNodePrompt = (
    goal: string,
    node: { id: string; title: string; description: string; dependsOn?: string[] },
    depOutputs: Array<{ nodeId: string; title: string; output: string }>
  ) => {
    const inputs = depOutputs
      .map(
        (d) =>
          `【来自上游节点：${d.title} (${d.nodeId})】\n${truncateForContext(d.output, 2000)}`
      )
      .join("\n\n");

    return [
      "你正在作为多专家任务图中的一个节点执行子任务。",
      "请只产出该子任务的结果（可用 Markdown），避免输出无关解释。",
      "",
      `【总目标】\n${goal}`,
      "",
      `【当前子任务】\n${node.title}`,
      `【子任务说明】\n${node.description}`,
      "",
      depOutputs.length > 0 ? `【输入（上游输出，可能有错）】\n${inputs}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  };

  const runGraphNode = async (
    sessionId: string,
    token: string,
    nodeResp: AIResponse,
    runtimeAgentById: Map<string, AIAgent>,
    prompt: string,
    signal: AbortSignal,
    runId: number
  ) => {
    const nodeId = nodeResp.nodeId || "";
    const gpt = runtimeAgentById.get(nodeResp.agentId);
    if (!gpt) {
      throw new Error("AI not found");
    }

    setAIResponses((prev) =>
      prev.map((r) =>
        r.nodeId === nodeId
          ? { ...r, status: "processing" as const, content: "" }
          : r
      )
    );

    const requestBody: Record<string, unknown> = {
      sessionId,
      message: prompt,
      model: gpt.model || "deepseek-chat",
      temperature: gpt.temperature || 0.7,
      maxTokens: gpt.maxTokens || 2048,
      agentName: gpt.name,
      skipSave: true,
    };
    if (!isSmartRuntimeAgent(gpt)) {
      requestBody.agentId = gpt.id;
    }

    const response = await fetch("/api/chat/send", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorInfo = await readChatApiError(
        response,
        language === "zh" ? "聊天请求失败，请稍后重试" : "Chat request failed"
      );
      maybeShowSubscriptionModal(errorInfo.openSubscriptionModal);
      throw new Error(errorInfo.message);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    const parser = new SSEJSONParser<any>();
    let accumulatedContent = "";
    let totalTokens = 0;
    let cost = 0;
    let resolvedModel = gpt.model;
    const streamUpdater = createStreamFrameUpdater((resp) => resp.nodeId === nodeId);

    if (reader) {
      while (true) {
        if (signal.aborted || runId !== activeRunIdRef.current) {
          streamUpdater.cancel();
          throw createAbortError();
        }
        const { done, value } = await reader.read();
        if (done) break;
        const events = parser.push(decoder.decode(value, { stream: true }));

        for (const data of events) {
          if (data.type === "content") {
            accumulatedContent += String(data.content || "");
            streamUpdater.enqueue({
              content: accumulatedContent,
              status: "processing",
            });
          } else if (data.type === "done") {
            totalTokens = (data.tokens as any)?.total || 0;
            cost = Number(data.cost || 0);
            if (typeof data.model === "string" && data.model.trim()) {
              resolvedModel = data.model;
            }
          }
        }
      }

      for (const data of parser.push(decoder.decode())) {
        if (data.type === "content") {
          accumulatedContent += String(data.content || "");
          streamUpdater.enqueue({
            content: accumulatedContent,
            status: "processing",
          });
        } else if (data.type === "done") {
          totalTokens = (data.tokens as any)?.total || 0;
          cost = Number(data.cost || 0);
          if (typeof data.model === "string" && data.model.trim()) {
            resolvedModel = data.model;
          }
        }
      }

      for (const data of parser.flush()) {
        if (data.type === "content") {
          accumulatedContent += String(data.content || "");
          streamUpdater.enqueue({
            content: accumulatedContent,
            status: "processing",
          });
        } else if (data.type === "done") {
          totalTokens = (data.tokens as any)?.total || 0;
          cost = Number(data.cost || 0);
          if (typeof data.model === "string" && data.model.trim()) {
            resolvedModel = data.model;
          }
        }
      }
    }

    streamUpdater.flush();

    if (!totalTokens && accumulatedContent) {
      totalTokens = Math.floor(accumulatedContent.length / 4);
    }

    setAIResponses((prev) =>
      prev.map((r) =>
        r.nodeId === nodeId
          ? {
              ...r,
              content: accumulatedContent,
              model: resolvedModel,
              tokens: totalTokens,
              cost,
              status: "completed" as const,
            }
          : r
      )
    );

    return {
      content: accumulatedContent,
      tokens: totalTokens,
      cost,
      model: resolvedModel,
      agentName: gpt.name,
    };
  };

  const handleTaskGraphMode = async (
    sessionId: string,
    token: string,
    goal: string,
    lockedAIs: AIAgent[],
    promptByAgentId: Record<string, string>,
    templateHint?: string,
    signal?: AbortSignal,
    requestRunId?: number
  ): Promise<{
    spec: TaskGraphSpec;
    run: TaskGraphExecutionRun;
    nodeResponses: AIResponse[];
  }> => {
    const runtimeAgentById = new Map(lockedAIs.map((ai) => [ai.id, ai]));

    const planResponse = await fetch("/api/chat/plan", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sessionId,
        goal,
        templateHint,
        maxNodes: 10,
      }),
    });

    if (!planResponse.ok) {
      const txt = await planResponse.text();
      throw new Error(`Plan failed: ${planResponse.status} ${txt}`);
    }

    const planData = await planResponse.json();
    const spec = planData.spec as TaskGraphSpec;
    setActiveTaskGraphSpec(spec);

    const lockedIds = lockedAIs.map((a) => a.id);
    const nodesById = new Map(spec.nodes.map((n) => [n.id, n] as const));

    const initialNodeResponses: AIResponse[] = spec.nodes.map((node, idx) => {
      const assignedAgentId =
        node.agentId && lockedIds.includes(node.agentId)
          ? node.agentId
          : lockedAIs[idx % Math.max(1, lockedAIs.length)]?.id;

      const agent = lockedAIs.find((a) => a.id === assignedAgentId) ?? lockedAIs[0];
      return {
        agentId: agent?.id || assignedAgentId || "",
        agentName: agent?.name || "AI",
        model: agent?.model,
        content: "",
        status: "pending",
        timestamp: new Date(),
        nodeId: node.id,
        nodeTitle: node.title,
        dependsOn: node.dependsOn ?? [],
      };
    });

    setAIResponses(initialNodeResponses);

    const taskGraphRunId = `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const runCreatedAt = new Date().toISOString();
    const outputs = new Map<string, string>();

    const layers = topoLayers(spec);
    const maxConcurrency = 3;

    for (const layer of layers) {
      if (signal?.aborted || (typeof requestRunId === "number" && requestRunId !== activeRunIdRef.current)) {
        throw createAbortError();
      }
      for (let i = 0; i < layer.length; i += maxConcurrency) {
        const batch = layer.slice(i, i + maxConcurrency);

        await Promise.all(
          batch.map(async (nodeId) => {
            const node = nodesById.get(nodeId);
            if (!node) return;

            const current = initialNodeResponses.find((r) => r.nodeId === nodeId);
            if (!current) return;

            const deps = (node.dependsOn ?? []).map((depId) => {
              const dep = nodesById.get(depId);
              return {
                nodeId: depId,
                title: dep?.title || depId,
                output: outputs.get(depId) || "",
              };
            });

            const agentGoal = promptByAgentId[current.agentId] || goal;
            const prompt = buildGraphNodePrompt(agentGoal, node, deps);

            try {
              const result = await runGraphNode(
                sessionId,
                token,
                current,
                runtimeAgentById,
                prompt,
                signal || new AbortController().signal,
                typeof requestRunId === "number" ? requestRunId : activeRunIdRef.current
              );
              outputs.set(nodeId, result.content);
              // Keep local copy in sync (used later to build final nodeResponses)
              current.content = result.content;
              current.tokens = result.tokens;
              current.cost = result.cost;
              current.model = result.model;
              current.agentName = result.agentName;
              current.status = "completed";
              current.timestamp = new Date();
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              setAIResponses((prev) =>
                prev.map((r) =>
                  r.nodeId === nodeId
                    ? { ...r, status: "error" as const, content: msg }
                    : r
                )
              );
              current.status = "error";
              current.content = msg;
              current.timestamp = new Date();
            }
          })
        );
      }
    }

    const finishedAt = new Date().toISOString();
    const nodeResponses = initialNodeResponses.map((r) => ({ ...r }));

    const run: TaskGraphExecutionRun = {
      runId: taskGraphRunId,
      createdAt: runCreatedAt,
      finishedAt,
      nodes: nodeResponses.map((r) => ({
        nodeId: r.nodeId || "",
        status: r.status === "processing" ? "running" : r.status,
        agentId: r.agentId,
        agentName: r.agentName,
        model: r.model || "",
        startedAt: undefined,
        finishedAt: r.timestamp?.toISOString?.() ?? new Date().toISOString(),
        output: r.status === "completed" ? r.content : undefined,
        error: r.status === "error" ? r.content : undefined,
      })),
    };

    return { spec, run, nodeResponses };
  };


  const createSession = async (token: string, firstMessage: string): Promise<string> => {
    try {
      // 使用用户第一条消息作为标题,最多10个字符
      const title = firstMessage.length > 10
        ? firstMessage.substring(0, 10) + "..."
        : firstMessage;

      // 判断是否为多AI模式
      const isMultiAI = selectedGPTs.length > 1;

      const sessionData: any = {
        title: title,
        model: selectedGPTs[0]?.model || "gpt-3.5-turbo",
      };

      // ✅ 改进：无论单AI还是多AI，都传递配置参数
      // 这样后端能统一处理agentId验证
      sessionData.isMultiAI = isMultiAI;
      sessionData.selectedAgentIds = selectedGPTs.map(gpt => gpt.id);
      sessionData.collaborationMode = isMultiAI ? collaborationMode : "single";

      console.log(
        `[GPTWorkspace] Creating ${isMultiAI ? "multi-AI" : "single-AI"} session with agents:`,
        sessionData.selectedAgentIds
      );

      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(sessionData),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Session created:`, data.session);
      setSessionConfig(data.session.multi_ai_config || null);
      return data.session.id;
    } catch (error) {
      console.error("Failed to create session:", error);
      toast.error("创建会话失败", {
        description: "请稍后重试",
      });
      throw error;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processing":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-300";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processing":
        return <Loader2 className="w-3 h-3 text-white animate-spin" />;
      case "completed":
        return <CheckCircle2 className="w-3 h-3 text-white" />;
      case "error":
        return <AlertCircle className="w-3 h-3 text-white" />;
      default:
        return <Clock className="w-3 h-3 text-white" />;
    }
  };

  const isGraphResultMessage = (message: Message): boolean => {
    return Boolean((message as any)?.taskGraph?.spec);
  };

  const isResultHistoryMessage = (message: Message): boolean => {
    if (message?.role !== "assistant") return false;
    if (isGraphResultMessage(message)) return false;
    if (Array.isArray(message.content)) return message.content.length > 0;
    if (typeof message.content !== "string" || !message.content.trim()) return false;

    const meta = message as any;
    return Boolean(
      message.isMultiAI ||
        message.collaborationMode === "normal" ||
        message.collaborationMode === "parallel" ||
        message.collaborationMode === "sequential" ||
        message.collaborationMode === "deep" ||
        typeof meta?.finalAgentId === "string" ||
        typeof meta?.finalAgentName === "string"
    );
  };

  const toResultItems = (message: Message | null): AIResponse[] => {
    if (!message || message.role !== "assistant") return [];
    if (Array.isArray(message.content)) return message.content;

    const plainContent =
      typeof message.content === "string" ? message.content.trim() : "";
    if (!plainContent) return [];

    const meta = message as any;
    return [
      {
        agentId:
          typeof meta?.finalAgentId === "string" && meta.finalAgentId.trim()
            ? meta.finalAgentId
            : "single-agent",
        agentName:
          typeof meta?.finalAgentName === "string" && meta.finalAgentName.trim()
            ? meta.finalAgentName
            : language === "zh"
              ? "单模型结果"
              : "Single-model result",
        content: plainContent,
        model:
          typeof meta?.model === "string" && meta.model.trim()
            ? meta.model
            : undefined,
        status: "completed",
        timestamp: message.timestamp,
      },
    ];
  };

  const taskGraphMessages = messages.filter((m) => {
    if (m?.role !== "assistant") return false;
    if (!(m as any).taskGraph?.spec) return false;
    if (!Array.isArray(m.content)) return false;
    return true;
  });

  useEffect(() => {
    if (taskGraphMessages.length === 0) {
      setSelectedTaskGraphMessageId(null);
      return;
    }

    const exists = taskGraphMessages.some((m) => m.id === selectedTaskGraphMessageId);
    if (!exists) {
      setSelectedTaskGraphMessageId(taskGraphMessages[taskGraphMessages.length - 1].id);
    }
  }, [taskGraphMessages, selectedTaskGraphMessageId]);

  const activeTaskGraphMessage =
    taskGraphMessages.find((m) => m.id === selectedTaskGraphMessageId) ||
    taskGraphMessages[taskGraphMessages.length - 1] ||
    null;

  const activeTaskGraphNavSpec = (activeTaskGraphMessage as any)?.taskGraph
    ?.spec as TaskGraphSpec | undefined;

  const activeTaskGraphOrderedNodeIds = activeTaskGraphNavSpec
    ? topoLayers(activeTaskGraphNavSpec).flat()
    : [];

  const multiAIHistoryMessages = messages.filter((m) => {
    return isResultHistoryMessage(m);
  });

  useEffect(() => {
    if (multiAIHistoryMessages.length === 0) {
      setSelectedResultMessageId(null);
      return;
    }

    const exists = multiAIHistoryMessages.some(
      (m) => m.id === selectedResultMessageId
    );
    if (!exists) {
      setSelectedResultMessageId(
        multiAIHistoryMessages[multiAIHistoryMessages.length - 1].id
      );
    }
  }, [multiAIHistoryMessages, selectedResultMessageId]);

  const activeResultMessage =
    multiAIHistoryMessages.find((m) => m.id === selectedResultMessageId) ||
    multiAIHistoryMessages[multiAIHistoryMessages.length - 1] ||
    null;

  const activeResultItems = toResultItems(activeResultMessage);

  const showLiveResultNav =
    isCurrentSessionProcessing &&
    visibleAIResponses.length > 0 &&
    effectiveCollaborationMode !== "graph";

  const createAbortError = () => {
    const error = new Error("Request aborted");
    error.name = "AbortError";
    return error;
  };

  const isAbortError = (error: unknown): boolean => {
    return (
      (error instanceof Error && error.name === "AbortError") ||
      (typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "AbortError")
    );
  };

  const stopCurrentRun = (silent: boolean = false) => {
    activeRunIdRef.current += 1;

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    setIsProcessing(false);
    setProcessingSessionId(null);
    processingSessionIdRef.current = null;
    setAIResponses([]);
    setActiveTaskGraphSpec(null);

    if (!silent) {
      toast.success("已停止当前对话");
    }
  };

  const toggleFavoriteWithToast = (payload: {
    id: string;
    sessionId: string;
    anchorId: string;
    role: "user" | "assistant";
    preview: string;
  }) => {
    const isAlreadyFavorite = favorites.isFavorite(payload.id);
    favorites.toggle(payload);
    toast.success(
      language === "zh"
        ? isAlreadyFavorite
          ? "已取消收藏"
          : "已加入收藏"
        : isAlreadyFavorite
          ? "Removed from favorites"
          : "Added to favorites"
    );
  };

  const shareMessageByLink = async (content: string) => {
    try {
      if (typeof window === "undefined") return;
      const { token } = await getClientAuthToken();
      const response = await fetch("/api/share/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        id?: string;
        shareCode?: string;
        error?: string;
      };

      if (!response.ok || !json?.id) {
        throw new Error(json?.error || `HTTP ${response.status}`);
      }

      const targetPath = `/share/text?id=${encodeURIComponent(json.id)}`;
      const shareUrl =
        typeof json.shareCode === "string" && json.shareCode.trim()
          ? `${window.location.origin}/r/${encodeURIComponent(
              json.shareCode
            )}?source=share_text&to=${encodeURIComponent(targetPath)}`
          : `${window.location.origin}${targetPath}`;

      await navigator.clipboard.writeText(shareUrl);

      toast.success(
        language === "zh"
          ? "分享链接已复制，可发送给他人"
          : "Share link copied, send it to others"
      );
    } catch (error) {
      console.error("Failed to share by link:", error);
      toast.error(language === "zh" ? "分享失败" : "Share failed");
    }
  };

  const copyContent = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success(language === "zh" ? "已复制" : "Copied");
  };

  const downloadContent = (content: string) => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-response-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restoreTaskGraphNav = () => {
    setTaskGraphNavDismissed(false);
    if (currentSessionId) {
      try {
        localStorage.removeItem(`task-graph-nav-dismissed:${currentSessionId}`);
      } catch {
        // ignore
      }
    }
  };

  const restoreResultNav = () => {
    setResultNavDismissed(false);
    if (currentSessionId) {
      try {
        localStorage.removeItem(`multi-ai-nav-dismissed:${currentSessionId}`);
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
      <RightNavDock
        taskGraphMessages={taskGraphMessages}
        multiAIHistoryMessages={multiAIHistoryMessages}
        showLiveResultNav={showLiveResultNav}
        taskGraphNavDismissed={taskGraphNavDismissed}
        resultNavDismissed={resultNavDismissed}
        taskGraphNavOpen={taskGraphNavOpen}
        resultNavOpen={resultNavOpen}
        currentSessionId={currentSessionId}
        activeTaskGraphMessage={activeTaskGraphMessage}
        activeTaskGraphNavSpec={activeTaskGraphNavSpec}
        activeTaskGraphOrderedNodeIds={activeTaskGraphOrderedNodeIds}
        activeResultMessage={activeResultMessage}
        activeResultItems={activeResultItems}
        aiResponses={visibleAIResponses}
        language={language}
        getStatusColor={getStatusColor}
        getConversationPreview={getConversationPreview}
        getConversationAnchorId={getConversationAnchorId}
        getLiveResponseAnchorId={getLiveResponseAnchorId}
        getMultiAIResponseAnchorId={getMultiAIResponseAnchorId}
        onJumpToMessage={jumpToMessage}
        setTaskGraphNavOpen={setTaskGraphNavOpen}
        setTaskGraphNavDismissed={setTaskGraphNavDismissed}
        setSelectedTaskGraphMessageId={setSelectedTaskGraphMessageId}
        restoreTaskGraphNav={restoreTaskGraphNav}
        setResultNavOpen={setResultNavOpen}
        setResultNavDismissed={setResultNavDismissed}
        setSelectedResultMessageId={setSelectedResultMessageId}
        restoreResultNav={restoreResultNav}
      />

      <div className="relative flex-1 min-h-0">
        <div
          ref={chatContainerRef}
          onScroll={handleChatScroll}
          className="h-full overflow-y-auto p-2 sm:p-4 lg:p-6 pb-6 sm:pb-8 space-y-4 min-h-0"
        >
          <div className="max-w-4xl mx-auto w-full space-y-4">
            <WorkspaceMessageList
              messages={messages}
              selectedGPTs={selectedGPTs}
              isProcessing={showWorkspaceProcessing}
              isSessionLoading={isSessionHistoryLoading}
              t={t}
              availableAIs={availableAIs}
              currentSessionId={currentSessionId}
              language={language}
              getMessageAnchorId={getMessageAnchorId}
              getMultiAIResponseAnchorId={getMultiAIResponseAnchorId}
              buildFavoriteId={buildFavoriteId}
              isFavorite={favorites.isFavorite}
              toggleFavoriteWithToast={toggleFavoriteWithToast}
              shareMessageByLink={shareMessageByLink}
              getStatusColor={getStatusColor}
              getStatusIcon={getStatusIcon}
              onCopyContent={copyContent}
              onDownloadContent={downloadContent}
            />

            <LiveCollaborationPanel
              isProcessing={showWorkspaceProcessing}
              aiResponses={visibleAIResponses}
              showPreflightPlaceholder={showMultimodalPreprocessHint}
              effectiveCollaborationMode={effectiveCollaborationMode}
              activeTaskGraphSpec={visibleActiveTaskGraphSpec}
              taskGraphPresetId={taskGraphPresetId}
              language={language}
              t={t}
              getStatusColor={getStatusColor}
              getStatusIcon={getStatusIcon}
              getLiveResponseAnchorId={getLiveResponseAnchorId}
              onCopyContent={copyContent}
              onDownloadContent={downloadContent}
              shareMessageByLink={shareMessageByLink}
            />

            {/* 错误提示 */}
            {error && (
              <Card className="p-4 bg-red-50 border-red-200">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-800">{error}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const pending = lastFailedRequestRef.current;
                        setError(null);
                        if (!pending || isProcessing) return;
                        void handleSend({
                          input: pending.input,
                          attachments: pending.attachments,
                          sessionId: pending.sessionId,
                        });
                      }}
                      className="mt-2"
                    >
                      {t.workspace.retry}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      <ChatInputPanel
        input={input}
        setInput={setInput}
        placeholder={t.workspace.placeholder}
        selectedGPTs={selectedGPTs}
        setSelectedGPTs={setSelectedGPTs}
        availableAIs={availableAIs}
        currentSessionId={currentSessionId}
        sessionConfig={sessionConfig}
        effectiveCollaborationMode={effectiveCollaborationMode}
        setCollaborationMode={setCollaborationMode}
        modeMenuOpen={modeMenuOpen}
        setModeMenuOpen={setModeMenuOpen}
        onCollaborationModeChange={(mode) => {
          void handleCollaborationModeChange(mode);
        }}
        taskGraphPresetId={taskGraphPresetId}
        setTaskGraphPresetId={setTaskGraphPresetId}
        isProcessing={isProcessing}
        onSend={handleSend}
        onStop={() => stopCurrentRun(false)}
        language={language}
        attachments={attachments}
        isRecording={isRecordingAudio}
        recordingSeconds={recordingSeconds}
        onToggleRecording={() => {
          void toggleAudioRecording();
        }}
        onPickFiles={(files) => {
          void handlePickFiles(files);
        }}
        onRemoveAttachment={removeAttachment}
        onClearAttachments={clearAttachments}
      />
    </div>
  );
}
