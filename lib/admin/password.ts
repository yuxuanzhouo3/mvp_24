/**
 * 密码工具函数
 * 使用 bcryptjs 进行密码哈希和验证
 */

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * 生成密码哈希
 * @param password 明文密码
 * @returns 哈希后的密码
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * 验证密码
 * @param password 明文密码
 * @param hash 数据库中的哈希值
 * @returns 是否匹配
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
