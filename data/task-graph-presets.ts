export interface TaskGraphPreset {
  id: string;
  name: string;
  templateHint: string;
}

export const TASK_GRAPH_PRESETS: TaskGraphPreset[] = [
  {
    id: "general",
    name: "通用拆分模式",
    templateHint:
      "将目标拆成清晰的子任务：澄清需求→信息收集→方案设计→执行产出→校验与交付。",
  },
  {
    id: "coding",
    name: "编码实现模式",
    templateHint:
      "面向工程落地拆分：需求/边界→现状扫描→接口/数据结构→实现→测试/回归→风险与上线步骤。",
  },
  {
    id: "research",
    name: "调研分析模式",
    templateHint:
      "强调并联调研：多来源要点提炼→对比→结论与建议→引用与风险。",
  },
];
