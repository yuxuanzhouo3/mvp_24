import { redirect } from "next/navigation";
import { getCurrentAdminRegion } from "@/lib/admin/region";

export default function DashboardPage() {
  redirect(
    getCurrentAdminRegion() === "CN"
      ? "/admin/dashboard/cn"
      : "/admin/dashboard/intl"
  );
}
