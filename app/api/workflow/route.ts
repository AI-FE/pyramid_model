import { ChatOpenAI } from "@langchain/openai";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
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

const model = new ChatOpenAI(
  {
    // modelName: "claude-3-5-sonnet-20240620",
    modelName: "qwen-max",
    temperature: 1,
    streaming: true,
    openAIApiKey: process.env.OPENAI_API_KEY,
    verbose: true,
  },
  { baseURL: process.env.OPENAI_BASE_URL }
);

export async function POST(req: Request) {
  try {
    const { text, flowData, nodeId } = await req.json();

    let contextStr = "无上层工作流程";
    if (flowData && nodeId) {
      contextStr =
        "当前完整工作流程树（▶ 表示当前需要拆解的节点）：\n" +
        getTreeString(flowData, nodeId);
    }

    const formatInstructions = workflowParser.getFormatInstructions();
    const input = await prompt.format({
      input: text,
      context: contextStr,
      format_instructions: formatInstructions,
    });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const modelStream = await model.stream([["system", input]]);

          let buffer = "";
          let inJsonBlock = false;

          for await (const chunk of modelStream) {
            const content =
              typeof chunk === "string" ? chunk : chunk.content || "";
            buffer += content;

            // 检查 JSON 块的开始
            if (!inJsonBlock && buffer.includes("```json")) {
              inJsonBlock = true;
              // 清除开始标记前的内容，保留标记后的内容
              buffer = buffer.slice(buffer.indexOf("```json") + 7);
              continue;
            }

            // 在 JSON 块内，检查是否有结束标记
            if (inJsonBlock) {
              const endIndex = buffer.indexOf("```");
              if (endIndex !== -1) {
                // 发送结束标记前的内容
                const jsonContent = buffer.slice(0, endIndex);
                for (const char of jsonContent) {
                  controller.enqueue(char);
                }
                inJsonBlock = false;
                break;
              } else {
                // 没有结束标记，发送缓冲区内容并清空
                for (const char of buffer) {
                  controller.enqueue(char);
                }
                buffer = "";
              }
            }
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
