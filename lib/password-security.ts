import zxcvbn from "zxcvbn";
import { z } from "zod";

// 密码强度级别
export enum PasswordStrength {
  VERY_WEAK = 0,
  WEAK = 1,
  FAIR = 2,
  GOOD = 3,
  STRONG = 4,
}

// 密码策略配置
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventCommonPasswords: boolean;
  preventPersonalInfo: boolean;
  maxConsecutiveChars: number;
  minStrength: PasswordStrength;
}

// 默认密码策略
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  preventCommonPasswords: true,
  preventPersonalInfo: true,
  maxConsecutiveChars: 3,
  minStrength: PasswordStrength.GOOD,
};

// 密码验证结果
export interface PasswordValidationResult {
  isValid: boolean;
  strength: PasswordStrength;
  score: number;
  feedback: string[];
  suggestions: string[];
}

/**
 * 密码安全管理器
 */
export class PasswordSecurityManager {
  private static instance: PasswordSecurityManager;
  private policy: PasswordPolicy;

  private constructor(policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY) {
    this.policy = policy;
  }

  static getInstance(policy?: PasswordPolicy): PasswordSecurityManager {
    if (!PasswordSecurityManager.instance) {
      PasswordSecurityManager.instance = new PasswordSecurityManager(policy);
    }
    return PasswordSecurityManager.instance;
  }

  /**
   * 验证密码强度和合规性
   */
  validatePassword(
    password: string,
    userInputs: string[] = []
  ): PasswordValidationResult {
    const feedback: string[] = [];
    const suggestions: string[] = [];

    // 基本长度检查
    if (password.length < this.policy.minLength) {
      feedback.push(`密码长度至少需要${this.policy.minLength}个字符`);
      suggestions.push(`增加密码长度到至少${this.policy.minLength}个字符`);
    }

    // 字符类型检查
    if (this.policy.requireUppercase && !/[A-Z]/.test(password)) {
      feedback.push("密码必须包含至少一个大写字母");
      suggestions.push("在密码中添加大写字母");
    }

    if (this.policy.requireLowercase && !/[a-z]/.test(password)) {
      feedback.push("密码必须包含至少一个小写字母");
      suggestions.push("在密码中添加小写字母");
    }

    if (this.policy.requireNumbers && !/\d/.test(password)) {
      feedback.push("密码必须包含至少一个数字");
      suggestions.push("在密码中添加数字");
    }

    if (
      this.policy.requireSpecialChars &&
      !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    ) {
      feedback.push("密码必须包含至少一个特殊字符");
      suggestions.push("在密码中添加特殊字符（如!@#$%^&*）");
    }

    // 连续字符检查
    if (this.hasConsecutiveChars(password, this.policy.maxConsecutiveChars)) {
      feedback.push(
        `密码不能包含超过${this.policy.maxConsecutiveChars}个连续相同字符`
      );
      suggestions.push("避免使用连续相同字符");
    }

    // 使用zxcvbn进行强度评估
    const zxcvbnResult = zxcvbn(password, userInputs);
    const strength = zxcvbnResult.score as PasswordStrength;

    // 检查是否低于最低强度要求
    if (strength < this.policy.minStrength) {
      feedback.push(
        `密码强度不足（当前：${this.getStrengthLabel(
          strength
        )}，需要：${this.getStrengthLabel(this.policy.minStrength)}）`
      );
      suggestions.push(...zxcvbnResult.feedback.suggestions);
    }

    // 检查常见密码
    if (this.policy.preventCommonPasswords && zxcvbnResult.score < 3) {
      feedback.push("密码过于常见，请选择更复杂的密码");
      suggestions.push("避免使用常见密码、字典词或简单模式");
    }

    // 检查个人信息的包含
    if (
      this.policy.preventPersonalInfo &&
      this.containsPersonalInfo(password, userInputs)
    ) {
      feedback.push("密码不能包含个人信息");
      suggestions.push("避免在密码中使用姓名、邮箱、电话等个人信息");
    }

    return {
      isValid: feedback.length === 0,
      strength,
      score: zxcvbnResult.score,
      feedback,
      suggestions: [...new Set(suggestions)], // 去重
    };
  }

  /**
   * 生成强密码建议
   */
  generatePasswordSuggestion(length: number = 12): string {
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*";

    let password = "";

    // 确保包含所有必需字符类型
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    if (this.policy.requireSpecialChars) {
      password += symbols[Math.floor(Math.random() * symbols.length)];
    }

    // 填充剩余长度
    const allChars = lowercase + uppercase + numbers + symbols;
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // 随机打乱
    return password
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  }

  /**
   * 检查是否包含连续相同字符
   */
  private hasConsecutiveChars(
    password: string,
    maxConsecutive: number
  ): boolean {
    let count = 1;
    for (let i = 1; i < password.length; i++) {
      if (password[i] === password[i - 1]) {
        count++;
        if (count > maxConsecutive) {
          return true;
        }
      } else {
        count = 1;
      }
    }
    return false;
  }

  /**
   * 检查是否包含个人信息
   */
  private containsPersonalInfo(
    password: string,
    userInputs: string[]
  ): boolean {
    const lowerPassword = password.toLowerCase();
    return userInputs.some((input) => {
      const lowerInput = input.toLowerCase();
      return lowerPassword.includes(lowerInput) && lowerInput.length > 2;
    });
  }

  /**
   * 获取强度标签
   */
  private getStrengthLabel(strength: PasswordStrength): string {
    switch (strength) {
      case PasswordStrength.VERY_WEAK:
        return "非常弱";
      case PasswordStrength.WEAK:
        return "弱";
      case PasswordStrength.FAIR:
        return "一般";
      case PasswordStrength.GOOD:
        return "良好";
      case PasswordStrength.STRONG:
        return "强";
      default:
        return "未知";
    }
  }

  /**
   * 更新密码策略
   */
  updatePolicy(newPolicy: Partial<PasswordPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
  }

  /**
   * 获取当前策略
   */
  getPolicy(): PasswordPolicy {
    return { ...this.policy };
  }
}

// 导出单例实例
export const passwordSecurity = PasswordSecurityManager.getInstance();

// Zod schema for password validation
export const passwordSchema = z
  .string()
  .min(1, "密码不能为空")
  .refine(
    (password) => {
      const result = passwordSecurity.validatePassword(password);
      return result.isValid;
    },
    {
      message: "密码不符合安全要求",
    }
  );

// 密码确认schema
export const passwordConfirmSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });
