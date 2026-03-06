import { NextRequest } from "next/server";
import { GET as getStats } from "../../app/api/market/stats/route";
import { verifyMarketAdminToken } from "../../lib/market/admin-auth";
import { getReferralStatsByUser } from "../../lib/market/referrals";

jest.mock("../../lib/market/admin-auth", () => ({
  verifyMarketAdminToken: jest.fn(),
}));

jest.mock("../../lib/market/referrals", () => ({
  getReferralStatsByUser: jest.fn(),
}));

describe("CN / INTL parity for market stats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifyMarketAdminToken as jest.Mock).mockReturnValue({
      ok: true,
      admin: { userId: "admin-1", username: "admin" },
    });

    (getReferralStatsByUser as jest.Mock).mockImplementation(
      async (_userId: string, region: string) => {
        if (region === "CN") {
          return {
            rewardCredits: 10,
            rewardDays: 10,
            totalRewardCredits: 10,
            totalRewardDays: 10,
          };
        }
        if (region === "INTL") {
          return {
            rewardCredits: 20,
            rewardDays: 20,
            totalRewardCredits: 20,
            totalRewardDays: 20,
          };
        }
        return {
          rewardCredits: 30,
          rewardDays: 30,
          totalRewardCredits: 30,
          totalRewardDays: 30,
        };
      }
    );
  });

  it("returns CN and INTL compatible day/credit fields", async () => {
    const cnReq = new NextRequest(
      "http://localhost/api/market/stats?userId=u1&region=CN"
    );
    const intlReq = new NextRequest(
      "http://localhost/api/market/stats?userId=u1&region=INTL"
    );

    const cnRes = await getStats(cnReq);
    const intlRes = await getStats(intlReq);

    const cn = await cnRes.json();
    const intl = await intlRes.json();

    expect(cn.success).toBe(true);
    expect(cn.stats.rewardCredits).toBe(cn.stats.rewardDays);

    expect(intl.success).toBe(true);
    expect(intl.stats.rewardCredits).toBe(intl.stats.rewardDays);
  });

  it("returns aggregated ALL stats when region is omitted", async () => {
    const request = new NextRequest("http://localhost/api/market/stats?userId=u1");
    const response = await getStats(request);
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(payload.stats.totalRewardDays).toBe(30);
    expect(payload.stats.totalRewardCredits).toBe(30);
  });
});
