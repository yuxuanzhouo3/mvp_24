import crypto from "crypto";
import { getCloudBaseApp } from "@/lib/cloudbase/init";
import { sendEmailBySmtp } from "@/lib/email-smtp";

const COLLECTION = "email_otp_codes";
const EXPIRES_MINUTES = 10;
const SEND_COOLDOWN_SECONDS = 60;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const GUARD_COLLECTION = "email_otp_guard";

type OtpPurpose = "signup" | "password_reset";

interface OtpResult {
  success: boolean;
  error?: string;
  code?: "TOO_FREQUENT" | "TOO_MANY_ATTEMPTS" | "OTP_EXPIRED" | "OTP_INVALID";
  retryAfterSeconds?: number;
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function getGuardRecord(db: any, email: string, purpose: OtpPurpose) {
  const result = await db
    .collection(GUARD_COLLECTION)
    .where({ email, purpose })
    .limit(1)
    .get();
  return result?.data?.[0] || null;
}

async function resetGuardRecord(db: any, email: string, purpose: OtpPurpose) {
  const record = await getGuardRecord(db, email, purpose);
  const now = new Date().toISOString();
  if (record?._id) {
    await db.collection(GUARD_COLLECTION).doc(record._id).update({
      fail_count: 0,
      locked_until: null,
      updated_at: now,
    });
  } else {
    await db.collection(GUARD_COLLECTION).add({
      email,
      purpose,
      fail_count: 0,
      locked_until: null,
      created_at: now,
      updated_at: now,
    });
  }
}

async function increaseFailedAttempt(db: any, email: string, purpose: OtpPurpose): Promise<OtpResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const record = await getGuardRecord(db, email, purpose);
  const currentFail = Number(record?.fail_count || 0);
  const nextFail = currentFail + 1;

  if (nextFail >= MAX_FAILED_ATTEMPTS) {
    const lockUntil = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000);
    if (record?._id) {
      await db.collection(GUARD_COLLECTION).doc(record._id).update({
        fail_count: nextFail,
        locked_until: lockUntil.toISOString(),
        updated_at: nowIso,
      });
    } else {
      await db.collection(GUARD_COLLECTION).add({
        email,
        purpose,
        fail_count: nextFail,
        locked_until: lockUntil.toISOString(),
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    return {
      success: false,
      error: `验证失败次数过多，请 ${LOCK_MINUTES} 分钟后重试`,
      code: "TOO_MANY_ATTEMPTS",
      retryAfterSeconds: LOCK_MINUTES * 60,
    };
  }

  if (record?._id) {
    await db.collection(GUARD_COLLECTION).doc(record._id).update({
      fail_count: nextFail,
      updated_at: nowIso,
    });
  } else {
    await db.collection(GUARD_COLLECTION).add({
      email,
      purpose,
      fail_count: nextFail,
      locked_until: null,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  return {
    success: false,
    error: "验证码错误",
    code: "OTP_INVALID",
  };
}

async function checkLocked(db: any, email: string, purpose: OtpPurpose): Promise<OtpResult | null> {
  const record = await getGuardRecord(db, email, purpose);
  if (!record?.locked_until) return null;

  const lockUntil = new Date(record.locked_until);
  const now = new Date();
  if (lockUntil <= now) {
    await resetGuardRecord(db, email, purpose);
    return null;
  }

  return {
    success: false,
    error: "验证失败次数过多，请稍后再试",
    code: "TOO_MANY_ATTEMPTS",
    retryAfterSeconds: Math.max(1, Math.ceil((lockUntil.getTime() - now.getTime()) / 1000)),
  };
}

export async function sendEmailOtp(
  email: string,
  purpose: OtpPurpose
): Promise<OtpResult> {
  try {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + EXPIRES_MINUTES * 60 * 1000).toISOString();

    const app = getCloudBaseApp();
    const db = app.database();

    const latest = await db
      .collection(COLLECTION)
      .where({ email, purpose })
      .orderBy("created_at", "desc")
      .limit(1)
      .get();

    const latestRecord = latest?.data?.[0];
    if (latestRecord?.created_at) {
      const lastTs = new Date(latestRecord.created_at).getTime();
      const nowTs = Date.now();
      const gapSec = Math.floor((nowTs - lastTs) / 1000);
      if (gapSec < SEND_COOLDOWN_SECONDS) {
        return {
          success: false,
          error: `发送过于频繁，请 ${SEND_COOLDOWN_SECONDS - gapSec} 秒后重试`,
          code: "TOO_FREQUENT",
          retryAfterSeconds: SEND_COOLDOWN_SECONDS - gapSec,
        };
      }
    }

    await db
      .collection(COLLECTION)
      .where({ email, purpose, used: false })
      .update({ used: true, updated_at: new Date().toISOString() });

    await db.collection(COLLECTION).add({
      email,
      purpose,
      code_hash: hashCode(code),
      expires_at: expiresAt,
      used: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const subject =
      purpose === "signup"
        ? "MornGPT 注册验证码"
        : "MornGPT 重置密码验证码";
    const text = `您的验证码是：${code}\n\n${EXPIRES_MINUTES} 分钟内有效。若非本人操作，请忽略此邮件。`;

    const sendResult = await sendEmailBySmtp({ to: email, subject, text });
    if (!sendResult.success) {
      return { success: false, error: sendResult.error || "邮件发送失败" };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "发送验证码失败",
    };
  }
}

export async function verifyEmailOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): Promise<OtpResult> {
  try {
    const app = getCloudBaseApp();
    const db = app.database();

    const lockedResult = await checkLocked(db, email, purpose);
    if (lockedResult) {
      return lockedResult;
    }

    const result = await db
      .collection(COLLECTION)
      .where({
        email,
        purpose,
        used: false,
        code_hash: hashCode(code),
      })
      .orderBy("created_at", "desc")
      .limit(1)
      .get();

    const record = result?.data?.[0];
    if (!record) {
      return await increaseFailedAttempt(db, email, purpose);
    }

    if (new Date(record.expires_at) < new Date()) {
      await increaseFailedAttempt(db, email, purpose);
      return { success: false, error: "验证码已过期", code: "OTP_EXPIRED" };
    }

    await db.collection(COLLECTION).doc(record._id).update({
      used: true,
      updated_at: new Date().toISOString(),
    });

    await resetGuardRecord(db, email, purpose);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "验证码校验失败",
    };
  }
}
