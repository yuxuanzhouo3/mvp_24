import { NextResponse } from "next/server";
import {
  DEPLOY_REGION,
  isChinaRegion,
  RegionConfig,
  printRegionConfig,
} from "@/lib/config/region";

/**
 * GET /api/config/region
 * 返回当前区域配置信息
 */
export async function GET() {
  // 打印配置信息到控制台
  printRegionConfig();

  return NextResponse.json({
    deployRegion: DEPLOY_REGION,
    isChinaRegion: isChinaRegion(),
    config: RegionConfig,
    env: {
      DEPLOY_REGION: process.env.DEPLOY_REGION,
      NODE_ENV: process.env.NODE_ENV,
    },
  });
}
