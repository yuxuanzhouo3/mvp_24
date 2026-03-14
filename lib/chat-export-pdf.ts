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
    };
  }

  return {
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
  };
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
