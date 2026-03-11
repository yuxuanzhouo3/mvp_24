import { getAdminSession } from "@/lib/admin/session";
import { getCurrentAdminDataProvider, getCurrentAdminRegionLabel } from "@/lib/admin/region";
import AdminSidebar from "./components/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  if (!session) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar
        username={session.username}
        regionLabel={getCurrentAdminRegionLabel()}
        providerLabel={getCurrentAdminDataProvider() === "cloudbase" ? "CloudBase" : "Supabase"}
      />
      <main className="flex-1 p-8 ml-64">{children}</main>
    </div>
  );
}
