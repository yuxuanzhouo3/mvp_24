import { NextRequest } from "next/server";
import { GET as getOverview } from "../../app/api/market/admin/overview/route";
import { GET as getTrends } from "../../app/api/market/admin/trends/route";
import { GET as getRelations } from "../../app/api/market/admin/relations/route";
import { verifyMarketAdminToken } from "../../lib/market/admin-auth";
import {
  getMarketAdminOverview,
  getMarketAdminRelations,
  getMarketAdminTrends,
} from "../../lib/market/referrals";

jest.mock("../../lib/market/admin-auth", () => ({
  verifyMarketAdminToken: jest.fn(),
}));

jest.mock("../../lib/market/referrals", () => ({
  getMarketAdminOverview: jest.fn(),
  getMarketAdminTrends: jest.fn(),
  getMarketAdminRelations: jest.fn(),
}));

describe("market admin API contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifyMarketAdminToken as jest.Mock).mockReturnValue({
      ok: true,
      admin: {
        userId: "admin-1",
        username: "admin",
      },
    });
  });

  it("returns { success, overview } for /api/market/admin/overview", async () => {
    (getMarketAdminOverview as jest.Mock).mockResolvedValue({
      totalClicks: 10,
      totalInvites: 5,
    });

    const request = new NextRequest(
      "http://localhost/api/market/admin/overview?region=ALL"
    );
    const response = await getOverview(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      overview: {
        totalClicks: 10,
        totalInvites: 5,
      },
    });
  });

  it("returns { success, trends } for /api/market/admin/trends", async () => {
    (getMarketAdminTrends as jest.Mock).mockResolvedValue([
      { date: "2026-02-23", clicks: 2, invites: 1, activated: 1, rewardCredits: 10 },
    ]);

    const request = new NextRequest(
      "http://localhost/api/market/admin/trends?days=14&region=ALL"
    );
    const response = await getTrends(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(Array.isArray(payload.trends)).toBe(true);
    expect(payload.trends[0].date).toBe("2026-02-23");
  });

  it("returns paged shape for /api/market/admin/relations", async () => {
    (getMarketAdminRelations as jest.Mock).mockResolvedValue({
      page: 1,
      limit: 20,
      total: 1,
      rows: [{ relationId: "rel_1" }],
    });

    const request = new NextRequest(
      "http://localhost/api/market/admin/relations?page=1&limit=20&region=ALL"
    );
    const response = await getRelations(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.page).toBe(1);
    expect(payload.limit).toBe(20);
    expect(payload.total).toBe(1);
    expect(payload.rows).toEqual([{ relationId: "rel_1" }]);
  });
});
