/**
 * Multi-Agent Orchestrator
 * 多AI协作编排器 - 支持顺序、并行、辩论、综合等模式
 */

import { aiRouter } from "./router";
import { AIMessage, AIResponse, StreamChunk } from "./types";
import { AIAgentConfig, getAgentById } from "./ai-agents.config";

export type CollaborationMode =
  | "sequential"
  | "parallel"
  | "debate"
  | "synthesis";

export interface AgentResponse {
  agentId: string;
  agentName: string;
  content: string;
  tokens: number;
  cost: number;
  timestamp: Date;
  error?: string;
}

export interface MultiAgentResult {
  responses: AgentResponse[];
  synthesis?: string; // 综合结论（如果有）
  totalTokens: number;
  totalCost: number;
  mode: CollaborationMode;
}

/**
 * 多AI协作编排器类
 */
export class MultiAgentOrchestrator {
  /**
   * 顺序协作 - AI按顺序处理，后面的AI可以看到前面的结果
   */
  async sequential(
    agentIds: string[],
    userMessage: string,
    options?: {
      onAgentStart?: (agentId: string) => void;
      onAgentComplete?: (response: AgentResponse) => void;
      onError?: (agentId: string, error: Error) => void;
    }
  ): Promise<MultiAgentResult> {
    const responses: AgentResponse[] = [];
    let accumulatedContext = userMessage;
    let totalTokens = 0;
    let totalCost = 0;

    for (const agentId of agentIds) {
      try {
        const agent = getAgentById(agentId);
        if (!agent) {
          throw new Error(`Agent ${agentId} not found`);
        }

        options?.onAgentStart?.(agentId);

        // 构建消息上下文
        const messages: AIMessage[] = [
          { role: "system", content: agent.systemPrompt || "" },
          { role: "user", content: accumulatedContext },
        ];

        // 调用AI
        const provider = aiRouter.getProviderForModel(agent.model);
        const result = await provider.chat(messages, {
          model: agent.model,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
        });

        const response: AgentResponse = {
          agentId,
          agentName: agent.name,
          content: result.content,
          tokens: result.tokens.total,
          cost: this.calculateCost(
            agent.model,
            result.tokens.prompt,
            result.tokens.completion
          ),
          timestamp: new Date(),
        };

        responses.push(response);
        totalTokens += result.tokens.total;
        totalCost += response.cost;

        // 更新上下文 - 添加该AI的回答
        accumulatedContext += `\n\n[${agent.name}的回答]\n${result.content}`;

        options?.onAgentComplete?.(response);
      } catch (error) {
        const errorResponse: AgentResponse = {
          agentId,
          agentName: getAgentById(agentId)?.name || agentId,
          content: "",
          tokens: 0,
          cost: 0,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : "Unknown error",
        };
        responses.push(errorResponse);
        options?.onError?.(
          agentId,
          error instanceof Error ? error : new Error("Unknown error")
        );
      }
    }

    return {
      responses,
      totalTokens,
      totalCost,
      mode: "sequential",
    };
  }

  /**
   * 并行协作 - AI同时独立处理，互不影响
   */
  async parallel(
    agentIds: string[],
    userMessage: string,
    options?: {
      onAgentStart?: (agentId: string) => void;
      onAgentComplete?: (response: AgentResponse) => void;
      onError?: (agentId: string, error: Error) => void;
    }
  ): Promise<MultiAgentResult> {
    const promises = agentIds.map(async (agentId) => {
      try {
        const agent = getAgentById(agentId);
        if (!agent) {
          throw new Error(`Agent ${agentId} not found`);
        }

        options?.onAgentStart?.(agentId);

        const messages: AIMessage[] = [
          { role: "system", content: agent.systemPrompt || "" },
          { role: "user", content: userMessage },
        ];

        const provider = aiRouter.getProviderForModel(agent.model);
        const result = await provider.chat(messages, {
          model: agent.model,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
        });

        const response: AgentResponse = {
          agentId,
          agentName: agent.name,
          content: result.content,
          tokens: result.tokens.total,
          cost: this.calculateCost(
            agent.model,
            result.tokens.prompt,
            result.tokens.completion
          ),
          timestamp: new Date(),
        };

        options?.onAgentComplete?.(response);
        return response;
      } catch (error) {
        const errorResponse: AgentResponse = {
          agentId,
          agentName: getAgentById(agentId)?.name || agentId,
          content: "",
          tokens: 0,
          cost: 0,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : "Unknown error",
        };
        options?.onError?.(
          agentId,
          error instanceof Error ? error : new Error("Unknown error")
        );
        return errorResponse;
      }
    });

    const responses = await Promise.all(promises);
    const totalTokens = responses.reduce((sum, r) => sum + r.tokens, 0);
    const totalCost = responses.reduce((sum, r) => sum + r.cost, 0);

    return {
      responses,
      totalTokens,
      totalCost,
      mode: "parallel",
    };
  }

