const { buildPdfHtml } = require("@/lib/chat-export-pdf");

describe("chat export pdf rendering", () => {
  it("does not include preview-only print UI in downloadable pdf html", () => {
    const html = buildPdfHtml(
      [
        {
          session: {
            id: "session-1",
            title: "测试会话",
            model: "test-model",
            created_at: "2026-03-13T10:00:00.000Z",
            updated_at: "2026-03-13T10:05:00.000Z",
          },
          messages: [
            {
              role: "user",
              content: "你好",
              created_at: "2026-03-13T10:00:00.000Z",
            },
          ],
        },
      ],
      "zh"
    );

    expect(html).not.toContain("window.print()");
    expect(html).not.toContain("print-button");
    expect(html).not.toContain("confirm(");
    expect(html).toContain("AI 对话导出报告");
  });
});
