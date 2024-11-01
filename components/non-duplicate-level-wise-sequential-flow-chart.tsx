"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  NodeProps,
  Handle,
  Position,
  MiniMap,
  Connection,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useFlowStore, FlowData } from "@/lib/stores/flow-store";

// 自定义节点组件
const CustomNode = ({ data }: NodeProps) => (
  <Card
    className={`w-[200px] transition-all duration-300 ${
      data.isNew ? "scale-0" : "scale-100"
    }`}
  >
    <CardContent className="p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium leading-none">{data.label}</div>
        <div className="text-xs text-muted-foreground rounded-md bg-muted px-2 py-1">
          Level {data.depth}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Progress value={data.ratio * 100} className="h-2" />
        <div className="text-xs text-muted-foreground text-right">
          用时比例 {Math.round(data.ratio * 100)}%
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-primary border-2 border-background dark:border-background"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-primary border-2 border-background dark:border-background"
      />
    </CardContent>
  </Card>
);

const nodeTypes = {
  custom: CustomNode,
};

// 定义返回类型
interface DecomposePart {
  text: string;
  ratio: number;
}

// 修改 decompose 函数
const decompose = async (text: string): Promise<DecomposePart[]> => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (text.length <= 1) return [];

  // 根据文本长度决定最大可能的分割数量
  const maxParts = Math.min(
    4, // 最大分割数
    Math.floor(text.length / 2) + 1 // 确保每部分至少有1个字符
  );

  // 如果文本太短，直接返回两部分
  if (maxParts <= 2) {
    const splitIndex = Math.floor(text.length / 2);
    const randomRatios = [Math.random(), Math.random()];
    const totalRatio = randomRatios.reduce((sum, ratio) => sum + ratio, 0);
    const [ratio1, ratio2] = randomRatios.map((ratio) => ratio / totalRatio);

    return [
      { text: text.slice(0, splitIndex), ratio: ratio1 },
      { text: text.slice(splitIndex), ratio: ratio2 },
    ];
  }

  // 随机决定分割数量（2到maxParts个部分）
  const partsCount = Math.floor(Math.random() * (maxParts - 1)) + 2;

  // 生成分割点
  const splitPoints = new Set<number>();
  let attempts = 0;
  const maxAttempts = 100; // 防止无限循环

  while (splitPoints.size < partsCount - 1 && attempts < maxAttempts) {
    const splitIndex = Math.floor(Math.random() * (text.length - 1)) + 1;
    splitPoints.add(splitIndex);
    attempts++;
  }

  const sortedSplitPoints = Array.from(splitPoints).sort((a, b) => a - b);
  const actualPartsCount = sortedSplitPoints.length + 1;

  // 生成随机比率
  const randomRatios = Array(actualPartsCount)
    .fill(0)
    .map(() => Math.random());
  const totalRatio = randomRatios.reduce((sum, ratio) => sum + ratio, 0);
  const normalizedRatios = randomRatios.map((ratio) => ratio / totalRatio);

  // 分割文本
  const parts: DecomposePart[] = [];
  let startIndex = 0;

  for (let i = 0; i < sortedSplitPoints.length; i++) {
    const endIndex = sortedSplitPoints[i];
    parts.push({
      text: text.slice(startIndex, endIndex),
      ratio: normalizedRatios[i],
    });
    startIndex = endIndex;
  }

  // 添加最后一部分
  parts.push({
    text: text.slice(startIndex),
    ratio: normalizedRatios[normalizedRatios.length - 1],
  });

  return parts;
};

