export type ShareSource = "copy" | "android_share" | "qr" | "poster";

function normalizeTargetPath(targetPath?: string | null) {
  const raw = String(targetPath || "").trim();
  if (!raw) return "/";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export function buildReferralShareLink(input: {
  origin: string;
  referralCode: string;
  targetPath?: string | null;
  source: ShareSource;
}) {
  const code = String(input.referralCode || "").trim();
  if (!code) return "";

  const url = new URL(`/r/${encodeURIComponent(code)}`, input.origin);
  url.searchParams.set("to", normalizeTargetPath(input.targetPath));
  url.searchParams.set("source", input.source);
  return url.toString();
}
