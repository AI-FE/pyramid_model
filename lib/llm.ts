// import { Ollama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
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

// 修改获取树状结构字符串的函数
function getTreeString(
  flowData: FlowData,
  currentNodeId: string,
  indent = ""
): string {
  let result = "";
  const isCurrentNode = flowData.id === currentNodeId;
  const prefix = isCurrentNode ? "▶ " : "  ";

  // 添加当前节点，不显示百分比
  result += `${indent}${prefix}${flowData.label}\n`;

  // 递归添加子节点
  if (flowData.children.length > 0) {
    flowData.children.forEach((child) => {
      result += getTreeString(child, currentNodeId, indent + "  ");
    });
  }

  return result;
}

// 修改提示模板
const PROMPT_TEMPLATE = `作为工作流程分析专家，请拆解以下工作内容。

工作流程树（▶ 为待拆解节点）：
{context}

待拆解内容："{input}"

注意：
1. 拆解结果不得与树中已有环节重复
2. 拆解必须是当前工作的直接子任务
3. 最后一个子任务应自然衔接下一环节

拆解要求：
- 每个环节包含名称和时间比例（总和为1）
- 只包含当前工种的具体工作
- 环节之间保持顺序连贯性

示例：
× 错误："前端开发" -> "写代码"、"开会"、"测试"
  原因：任务笼统且包含其他工种职责

√ 正确："前端开发" -> "组件设计"、"交互实现"、"性能优化"
  原因：都是前端工程师的具体工作，且有序连贯

{format_instructions}

确保：
- 严格限定当前工种职责范围
- 环节间保持逻辑顺序
- 最后环节能顺畅过渡
- 遵循JSON格式输出`;

const prompt = PromptTemplate.fromTemplate(PROMPT_TEMPLATE);

// 创建 Ollama 实例
// const model = new Ollama({
//   baseUrl: "http://localhost:11434",
//   model: "qwen2.5:7b",
//   temperature: 1,
//   verbose: true,
// });

const model = new ChatOpenAI(
  {
    modelName: "claude-3-5-sonnet-20240620",
    temperature: 1,
    streaming: false,
    // 测试用 ⚠️ 不要上传自己的key
    openAIApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  },
  { baseURL: "https://api.302.ai/v1/chat/completions" }
);

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

    const response = await model.invoke([["system", input]]);
    // 获取模型响应
    // const response = await model.call([{ role: "user", content: input }]);

    // 打印模型响应
    console.log("\n=== LLM Response ===\n", response, "\n==================\n");

    // 解析响应
    const parsed = await workflowParser.parse(response.content);

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
