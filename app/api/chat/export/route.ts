import cloudbase from "@cloudbase/node-sdk";
import { existsSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getGptMessages as getCloudBaseMessages } from "@/lib/cloudbase-db";
import { isChinaRegion } from "@/lib/config/region";
import { extractTokenFromHeader, verifyAuthToken } from "@/lib/auth-utils";
import {
  signChatExportToken,
  verifyChatExportToken,
  type ChatExportTokenPayload,
} from "@/lib/security/jwt";
import { supabaseAdmin } from "@/lib/supabase-admin";

const GET_MESSAGES_PAGE_RPC = "get_gpt_session_messages_page";
const MAX_EXPORT_SESSIONS = 100;
const PAGE_SIZE = 500;
export const runtime = "nodejs";
const PUPPETEER_EXECUTABLE_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter((value): value is string => typeof value === "string" && value.length > 0);

type ExportFormat = "markdown" | "pdf";
type ExportLanguage = "zh" | "en";

type ExportSession = {
  session: {
    id: string;
    title: string;
    model: string;
    created_at: string;
    updated_at: string;
  };
  messages: any[];
};

type IntlSessionRow = {
  id: string;
  title: string | null;
  model: string | null;
  created_at: string | null;
  updated_at: string | null;
  messages: any[] | null;
};

function isRpcMissing(error: any): boolean {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    error?.code === "PGRST202" ||
    text.includes("could not find the function") ||
    text.includes("does not exist")
  );
}

function getCloudBaseApp() {
  return cloudbase.init({
    env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY,
  });
}

function compactFragments(fragments: string[]) {
  const compacted: string[] = [];

  for (const fragment of fragments) {
    const text = fragment.replace(/\r\n/g, "\n").trim();
    if (!text) continue;
    if (compacted[compacted.length - 1] === text) continue;
    compacted.push(text);
  }

  return compacted;
}

