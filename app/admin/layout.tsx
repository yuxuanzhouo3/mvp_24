import { getAdminSession } from "@/lib/admin/session";
import AdminSidebar from "./components/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  // 未登录时（登录页），只渲染 children，不显示侧边栏
  // 路由保护由 proxy.ts 处理
  if (!session) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar username={session.username} />
      <main className="flex-1 p-8 ml-64">
        {children}
      </main>
    </div>
  );
}
