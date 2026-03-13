/**
 * AI 配置 API
 * 根据部署区域返回前端可见的模型/智能体配置
 */

import { NextRequest, NextResponse } from "next/server";
import {
  loadAIConfig,
  getEnabledAgents,
  hasEnabledAI,
} from "@/lib/ai/ai-config-loader";
import { isChinaRegion, DEPLOY_REGION } from "@/lib/config/region";
import { buildCatalogAgent, listEnabledRuntimeModels } from "@/lib/ai/runtime-models";

export async function GET(request: NextRequest) {
  try {
    const region = isChinaRegion() ? "china" : "global";
    const country = isChinaRegion() ? "CN" : "INTL";

    console.log(
      `📡 AI 配置请求 - DEPLOY_REGION: ${DEPLOY_REGION}, 区域: ${region}, 国家: ${country}`
    );

    const models = await listEnabledRuntimeModels(country);
    const agents = await Promise.all(models.map((entry, index) => buildCatalogAgent(entry, index)));

    if (isChinaRegion()) {
      return NextResponse.json({
        success: true,
        region: "china",
        country,
        agents,
        totalAgents: agents.length,
        providers: [
          {
            provider: "bailian",
            enabled: Boolean(process.env.DASHSCOPE_API_KEY),
            baseURL: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
          },
          {
            provider: "volcengine",
            enabled: Boolean(process.env.VOLCENGINE_API_KEY),
            baseURL: process.env.VOLCENGINE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
          },
        ],
      });
    }

    return NextResponse.json({
      success: true,
      region: "global",
      country,
      agents,
      totalAgents: agents.length,
      providers: [
        {
          provider: "openrouter",
          enabled: Boolean(process.env.OPENROUTER_API),
          baseURL: "https://openrouter.ai/api/v1",
        },
      ],
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
