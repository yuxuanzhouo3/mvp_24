import { redirect } from "next/navigation";

export default function AdminPage() {
  // 默认重定向到广告管理
  redirect("/admin/ads");
}
