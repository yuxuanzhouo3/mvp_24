"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Download,
  Share2,
  FileText,
  Mail,
  MessageCircle,
  Webhook,
  Settings,
  CheckCircle,
  History,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { useGeo } from "@/components/geo-provider";
import { getAuthClient } from "@/lib/auth/client";
import { toast } from "sonner";

interface ChatSession {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message?: string;
}

interface ExportPanelProps {
  selectedGPTs: any[];
}

export function ExportPanel({ selectedGPTs }: ExportPanelProps) {
  const { language } = useLanguage();
  const t = useTranslations(language);
  const { isChina, isLoading: geoLoading } = useGeo();

  const [exportFormat, setExportFormat] = useState("markdown");
  const [shareTarget, setShareTarget] = useState(isChina ? "wechat" : "link");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  // 根据地理位置更新默认分享方式
  useEffect(() => {
    if (!geoLoading) {
      setShareTarget(isChina ? "wechat" : "link");
    }
  }, [isChina, geoLoading]);

  const loadSessions = async () => {
    try {
      setLoading(true);

      // 获取认证 token - 根据区域使用正确的认证客户端
      const authClient = getAuthClient();
      const { data: sessionData, error: sessionError } =
        await authClient.getSession();

      if (sessionError || !sessionData.session) {
        console.error("获取会话失败:", sessionError);
        toast.error(t.errors.loginRequired);
        setSessions([]);
        return;
      }

      const accessToken = sessionData.session.access_token;
      if (!accessToken) {
        console.error("没有访问令牌");
        toast.error(t.errors.loginRequired);
        setSessions([]);
        return;
      }

      // 调用真实 API
      const response = await fetch("/api/chat/sessions", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // 处理返回的数据
      const processedSessions = (data.sessions || []).map((s: any) => ({
        ...s,
        message_count: Array.isArray(s.gpt_messages)
          ? s.gpt_messages.length
          : 0,
      }));

      setSessions(processedSessions);
    } catch (error) {
      console.error("Failed to load sessions:", error);
      toast.error(t.errors.loadSessionsFailed);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSessionSelect = (sessionId: string, checked: boolean) => {
    if (checked) {
      setSelectedSessions((prev) => [...prev, sessionId]);
    } else {
      setSelectedSessions((prev) => prev.filter((id) => id !== sessionId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSessions(sessions.map((s) => s.id));
    } else {
      setSelectedSessions([]);
    }
  };

  const selectedSessionData = sessions.filter((s) =>
    selectedSessions.includes(s.id)
  );
  const totalMessages = selectedSessionData.reduce(
    (sum, s) => sum + (s.message_count || 0),
    0
  );
  const totalTokens = selectedSessionData.length * 2847; // 模拟数据
  const totalDuration = selectedSessionData.length * 15; // 模拟数据

  const exportFormats = [
    {
      id: "pdf",
      name: t.export.formats.pdf,
      icon: FileText,
      description: t.export.formatDescriptions.pdf,
    },
    {
      id: "docx",
      name: t.export.formats.docx,
      icon: FileText,
      description: t.export.formatDescriptions.docx,
    },
    {
      id: "markdown",
      name: t.export.formats.markdown,
      icon: FileText,
      description: t.export.formatDescriptions.markdown,
    },
  ];

  const shareOptions = [
    {
      id: "link",
      name: t.export.shareChannels.link,
      icon: Share2,
      color: "bg-blue-500",
      description: t.export.shareDescriptions.link,
    },
    {
      id: "email",
      name: t.export.shareChannels.email,
      icon: Mail,
      color: "bg-red-500",
      description: t.export.shareDescriptions.email,
    },
    // 根据 IP 地区显示中国特定的分享选项
    ...(isChina
      ? [
          {
            id: "wechat",
            name: t.export.shareChannels.wechat,
            icon: MessageCircle,
            color: "bg-green-500",
            description: t.export.shareDescriptions.wechat,
          },
          {
            id: "dingtalk",
            name: t.export.shareChannels.dingtalk,
            icon: MessageCircle,
            color: "bg-blue-600",
            description: t.export.shareDescriptions.dingtalk,
          },
        ]
      : []),
  ];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleExport = async () => {
    if (selectedSessions.length === 0) {
      toast.error(t.export.selectSessionsFirst);
      return;
    }

    try {
      // 获取认证 token - 根据区域使用正确的认证客户端
      const authClient = getAuthClient();
      const { data: sessionData, error: sessionError } =
        await authClient.getSession();

      if (sessionError || !sessionData.session) {
        console.error("获取会话失败:", sessionError);
        toast.error("请先登录");
        return;
      }

      const accessToken = sessionData.session.access_token;
      if (!accessToken) {
        console.error("没有访问令牌");
        toast.error("请先登录");
        return;
      }

      toast.loading(t.exportMessages.exporting);

      // 获取所有选中会话的消息
      const allMessages: any[] = [];
      for (const sessionId of selectedSessions) {
        const response = await fetch(
          `/api/chat/sessions/${sessionId}/messages`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const sessionData = sessions.find((s) => s.id === sessionId);
          allMessages.push({
            session: sessionData,
            messages: data.messages || [],
          });
        }
      }

      // 根据格式导出
      if (exportFormat === "markdown") {
        exportAsMarkdown(allMessages);
      } else if (exportFormat === "docx") {
        exportAsDocx(allMessages);
      } else if (exportFormat === "pdf") {
        exportAsPdf(allMessages);
      }

      toast.dismiss();
      toast.success(t.export.exportSuccess);
    } catch (error) {
      console.error("Export failed:", error);
      toast.dismiss();
      toast.error(t.export.exportFailed);
    }
  };

  const exportAsMarkdown = (data: any[]) => {
    let markdown = `# 📝 AI 对话导出\n\n`;
    markdown += `**导出时间**: ${new Date().toLocaleString(
      language === "zh" ? "zh-CN" : "en-US"
    )}\n`;
    markdown += `**会话数量**: ${data.length}\n`;
    markdown += `**总消息数**: ${data.reduce(
      (sum, d) => sum + d.messages.length,
      0
    )}\n\n`;
    markdown += `---\n\n`;

    data.forEach(({ session, messages }, index) => {
      markdown += `## ${index + 1}. ${session.title}\n\n`;
      markdown += `- **模型**: ${session.model || "Unknown"}\n`;
      markdown += `- **创建时间**: ${formatDate(session.created_at)}\n`;
      markdown += `- **更新时间**: ${formatDate(session.updated_at)}\n`;
      markdown += `- **消息数量**: ${messages.length}\n\n`;

      if (messages.length === 0) {
        markdown += `> *暂无消息*\n\n`;
      } else {
        messages.forEach((msg: any, msgIndex: number) => {
          const role = msg.role === "user" ? "👤 用户" : "🤖 AI助手";
          const timestamp = msg.created_at ? formatDate(msg.created_at) : "";

          markdown += `### ${role}${timestamp ? ` (${timestamp})` : ""}\n\n`;
          markdown += `${msg.content}\n\n`;

          // 添加元数据
          const metadata = [];
          if (msg.tokens_used) metadata.push(`Tokens: ${msg.tokens_used}`);
          if (msg.cost_usd) metadata.push(`Cost: $${msg.cost_usd.toFixed(6)}`);
          if (msg.model) metadata.push(`Model: ${msg.model}`);

          if (metadata.length > 0) {
            markdown += `> ${metadata.join(" | ")}\n\n`;
          }

          markdown += `---\n\n`;
        });
      }

      markdown += `\n`;
    });

    // 添加统计摘要
    const totalTokens = data.reduce(
      (sum, d) =>
        sum +
        d.messages.reduce((s: number, m: any) => s + (m.tokens_used || 0), 0),
      0
    );
    const totalCost = data.reduce(
      (sum, d) =>
        sum +
        d.messages.reduce((s: number, m: any) => s + (m.cost_usd || 0), 0),
      0
    );

    markdown += `\n---\n\n## 📊 统计摘要\n\n`;
    markdown += `- **总会话数**: ${data.length}\n`;
    markdown += `- **总消息数**: ${data.reduce(
      (sum, d) => sum + d.messages.length,
      0
    )}\n`;
    if (totalTokens > 0)
      markdown += `- **总Token数**: ${totalTokens.toLocaleString()}\n`;
    if (totalCost > 0) markdown += `- **总成本**: $${totalCost.toFixed(4)}\n`;
    markdown += `- **导出时间**: ${new Date().toLocaleString(
      language === "zh" ? "zh-CN" : "en-US"
    )}\n`;

    // 下载文件
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = `ai-chat-${
      new Date().toISOString().split("T")[0]
    }-${Date.now()}.md`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAsDocx = (data: any[]) => {
    // 生成更专业的HTML，兼容Word导入
    let html = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="UTF-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="Microsoft Word 15">
  <meta name="Originator" content="Microsoft Word 15">
  <title>AI 对话导出</title>
  <style>
    @page {
      size: A4;
      margin: 2.5cm;
    }
    body { 
      font-family: 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 21cm;
      margin: 0 auto;
      padding: 20px;
    }
    h1 { 
      color: #2c3e50;
      border-bottom: 4px solid #3498db;
      padding-bottom: 12px;
      margin-bottom: 24px;
      font-size: 28px;
    }
    h2 { 
      color: #3498db;
      margin-top: 32px;
      margin-bottom: 16px;
      font-size: 22px;
      border-left: 5px solid #3498db;
      padding-left: 12px;
    }
    h3 {
      color: #555;
      margin-top: 16px;
      margin-bottom: 8px;
      font-size: 16px;
    }
    .header-info {
      background: #ecf0f1;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .header-info p {
      margin: 4px 0;
    }
    .session-meta {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 14px;
    }
    .session-meta ul {
      margin: 0;
      padding-left: 20px;
    }
    .message { 
      margin: 16px 0;
      padding: 16px;
      border-radius: 8px;
      border-left: 4px solid #ddd;
      page-break-inside: avoid;
    }
    .message.user { 
      background: #e3f2fd;
      border-left-color: #2196f3;
    }
    .message.assistant { 
      background: #f1f8e9;
      border-left-color: #4caf50;
    }
    .message-header {
      font-weight: bold;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .message-content {
      white-space: pre-wrap;
      word-wrap: break-word;
      line-height: 1.8;
    }
    .meta { 
      color: #666;
      font-size: 12px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #e0e0e0;
    }
    .summary {
      background: #fff3cd;
      padding: 20px;
      border-radius: 8px;
      margin-top: 32px;
      border: 2px solid #ffc107;
    }
    .summary h2 {
      border-left: none;
      color: #856404;
      margin-top: 0;
    }
    .summary ul {
      list-style: none;
      padding-left: 0;
    }
    .summary li {
      padding: 4px 0;
    }
    .page-break {
      page-break-after: always;
    }
    @media print {
      body {
        font-size: 12pt;
      }
    }
  </style>
</head>
<body>
  <h1>📝 AI 对话导出报告</h1>
  
  <div class="header-info">
    <p><strong>📅 导出时间:</strong> ${new Date().toLocaleString(
      language === "zh" ? "zh-CN" : "en-US"
    )}</p>
    <p><strong>📊 会话数量:</strong> ${data.length}</p>
    <p><strong>💬 总消息数:</strong> ${data.reduce(
      (sum, d) => sum + d.messages.length,
      0
    )}</p>
  </div>
`;

    const totalTokens = data.reduce(
      (sum, d) =>
        sum +
        d.messages.reduce((s: number, m: any) => s + (m.tokens_used || 0), 0),
      0
    );
    const totalCost = data.reduce(
      (sum, d) =>
        sum +
        d.messages.reduce((s: number, m: any) => s + (m.cost_usd || 0), 0),
      0
    );

    data.forEach(({ session, messages }, index) => {
      html += `<h2>${index + 1}. ${session.title}</h2>`;

      html += `<div class="session-meta">`;
      html += `<ul>`;
      html += `<li><strong>模型:</strong> ${session.model || "Unknown"}</li>`;
      html += `<li><strong>创建时间:</strong> ${formatDate(
        session.created_at
      )}</li>`;
      html += `<li><strong>更新时间:</strong> ${formatDate(
        session.updated_at
      )}</li>`;
      html += `<li><strong>消息数量:</strong> ${messages.length}</li>`;
      html += `</ul>`;
      html += `</div>`;

      if (messages.length === 0) {
        html += `<p style="color: #999; font-style: italic;">暂无消息</p>`;
      } else {
        messages.forEach((msg: any) => {
          const role = msg.role === "user" ? "👤 用户" : "🤖 AI助手";
          const className = msg.role === "user" ? "user" : "assistant";
          const timestamp = msg.created_at ? formatDate(msg.created_at) : "";

          html += `<div class="message ${className}">`;
          html += `<div class="message-header">${role}${
            timestamp ? ` - ${timestamp}` : ""
          }</div>`;
          html += `<div class="message-content">${msg.content
            .replace(/\n/g, "<br>")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</div>`;

          const metadata = [];
          if (msg.tokens_used) metadata.push(`Tokens: ${msg.tokens_used}`);
          if (msg.cost_usd) metadata.push(`Cost: $${msg.cost_usd.toFixed(6)}`);
          if (msg.model) metadata.push(`Model: ${msg.model}`);

          if (metadata.length > 0) {
            html += `<div class="meta">${metadata.join(" | ")}</div>`;
          }

          html += `</div>`;
        });
      }

      // 每个会话后添加分页符（除了最后一个）
      if (index < data.length - 1) {
        html += `<div class="page-break"></div>`;
      }
    });

    // 添加统计摘要
    html += `<div class="summary">`;
    html += `<h2>📊 统计摘要</h2>`;
    html += `<ul>`;
    html += `<li><strong>总会话数:</strong> ${data.length}</li>`;
    html += `<li><strong>总消息数:</strong> ${data.reduce(
      (sum, d) => sum + d.messages.length,
      0
    )}</li>`;
    if (totalTokens > 0)
      html += `<li><strong>总Token数:</strong> ${totalTokens.toLocaleString()}</li>`;
    if (totalCost > 0)
      html += `<li><strong>总成本:</strong> $${totalCost.toFixed(4)}</li>`;
    html += `<li><strong>导出时间:</strong> ${new Date().toLocaleString(
      language === "zh" ? "zh-CN" : "en-US"
    )}</li>`;
    html += `</ul>`;
    html += `</div>`;

    html += `</body></html>`;

    const blob = new Blob(["\ufeff", html], {
      type: "application/msword;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = `ai-chat-${
      new Date().toISOString().split("T")[0]
    }-${Date.now()}.doc`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAsPdf = (data: any[]) => {
    // 使用浏览器打印功能生成PDF
    const totalTokens = data.reduce(
      (sum, d) =>
        sum +
        d.messages.reduce((s: number, m: any) => s + (m.tokens_used || 0), 0),
      0
    );
    const totalCost = data.reduce(
      (sum, d) =>
        sum +
        d.messages.reduce((s: number, m: any) => s + (m.cost_usd || 0), 0),
      0
    );

    let printContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>AI 对话导出 - PDF</title>
  <style>
    @page {
      size: A4;
      margin: 2cm;
    }
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
    .header-info {
      background: #ecf0f1;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .header-info p { margin: 4px 0; }
    .session-meta {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 10pt;
    }
    .session-meta ul {
      margin: 0;
      padding-left: 20px;
    }
    .message { 
      margin: 12px 0;
      padding: 12px;
      border-radius: 6px;
      border-left: 4px solid #ddd;
      page-break-inside: avoid;
    }
    .message.user { 
      background: #e3f2fd;
      border-left-color: #2196f3;
    }
    .message.assistant { 
      background: #f1f8e9;
      border-left-color: #4caf50;
    }
    .message-header {
      font-weight: bold;
      margin-bottom: 8px;
      font-size: 11pt;
    }
    .message-content {
      white-space: pre-wrap;
      word-wrap: break-word;
      line-height: 1.6;
    }
    .meta { 
      color: #666;
      font-size: 9pt;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #e0e0e0;
    }
    .summary {
      background: #fff3cd;
      padding: 16px;
      border-radius: 8px;
      margin-top: 24px;
      border: 2px solid #ffc107;
    }
    .summary h2 {
      border-left: none;
      color: #856404;
      margin-top: 0;
    }
    .print-button {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 24px;
      background: #3498db;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .print-button:hover {
      background: #2980b9;
    }
  </style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">🖨️ 打印/保存为PDF</button>
  
  <h1>📝 AI 对话导出报告</h1>
  
  <div class="header-info">
    <p><strong>📅 导出时间:</strong> ${new Date().toLocaleString(
      language === "zh" ? "zh-CN" : "en-US"
    )}</p>
    <p><strong>📊 会话数量:</strong> ${data.length}</p>
    <p><strong>💬 总消息数:</strong> ${data.reduce(
      (sum, d) => sum + d.messages.length,
      0
    )}</p>
  </div>
`;

    data.forEach(({ session, messages }, index) => {
      printContent += `<h2>${index + 1}. ${session.title}</h2>`;

      printContent += `<div class="session-meta">`;
      printContent += `<ul>`;
      printContent += `<li><strong>模型:</strong> ${
        session.model || "Unknown"
      }</li>`;
      printContent += `<li><strong>创建时间:</strong> ${formatDate(
        session.created_at
      )}</li>`;
      printContent += `<li><strong>更新时间:</strong> ${formatDate(
        session.updated_at
      )}</li>`;
      printContent += `<li><strong>消息数量:</strong> ${messages.length}</li>`;
      printContent += `</ul>`;
      printContent += `</div>`;

      if (messages.length > 0) {
        messages.forEach((msg: any) => {
          const role = msg.role === "user" ? "👤 用户" : "🤖 AI助手";
          const className = msg.role === "user" ? "user" : "assistant";
          const timestamp = msg.created_at ? formatDate(msg.created_at) : "";

          printContent += `<div class="message ${className}">`;
          printContent += `<div class="message-header">${role}${
            timestamp ? ` - ${timestamp}` : ""
          }</div>`;
          printContent += `<div class="message-content">${msg.content
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>")}</div>`;

          const metadata = [];
          if (msg.tokens_used) metadata.push(`Tokens: ${msg.tokens_used}`);
          if (msg.cost_usd) metadata.push(`Cost: $${msg.cost_usd.toFixed(6)}`);
          if (msg.model) metadata.push(`Model: ${msg.model}`);

          if (metadata.length > 0) {
            printContent += `<div class="meta">${metadata.join(" | ")}</div>`;
          }

          printContent += `</div>`;
        });
      }

      if (index < data.length - 1) {
        printContent += `<div class="page-break"></div>`;
      }
    });

    printContent += `<div class="summary">`;
    printContent += `<h2>📊 统计摘要</h2>`;
    printContent += `<ul style="list-style: none; padding-left: 0;">`;
    printContent += `<li><strong>总会话数:</strong> ${data.length}</li>`;
    printContent += `<li><strong>总消息数:</strong> ${data.reduce(
      (sum, d) => sum + d.messages.length,
      0
    )}</li>`;
    if (totalTokens > 0)
      printContent += `<li><strong>总Token数:</strong> ${totalTokens.toLocaleString()}</li>`;
    if (totalCost > 0)
      printContent += `<li><strong>总成本:</strong> $${totalCost.toFixed(
        4
      )}</li>`;
    printContent += `<li><strong>导出时间:</strong> ${new Date().toLocaleString(
      language === "zh" ? "zh-CN" : "en-US"
    )}</li>`;
    printContent += `</ul>`;
    printContent += `</div>`;

    printContent += `
  <script>
    // 提示用户
    setTimeout(() => {
      if (confirm('${
        language === "zh"
          ? '点击确定打开打印对话框，选择"另存为PDF"保存文件'
          : 'Click OK to open print dialog, select "Save as PDF" to save file'
      }')) {
        window.print();
      }
    }, 500);
  </script>
</body>
</html>`;

    // 在新窗口打开打印预览
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      toast.success(
        language === "zh"
          ? "已打开PDF预览，请使用浏览器的打印功能保存为PDF"
          : "PDF preview opened, use browser print to save as PDF"
      );
    } else {
      toast.error(
        language === "zh"
          ? "无法打开新窗口，请允许弹出窗口"
          : "Cannot open new window, please allow popups"
      );
    }
  };

  const handleShare = async () => {
    if (selectedSessions.length === 0) {
      toast.error(t.export.selectSessionsToShare);
      return;
    }

    try {
      // 获取认证 token - 根据区域使用正确的认证客户端
      const authClient = getAuthClient();
      const { data: sessionData, error: sessionError } =
        await authClient.getSession();

      if (sessionError || !sessionData.session) {
        console.error("获取会话失败:", sessionError);
        toast.error("请先登录");
        return;
      }

      const accessToken = sessionData.session.access_token;
      if (!accessToken) {
        console.error("没有访问令牌");
        toast.error("请先登录");
        return;
      }

      toast.loading(t.exportMessages.sharing);

      // 获取所有选中会话的消息
      const allMessages: any[] = [];
      for (const sessionId of selectedSessions) {
        const response = await fetch(
          `/api/chat/sessions/${sessionId}/messages`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const sessionData = sessions.find((s) => s.id === sessionId);
          allMessages.push({
            session: sessionData,
            messages: data.messages || [],
          });
        }
      }

      // 根据分享目标执行不同操作
      if (shareTarget === "link") {
        shareAsLink(allMessages);
      } else if (shareTarget === "email") {
        shareToEmail(allMessages);
      } else if (shareTarget === "wechat") {
        shareToWeChat(allMessages);
      } else if (shareTarget === "dingtalk") {
        shareToDingTalk(allMessages);
      }

      toast.dismiss();
    } catch (error) {
      console.error("Share failed:", error);
      toast.dismiss();
      toast.error(t.export.shareFailed);
    }
  };

  // 生成分享链接（通用方式）
  const shareAsLink = (data: any[]) => {
    // 生成简洁的分享文本摘要
    const summary = {
      title: language === "zh" ? "AI 对话分享" : "AI Chat Share",
      sessionCount: data.length,
      messageCount: data.reduce((sum, d) => sum + d.messages.length, 0),
      exportTime: new Date().toISOString(),
      sessions: data.map(({ session, messages }) => ({
        title: session.title,
        messageCount: messages.length,
        firstMessage:
          messages.length > 0 ? messages[0].content.substring(0, 100) : "",
      })),
    };

    // 生成易读的分享文本
    let shareText = `📝 ${summary.title}\n\n`;
    shareText +=
      language === "zh"
        ? `共 ${summary.sessionCount} 个会话，${summary.messageCount} 条消息\n\n`
        : `${summary.sessionCount} sessions, ${summary.messageCount} messages\n\n`;

    summary.sessions.forEach((s, index) => {
      shareText += `${index + 1}. ${s.title}\n`;
      shareText +=
        language === "zh"
          ? `   ${s.messageCount} 条消息\n`
          : `   ${s.messageCount} messages\n`;
      if (s.firstMessage) {
        shareText += `   ${s.firstMessage}${
          s.firstMessage.length >= 100 ? "..." : ""
        }\n`;
      }
      shareText += `\n`;
    });

    shareText += `\n${
      language === "zh" ? "导出时间" : "Export time"
    }: ${new Date().toLocaleString(language === "zh" ? "zh-CN" : "en-US")}`;

    // 尝试使用 Web Share API（现代浏览器支持）
    if (navigator.share) {
      navigator
        .share({
          title: summary.title,
          text: shareText,
        })
        .then(() => {
          toast.success(
            language === "zh" ? "分享成功！" : "Shared successfully!"
          );
        })
        .catch((error) => {
          if (error.name !== "AbortError") {
            // 用户取消不算错误
            console.error("Share failed:", error);
            // 降级到复制
            fallbackCopyToClipboard(shareText);
          }
        });
    } else {
      // 不支持 Web Share API，复制到剪贴板
      fallbackCopyToClipboard(shareText);
    }
  };

  // 降级方案：复制到剪贴板
  const fallbackCopyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success(
          language === "zh"
            ? "已复制到剪贴板！可粘贴到任意平台分享"
            : "Copied to clipboard! Paste to share on any platform"
        );
      })
      .catch(() => {
        // 最后的降级方案：显示文本框
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand("copy");
          toast.success(
            language === "zh" ? "已复制到剪贴板！" : "Copied to clipboard!"
          );
        } catch (err) {
          toast.error(
            language === "zh"
              ? "复制失败，请手动复制"
              : "Copy failed, please copy manually"
          );
          alert(text);
        } finally {
          document.body.removeChild(textarea);
        }
      });
  };

  // 微信分享
  const shareToWeChat = (data: any[]) => {
    // 生成分享文本
    let shareText = `📝 AI 对话分享\n\n`;
    shareText += `共 ${data.length} 个会话，${data.reduce(
      (sum, d) => sum + d.messages.length,
      0
    )} 条消息\n\n`;

    data.forEach(({ session, messages }, index) => {
      shareText += `${index + 1}. ${session.title}\n`;
      shareText += `   消息: ${messages.length}条\n`;
      if (messages.length > 0) {
        const firstMsg = messages[0];
        const preview = firstMsg.content.substring(0, 50);
        shareText += `   预览: ${preview}${
          firstMsg.content.length > 50 ? "..." : ""
        }\n`;
      }
      shareText += `\n`;
    });

    shareText += `\n导出时间: ${new Date().toLocaleString("zh-CN")}`;

    // 复制到剪贴板
    navigator.clipboard
      .writeText(shareText)
      .then(() => {
        toast.success(
          language === "zh"
            ? "已复制到剪贴板！请打开微信粘贴分享"
            : "Copied to clipboard! Open WeChat to share"
        );

        // 尝试打开微信（仅在支持的环境）
        if (typeof window !== "undefined" && "wx" in window) {
          // 微信内置浏览器
          toast.info("请使用右上角菜单分享");
        }
      })
      .catch(() => {
        toast.error("复制失败，请手动复制内容");
        // 显示文本框让用户手动复制
        alert(shareText);
      });
  };

  // 钉钉分享
  const shareToDingTalk = (data: any[]) => {
    // 生成 Markdown 格式文本（钉钉支持）
    let shareText = `# 📝 AI 对话分享\n\n`;
    shareText += `**会话数**: ${data.length}\n`;
    shareText += `**消息数**: ${data.reduce(
      (sum, d) => sum + d.messages.length,
      0
    )}\n\n`;
    shareText += `---\n\n`;

    data.forEach(({ session, messages }, index) => {
      shareText += `## ${index + 1}. ${session.title}\n\n`;
      shareText += `- 消息数: ${messages.length}\n`;
      shareText += `- 创建时间: ${formatDate(session.created_at)}\n\n`;

      if (messages.length > 0) {
        // 显示前3条消息预览
        const previewCount = Math.min(3, messages.length);
        messages.slice(0, previewCount).forEach((msg: any) => {
          const role = msg.role === "user" ? "👤" : "🤖";
          const preview = msg.content.substring(0, 100);
          shareText += `${role} ${preview}${
            msg.content.length > 100 ? "..." : ""
          }\n\n`;
        });

        if (messages.length > previewCount) {
          shareText += `_...还有 ${messages.length - previewCount} 条消息_\n\n`;
        }
      }
    });

    shareText += `\n---\n`;
    shareText += `🕐 导出时间: ${new Date().toLocaleString("zh-CN")}`;

    // 复制到剪贴板
    navigator.clipboard
      .writeText(shareText)
      .then(() => {
        toast.success(
          language === "zh"
            ? "已复制到剪贴板！请打开钉钉粘贴分享"
            : "Copied to clipboard! Open DingTalk to share"
        );

        // 尝试唤起钉钉
        if (typeof window !== "undefined") {
          const isMobile =
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
              navigator.userAgent
            );
          if (isMobile) {
            // 移动端尝试唤起钉钉
            window.location.href = "dingtalk://";
            setTimeout(() => {
              toast.info("如果钉钉未打开，请手动打开钉钉粘贴");
            }, 2000);
          }
        }
      })
      .catch(() => {
        toast.error("复制失败，请手动复制内容");
        alert(shareText);
      });
  };

  // 邮件分享
  const shareToEmail = (data: any[]) => {
    // 生成邮件内容
    const subject = encodeURIComponent(`AI 对话导出 - ${data.length}个会话`);

    let body = `AI 对话导出报告\n\n`;
    body += `导出时间: ${new Date().toLocaleString("zh-CN")}\n`;
    body += `会话数量: ${data.length}\n`;
    body += `总消息数: ${data.reduce(
      (sum, d) => sum + d.messages.length,
      0
    )}\n\n`;
    body += `---\n\n`;

    data.forEach(({ session, messages }, index) => {
      body += `${index + 1}. ${session.title}\n`;
      body += `模型: ${session.model || "Unknown"}\n`;
      body += `创建时间: ${formatDate(session.created_at)}\n`;
      body += `消息数: ${messages.length}\n\n`;

      if (messages.length > 0) {
        // 显示前5条消息
        const previewCount = Math.min(5, messages.length);
        messages.slice(0, previewCount).forEach((msg: any) => {
          const role = msg.role === "user" ? "[用户]" : "[AI]";
          body += `${role} ${msg.content}\n\n`;
        });

        if (messages.length > previewCount) {
          body += `...还有 ${messages.length - previewCount} 条消息\n\n`;
        }
      }

      body += `\n---\n\n`;
    });

    body += `\n提示: 完整对话请使用导出功能下载文档。`;

    // 构建 mailto 链接
    const mailtoLink = `mailto:?subject=${subject}&body=${encodeURIComponent(
      body
    )}`;

    // 检查链接长度（邮件客户端有限制）
    if (mailtoLink.length > 2000) {
      // 太长了，使用简化版本
      toast.info("内容较多，将为您打开邮件客户端，请手动粘贴");

      // 简化版邮件内容
      const simpleBody = `AI 对话导出报告\n\n共 ${
        data.length
      } 个会话，${data.reduce(
        (sum, d) => sum + d.messages.length,
        0
      )} 条消息\n\n会话列表:\n${data
        .map(
          (d, i) => `${i + 1}. ${d.session.title} (${d.messages.length}条消息)`
        )
        .join("\n")}\n\n导出时间: ${new Date().toLocaleString(
        "zh-CN"
      )}\n\n提示: 详细内容已复制到剪贴板，请粘贴到邮件正文。`;

      const simpleMailto = `mailto:?subject=${subject}&body=${encodeURIComponent(
        simpleBody
      )}`;

      // 复制完整内容到剪贴板
      navigator.clipboard
        .writeText(body)
        .then(() => {
          window.location.href = simpleMailto;
          toast.success("详细内容已复制到剪贴板");
        })
        .catch(() => {
          window.location.href = simpleMailto;
        });
    } else {
      // 直接打开邮件客户端
      window.location.href = mailtoLink;
      toast.success(
        language === "zh" ? "已打开邮件客户端" : "Email client opened"
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t.common.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {t.export.title}
          </h2>
          <p className="text-gray-600">
            {t.exportMessages.selectConversationsDesc}
          </p>
        </div>

        {/* Session Selection */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center space-x-2">
              <History className="w-5 h-5" />
              <span>{t.export.selectConversations}</span>
            </h3>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="select-all"
                checked={
                  selectedSessions.length === sessions.length &&
                  sessions.length > 0
                }
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="text-sm font-medium">
                {t.export.selectAll}
              </label>
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t.export.noHistory}</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`p-4 border rounded-lg transition-colors ${
                    selectedSessions.includes(session.id)
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={selectedSessions.includes(session.id)}
                      onCheckedChange={(checked) =>
                        handleSessionSelect(session.id, checked as boolean)
                      }
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate mb-1">
                        {session.title}
                      </h4>
                      <div className="flex items-center space-x-4 text-xs text-gray-500 mb-2">
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(session.created_at)}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MessageSquare className="w-3 h-3" />
                          <span>
                            {session.message_count || 0} {t.history.messages}
                          </span>
                        </div>
                      </div>
                      {session.last_message && (
                        <p className="text-xs text-gray-600 truncate">
                          {session.last_message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Selected Sessions Summary */}
        {selectedSessions.length > 0 && (
          <Card className="p-6">
            <h3 className="font-semibold text-lg mb-4">
              {t.export.exportSummary}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-500">{t.export.selectedSessions}</div>
                <div className="font-semibold">{selectedSessions.length}</div>
              </div>
              <div>
                <div className="text-gray-500">{t.export.messages}</div>
                <div className="font-semibold">{totalMessages}</div>
              </div>
              <div>
                <div className="text-gray-500">{t.export.totalTokens}</div>
                <div className="font-semibold">
                  {totalTokens.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-gray-500">{t.export.duration}</div>
                <div className="font-semibold">
                  {totalDuration} {t.export.minutesShort}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Export Formats */}
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">
            {t.export.exportFormats}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {exportFormats.map((format) => {
              const Icon = format.icon;
              return (
                <div
                  key={format.id}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    exportFormat === format.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setExportFormat(format.id)}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <Icon className="w-5 h-5 text-gray-600" />
                    <span className="font-medium">{format.name}</span>
                  </div>
                  <p className="text-sm text-gray-500">{format.description}</p>
                </div>
              );
            })}
          </div>
          <Button
            onClick={handleExport}
            className="w-full"
            disabled={selectedSessions.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            {t.export.exportSessions.replace(
              "{count}",
              selectedSessions.length.toString()
            )}
          </Button>
        </Card>

        {/* Share Options */}
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">
            {t.export.shareOptions}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {shareOptions.map((option) => {
              const Icon = option.icon;
              return (
                <div
                  key={option.id}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    shareTarget === option.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setShareTarget(option.id)}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <div
                      className={`w-8 h-8 rounded-full ${option.color} flex items-center justify-center`}
                    >
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-medium">{option.name}</span>
                  </div>
                  <p className="text-sm text-gray-500">{option.description}</p>
                </div>
              );
            })}
          </div>
          <Button
            onClick={handleShare}
            className="w-full"
            disabled={selectedSessions.length === 0}
          >
            <Share2 className="w-4 h-4 mr-2" />
            {t.export.shareSessions.replace(
              "{count}",
              selectedSessions.length.toString()
            )}
          </Button>
        </Card>

        {/* API Integration */}
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">
            {t.export.apiIntegration}
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <Webhook className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">
                    {t.export.shareChannels.webhook}
                  </div>
                  <div className="text-sm text-gray-500">
                    {t.export.webhookDesc}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                {t.export.configure}
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-medium">{t.export.autoSave}</div>
                  <div className="text-sm text-gray-500">
                    {t.export.autoSaveDesc}
                  </div>
                </div>
              </div>
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800"
              >
                {t.export.enabled}
              </Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
