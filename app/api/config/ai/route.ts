/**
 * AI 配置 API
 * 根据 DEPLOY_REGION 环境变量返回对应的 AI 配置
 */

import { NextRequest, NextResponse } from "next/server";
import {
  loadAIConfig,
  getEnabledAgents,
  hasEnabledAI,
} from "@/lib/ai/ai-config-loader";
import { isChinaRegion, DEPLOY_REGION } from "@/lib/config/region";

export async function GET(request: NextRequest) {
  try {
    // 使用 DEPLOY_REGION 环境变量，而不是IP检测
    const region = isChinaRegion() ? "china" : "global";
    const country = isChinaRegion() ? "CN" : "INTL";

    console.log(
      `📡 AI 配置请求 - DEPLOY_REGION: ${DEPLOY_REGION}, 区域: ${region}, 国家: ${country}`
    );

    // 加载对应区域的配置
    const config = loadAIConfig(region as "china" | "global" | "usa");

    // 获取已启用的智能体
    const enabledAgents = getEnabledAgents(
      region as "china" | "global" | "usa"
    );

    // 检查是否有可用的 AI
    const hasAI = hasEnabledAI(region as "china" | "global" | "usa");

    if (!hasAI) {
      console.warn(`⚠️ 区域 ${region} 没有启用的 AI Provider`);
      return NextResponse.json(
        {
          error: "No AI providers enabled",
          message: "Please configure API keys in environment variables",
          region,
          country,
        },
        { status: 503 }
      );
    }

    // 返回配置（不包含 API 密钥）
    return NextResponse.json({
      success: true,
      region: config.region,
      country,
      agents: enabledAgents,
      totalAgents: enabledAgents.length,
      providers: config.providers.map((p) => ({
        provider: p.provider,
        enabled: p.enabled,
        baseURL: p.baseURL,
        // ⚠️ 不返回 API 密钥到前端
      })),
    });
  } catch (error) {
    console.error("❌ AI 配置加载失败:", error);
    return NextResponse.json(
      {
        error: "Failed to load AI configuration",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
