export async function GET() {
  return Response.json({
    wechatAppId: process.env.NEXT_PUBLIC_WECHAT_APP_ID,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    wechatCloudbaseId: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
  });
}
