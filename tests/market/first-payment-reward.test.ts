import { handlePaymentSuccess } from "../../lib/payment/webhook-handler/payment-success";
import { grantReferralFirstPaymentReward } from "../../lib/market/referrals";
import { updateSubscriptionStatus } from "../../lib/payment/webhook-handler/subscription-db";
import { seedWalletForPlan } from "../../services/wallet-supabase";

jest.mock("../../lib/config/region", () => ({
  isChinaRegion: jest.fn(() => false),
}));

jest.mock("../../lib/logger", () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logBusinessEvent: jest.fn(),
}));

jest.mock("../../lib/market/referrals", () => ({
  grantReferralFirstPaymentReward: jest.fn(),
}));

jest.mock("../../lib/payment/webhook-handler/subscription-db", () => ({
  updateSubscriptionStatus: jest.fn(),
  findUserBySubscriptionId: jest.fn(),
}));

jest.mock("../../services/wallet-supabase", () => ({
  seedWalletForPlan: jest.fn(),
  addAddonCredits: jest.fn(),
}));

jest.mock("../../services/wallet-cloudbase", () => ({
  seedCloudBaseWalletForPlan: jest.fn(),
  addCloudBaseAddonCredits: jest.fn(),
}));

jest.mock("../../constants/addon-packages", () => ({
  getAddonPackageById: jest.fn(() => null),
}));

jest.mock("../../lib/cloudbase-service", () => ({
  getDatabase: jest.fn(),
}));

jest.mock("../../lib/supabase-admin", () => {
  const makeQueryChain = (result: any) => {
    const chain: any = {};
    chain.eq = jest.fn(() => chain);
    chain.order = jest.fn(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.maybeSingle = jest.fn(async () => ({ data: result }));
    return chain;
  };

  return {
    supabaseAdmin: {
      from: jest.fn(() => ({
        select: jest.fn(() => makeQueryChain((global as any).__TEST_PAYMENT_RECORD__)),
        update: jest.fn(() => ({
          eq: jest.fn(async () => ({ error: null })),
        })),
      })),
    },
  };
});

describe("first-payment reward trigger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (updateSubscriptionStatus as jest.Mock).mockResolvedValue(true);
    (seedWalletForPlan as jest.Mock).mockResolvedValue({
      monthly_image_balance: 100,
      monthly_video_balance: 100,
    });
    (grantReferralFirstPaymentReward as jest.Mock).mockResolvedValue({
      handled: true,
    });
  });

  it("triggers referral first-payment reward for subscription payment success", async () => {
    (global as any).__TEST_PAYMENT_RECORD__ = {
      id: "pay-1",
      user_id: "user-1",
      status: "pending",
      type: "SUBSCRIPTION",
      transaction_id: "txn-1",
      payment_method: "stripe",
      metadata: { days: 30, productType: "SUBSCRIPTION", planType: "pro" },
    };

    const success = await handlePaymentSuccess("stripe", {
      id: "evt_stripe_1",
      subscription: "txn-1",
      amount_total: 999,
      currency: "usd",
      metadata: { userId: "user-1" },
    });

    expect(success).toBe(true);
    expect(grantReferralFirstPaymentReward).toHaveBeenCalledTimes(1);
    expect(grantReferralFirstPaymentReward).toHaveBeenCalledWith({
      invitedUserId: "user-1",
      transactionId: "txn-1",
      provider: "stripe",
      region: "INTL",
    });
  });

  it("does not trigger referral first-payment reward for addon payment", async () => {
    (global as any).__TEST_PAYMENT_RECORD__ = {
      id: "pay-2",
      user_id: "user-2",
      status: "pending",
      type: "ADDON",
      transaction_id: "txn-addon-1",
      payment_method: "stripe",
      metadata: { productType: "ADDON", addonPackageId: "pack_1" },
    };

    const success = await handlePaymentSuccess("stripe", {
      id: "evt_stripe_2",
      subscription: "txn-addon-1",
      amount_total: 499,
      currency: "usd",
      metadata: { userId: "user-2" },
    });

    expect(success).toBe(true);
    expect(grantReferralFirstPaymentReward).not.toHaveBeenCalled();
  });
});
