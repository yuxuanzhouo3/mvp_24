import { NextResponse } from "next/server";
import { geoRouter } from "@/lib/architecture-modules/core/geo-router";
import { RegionType } from "@/lib/architecture-modules/core/types";

/**
 * 简单的Geo检测API
 * 返回 { region: string, countryCode?: string }
 *
 * 支持调试参数：
 * - ?debug=china: 强制返回中国区域
 * - ?debug=usa: 强制返回美国区域
 * - ?debug=europe: 强制返回欧洲区域
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const debugRegion = searchParams.get("debug");

    // 调试模式：强制返回指定区域
    if (debugRegion) {
      let region: RegionType;
      let countryCode: string;

      switch (debugRegion.toLowerCase()) {
        case "china":
          region = RegionType.CHINA;
          countryCode = "CN";
          break;
        case "usa":
        case "us":
          region = RegionType.USA;
          countryCode = "US";
          break;
        case "europe":
        case "eu":
          region = RegionType.EUROPE;
          countryCode = "DE";
          break;
        default:
          region = RegionType.USA;
          countryCode = "US";
      }

      return NextResponse.json({
        region,
        countryCode,
        debug: true,
        message: `Debug mode: forced ${region} region`,
      });
    }

    // 参考 middleware 中的获取逻辑，从请求头中读取可能的真实IP
    const headers = request.headers;

    const realIP = headers.get("x-real-ip");
    const forwardedFor = headers.get("x-forwarded-for");

    let clientIP: string | null = null;
    if (realIP) clientIP = realIP;
    else if (forwardedFor) clientIP = forwardedFor.split(",")[0].trim();

    // 如果无法获取IP，尝试使用 request.ip 兼容路径（Next.js 中通常不可用）
    if (!clientIP) {
      // 降级为本地检测（geoRouter 内部会处理）
      clientIP = "";
    }

    const geoResult = await geoRouter.detect(clientIP || "");

    return NextResponse.json({
      region: geoResult.region,
      countryCode: geoResult.countryCode,
    });
  } catch (err) {
    console.error("/api/geo error:", err);
    // 出错时返回默认海外
    return NextResponse.json({ region: RegionType.USA }, { status: 200 });
  }
}