  /**
   * 辩论模式 - AI之间互相质疑和反驳
   */
  async debate(
    agentIds: string[],
    userMessage: string,
    rounds: number = 2,
    options?: {
      onRoundStart?: (round: number) => void;
      onAgentResponse?: (round: number, response: AgentResponse) => void;
    }
  ): Promise<MultiAgentResult> {
    const allResponses: AgentResponse[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    const debateHistory: string[] = [userMessage];

    for (let round = 0; round < rounds; round++) {
      options?.onRoundStart?.(round + 1);

      for (const agentId of agentIds) {
        const agent = getAgentById(agentId);
        if (!agent) continue;

        // 构建辩论上下文
        const debatePrompt = `${
          agent.systemPrompt
        }\n\n你正在参与一个多AI辩论。请仔细分析其他AI的观点，提出你的见解和质疑。\n\n${debateHistory.join(
          "\n\n"
        )}`;

        const messages: AIMessage[] = [
          { role: "system", content: debatePrompt },
          { role: "user", content: `请提供你的分析（第${round + 1}轮）` },
        ];

        const provider = aiRouter.getProviderForModel(agent.model);
        const result = await provider.chat(messages, {
          model: agent.model,
          temperature: agent.temperature || 0.7,
          maxTokens: agent.maxTokens,
        });

        const response: AgentResponse = {
          agentId,
          agentName: agent.name,
          content: result.content,
          tokens: result.tokens.total,
          cost: this.calculateCost(
            agent.model,
            result.tokens.prompt,
            result.tokens.completion
          ),
          timestamp: new Date(),
        };

        allResponses.push(response);
        totalTokens += result.tokens.total;
        totalCost += response.cost;

        debateHistory.push(
          `[${agent.name} - 第${round + 1}轮]\n${result.content}`
        );
        options?.onAgentResponse?.(round + 1, response);
      }
    }

    return {
      responses: allResponses,
      totalTokens,
      totalCost,
      mode: "debate",
    };
  }

  /**
   * 综合模式 - 先并行分析，再由主AI综合所有观点
   */
  async synthesis(
    agentIds: string[],
    userMessage: string,
    synthesisAgentId?: string // 可选：指定综合者，默认使用第一个
  ): Promise<MultiAgentResult> {
    // 第一阶段：并行获取各AI的分析
    const parallelResult = await this.parallel(agentIds, userMessage);

    // 第二阶段：综合所有观点
    const synthesizer = getAgentById(synthesisAgentId || agentIds[0]);
    if (!synthesizer) {
      throw new Error("Synthesis agent not found");
    }

    // 构建综合提示词
    const analysisText = parallelResult.responses
      .map((r) => `[${r.agentName}的分析]\n${r.content}`)
      .join("\n\n---\n\n");

    const synthesisPrompt = `你需要综合多位专家的分析，提供一个全面、平衡的结论。

原始问题：
${userMessage}

各专家的分析：
${analysisText}

请综合以上所有观点，提供：
1. 共识点
2. 分歧点
3. 综合建议
4. 风险提示`;

    const messages: AIMessage[] = [
      { role: "system", content: synthesizer.systemPrompt || "" },
      { role: "user", content: synthesisPrompt },
    ];

    const provider = aiRouter.getProviderForModel(synthesizer.model);
    const result = await provider.chat(messages, {
      model: synthesizer.model,
      temperature: 0.7,
      maxTokens: synthesizer.maxTokens,
    });

    const synthesisResponse: AgentResponse = {
      agentId: synthesizer.id,
      agentName: `${synthesizer.name} (综合者)`,
      content: result.content,
      tokens: result.tokens.total,
      cost: this.calculateCost(
        synthesizer.model,
        result.tokens.prompt,
        result.tokens.completion
      ),
      timestamp: new Date(),
    };

    return {
      responses: parallelResult.responses,
      synthesis: result.content,
      totalTokens: parallelResult.totalTokens + result.tokens.total,
      totalCost: parallelResult.totalCost + synthesisResponse.cost,
      mode: "synthesis",
    };
  }

  /**
   * 流式多AI协作（用于实时UI更新）
   */
  async *parallelStream(
    agentIds: string[],
    userMessage: string
  ): AsyncGenerator<{ agentId: string; chunk: StreamChunk }> {
    const streams = agentIds.map(async function* (agentId) {
      const agent = getAgentById(agentId);
      if (!agent) return;

      const messages: AIMessage[] = [
        { role: "system", content: agent.systemPrompt || "" },
        { role: "user", content: userMessage },
      ];

      const provider = aiRouter.getProviderForModel(agent.model);
      const stream = provider.chatStream(messages, {
        model: agent.model,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
      });

      for await (const chunk of stream) {
        yield { agentId, chunk };
      }
    });

    // 合并所有流
    for (const stream of streams) {
      for await (const item of stream) {
        yield item;
      }
    }
  }

  /**
   * 计算费用（复用token-counter的逻辑）
   */
  private calculateCost(
    model: string,
    promptTokens: number,
    completionTokens: number
  ): number {
    // 这里应该导入真实的calculateCost函数
    // 为了演示，使用简化版本
    const pricing: Record<string, { prompt: number; completion: number }> = {
      "gpt-4-turbo": { prompt: 0.01, completion: 0.03 },
      "gpt-3.5-turbo": { prompt: 0.0005, completion: 0.0015 },
      "claude-3-5-sonnet-20241022": { prompt: 0.003, completion: 0.015 },
    };

    const price = pricing[model] || pricing["gpt-3.5-turbo"];
    return (
      (promptTokens / 1000) * price.prompt +
      (completionTokens / 1000) * price.completion
    );
  }
}

// 导出单例
export const multiAgentOrchestrator = new MultiAgentOrchestrator();
