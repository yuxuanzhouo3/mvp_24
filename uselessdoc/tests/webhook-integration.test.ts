// tests/webhook-integration.test.ts - Webhook集成测试
import { WebhookHandler } from "../lib/payment/webhook-handler";
import { supabaseAdmin } from "../lib/supabase-admin";

// Mock Supabase admin client
jest.mock("../lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

// Mock logger
jest.mock("../lib/logger", () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logSecurityEvent: jest.fn(),
  logBusinessEvent: jest.fn(),
}));

// Mock logger
jest.mock("../lib/logger", () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logSecurityEvent: jest.fn(),
  logBusinessEvent: jest.fn(),
}));

describe("Webhook Integration Tests", () => {
  let webhookHandler: WebhookHandler;

  beforeEach(() => {
    webhookHandler = WebhookHandler.getInstance();
    jest.clearAllMocks();
  });

  describe("Stripe Webhook Processing", () => {
    it.skip("should process checkout.session.completed event", async () => {
      const mockEvent = {
        id: "evt_test_checkout",
        type: "checkout.session.completed",
        livemode: false,
        data: {
          object: {
            id: "cs_test_session",
            subscription: "sub_test_subscription",
            amount_total: 16800,
            currency: "usd",
            metadata: {
              userId: "user_test_123",
              planType: "pro",
            },
          },
        },
      };

      // Mock all database calls in sequence
      const mockSupabase = supabaseAdmin as any;

      // 1. getProcessedEvent - webhook_events select (not processed)
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
      });

      // 2. recordEvent - webhook_events upsert
      mockSupabase.from.mockReturnValueOnce({
        upsert: jest.fn().mockResolvedValue({ error: null }),
      });

      // 3. updateSubscriptionStatus - user_profiles select
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: "user_test_123", subscription_plan: "free" },
              error: null,
            }),
          }),
        }),
      });

      // 4. updateSubscriptionStatus - subscriptions select (no existing)
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
      });

      // 5. updateSubscriptionStatus - subscriptions insert
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: "sub_test",
                user_id: "user_test_123",
                plan_id: "pro",
                status: "active",
              },
              error: null,
            }),
          }),
        }),
      });

      // 6. updateSubscriptionStatus - user_profiles update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      // 7. updateSubscriptionStatus - payments insert
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      // 8. markEventProcessed - webhook_events update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const result = await webhookHandler.processWebhook(
        "stripe",
        "checkout.session.completed",
        mockEvent
      );

      expect(result).toBe(true);
    });

    it.skip("should handle invoice payment events", async () => {
      const mockEvent = {
        id: "evt_test_invoice",
        type: "invoice.payment_succeeded",
        livemode: false,
        data: {
          object: {
            id: "in_test_invoice",
            subscription: "sub_test_subscription",
            amount_paid: 16800,
            currency: "usd",
          },
        },
      };

      // Mock all database calls in sequence
      const mockSupabase = supabaseAdmin as any;

      // 1. getProcessedEvent - webhook_events select (not processed)
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
      });

      // 2. recordEvent - webhook_events upsert
      mockSupabase.from.mockReturnValueOnce({
        upsert: jest.fn().mockResolvedValue({ error: null }),
      });

      // 3. findUserBySubscriptionId - payments select (find user)
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { user_id: "user_test_123" },
                }),
              }),
            }),
          }),
        }),
      });

      // 4. findUserBySubscriptionId - subscriptions select (find subscription)
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { user_id: "user_test_123", id: "sub_test" },
            }),
          }),
        }),
      });

      // 5. handleStripeInvoicePaymentSucceeded - payments insert
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      // 6. markEventProcessed - webhook_events update
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const result = await webhookHandler.processWebhook(
        "stripe",
        "invoice.payment_succeeded",
        mockEvent
      );

      expect(result).toBe(true);
    });
  });

  describe("Idempotency and Error Handling", () => {
    it.skip("should handle duplicate webhook events", async () => {
      const mockEvent = {
        id: "evt_duplicate",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_duplicate",
            subscription: "sub_duplicate",
            metadata: { userId: "user_test_123" },
          },
        },
      };

      // Mock as already processed
      const mockSupabase = supabaseAdmin as any;
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: "stripe_evt_duplicate", processed: true },
              }),
            }),
          }),
        }),
      });

      const result = await webhookHandler.processWebhook(
        "stripe",
        "checkout.session.completed",
        mockEvent
      );

      expect(result).toBe(true);
    });

    it.skip("should handle database errors gracefully", async () => {
      const mockEvent = {
        id: "evt_error",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_error",
            subscription: "sub_error",
            metadata: { userId: "user_test_123" },
          },
        },
      };

      // Mock database error
      const mockSupabase = supabaseAdmin as any;
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({
          error: new Error("Database connection failed"),
        }),
      });

      const result = await webhookHandler.processWebhook(
        "stripe",
        "checkout.session.completed",
        mockEvent
      );

      expect(result).toBe(false);
    });
  });
});
