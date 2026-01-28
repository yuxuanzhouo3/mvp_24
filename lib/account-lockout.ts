import { logSecurityEvent } from "./logger";

// 账户锁定配置
export interface AccountLockoutPolicy {
  maxFailedAttempts: number; // 最大失败尝试次数
  lockoutDurationMinutes: number; // 锁定持续时间（分钟）
  resetAfterMinutes: number; // 重置计数器时间（分钟）
  progressiveLockout: boolean; // 是否使用渐进式锁定
}

// 默认锁定策略
export const DEFAULT_LOCKOUT_POLICY: AccountLockoutPolicy = {
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 15,
  resetAfterMinutes: 30,
  progressiveLockout: true,
};

// 账户锁定记录
interface LockoutRecord {
  failedAttempts: number;
  lastFailedAttempt: Date;
  lockoutUntil?: Date;
  progressiveLevel: number; // 渐进式锁定级别
}

/**
 * 账户锁定管理器
 */
export class AccountLockoutManager {
  private static instance: AccountLockoutManager;
  private policy: AccountLockoutPolicy;
  private lockoutRecords: Map<string, LockoutRecord> = new Map();

  private constructor(policy: AccountLockoutPolicy = DEFAULT_LOCKOUT_POLICY) {
    this.policy = policy;

    // 定期清理过期的锁定记录
    setInterval(() => this.cleanupExpiredRecords(), 5 * 60 * 1000); // 每5分钟清理一次
  }

  static getInstance(policy?: AccountLockoutPolicy): AccountLockoutManager {
    if (!AccountLockoutManager.instance) {
      AccountLockoutManager.instance = new AccountLockoutManager(policy);
    }
    return AccountLockoutManager.instance;
  }

  /**
   * 记录登录失败
   */
  recordFailedAttempt(
    identifier: string,
    ip?: string
  ): {
    isLocked: boolean;
    remainingAttempts: number;
    lockoutUntil?: Date;
  } {
    const now = new Date();
    const record = this.lockoutRecords.get(identifier) || {
      failedAttempts: 0,
      lastFailedAttempt: now,
      progressiveLevel: 0,
    };

    // 检查是否需要重置计数器
    const timeSinceLastAttempt =
      now.getTime() - record.lastFailedAttempt.getTime();
    const resetThreshold = this.policy.resetAfterMinutes * 60 * 1000;

    if (timeSinceLastAttempt > resetThreshold) {
      record.failedAttempts = 0;
      record.progressiveLevel = 0;
    }

    record.failedAttempts++;
    record.lastFailedAttempt = now;

    // 计算锁定持续时间
    let lockoutDuration = this.policy.lockoutDurationMinutes;

    if (this.policy.progressiveLockout) {
      // 渐进式锁定：每次失败增加锁定时间
      record.progressiveLevel++;
      lockoutDuration = Math.min(
        this.policy.lockoutDurationMinutes *
          Math.pow(2, record.progressiveLevel - 1),
        24 * 60 // 最大24小时
      );
    }

    // 检查是否达到锁定阈值
    if (record.failedAttempts >= this.policy.maxFailedAttempts) {
      record.lockoutUntil = new Date(
        now.getTime() + lockoutDuration * 60 * 1000
      );

      logSecurityEvent("account_locked", undefined, ip, {
        identifier: this.maskIdentifier(identifier),
        failedAttempts: record.failedAttempts,
        lockoutDuration,
        progressiveLevel: record.progressiveLevel,
      });
    }

    this.lockoutRecords.set(identifier, record);

    const isLocked = record.lockoutUntil ? record.lockoutUntil > now : false;
    const remainingAttempts = Math.max(
      0,
      this.policy.maxFailedAttempts - record.failedAttempts
    );

    return {
      isLocked,
      remainingAttempts,
      lockoutUntil: record.lockoutUntil,
    };
  }

  /**
   * 记录登录成功 - 重置失败计数器
   */
  recordSuccessfulLogin(identifier: string): void {
    const record = this.lockoutRecords.get(identifier);
    if (record) {
      record.failedAttempts = 0;
      record.progressiveLevel = 0;
      delete record.lockoutUntil;
    }
  }

  /**
   * 检查账户是否被锁定
   */
  isLocked(identifier: string): {
    locked: boolean;
    lockoutUntil?: Date;
    remainingTimeMinutes?: number;
  } {
    const record = this.lockoutRecords.get(identifier);
    if (!record || !record.lockoutUntil) {
      return { locked: false };
    }

    const now = new Date();
    if (record.lockoutUntil > now) {
      const remainingTimeMinutes = Math.ceil(
        (record.lockoutUntil.getTime() - now.getTime()) / (1000 * 60)
      );
      return {
        locked: true,
        lockoutUntil: record.lockoutUntil,
        remainingTimeMinutes,
      };
    } else {
      // 锁定已过期，重置记录
      record.failedAttempts = 0;
      record.progressiveLevel = 0;
      delete record.lockoutUntil;
      return { locked: false };
    }
  }

  /**
   * 获取账户状态
   */
  getAccountStatus(identifier: string): {
    failedAttempts: number;
    lastFailedAttempt?: Date;
    lockoutUntil?: Date;
    progressiveLevel: number;
  } {
    const record = this.lockoutRecords.get(identifier);
    if (!record) {
      return {
        failedAttempts: 0,
        progressiveLevel: 0,
      };
    }

    return {
      failedAttempts: record.failedAttempts,
      lastFailedAttempt: record.lastFailedAttempt,
      lockoutUntil: record.lockoutUntil,
      progressiveLevel: record.progressiveLevel,
    };
  }

  /**
   * 手动解锁账户
   */
  unlockAccount(identifier: string): boolean {
    const record = this.lockoutRecords.get(identifier);
    if (record) {
      record.failedAttempts = 0;
      record.progressiveLevel = 0;
      delete record.lockoutUntil;
      return true;
    }
    return false;
  }

  /**
   * 清理过期的锁定记录
   */
  private cleanupExpiredRecords(): void {
    const now = new Date();
    const maxAge = this.policy.resetAfterMinutes * 60 * 1000 * 2; // 保留双倍重置时间

    for (const [identifier, record] of this.lockoutRecords.entries()) {
      const age = now.getTime() - record.lastFailedAttempt.getTime();
      if (age > maxAge && !record.lockoutUntil) {
        this.lockoutRecords.delete(identifier);
      }
    }
  }

  /**
   * 遮罩标识符（用于日志记录）
   */
  private maskIdentifier(identifier: string): string {
    if (identifier.includes("@")) {
      // 邮箱地址
      const [local, domain] = identifier.split("@");
      if (local.length > 2) {
        return `${local.substring(0, 2)}***@${domain}`;
      }
    }
    // 其他标识符
    if (identifier.length > 4) {
      return `${identifier.substring(0, 2)}***${identifier.substring(
        identifier.length - 2
      )}`;
    }
    return "***";
  }

  /**
   * 更新锁定策略
   */
  updatePolicy(newPolicy: Partial<AccountLockoutPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
  }

  /**
   * 获取当前策略
   */
  getPolicy(): AccountLockoutPolicy {
    return { ...this.policy };
  }
}

// 导出单例实例
export const accountLockout = AccountLockoutManager.getInstance();
