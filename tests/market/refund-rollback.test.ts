import {
  handlePayPalEvent,
  handleStripeEvent,
  handleWechatEvent,
} from "../../lib/payment/webhook-handler/providers";
import { rollbackReferralRewardsByTransaction } from "../../lib/market/referrals";

jest.mock("../../lib/logger", () => ({
  logInfo: jest.fn(),
  logSecurityEvent: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock("../../lib/market/referrals", () => ({
  rollbackReferralRewardsByTransaction: jest.fn().mockResolvedValue({
    handled: true,
  }),
}));

jest.mock("../../lib/payment/webhook-handler/payment-success", () => ({
  handlePaymentSuccess: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../lib/payment/webhook-handler/subscription-db", () => ({
  updateSubscriptionStatus: jest.fn().mockResolvedValue(true),
  findUserBySubscriptionId: jest.fn().mockResolvedValue({
    userId: "u1",
    subscriptionId: "s1",
  }),
}));

jest.mock("../../lib/payment/webhook-handler/stripe", () => ({
  handleStripeCheckoutCompleted: jest.fn().mockResolvedValue(true),
  handleStripeSubscriptionCreated: jest.fn().mockResolvedValue(true),
  handleStripeSubscriptionUpdated: jest.fn().mockResolvedValue(true),
  handleStripeSubscriptionCancelled: jest.fn().mockResolvedValue(true),
  handleStripeInvoicePaymentSucceeded: jest.fn().mockResolvedValue(true),
  handleStripeInvoicePaymentFailed: jest.fn().mockResolvedValue(true),
}));

describe("refund rollback integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rolls back referral rewards on Stripe charge.refunded", async () => {
    const ok = await handleStripeEvent("charge.refunded", {
      data: { object: { id: "ch_1", payment_intent: "pi_1" } },
    });

    expect(ok).toBe(true);
    expect(rollbackReferralRewardsByTransaction).toHaveBeenCalledWith({
      transactionId: "ch_1",
      provider: "stripe",
      region: "ALL",
      reason: "refund",
    });
    expect(rollbackReferralRewardsByTransaction).toHaveBeenCalledWith({
      transactionId: "pi_1",
      provider: "stripe",
      region: "ALL",
      reason: "refund",
    });
  });

  it("rolls back referral rewards on PayPal refunded events", async () => {
    const ok = await handlePayPalEvent("PAYMENT.SALE.REFUNDED", {
      resource: { id: "sale_1" },
    });

    expect(ok).toBe(true);
    expect(rollbackReferralRewardsByTransaction).toHaveBeenCalledWith({
      transactionId: "sale_1",
      provider: "paypal",
      region: "ALL",
      reason: "refund",
    });
  });

  it("rolls back referral rewards on WeChat REFUND.SUCCESS", async () => {
    const ok = await handleWechatEvent("REFUND.SUCCESS", {
      transaction_id: "wx_txn_1",
      out_trade_no: "order_1",
    });

    expect(ok).toBe(true);
    expect(rollbackReferralRewardsByTransaction).toHaveBeenCalledWith({
      transactionId: "wx_txn_1",
      provider: "wechat",
      region: "ALL",
      reason: "refund",
    });
  });
});
