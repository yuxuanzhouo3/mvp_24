import { POST } from "../../app/api/auth/register/route";
import { bindReferralFromRequest } from "../../lib/market/referrals";
import { supabase } from "../../lib/supabase";
import { isChinaRegion } from "../../lib/config/region";
import { passwordSecurity } from "../../lib/password-security";

jest.mock("../../lib/market/referrals", () => ({
  bindReferralFromRequest: jest.fn(),
}));

jest.mock("../../lib/config/region", () => ({
  isChinaRegion: jest.fn(),
}));

jest.mock("../../lib/password-security", () => ({
  passwordSecurity: {
    validatePassword: jest.fn(),
  },
}));

jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
    },
  },
}));

jest.mock("../../lib/database/adapter", () => ({
  getDatabase: jest.fn(() => ({
    insert: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../../lib/models/user", () => ({
  createProfileFromEmailUser: jest.fn((id: string, email: string, fullName: string) => ({
    id,
    email,
    fullName,
  })),
}));

jest.mock("../../lib/logger", () => ({
  logSecurityEvent: jest.fn(),
}));

jest.mock("../../lib/email-otp", () => ({
  verifyEmailOtp: jest.fn(),
}));

jest.mock("../../lib/cloudbase-service", () => ({
  signupUser: jest.fn(),
}));

jest.mock("../../lib/cloudbase-user-profile", () => ({
  getOrCreateUserProfile: jest.fn(),
}));

describe("register referral bind", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isChinaRegion as jest.Mock).mockReturnValue(false);
    (passwordSecurity.validatePassword as jest.Mock).mockReturnValue({
      isValid: true,
      score: 4,
      feedback: [],
      suggestions: [],
    });
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: {
        user: {
          id: "intl-user-1",
          email: "newuser@example.com",
          user_metadata: {},
        },
      },
      error: null,
    });
    (bindReferralFromRequest as jest.Mock).mockResolvedValue({
      bound: true,
    });
  });

  it("binds referral for successful new registration", async () => {
    const request = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "newuser@example.com",
        password: "Password123!",
        confirmPassword: "Password123!",
        fullName: "New User",
      }),
    });

    const response = await POST(request as any);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(bindReferralFromRequest).toHaveBeenCalledTimes(1);
    expect(bindReferralFromRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        invitedUserId: "intl-user-1",
        invitedEmail: "newuser@example.com",
        region: "INTL",
      })
    );
  });

  it("does not fail registration when referral bind throws", async () => {
    (bindReferralFromRequest as jest.Mock).mockRejectedValueOnce(
      new Error("bind failed")
    );

    const request = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "newuser@example.com",
        password: "Password123!",
        confirmPassword: "Password123!",
        fullName: "New User",
      }),
    });

    const response = await POST(request as any);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(bindReferralFromRequest).toHaveBeenCalledTimes(1);
  });
});