function collectTextFragments(
  value: unknown,
  visited: WeakSet<object> = new WeakSet(),
  depth = 0
): string[] {
  if (depth > 8 || value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextFragments(item, visited, depth + 1));
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (visited.has(objectValue)) {
      return [];
    }
    visited.add(objectValue);

    const preferredKeys = [
      "text",
      "content",
      "message",
      "output",
      "answer",
      "result",
      "parts",
      "delta",
    ];

    let fragments: string[] = [];

    for (const key of preferredKeys) {
      if (key in objectValue) {
        fragments = fragments.concat(
          collectTextFragments(objectValue[key], visited, depth + 1)
        );
      }
    }

    if (fragments.length === 0) {
      fragments = Object.values(objectValue).flatMap((item) =>
        collectTextFragments(item, visited, depth + 1)
      );
    }

    return fragments;
  }

  return [];
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (content === null || content === undefined) {
    return "";
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((item: any) => {
        if (typeof item === "string") {
          return item.trim();
        }

        if (!item || typeof item !== "object") {
          return "";
        }

        const agentName =
          typeof item.agentName === "string"
            ? item.agentName
            : typeof item.agent_name === "string"
              ? item.agent_name
              : "";

        const source =
          (item as Record<string, unknown>).content ??
          (item as Record<string, unknown>).text ??
          (item as Record<string, unknown>).message ??
          item;

        const text = compactFragments(
          collectTextFragments(source, new WeakSet())
        ).join("\n");

        if (!text) {
          try {
            const fallback = JSON.stringify(item);
            return fallback === "{}" ? "" : fallback;
          } catch {
            return "";
          }
        }

        return agentName ? `[${agentName}] ${text}` : text;
      })
      .filter((item) => item.length > 0);

    return parts.join("\n\n");
  }

  if (typeof content === "object") {
    const fragments = compactFragments(collectTextFragments(content));
    if (fragments.length > 0) {
      return fragments.join("\n");
    }

    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return "";
    }
  }

  if (typeof content === "number" || typeof content === "boolean") {
    return String(content);
  }

  return "";
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(dateString: string | undefined, language: ExportLanguage) {
  if (!dateString) {
    return "";
  }

  const date = new Date(dateString);
  return date.toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getExportLabels(language: ExportLanguage) {
  if (language === "zh") {
    return {
      title: "📝 AI 对话导出",
      reportTitle: "📝 AI 对话导出报告",
      exportTime: "导出时间",
      sessionCount: "会话数量",
      totalMessages: "总消息数",
      model: "模型",
      createdAt: "创建时间",
      updatedAt: "更新时间",
      messageCount: "消息数量",
      noMessages: "暂无消息",
      user: "👤 用户",
      assistant: "🤖 AI助手",
      summary: "📊 统计摘要",
      totalSessions: "总会话数",
      totalTokens: "总Token数",
      totalCost: "总成本",
      printButton: "🖨️ 打印/保存为PDF",
      printConfirm: '点击确定打开打印对话框，选择"另存为PDF"保存文件',
      pdfOpened: "已打开导出预览，请使用浏览器打印功能保存为PDF",
    };
  }

  return {
    title: "📝 AI Chat Export",
    reportTitle: "📝 AI Chat Export Report",
    exportTime: "Export time",
    sessionCount: "Session count",
    totalMessages: "Total messages",
    model: "Model",
    createdAt: "Created at",
    updatedAt: "Updated at",
    messageCount: "Message count",
    noMessages: "No messages",
    user: "👤 User",
    assistant: "🤖 Assistant",
    summary: "📊 Summary",
    totalSessions: "Total sessions",
    totalTokens: "Total tokens",
    totalCost: "Total cost",
    printButton: "🖨️ Print / Save as PDF",
    printConfirm: 'Click OK to open the print dialog and choose "Save as PDF"',
    pdfOpened: "Export preview opened. Use your browser print dialog to save as PDF",
  };
}

function buildMarkdown(data: ExportSession[], language: ExportLanguage) {
  const labels = getExportLabels(language);
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const totalTokens = data.reduce(
    (sum, item) =>
      sum +
      item.messages.reduce(
        (messageSum: number, message: any) =>
          messageSum +
          (typeof message?.tokens_used === "number" ? message.tokens_used : 0),
        0
      ),
    0
  );
  const totalCost = data.reduce(
    (sum, item) =>
      sum +
      item.messages.reduce(
        (messageSum: number, message: any) =>
          messageSum + (typeof message?.cost_usd === "number" ? message.cost_usd : 0),
        0
      ),
    0
  );

  let markdown = `# ${labels.title}\n\n`;
  markdown += `**${labels.exportTime}**: ${new Date().toLocaleString(locale)}\n`;
  markdown += `**${labels.sessionCount}**: ${data.length}\n`;
  markdown += `**${labels.totalMessages}**: ${data.reduce(
    (sum, item) => sum + item.messages.length,
    0
  )}\n\n`;
  markdown += `---\n\n`;

  data.forEach(({ session, messages }, index) => {
    markdown += `## ${index + 1}. ${session.title}\n\n`;
    markdown += `- **${labels.model}**: ${session.model || "Unknown"}\n`;
    markdown += `- **${labels.createdAt}**: ${formatDate(session.created_at, language)}\n`;
    markdown += `- **${labels.updatedAt}**: ${formatDate(session.updated_at, language)}\n`;
    markdown += `- **${labels.messageCount}**: ${messages.length}\n\n`;

    if (messages.length === 0) {
      markdown += `> *${labels.noMessages}*\n\n`;
      return;
    }

    messages.forEach((message: any) => {
      const role = message.role === "user" ? labels.user : labels.assistant;
      const timestamp = formatDate(message.created_at || message.timestamp, language);
      const content = normalizeMessageContent(message.content);
      const metadata: string[] = [];

      markdown += `### ${role}${timestamp ? ` (${timestamp})` : ""}\n\n`;
      markdown += `${content || (language === "zh" ? "（空内容）" : "(Empty content)")}\n\n`;

      if (message.tokens_used) metadata.push(`Tokens: ${message.tokens_used}`);
      if (typeof message.cost_usd === "number") {
        metadata.push(`Cost: $${message.cost_usd.toFixed(6)}`);
      }
      if (message.model) metadata.push(`Model: ${message.model}`);

      if (metadata.length > 0) {
        markdown += `> ${metadata.join(" | ")}\n\n`;
      }

      markdown += `---\n\n`;
    });
  });

  markdown += `## ${labels.summary}\n\n`;
  markdown += `- **${labels.totalSessions}**: ${data.length}\n`;
  markdown += `- **${labels.totalMessages}**: ${data.reduce(
    (sum, item) => sum + item.messages.length,
    0
  )}\n`;
  if (totalTokens > 0) {
    markdown += `- **${labels.totalTokens}**: ${totalTokens.toLocaleString()}\n`;
  }
  if (totalCost > 0) {
    markdown += `- **${labels.totalCost}**: $${totalCost.toFixed(4)}\n`;
  }
  markdown += `- **${labels.exportTime}**: ${new Date().toLocaleString(locale)}\n`;

  return markdown;
}

export function buildPdfHtml(data: ExportSession[], language: ExportLanguage) {
  const labels = getExportLabels(language);
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const totalTokens = data.reduce(
    (sum, item) =>
      sum +
      item.messages.reduce(
        (messageSum: number, message: any) =>
          messageSum +
          (typeof message?.tokens_used === "number" ? message.tokens_used : 0),
        0
      ),
    0
  );
  const totalCost = data.reduce(
    (sum, item) =>
      sum +
      item.messages.reduce(
        (messageSum: number, message: any) =>
          messageSum + (typeof message?.cost_usd === "number" ? message.cost_usd : 0),
        0
      ),
    0
  );

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${labels.reportTitle}</title>
  <style>
    @page { size: A4; margin: 2cm; }
    @media print {
      body { font-size: 11pt; }
      .page-break { page-break-after: always; }
      .no-print { display: none; }
    }
    body {
      font-family: 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #2c3e50;
      border-bottom: 4px solid #3498db;
      padding-bottom: 12px;
      margin-bottom: 24px;
      font-size: 24pt;
    }
    h2 {
      color: #3498db;
      margin-top: 24px;
      margin-bottom: 12px;
      font-size: 18pt;
      border-left: 5px solid #3498db;
      padding-left: 12px;
    }
    .header-info,
    .summary {
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .header-info { background: #ecf0f1; }
    .summary {
      background: #fff3cd;
      border: 2px solid #ffc107;
      margin-top: 24px;
    }
    .session-meta {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 10pt;
    }
    .message {
      margin: 12px 0;
      padding: 12px;
      border-radius: 6px;
      border-left: 4px solid #ddd;
      page-break-inside: avoid;
    }
    .message.user { background: #e3f2fd; border-left-color: #2196f3; }
    .message.assistant { background: #f1f8e9; border-left-color: #4caf50; }
    .message-header { font-weight: 700; margin-bottom: 8px; }
    .message-content { white-space: pre-wrap; word-wrap: break-word; }
    .meta {
      color: #666;
      font-size: 9pt;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #e0e0e0;
    }
  </style>
</head>
<body>
  <h1>${labels.reportTitle}</h1>
  <div class="header-info">
    <p><strong>${labels.exportTime}:</strong> ${new Date().toLocaleString(locale)}</p>
    <p><strong>${labels.sessionCount}:</strong> ${data.length}</p>
    <p><strong>${labels.totalMessages}:</strong> ${data.reduce(
      (sum, item) => sum + item.messages.length,
      0
    )}</p>
  </div>`;

  data.forEach(({ session, messages }, index) => {
    html += `<h2>${index + 1}. ${escapeHtml(session.title)}</h2>`;
    html += `<div class="session-meta"><ul>`;
    html += `<li><strong>${labels.model}:</strong> ${escapeHtml(session.model || "Unknown")}</li>`;
    html += `<li><strong>${labels.createdAt}:</strong> ${escapeHtml(
      formatDate(session.created_at, language)
    )}</li>`;
    html += `<li><strong>${labels.updatedAt}:</strong> ${escapeHtml(
      formatDate(session.updated_at, language)
    )}</li>`;
    html += `<li><strong>${labels.messageCount}:</strong> ${messages.length}</li>`;
    html += `</ul></div>`;

    if (messages.length === 0) {
      html += `<div class="message assistant"><div class="message-content">${labels.noMessages}</div></div>`;
    } else {
      messages.forEach((message: any) => {
        const role = message.role === "user" ? labels.user : labels.assistant;
        const className = message.role === "user" ? "user" : "assistant";
        const timestamp = formatDate(message.created_at || message.timestamp, language);
        const content = normalizeMessageContent(message.content);
        const metadata: string[] = [];

        if (message.tokens_used) metadata.push(`Tokens: ${message.tokens_used}`);
        if (typeof message.cost_usd === "number") {
          metadata.push(`Cost: $${message.cost_usd.toFixed(6)}`);
        }
        if (message.model) metadata.push(`Model: ${message.model}`);

        html += `<div class="message ${className}">`;
        html += `<div class="message-header">${escapeHtml(role)}${
          timestamp ? ` - ${escapeHtml(timestamp)}` : ""
        }</div>`;
        html += `<div class="message-content">${escapeHtml(content).replace(/\n/g, "<br>")}</div>`;
        if (metadata.length > 0) {
          html += `<div class="meta">${escapeHtml(metadata.join(" | "))}</div>`;
        }
        html += `</div>`;
      });
    }

    if (index < data.length - 1) {
      html += `<div class="page-break"></div>`;
    }
  });

  html += `<div class="summary"><h2>${labels.summary}</h2><ul style="list-style: none; padding-left: 0;">`;
  html += `<li><strong>${labels.totalSessions}:</strong> ${data.length}</li>`;
  html += `<li><strong>${labels.totalMessages}:</strong> ${data.reduce(
    (sum, item) => sum + item.messages.length,
    0
  )}</li>`;
  if (totalTokens > 0) {
    html += `<li><strong>${labels.totalTokens}:</strong> ${totalTokens.toLocaleString()}</li>`;
  }
  if (totalCost > 0) {
    html += `<li><strong>${labels.totalCost}:</strong> $${totalCost.toFixed(4)}</li>`;
  }
  html += `<li><strong>${labels.exportTime}:</strong> ${new Date().toLocaleString(locale)}</li>`;
  html += `</ul></div>`;
  html += `</body></html>`;

  return html;
}

async function renderPdfBuffer(html: string): Promise<Buffer> {
  const puppeteerModule = await import("puppeteer");
  const puppeteer = (puppeteerModule as any).default ?? puppeteerModule;

  const launchOptions: Record<string, unknown> = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };

  const executablePath = PUPPETEER_EXECUTABLE_CANDIDATES.find((candidate) =>
    existsSync(candidate)
  );
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "18mm",
        right: "14mm",
        bottom: "18mm",
        left: "14mm",
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

async function getChinaExportSessions(
  userId: string,
  sessionIds: string[]
): Promise<ExportSession[]> {
  const db = getCloudBaseApp().database();
  const collection = db.collection("ai_conversations");
  const exported: ExportSession[] = [];

  for (const sessionId of sessionIds) {
    const sessionResult = await collection.doc(sessionId).get();
    const rawSession = Array.isArray(sessionResult?.data)
      ? sessionResult.data[0]
      : sessionResult?.data;

    if (!rawSession || rawSession.user_id !== userId) {
      continue;
    }

    const messages: any[] = [];
    let offset = 0;

    while (true) {
      const page = await getCloudBaseMessages(sessionId, PAGE_SIZE, offset);
      if (page.error) {
        throw page.error;
      }

      const pageMessages = Array.isArray(page.data) ? page.data : [];
      messages.push(...pageMessages);

      if (pageMessages.length < PAGE_SIZE) {
        break;
      }

      offset += pageMessages.length;
    }

    exported.push({
      session: {
        id: rawSession._id || rawSession.id || sessionId,
        title: rawSession.title || "Untitled Session",
        model: rawSession.model || "Unknown",
        created_at: rawSession.created_at || new Date().toISOString(),
        updated_at: rawSession.updated_at || rawSession.created_at || new Date().toISOString(),
      },
      messages,
    });
  }

  return exported;
}

async function getIntlMessages(sessionId: string, userId: string, fallbackMessages: any[]) {
  const messages: any[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin.rpc(GET_MESSAGES_PAGE_RPC, {
      p_session_id: sessionId,
      p_user_id: userId,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });

    if (error) {
      if (isRpcMissing(error)) {
        return Array.isArray(fallbackMessages) ? fallbackMessages : [];
      }
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : null;
    const pageMessages = Array.isArray(row?.messages) ? row.messages : [];
    const total = typeof row?.total === "number" ? row.total : Number(row?.total || 0);

    messages.push(...pageMessages);

    if (pageMessages.length === 0 || messages.length >= total) {
      break;
    }

    offset += pageMessages.length;
  }

  return messages;
}

async function getIntlExportSessions(
  userId: string,
  sessionIds: string[]
): Promise<ExportSession[]> {
  const { data: sessions, error } = await supabaseAdmin
    .from("gpt_sessions")
    .select("id, title, model, created_at, updated_at, messages")
    .eq("user_id", userId)
    .in("id", sessionIds);

  if (error) {
    throw error;
  }

  const typedSessions = (sessions || []) as IntlSessionRow[];
  const sessionMap = new Map<string, IntlSessionRow>(
    typedSessions.map((session) => [session.id, session])
  );

  const exported: ExportSession[] = [];
  for (const sessionId of sessionIds) {
    const session = sessionMap.get(sessionId);
    if (!session) {
      continue;
    }

    exported.push({
      session: {
        id: session.id,
        title: session.title || "Untitled Session",
        model: session.model || "Unknown",
        created_at: session.created_at || new Date().toISOString(),
        updated_at: session.updated_at || session.created_at || new Date().toISOString(),
      },
      messages: await getIntlMessages(session.id, userId, session.messages || []),
    });
  }

  return exported;
}

async function getExportSessions(payload: ChatExportTokenPayload) {
  if (payload.region === "CN") {
    return getChinaExportSessions(payload.userId, payload.sessionIds);
  }
  return getIntlExportSessions(payload.userId, payload.sessionIds);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return NextResponse.json(
        { error: tokenError || "Unauthorized" },
        { status: 401 }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const format: ExportFormat = body?.format === "pdf" ? "pdf" : "markdown";
    const language: ExportLanguage = body?.language === "en" ? "en" : "zh";
    const sessionIds: string[] = Array.isArray(body?.sessionIds)
      ? Array.from(
          new Set(
            body.sessionIds.filter(
              (sessionId: unknown): sessionId is string =>
                typeof sessionId === "string" && sessionId.trim().length > 0
            )
          )
        ).slice(0, MAX_EXPORT_SESSIONS)
      : [];

    if (sessionIds.length === 0) {
      return NextResponse.json({ error: "Missing sessionIds" }, { status: 400 });
    }

    const region = authResult.region || (isChinaRegion() ? "CN" : "INTL");
    const exportToken = signChatExportToken({
      userId: authResult.userId,
      region,
      sessionIds,
      format,
      language,
    });

    const origin = new URL(req.url).origin;
    return NextResponse.json({
      url: `${origin}/api/chat/export?token=${encodeURIComponent(exportToken)}`,
    });
  } catch (error) {
    console.error("Create export link failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    let payload: ChatExportTokenPayload;
    try {
      payload = verifyChatExportToken(token);
    } catch (error) {
      console.error("Verify export token failed:", error);
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const currentRegion = isChinaRegion() ? "CN" : "INTL";
    if (payload.region !== currentRegion) {
      return NextResponse.json({ error: "Region mismatch" }, { status: 400 });
    }

    const data = await getExportSessions(payload);
    if (data.length === 0) {
      return NextResponse.json({ error: "No exportable sessions found" }, { status: 404 });
    }

    const today = new Date().toISOString().split("T")[0];
    const language: ExportLanguage = payload.language === "en" ? "en" : "zh";

    if (payload.format === "markdown") {
      const filename = `ai-chat-${today}-${Date.now()}.md`;
      return new NextResponse(buildMarkdown(data, language), {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const filename = `ai-chat-${today}-${Date.now()}.pdf`;
    const pdfBuffer = await renderPdfBuffer(buildPdfHtml(data, language));
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Download export failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
