const TRUTHY_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

export function isAppleIAPEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_ENABLE_APPLE_IAP || "").trim().toLowerCase();
  return TRUTHY_VALUES.has(raw);
}

