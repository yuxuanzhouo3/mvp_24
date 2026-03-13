const walletModule = require("@/lib/billing/wallet");

const { reconcileMonthlyGrantBalance } = walletModule;

describe("reconcileMonthlyGrantBalance", () => {
  it("shrinks same-month grant balance when the configured monthly quota is lowered", () => {
    const result = reconcileMonthlyGrantBalance({
      existing: {
        userId: "user-1",
        planId: "free",
        monthKey: "2026-03",
        monthlyGrantTotal: 2000,
        monthlyGrantBalance: 1992,
        rechargeBalance: 0,
        bonusBalance: 0,
        frozenCredits: 0,
        lifetimeCredited: 2000,
        lifetimeDebited: 8,
        updatedAt: "2026-03-13T00:00:00.000Z",
      },
      planId: "free",
      currentMonthKey: "2026-03",
      monthlyGrant: 450,
      spentThisMonth: 8,
    });

    expect(result.grantDelta).toBe(0);
    expect(result.revokedGrantCredits).toBe(1550);
    expect(result.next.monthlyGrantTotal).toBe(450);
    expect(result.next.monthlyGrantBalance).toBe(442);
  });

  it("does not touch top-up balances when only the monthly grant is reduced", () => {
    const result = reconcileMonthlyGrantBalance({
      existing: {
        userId: "user-2",
        planId: "free",
        monthKey: "2026-03",
        monthlyGrantTotal: 2000,
        monthlyGrantBalance: 1700,
        rechargeBalance: 300,
        bonusBalance: 120,
        frozenCredits: 0,
        lifetimeCredited: 2420,
        lifetimeDebited: 300,
        updatedAt: "2026-03-13T00:00:00.000Z",
      },
      planId: "free",
      currentMonthKey: "2026-03",
      monthlyGrant: 450,
      spentThisMonth: 120,
    });

    expect(result.next.monthlyGrantBalance).toBe(330);
    expect(result.next.rechargeBalance).toBe(300);
    expect(result.next.bonusBalance).toBe(120);
  });

  it("still grants the full delta when the monthly quota increases mid-cycle", () => {
    const result = reconcileMonthlyGrantBalance({
      existing: {
        userId: "user-3",
        planId: "free",
        monthKey: "2026-03",
        monthlyGrantTotal: 0,
        monthlyGrantBalance: 0,
        rechargeBalance: 200,
        bonusBalance: 0,
        frozenCredits: 0,
        lifetimeCredited: 200,
        lifetimeDebited: 50,
        updatedAt: "2026-03-13T00:00:00.000Z",
      },
      planId: "free",
      currentMonthKey: "2026-03",
      monthlyGrant: 450,
      spentThisMonth: 50,
    });

    expect(result.grantDelta).toBe(450);
    expect(result.revokedGrantCredits).toBe(0);
    expect(result.next.monthlyGrantTotal).toBe(450);
    expect(result.next.monthlyGrantBalance).toBe(450);
    expect(result.next.rechargeBalance).toBe(200);
  });
});
