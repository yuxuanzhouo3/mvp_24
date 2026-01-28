/**
 * 简单的内存缓存工具
 * 支持设定过期时间，用于缓存统计数据
 */

interface CacheItem<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheItem<any>>();

/**
 * 生成缓存键
 */
export function generateCacheKey(
  type: string,
  region: string,
  startDate?: string,
  endDate?: string
): string {
  return `stats:${type}:${region}:${startDate || "all"}:${endDate || "all"}`;
}

/**
 * 从缓存获取数据
 */
export function getCachedData<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item) return null;

  // 检查是否过期
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }

  return item.data as T;
}

/**
 * 设置缓存数据
 * @param key 缓存键
 * @param data 数据
 * @param ttlSeconds 过期时间（秒），默认 600 秒（10 分钟）
 */
export function setCachedData<T>(
  key: string,
  data: T,
  ttlSeconds: number = 600
): void {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  cache.set(key, { data, expiresAt });
}

/**
 * 清除指定缓存
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * 清除所有缓存
 */
export function clearAllCache(): void {
  cache.clear();
}

/**
 * 清除所有过期的缓存项
 */
export function cleanupExpiredCache(): void {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (now > item.expiresAt) {
      cache.delete(key);
    }
  }
}

/**
 * 定期清理过期缓存（可选）
 */
setInterval(cleanupExpiredCache, 60000); // 每分钟清理一次
