import { Ollama } from "@langchain/ollama";
import { StructuredOutputParser } from "langchain/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { FlowData } from "@/lib/stores/flow-store";

// 定义输出结构
const workflowParser = StructuredOutputParser.fromZodSchema(
  z.array(
    z.object({
      text: z.string().describe("工作环节名称"),
      ratio: z
        .number()
        .min(0)
        .max(1)
        .describe("这个工作环节占总用时的比例（0-1之间的小数）"),
    })
  )
);

// 添加获取树状结构字符串的函数
function getTreeString(
  flowData: FlowData,
  currentNodeId: string,
  indent = ""
): string {
  let result = "";
  const isCurrentNode = flowData.id === currentNodeId;
  const prefix = isCurrentNode ? "▶ " : "  ";

  // 添加当前节点
  result += `${indent}${prefix}${flowData.label} (${Math.round(
    flowData.ratio * 100
  )}%)\n`;

  // 递归添加子节点
  if (flowData.children.length > 0) {
    flowData.children.forEach((child, index) => {
      result += getTreeString(child, currentNodeId, indent + "  ");
    });
  }

  return result;
}

// 修改提示模板
const PROMPT_TEMPLATE = `你是一个工作流程分析专家。请将以下工作内容拆解为若干个主要工作环节。

当前工作流程树结构：
{context}

需要拆解的工作内容："{input}"

拆解要求：
1. 每个环节需要包含：
   - 环节名称（简明扼要）
   - 该环节预计占用总工作时间的比例（所有环节比例之和必须等于1）

2. 拆解原则：
   - 只拆解当前层级直接相关的工作内容
   - 拆解出的环节应该是当前工作内容的直接子任务
   - 避免跨层级拆解（不要包含已在其他层级出现的任务）
   - 保持同一层级的工作环节在逻辑上平行且互补
   - 参考工作流程树的整体结构，确保拆解的合理性

举例说明：
× 错误的拆解方式：
  "前端开发" -> "写代码"、"开会"、"部署上线"
  （这种拆解缺乏逻辑性和完整性）

√ 正确的拆解方式：
  "前端开发" -> "需求分析"、"UI设计"、"功能开发"、"测试优化"
  （这种拆解符合工作流程的逻辑顺序和完整性）

请确保：
- 根据工作内容的复杂程度，合理拆分工作环节
- 每个环节名称要简明扼要
- 所有环节的时间比例之和必须等于1
- 环节的拆解要在当前上下文范围内，与整体工作流程保持逻辑连贯性
- 严格按照要求的JSON格式输出
- 确保每个环节都是必要且独立的，避免过度拆分或过于笼统
- 注意查看完整的工作流程树，避免与其他层级的任务重复或冲突

{format_instructions}
`;

const prompt = PromptTemplate.fromTemplate(PROMPT_TEMPLATE);

// 创建 Ollama 实例
const model = new Ollama({
  baseUrl: "http://localhost:11434",
  model: "qwen2.5:7b",
  temperature: 1,
  verbose: true,
});

// 获取工作流程路径的函数
function getWorkflowPath(flowData: FlowData, nodeId: string): string[] {
  const findPath = (
    node: FlowData,
    targetId: string,
    path: string[]
  ): string[] | null => {
    if (node.id === targetId) {
      return [...path, node.label];
    }

    for (const child of node.children) {
      const result = findPath(child, targetId, [...path, node.label]);
      if (result) {
        return result;
      }
    }

    return null;
  };

  return findPath(flowData, nodeId, []) || [];
}

export async function decomposeWorkflow(
  text: string,
  flowData: FlowData | null = null,
  nodeId: string | null = null
) {
  try {
    // 准备上下文信息
    let contextStr = "无上层工作流程";
    if (flowData && nodeId) {
      contextStr =
        "当前完整工作流程树（▶ 表示当前需要拆解的节点）：\n" +
        getTreeString(flowData, nodeId);
    }

    // 准备提示
    const formatInstructions = workflowParser.getFormatInstructions();
    const input = await prompt.format({
      input: text,
      context: contextStr,
      format_instructions: formatInstructions,
    });

    // 打印完整的提示信息
    console.log("\n=== Prompt to LLM ===\n", input, "\n==================\n");

    // 获取模型响应
    const response = await model.call(input);

    // 打印模型响应
    console.log("\n=== LLM Response ===\n", response, "\n==================\n");

    // 解析响应
    const parsed = await workflowParser.parse(response);

    // 打印解析后的结果
    console.log("\n=== Parsed Result ===\n", parsed, "\n==================\n");

    // 验证比例之和是否接近1
    const totalRatio = parsed.reduce((sum, item) => sum + item.ratio, 0);
    if (Math.abs(totalRatio - 1) > 0.01) {
      // 如果总和不是1，规范化比例
      const normalized = parsed.map((item) => ({
        ...item,
        ratio: item.ratio / totalRatio,
      }));

      // 打印规范化后的结果
      console.log(
        "\n=== Normalized Result ===\n",
        normalized,
        "\n==================\n"
      );

      return normalized;
    }

    return parsed;
  } catch (error) {
    console.error(
      "\n=== Error in decomposeWorkflow ===\n",
      error,
      "\n==================\n"
    );
    throw new Error("Failed to decompose workflow");
  }
}
