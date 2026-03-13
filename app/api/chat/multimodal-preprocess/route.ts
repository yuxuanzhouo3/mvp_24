import OpenAI from "openai";
import { NextRequest } from "next/server";
import { extractTokenFromHeader, verifyAuthToken } from "@/lib/auth-utils";
import { isChinaRegion } from "@/lib/config/region";
import { resolveIntlUserPlan } from "@/lib/user-plan";
import {
  consumeQuota,
  getPlanMediaLimits,
  getWalletStats,
  seedWalletForPlan,
} from "@/services/wallet";
import type {
  MultimodalAttachmentPayload,
  MultimodalPreprocessResult,
} from "@/lib/chat/multimodal-types";
import {
  authorizeCreditUsage,
  buildCreditReservationErrorPayload,
  estimateTextMetrics,
  releaseCreditUsageReservation,
  settleCreditUsage,
} from "@/lib/billing/engine";
import type { AIMessage } from "@/lib/ai/types";
import { coercePlanId } from "@/lib/plan-quota-settings";
import { listModelCatalogEntries } from "@/lib/billing/catalog";
import {
  buildPreprocessUnavailableMessage,
  resolveIntlPreprocessModelCandidates,
  resolvePreprocessBillingModelKey,
  shouldRetryPreprocessModel,
} from "@/lib/chat/multimodal-preprocess-models";

export const runtime = "nodejs";

const MAX_ATTACHMENTS = 8;
const MAX_TEXT_PREVIEW_CHARS = 12000;
const MAX_DATA_URL_CHARS = 3 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 24 * 1024 * 1024;
const CN_QWEN_OMNI_MODEL = "qwen3-omni-flash";
const CN_QWEN_OMNI_AUDIO_MODEL = "qwen3-omni-flash-2025-12-01";

class MultimodalPreprocessRouteError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "MultimodalPreprocessRouteError";
    this.statusCode = statusCode;
  }
}

function sanitizeAttachment(raw: any): MultimodalAttachmentPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const mimeType = typeof raw.mimeType === "string" ? raw.mimeType.trim() : "";
  const size = typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0;
  const kind =
    raw.kind === "image" || raw.kind === "audio" || raw.kind === "video" || raw.kind === "file"
      ? raw.kind
      : null;
  const durationSeconds =
    typeof raw.durationSeconds === "number" && Number.isFinite(raw.durationSeconds)
      ? Math.max(0, raw.durationSeconds)
      : undefined;

  if (!id || !name || !kind) return null;

  const dataUrl =
    typeof raw.dataUrl === "string" && raw.dataUrl.length > 0
      ? raw.dataUrl.slice(0, MAX_DATA_URL_CHARS)
      : undefined;
  const textContent =
    typeof raw.textContent === "string" && raw.textContent.length > 0
      ? raw.textContent.slice(0, MAX_TEXT_PREVIEW_CHARS)
      : undefined;

  return {
    id,
    name,
    mimeType,
    size: Math.max(0, size),
    kind,
    durationSeconds,
    dataUrl,
    textContent,
  };
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function normalizePlanLower(raw: string): string {
  const value = (raw || "free").toLowerCase();
  if (value.includes("enterprise")) return "enterprise";
  if (value.includes("pro")) return "pro";
  if (value.includes("basic")) return "basic";
  return "free";
}

async function resolvePlanLowerForUser(userId: string, authUser: any): Promise<string> {
  if (!isChinaRegion()) {
    const plan = await resolveIntlUserPlan(userId, authUser?.user_metadata || {});
    return normalizePlanLower(plan);
  }

  try {
    const cloudbase = require("@cloudbase/node-sdk")
      .init({
        env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
        secretId: process.env.CLOUDBASE_SECRET_ID,
        secretKey: process.env.CLOUDBASE_SECRET_KEY,
      })
      .database();

    const result = await cloudbase
      .collection("subscriptions")
      .where({
        user_id: userId,
        status: "active",
      })
      .orderBy("current_period_end", "desc")
      .limit(1)
      .get();

    const latest = result?.data?.[0];
    if (latest && new Date(latest.current_period_end || 0) > new Date()) {
      return normalizePlanLower(String(latest.plan || latest.plan_id || "pro"));
    }
  } catch (error) {
    console.error("[multimodal-preprocess] resolve CN plan failed:", error);
  }

  return "free";
}

