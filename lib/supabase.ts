import { createClient } from "@supabase/supabase-js";

// 延迟初始化 Supabase 客户端，避免在构建时访问环境变量
let supabaseInstance: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  // 延迟到运行时才读取环境变量，兼容新旧 Key 命名
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseAnonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();

  // 缺失配置时直接报错，避免静默回退到占位域名导致迷惑性网络错误
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase config missing: NEXT_PUBLIC_SUPABASE_URL and " +
        "(NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY) must be set."
    );
  }

  // 使用 Supabase SDK 的默认存储键（sb-<project>-auth-token）以获得最稳定的持久化行为
  supabaseInstance = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }
  );

  return supabaseInstance;
}

// 导出默认的 supabase 客户端（保持向后兼容）
export const supabase = new Proxy({} as any, {
  get: (target, prop) => {
    const client = getSupabaseClient();
    return client[prop as keyof typeof client];
  },
});
