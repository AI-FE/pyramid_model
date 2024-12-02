import { FlowData } from "@/lib/stores/flow-store";

export async function decomposeWorkflow(
  text: string,
  flowData: FlowData | null = null,
  nodeId: string | null = null,
  onPartialResult?: (part: { text: string; ratio: number }) => void
) {
  try {
    const response = await fetch("/api/workflow", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        flowData,
        nodeId,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to decompose workflow");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    let results: { text: string; ratio: number }[] = [];
    const decoder = new TextDecoder();
    let buffer = "";
    let bracketCount = 0;
    let inObject = false;
    let currentObject = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);

      for (const char of chunk) {
        buffer += char;

        // 开始解析对象
        if (char === "{") {
          inObject = true;
          currentObject = "{";
          continue;
        }

        // 在对象内收集字符
        if (inObject) {
          if (char !== "{") {
            currentObject += char;
          }

          // 对象结束
          if (char === "}") {
            inObject = false;
            try {
              const parsed = JSON.parse(currentObject);
              if (
                parsed.text &&
                typeof parsed.text === "string" &&
                parsed.ratio &&
                typeof parsed.ratio === "number"
              ) {
                results.push(parsed);
                onPartialResult?.(parsed);
              }
            } catch {
              // 忽略解析错误
            }
            currentObject = "";
          }
        }

        // 跟踪数组括号
        if (char === "[") bracketCount++;
        if (char === "]") {
          bracketCount--;
          if (bracketCount === 0) {
            // 数组结束，退出循环
            break;
          }
        }
      }

      if (bracketCount === 0) break;
    }

    // 规范化最终结果的比例
    const totalRatio = results.reduce((sum, item) => sum + item.ratio, 0);
    if (Math.abs(totalRatio - 1) > 0.01) {
      results = results.map((item) => ({
        ...item,
        ratio: item.ratio / totalRatio,
      }));
    }

    return results;
  } catch (error) {
    console.error("Error in decomposeWorkflow:", error);
    throw new Error("Failed to decompose workflow");
  }
}