function countQuotaDemand(attachments: MultimodalAttachmentPayload[]) {
  let imageCount = 0;
  let videoAudioCount = 0;

  for (const attachment of attachments) {
    if (attachment.kind === "image") {
      imageCount += 1;
      continue;
    }
    if (attachment.kind === "audio" || attachment.kind === "video") {
      videoAudioCount += 1;
    }
  }

  return { imageCount, videoAudioCount };
}

function buildAttachmentDigest(attachments: MultimodalAttachmentPayload[]): string {
  if (attachments.length === 0) return "无附件";
  return attachments
    .map((item, idx) => {
      const lines = [
        `附件#${idx + 1}`,
        `- 名称: ${item.name}`,
        `- 类型: ${item.kind}`,
        `- MIME: ${item.mimeType || "unknown"}`,
        `- 大小: ${formatBytes(item.size)}`,
      ];
      if (item.textContent && item.textContent.trim()) {
        lines.push(`- 文本片段:\n${item.textContent.trim()}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function normalizeAudioFormat(format: string): string {
  const normalized = (format || "").toLowerCase().trim();
  if (!normalized) return "";

  if (normalized === "x-wav") return "wav";
  if (normalized === "mpeg" || normalized === "mpga") return "mp3";
  if (normalized === "m4a") return "mp4";

  return normalized;
}

function extractAudioData(dataUrl?: string): { format: string; dataUri: string } | null {
  if (!dataUrl || !dataUrl.startsWith("data:audio/")) return null;

  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex <= 0) return null;

  const meta = dataUrl.slice(5, commaIndex); // e.g. audio/webm;codecs=opus;base64
  const data = dataUrl.slice(commaIndex + 1);
  if (!meta || !data) return null;

  const metaParts = meta.split(";").map((part) => part.trim()).filter(Boolean);
  const typePart = metaParts[0] || "";
  const hasBase64 = metaParts.some((part) => part.toLowerCase() === "base64");
  if (!hasBase64 || !typePart.startsWith("audio/")) return null;

  const rawFormat = typePart.slice("audio/".length);
  const format = normalizeAudioFormat(rawFormat);
  if (!format) return null;

  return {
    format,
    dataUri: dataUrl,
  };
}

function buildPromptContext(message: string, attachments: MultimodalAttachmentPayload[]) {
  const userQuestion = message?.trim() || "用户没有输入文本，仅上传了附件。";
  const attachmentDigest = buildAttachmentDigest(attachments);
  const hasAudio = attachments.some((item) => item.kind === "audio");

  const outputRequirements = [
    "1) 先给出“关键信息摘要”；",
    "2) 再给出“可用于后续模型的事实清单”（编号列表）；",
    "3) 若附件信息不足，明确写出缺失项；",
    "4) 不要编造未出现的事实；",
  ];

  if (hasAudio) {
    outputRequirements.unshift("0) 若含音频，必须先给出“音频逐字转写”；");
    outputRequirements.push("5) 若有听不清片段，标注不清晰时间段，而不是直接放弃转写。");
  }

  return [
    "你是多模态预处理器，请将附件解析为可供其他文本模型继续推理的结构化摘要。",
    "输出要求：",
    ...outputRequirements,
    "",
    `用户原始问题：\n${userQuestion}`,
    "",
    `附件元信息：\n${attachmentDigest}`,
  ].join("\n");
}

function summarizePreprocessError(error: unknown) {
  const status = Number((error as any)?.status || 0);
  const message =
    (typeof (error as any)?.error?.message === "string" && (error as any).error.message) ||
    (typeof (error as any)?.message === "string" && (error as any).message) ||
    "Unknown error";

  return {
    status: status > 0 ? status : null,
    message,
  };
}

async function resolvePreprocessModels(
  attachments: MultimodalAttachmentPayload[],
): Promise<string[]> {
  const hasAudioAttachment = attachments.some(
    (item) => item.kind === "audio" || item.kind === "video",
  );
  if (isChinaRegion()) {
    return [hasAudioAttachment ? CN_QWEN_OMNI_AUDIO_MODEL : CN_QWEN_OMNI_MODEL];
  }

  const catalog = await listModelCatalogEntries("INTL");
  const candidates = resolveIntlPreprocessModelCandidates(catalog, attachments);
  if (candidates.length === 0) {
    throw new MultimodalPreprocessRouteError(
      buildPreprocessUnavailableMessage(attachments),
      503,
    );
  }
  return candidates.map((item) => item.modelKey);
}

function createPreprocessClient() {
  if (isChinaRegion()) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error("DASHSCOPE_API_KEY is not configured");
    }
    return new OpenAI({
      apiKey,
      baseURL:
        process.env.DASHSCOPE_BASE_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
  }

  const apiKey = process.env.OPENROUTER_API;
  if (!apiKey) {
    throw new Error("OPENROUTER_API is not configured");
  }

  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000",
      "X-Title": process.env.APP_NAME || "MultiGPT",
    },
  });
}

async function runMultimodalPreprocess(params: {
  userId: string;
  message: string;
  attachments: MultimodalAttachmentPayload[];
  candidateModels: string[];
}) {
  const { userId, message, attachments, candidateModels } = params;
  const hasAudioAttachment = attachments.some((item) => item.kind === "audio");
  const client = createPreprocessClient();

  const promptContext = buildPromptContext(message, attachments);
  const richParts: any[] = [{ type: "text", text: promptContext }];
  const attemptedModels: string[] = [];
  let lastError: unknown = null;
  let audioPayloadCount = 0;
  let textOnlyContext = promptContext;

  for (const attachment of attachments) {
    if (
      (attachment.kind === "image" || attachment.kind === "video") &&
      attachment.dataUrl
    ) {
      richParts.push({
        type: "image_url",
        image_url: { url: attachment.dataUrl },
      });
      continue;
    }

    if (attachment.kind === "audio" && attachment.dataUrl) {
      const audioData = extractAudioData(attachment.dataUrl);
      if (audioData) {
        audioPayloadCount += 1;
        richParts.push({
          type: "input_audio",
          input_audio: {
            data: audioData.dataUri,
            format: audioData.format,
          },
        });
      } else {
        console.warn(
          "[multimodal-preprocess] audio attachment dataUrl could not be parsed:",
          {
            name: attachment.name,
            mimeType: attachment.mimeType,
            dataUrlPrefix: attachment.dataUrl.slice(0, 48),
          }
        );
      }
    }
  }

  if (hasAudioAttachment && audioPayloadCount === 0) {
    console.warn(
      "[multimodal-preprocess] audio attachments exist but no parsable audio payload, fallback to metadata-only analysis"
    );
    textOnlyContext = [
      promptContext,
      "",
      "注意：当前请求未携带可解析音频数据，只提供了音频元信息。请不要编造逐字转写，并给出用户可执行的下一步建议。",
    ].join("\n");
  }

  const makeRequest = async (content: any, model: string) => {
    return client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "你负责把多模态输入转换成可供其他文本模型继续使用的高质量文本语义。请保持准确、简洁、结构化。",
        },
        {
          role: "user",
          content,
        },
      ] as any,
      temperature: 0.2,
      max_tokens: 1400,
      user: userId,
    });
  };

  const hasRichMediaPayload = richParts.some(
    (part) => part?.type === "image_url" || part?.type === "input_audio",
  );
  const requestContent = hasRichMediaPayload ? richParts : textOnlyContext;

  for (const candidateModel of candidateModels) {
    attemptedModels.push(candidateModel);
    try {
      const completion = await makeRequest(requestContent, candidateModel);
      const rawContent = completion?.choices?.[0]?.message?.content;
      const usage = {
        promptTokens: Math.max(0, Number(completion?.usage?.prompt_tokens || 0)),
        completionTokens: Math.max(0, Number(completion?.usage?.completion_tokens || 0)),
        totalTokens: Math.max(0, Number(completion?.usage?.total_tokens || 0)),
      };

      if (typeof rawContent === "string" && rawContent.trim()) {
        return {
          summary: rawContent.trim(),
          model: candidateModel,
          usage,
        };
      }
      if (Array.isArray(rawContent)) {
        const text = rawContent
          .map((part: any) =>
            typeof part === "string"
              ? part
              : typeof part?.text === "string"
                ? part.text
                : "",
          )
          .join("")
          .trim();
        if (text) {
          return {
            summary: text,
            model: candidateModel,
            usage,
          };
        }
      }

      lastError = new Error(`${candidateModel} returned empty content`);
      if (!shouldRetryPreprocessModel(lastError)) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      console.warn(
        "[multimodal-preprocess] candidate failed, trying next model if available:",
        {
          candidateModel,
          ...summarizePreprocessError(error),
        },
      );
      if (!shouldRetryPreprocessModel(error)) {
        throw error;
      }
    }
  }

  console.error("[multimodal-preprocess] all candidate models failed:", {
    attemptedModels,
    ...summarizePreprocessError(lastError),
  });
  throw new MultimodalPreprocessRouteError(
    buildPreprocessUnavailableMessage(attachments),
    503,
  );
}

function buildEnhancedMessage(
  userMessage: string,
  preprocessSummary: string,
  preprocessModel: string
) {
  const normalizedMessage = userMessage.trim() || "请基于附件内容完成分析。";
  return [
    normalizedMessage,
    "",
    `【多模态预处理结果（${preprocessModel}）】`,
    preprocessSummary,
    "",
    "请基于以上预处理结果继续推理并回答。如果信息不足，请明确指出。",
  ].join("\n");
}

async function buildMultimodalBillingMetrics(params: {
  message: string;
  attachments: MultimodalAttachmentPayload[];
  modelKey: string;
  maxTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
}) {
  const { message, attachments, modelKey, maxTokens, promptTokens, completionTokens } = params;
  const promptMessages: AIMessage[] = [
    { role: "user", content: buildPromptContext(message, attachments) },
  ];
  const estimatedTextMetrics = await estimateTextMetrics({
    messages: promptMessages,
    modelKey,
    maxTokens,
  });

  const imageCount = attachments.filter((item) => item.kind === "image").length;
  const audioSeconds = attachments
    .filter((item) => item.kind === "audio")
    .reduce((sum, item) => sum + Math.max(0, item.durationSeconds || 0), 0);
  const videoSeconds = attachments
    .filter((item) => item.kind === "video")
    .reduce((sum, item) => sum + Math.max(0, item.durationSeconds || 0), 0);
  return {
    input_tokens: promptTokens ?? (estimatedTextMetrics.input_tokens || 0),
    output_tokens: completionTokens ?? (estimatedTextMetrics.output_tokens || 0),
    image_count: imageCount,
    audio_input_seconds: audioSeconds,
    video_input_seconds: videoSeconds,
    request_count: 1,
  };
}

async function buildQuotaSnapshot(params: {
  planLower: string;
  wallet: Awaited<ReturnType<typeof getWalletStats>>;
}) {
  const { planLower, wallet } = params;
  if (!wallet) return undefined;
  const mediaLimits = await getPlanMediaLimits(planLower);
  const imageUsed = Math.max(0, mediaLimits.imageLimit - wallet.monthly.image);
  const videoUsed = Math.max(0, mediaLimits.videoLimit - wallet.monthly.video);

  return {
    image: {
      used: imageUsed,
      limit: mediaLimits.imageLimit + wallet.addon.image,
      remaining: wallet.total.image,
    },
    videoAudio: {
      used: videoUsed,
      limit: mediaLimits.videoLimit + wallet.addon.video,
      remaining: wallet.total.video,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);
    if (tokenError || !token) {
      return Response.json(
        { error: tokenError || "Unauthorized" },
        { status: 401 }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return Response.json(
        { error: authResult.error || "Invalid token" },
        { status: 401 }
      );
    }

    const userId = authResult.userId;
    const body = await req.json();
    const rawMessage = typeof body?.message === "string" ? body.message : "";
    const attachmentsInput = Array.isArray(body?.attachments) ? body.attachments : [];
    const attachments = attachmentsInput
      .slice(0, MAX_ATTACHMENTS)
      .map(sanitizeAttachment)
      .filter((item: MultimodalAttachmentPayload | null): item is MultimodalAttachmentPayload =>
        item !== null
      );
    const audioAttachments = attachments.filter(
      (item: MultimodalAttachmentPayload) => item.kind === "audio"
    );
    const totalAttachmentBytes = attachments.reduce(
      (sum: number, item: MultimodalAttachmentPayload) =>
        sum + Math.max(0, item.size || 0),
      0
    );

    if (attachments.length === 0) {
      const emptyResult: MultimodalPreprocessResult = {
        enhancedMessage: rawMessage.trim(),
        summary: "",
      };
      return Response.json({ success: true, ...emptyResult });
    }
    if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return Response.json(
        {
          error: "Attachments are too large",
          message: `Total attachment size exceeds ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)}`,
        },
        { status: 413 }
      );
    }

    if (
      audioAttachments.length > 0 &&
      !audioAttachments.some(
        (item: MultimodalAttachmentPayload) =>
          typeof item.dataUrl === "string" && item.dataUrl.startsWith("data:audio/")
      )
    ) {
      return Response.json(
        {
          error: "Audio payload missing",
          message: "音频未携带可识别数据，可能因文件过大。请缩短录音时长后重试。",
        },
        { status: 422 }
      );
    }

    const planLower = await resolvePlanLowerForUser(userId, authResult.user);
    await seedWalletForPlan(userId, planLower || "free");

    const { imageCount, videoAudioCount } = countQuotaDemand(attachments);
    const preprocessModels = await resolvePreprocessModels(attachments);
    const billingModelKey = resolvePreprocessBillingModelKey(preprocessModels[0] || "");
    const billingRequestId = `multimodal:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const estimatedMetrics = await buildMultimodalBillingMetrics({
      message: rawMessage,
      attachments,
      modelKey: billingModelKey,
      maxTokens: 1400,
    });

    const planId = coercePlanId(planLower);

    const reservation = await authorizeCreditUsage({
      userId,
      requestId: billingRequestId,
      planId,
      modelKey: billingModelKey,
      metrics: estimatedMetrics,
      metadata: { route: "chat/multimodal-preprocess" },
    });

    if (!reservation.success) {
      const payload = buildCreditReservationErrorPayload(reservation);
      return Response.json(payload, {
        status: reservation.failureCode === "reservation_failed" ? 503 : 402,
      });
    }

    let preprocessResult;
    try {
      preprocessResult = await runMultimodalPreprocess({
        userId,
        message: rawMessage,
        attachments,
        candidateModels: preprocessModels,
      });
    } catch (error) {
      await releaseCreditUsageReservation({
        userId,
        requestId: billingRequestId,
        reason: error instanceof Error ? error.message : "multimodal_preprocess_failed",
      }).catch(() => undefined);
      throw error;
    }

    const actualBillingModelKey = resolvePreprocessBillingModelKey(preprocessResult.model);
    const actualMetrics = await buildMultimodalBillingMetrics({
      message: rawMessage,
      attachments,
      modelKey: actualBillingModelKey,
      maxTokens: 1400,
      promptTokens: preprocessResult.usage?.promptTokens,
      completionTokens: preprocessResult.usage?.completionTokens,
    });

    const settlement = await settleCreditUsage({
      userId,
      requestId: billingRequestId,
      planId,
      modelKey: actualBillingModelKey,
      metrics: actualMetrics,
      metadata: { route: "chat/multimodal-preprocess" },
    });

    if (!settlement.success) {
      console.error("[multimodal-preprocess] Failed to settle credits:", settlement.error);
    }

    if (imageCount > 0 || videoAudioCount > 0) {
      const deduction = await consumeQuota({
        userId,
        imageCount,
        videoAudioCount,
      });
      if (!deduction.success) {
        console.warn("[multimodal-preprocess] Legacy quota mirror failed:", deduction.error);
      }
    }

    const wallet = await getWalletStats(userId);
    const result: MultimodalPreprocessResult = {
      enhancedMessage: buildEnhancedMessage(
        rawMessage,
        preprocessResult.summary,
        preprocessResult.model
      ),
      summary: preprocessResult.summary,
      quota: await buildQuotaSnapshot({ planLower, wallet }),
    };

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[multimodal-preprocess] API error:", error);
    const statusCode =
      error instanceof MultimodalPreprocessRouteError
        ? error.statusCode
        : 500;
    return Response.json(
      {
        error: "Failed to preprocess multimodal input",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: statusCode }
    );
  }
}
