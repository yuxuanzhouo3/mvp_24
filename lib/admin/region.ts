import { isChinaRegion } from "@/lib/config/region";

export type AdminRegion = "CN" | "INTL";

export function getCurrentAdminRegion(): AdminRegion {
  return isChinaRegion() ? "CN" : "INTL";
}

export function getCurrentAdminRegionLabel(): string {
  return getCurrentAdminRegion() === "CN" ? "国内版" : "国际版";
}

export function getCurrentAdminDataProvider(): "cloudbase" | "supabase" {
  return getCurrentAdminRegion() === "CN" ? "cloudbase" : "supabase";
}

export function isCurrentAdminRegion(region: string | null | undefined): boolean {
  return !region || region === getCurrentAdminRegion();
}

export function resolveAdminRegionAccess(region: string | null | undefined):
  | { ok: true; region: AdminRegion }
  | { ok: false; region: AdminRegion; error: string } {
  const currentRegion = getCurrentAdminRegion();
  if (!region || region === currentRegion) {
    return { ok: true, region: currentRegion };
  }

  return {
    ok: false,
    region: currentRegion,
    error:
      currentRegion === "CN"
        ? "当前后台仅允许访问国内版数据"
        : "Current admin only allows INTL data",
  };
}
