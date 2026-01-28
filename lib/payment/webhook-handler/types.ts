/**
 * Webhook Handler Types
 * 统一的 webhook 处理类型定义
 */

export type WebhookProvider = "paypal" | "stripe" | "alipay" | "wechat";

export interface WebhookEvent {
  id: string;
  provider: WebhookProvider;
  eventType: string;
  eventData: any;
  processed: boolean;
  createdAt: string;
  processedAt?: string;
}

export interface PaymentData {
  subscriptionId: string;
  userId: string;
  amount: number;
  currency: string;
  days: number;
  paypalOrderId?: string;
}

export interface SubscriptionUser {
  userId: string;
  subscriptionId?: string;
}

export interface WalletUpdateResult {
  success: boolean;
  error?: string;
}

export interface PaymentRecord {
  _id?: string;
  id?: string;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  transaction_id: string;
  type?: string;
  addon_package_id?: string;
  image_credits?: number;
  video_audio_credits?: number;
  out_trade_no?: string;
  metadata?: {
    days?: number | string;
    billingCycle?: string;
    planType?: string;
    productType?: string;
    productId?: string;
  };
  created_at?: string;
  updated_at?: string;
}
