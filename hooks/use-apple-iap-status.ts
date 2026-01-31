/**
 * Hook: useAppleIAPStatus
 * 
 * 用途：获取实时的 Apple IAP 订阅状态
 * 
 * 新架构：
 * - 前端调用 GET /api/payment/ios-iap/status
 * - 后端从 Apple 查询真实过期时间
 * - 永远显示 Apple 的最新数据
 */

"use client";

import { useState, useEffect } from "react";

export interface AppleIAPStatus {
  success: boolean;
  transactionId: string;
  expiresAt: string;
  expiresAtMs: number;
  daysLeft: number;
  isExpired: boolean;
  autoRenewStatus: boolean;
  source: "apple" | "cached";
}

export function useAppleIAPStatus() {
  const [status, setStatus] = useState<AppleIAPStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/payment/ios-iap/status");

      if (response.status === 404) {
        // 用户没有 Apple IAP 订阅
        setStatus(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.statusText}`);
      }

      const data = await response.json();
      setStatus(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("❌ Failed to fetch Apple IAP status:", message);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时获取状态
  useEffect(() => {
    fetchStatus();
  }, []);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
  };
}