export function FlowChart() {
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    resetFlow,
    initializeFromData,
  } = useFlowStore();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const depthNodesRef = useRef<Map<number, { start: number; end: number }>>(
    new Map()
  );

  // 修改 resetDepthNodes 函数
  const resetDepthNodes = () => {
    depthNodesRef.current.clear();
    resetFlow(); // 重置流程图
  };

  // 修改 createNodeAndEdge 函数
  const createNodeAndEdge = async (
    text: string,
    ratio: number,
    parentId: string | null,
    depth: number,
    x: number,
    y: number
  ): Promise<[Node, Edge | null]> => {
    const newNode: Node = {
      id: `node-${Math.random()}`,
      type: "custom",
      position: { x, y },
      data: { label: text, ratio, isNew: true, depth },
    };

    setNodes((prevNodes) => [...prevNodes, newNode]);

    await new Promise((resolve) => setTimeout(resolve, 300));
    setNodes((prevNodes) =>
      prevNodes.map((node) =>
        node.id === newNode.id
          ? { ...node, data: { ...node.data, isNew: false } }
          : node
      )
    );

    let newEdge: Edge | null = null;
    if (parentId) {
      newEdge = {
        id: `edge-${parentId}-${newNode.id}`,
        source: parentId,
        target: newNode.id,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
        animated: true,
      };
      if (newEdge) {
        setEdges((prevEdges) => [...prevEdges, newEdge!]);
      }
    }

    return [newNode, newEdge];
  };

  // 创建同一级的所有节点
  const createLevelNodes = async (
    parts: DecomposePart[],
    parentId: string | null,
    depth: number,
    x: number,
    y: number
  ): Promise<Node[]> => {
    const NODE_WIDTH = 200;
    const NODE_SPACING = 50;
    const totalWidth =
      parts.length * NODE_WIDTH + (parts.length - 1) * NODE_SPACING;

    // 检查同一深度是否已有节点
    const depthInfo = depthNodesRef.current.get(depth);
    let startX = x - totalWidth / 2;

    if (depthInfo) {
      // 如果新节点组与现有节点重叠，将其移到现有节点的右侧
      const rightmostX = depthInfo.end;
      if (startX - NODE_SPACING < rightmostX) {
        startX = rightmostX + NODE_SPACING;
      }
    }

    // 计算这组节点的范围
    const endX = startX + totalWidth;

    // 更新深度信息
    if (depthInfo) {
      depthNodesRef.current.set(depth, {
        start: Math.min(depthInfo.start, startX),
        end: Math.max(depthInfo.end, endX),
      });
    } else {
      depthNodesRef.current.set(depth, { start: startX, end: endX });
    }

    const levelNodes: Node[] = [];
    let previousNode: Node | null = null; // 用于跟踪前一个节点

    // 创建节点并连接
    for (let i = 0; i < parts.length; i++) {
      const nodeX = startX + i * (NODE_WIDTH + NODE_SPACING);
      const { text, ratio } = parts[i];
      const [node, _] = await createNodeAndEdge(
        text,
        ratio,
        parentId,
        depth,
        nodeX,
        y
      );
      levelNodes.push(node);

      // 如果有前一个节点，创建从前一个节点到当前节点的连接
      if (previousNode) {
        const siblingEdge: Edge = {
          id: `sibling-edge-${previousNode.id}-${node.id}`,
          source: previousNode.id,
          target: node.id,
          type: "smoothstep", // 使用平滑的曲线
          style: {
            stroke: "hsl(var(--primary))",
            strokeWidth: 1, // 使用较细的线条
            opacity: 0.5, // 降低透明度以区分父子连接
          },
          animated: false,
        };
        setEdges((prevEdges) => [...prevEdges, siblingEdge]);
      }

      previousNode = node; // 更新前一个节点
    }

    return levelNodes;
  };

  // 递归创建节点和边
  const createNodesAndEdges = async (
    text: string,
    parentId: string | null,
    x: number,
    y: number,
    depth: number = 0,
    isRoot: boolean = true
  ): Promise<void> => {
    const parts = isRoot ? [{ text, ratio: 1 }] : await decompose(text);
    const childNodes = await createLevelNodes(
      parts,
      parentId,
      depth,
      x,
      y + 150
    );

    await Promise.all(
      childNodes.map((childNode) =>
        childNode.data.label.length > 1
          ? createNodesAndEdges(
              childNode.data.label,
              childNode.id,
              childNode.position.x,
              childNode.position.y,
              depth + 1,
              false
            )
          : Promise.resolve()
      )
    );
  };

  // 修改 handleGenerate
  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    resetDepthNodes();
    try {
      await createNodesAndEdges(input, null, 0, 0, 0, true);
    } catch (error) {
      console.error("Error generating flow:", error);
    } finally {
      setIsLoading(false);
    }
  }, [input, resetDepthNodes, createNodesAndEdges]);

  // 添加初始化方法
  const initializeFlow = useCallback((data: FlowData) => {
    resetDepthNodes();
    initializeFromData(data);
  }, []);

  // 初始化
  useEffect(() => {
    const data: FlowData = {
      id: "root",
      label: "根节点",
      depth: 0,
      ratio: 1,
      children: [
        {
          id: "child1",
          label: "子节点1",
          depth: 1,
          ratio: 0.5,
          children: [],
        },
        {
          id: "child2",
          label: "子节点2",
          depth: 1,
          ratio: 0.5,
          children: [
            {
              id: "child4",
              label: "子节点4",
              depth: 1,
              ratio: 0.5,
              children: [],
            },
          ],
        },
        {
          id: "child3",
          label: "子节点3",
          depth: 1,
          ratio: 0.5,
          children: [],
        },
      ],
    };

    initializeFlow(data);
  }, []);

  return (
    <div className="w-full h-screen bg-background text-foreground">
      <div className="p-4 flex gap-4">
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading) {
              handleGenerate();
            }
          }}
          placeholder="输入职业名称"
          className="flex-grow"
          disabled={isLoading}
        />
        <Button onClick={handleGenerate} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              生成中...
            </>
          ) : (
            "拆解工作流程"
          )}
        </Button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        defaultViewport={{ x: 500, y: 0, zoom: 0.8 }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeStrokeColor="hsl(var(--primary))"
          nodeColor="hsl(var(--card))"
          nodeBorderRadius={12}
          className="!bottom-4 !right-4"
        />
      </ReactFlow>
    </div>
  );
}
