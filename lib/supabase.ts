import { createClient } from "@supabase/supabase-js";

// 延迟初始化 Supabase 客户端，避免在构建时访问环境变量
let supabaseInstance: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  // 延迟到运行时才读取环境变量
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  // 运行时检查环境变量
  if (typeof window !== 'undefined' || process.env.NODE_ENV === 'production') {
    if (!supabaseUrl) {
      console.error(
        '❌ Missing NEXT_PUBLIC_SUPABASE_URL environment variable. ' +
        'Please set it in your deployment platform (e.g., Tencent Cloud)'
      );
    }

    if (!supabaseAnonKey) {
      console.error(
        '❌ Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable. ' +
        'Please set it in your deployment platform (e.g., Tencent Cloud)'
      );
    }
  }

  // 使用 Supabase SDK 的默认存储键（sb-<project>-auth-token）以获得最稳定的持久化行为
  supabaseInstance = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
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
