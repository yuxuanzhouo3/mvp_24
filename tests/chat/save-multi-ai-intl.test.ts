import { saveIntlMultiAISessionTurn } from "../../lib/chat/save-multi-ai-intl";
import { appendSessionMessages } from "../../lib/chat-session-store";

jest.mock("../../lib/chat-session-store", () => ({
  appendSessionMessages: jest.fn(),
}));

describe("saveIntlMultiAISessionTurn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (appendSessionMessages as jest.Mock).mockResolvedValue(undefined);
  });

  it("persists user + assistant together in one append", async () => {
    await saveIntlMultiAISessionTurn({
      sessionId: "s1",
      userId: "u1",
      userMessage: "hello",
      aiResponses: [
        {
          agentId: "a1",
          agentName: "Agent1",
          content: "world",
          model: "gpt-x",
          status: "completed",
          timestamp: new Date("2026-02-15T00:00:00.000Z"),
        },
      ],
    });

    expect(appendSessionMessages).toHaveBeenCalledTimes(1);
    expect(appendSessionMessages).toHaveBeenCalledWith({
      sessionId: "s1",
      userId: "u1",
      messages: [
        {
          id: expect.any(String),
          content: "hello",
          role: "user",
          timestamp: expect.any(String),
          tokens_used: 0,
        },
        {
          id: expect.any(String),
          content: [
            {
              agentName: "Agent1",
              agentId: "a1",
              model: "gpt-x",
              content: "world",
              status: "completed",
              timestamp: "2026-02-15T00:00:00.000Z",
              nodeId: undefined,
              nodeTitle: undefined,
              dependsOn: undefined,
              tokens: undefined,
              cost: undefined,
            },
          ],
          role: "assistant",
          timestamp: expect.any(String),
          tokens_used: 0,
          isMultiAI: true,
        },
      ],
    });
  });

  it("does not dedupe same text across turns", async () => {
    const payload = {
      sessionId: "s1",
      userId: "u1",
      userMessage: "same question",
      aiResponses: [
        {
          agentId: "a1",
          agentName: "Agent1",
          content: "answer",
          model: "gpt-x",
          status: "completed",
          timestamp: new Date("2026-02-15T00:00:00.000Z"),
        },
      ],
    };

    await saveIntlMultiAISessionTurn(payload);
    await saveIntlMultiAISessionTurn(payload);

    expect(appendSessionMessages).toHaveBeenCalledTimes(2);
    expect((appendSessionMessages as jest.Mock).mock.calls[0][0].messages[0].content).toBe(
      "same question"
    );
    expect((appendSessionMessages as jest.Mock).mock.calls[1][0].messages[0].content).toBe(
      "same question"
    );
  });
});
