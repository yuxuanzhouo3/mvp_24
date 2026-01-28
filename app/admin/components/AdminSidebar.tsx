"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminLogout } from "@/actions/admin-auth";
import { Button } from "@/components/ui/button";
import {
  Image,
  Package,
  FolderOpen,
  Settings,
  LogOut,
  LayoutDashboard,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
  username: string;
}

const menuItems = [
  {
    title: "数据仪表盘",
    href: "/admin/dashboard",
    icon: BarChart3,
  },
  {
    title: "广告管理",
    href: "/admin/ads",
    icon: Image,
  },
  {
    title: "发布版本",
    href: "/admin/releases",
    icon: Package,
  },
  {
    title: "文件管理",
    href: "/admin/files",
    icon: FolderOpen,
  },
  {
    title: "系统设置",
    href: "/admin/settings",
    icon: Settings,
  },
];

export default function AdminSidebar({ username }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <LayoutDashboard className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">后台管理</h1>
            <p className="text-xs text-gray-500">MultiGPT Admin</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {username.charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="text-sm font-medium">{username}</span>
          </div>
        </div>
        <form action={adminLogout}>
          <Button
            type="submit"
            variant="outline"
            className="w-full justify-start"
          >
            <LogOut className="w-4 h-4 mr-2" />
            退出登录
          </Button>
        </form>
      </div>
    </aside>
  );
}
