/**
 * AI 配置 API
 * 根据部署区域返回前端可见的模型/智能体配置
 */

import { NextRequest, NextResponse } from "next/server";
import { isChinaRegion, DEPLOY_REGION } from "@/lib/config/region";
import { buildCatalogAgent, listEnabledRuntimeModels } from "@/lib/ai/runtime-models";
import { SMART_AGENT_ID, SMART_MODEL_ID } from "@/lib/ai/smart-model-router";

export async function GET(request: NextRequest) {
  try {
    const region = isChinaRegion() ? "china" : "global";
    const country = isChinaRegion() ? "CN" : "INTL";

    console.log(
      `📡 AI 配置请求 - DEPLOY_REGION: ${DEPLOY_REGION}, 区域: ${region}, 国家: ${country}`
    );

    const models = await listEnabledRuntimeModels(country);
    const catalogAgents = await Promise.all(
      models.map((entry, index) => buildCatalogAgent(entry, index))
    );
    const agents = [
      {
        id: SMART_AGENT_ID,
        name: country === "CN" ? "自动" : "Auto",
        provider: "auto",
        model: SMART_MODEL_ID,
        description:
          country === "CN"
            ? "自动选择最优模型"
            : "Automatically choose the best model",
        capabilities: [
          "analysis",
          "conversation",
          "coding",
          "creative",
          "research",
          "translation",
        ],
        maxTokens: 16000,
        temperature: 0.7,
        icon: "⭐",
        pricingLevel: "medium" as const,
        unitPrice: 0,
        releaseDate: null,
      },
      ...catalogAgents,
    ];

    const responseData = isChinaRegion() ? {
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
    } : {
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
    };

    const response = NextResponse.json(responseData);
    response.headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
    return response;
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
