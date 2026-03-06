import { grantReferralFirstUseReward } from "../../lib/market/referrals";
import { POST } from "../../app/api/chat/multi-send/route";
import { multiAgentOrchestrator } from "../../lib/ai/multi-agent-orchestrator";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { validateAgents } from "../../lib/ai/ai-agents.config";
import { resolveIntlUserPlan } from "../../lib/user-plan";

jest.mock("../../lib/market/referrals", () => ({
  grantReferralFirstUseReward: jest.fn(),
}));

jest.mock("../../lib/auth-utils", () => ({
  extractTokenFromHeader: jest.fn(() => ({ token: "token", error: null })),
  verifyAuthToken: jest.fn(async () => ({
    success: true,
    userId: "user-1",
    user: { id: "user-1", user_metadata: {} },
  })),
}));

jest.mock("../../lib/config/region", () => ({
  isChinaRegion: jest.fn(() => false),
}));

jest.mock("../../lib/ai/ai-agents.config", () => ({
  validateAgents: jest.fn(),
  getAgentById: jest.fn(() => ({ model: "gpt-test" })),
}));

jest.mock("../../lib/ai/multi-agent-orchestrator", () => ({
  multiAgentOrchestrator: {
    sequential: jest.fn(),
    parallel: jest.fn(),
    debate: jest.fn(),
    synthesis: jest.fn(),
  },
}));

jest.mock("../../lib/ai/token-counter", () => ({
  recordUsage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../lib/sentry", () => ({
  captureException: jest.fn(),
}));

jest.mock("../../lib/chat-session-store", () => ({
  appendSessionMessages: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../lib/chat/message-id", () => ({
  createMessageId: jest.fn(() => "msg-test"),
}));

jest.mock("../../lib/chat/count-intl-assistant-messages", () => ({
  countIntlAssistantMessagesSince: jest.fn().mockResolvedValue(0),
}));

jest.mock("../../lib/user-plan", () => ({
  resolveIntlUserPlan: jest.fn(),
}));

jest.mock("../../lib/supabase-admin", () => {
  const selectChain = {
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: "session-1", user_id: "user-1" },
      error: null,
    }),
  };

  const updateChain = {
    eq: jest.fn().mockReturnThis(),
  };

  return {
    supabaseAdmin: {
      from: jest.fn(() => ({
        select: jest.fn(() => selectChain),
        update: jest.fn(() => updateChain),
      })),
    },
  };
});

describe("first-use reward trigger in multi-send route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveIntlUserPlan as jest.Mock).mockResolvedValue("pro");
    (grantReferralFirstUseReward as jest.Mock).mockResolvedValue({
      handled: true,
    });
    (validateAgents as jest.Mock).mockReturnValue({
      valid: [{ id: "agent-1", model: "gpt-test" }],
      invalid: [],
      needsUpgrade: [],
    });
    (multiAgentOrchestrator.parallel as jest.Mock).mockResolvedValue({
      mode: "parallel",
      responses: [
        {
          agentId: "agent-1",
          agentName: "Agent 1",
          content: "answer",
          tokens: 10,
          cost: 0.001,
          model: "gpt-test",
          error: null,
        },
      ],
      synthesis: null,
      totalTokens: 10,
      totalCost: 0.001,
    });
  });

  it("grants first-use reward when at least one agent response succeeds", async () => {
    const request = new Request("http://localhost/api/chat/multi-send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
      },
      body: JSON.stringify({
        sessionId: "session-1",
        message: "hello",
        agentIds: ["agent-1"],
        mode: "parallel",
      }),
    });

    const response = await POST(request as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(grantReferralFirstUseReward).toHaveBeenCalledTimes(1);
    expect(grantReferralFirstUseReward).toHaveBeenCalledWith({
      invitedUserId: "user-1",
      toolId: "agent-1",
      region: "INTL",
    });
  });

  it("does not grant first-use reward when all responses fail", async () => {
    (multiAgentOrchestrator.parallel as jest.Mock).mockResolvedValueOnce({
      mode: "parallel",
      responses: [
        {
          agentId: "agent-1",
          agentName: "Agent 1",
          content: "",
          tokens: 0,
          cost: 0,
          model: "gpt-test",
          error: "provider down",
        },
      ],
      synthesis: null,
      totalTokens: 0,
      totalCost: 0,
    });

    const request = new Request("http://localhost/api/chat/multi-send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
      },
      body: JSON.stringify({
        sessionId: "session-1",
        message: "hello",
        agentIds: ["agent-1"],
        mode: "parallel",
      }),
    });

    const response = await POST(request as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(grantReferralFirstUseReward).not.toHaveBeenCalled();
  });
});
