"use client";

import React, { useState, useCallback, useRef } from "react";
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
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// 自定义节点组件
const CustomNode = ({ data }: NodeProps) => (
  <Card
    className={`w-[200px] transition-all duration-300 ${
      data.isNew ? "scale-0" : "scale-100"
    }`}
  >
    <CardContent className="p-4">
      <div className="text-sm font-medium leading-none">{data.label}</div>
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

// 异步的decompose函数
const decompose = async (text: string): Promise<string[]> => {
  // 模拟异步操作
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (text.length <= 1) return [text];
  const splitIndex = Math.floor(Math.random() * (text.length - 1)) + 1;
  return [text.slice(0, splitIndex), text.slice(splitIndex)];
};

export function FlowChart() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const createdNodesRef = useRef(new Set<string>());

  // 创建单个节点和边
  const createNodeAndEdge = async (
    text: string,
    parentId: string | null,
    x: number,
    y: number
  ): Promise<[Node, Edge | null]> => {
    // if (createdNodesRef.current.has(text)) {
    //   return [nodes.find((node) => node.data.label === text)!, null];
    // }

    const newNode: Node = {
      id: `node-${Math.random()}`,
      type: "custom",
      position: { x, y },
      data: { label: text, isNew: true },
    };

    // createdNodesRef.current.add(text);

    // 添加新节点
    setNodes((prevNodes) => [...prevNodes, newNode]);

    // 移除新节点的动画效果
    await new Promise((resolve) => setTimeout(resolve, 300));
    setNodes((prevNodes) =>
      prevNodes.map((node) =>
        node.id === newNode.id
          ? { ...node, data: { ...node.data, isNew: false } }
          : node
      )
    );

    // 创建与父节点的连接
    let newEdge: Edge | null = null;
    if (parentId) {
      newEdge = {
        id: `edge-${parentId}-${newNode.id}`,
        source: parentId,
        target: newNode.id,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
        animated: true,
      };
      setEdges((prevEdges) => [...prevEdges, newEdge]);
    }

    return [newNode, newEdge];
  };

  // 创建同一级的所有节点
  const createLevelNodes = async (
    texts: string[],
    parentId: string | null,
    x: number,
    y: number
  ): Promise<Node[]> => {
    const levelNodes: Node[] = [];
    for (let i = 0; i < texts.length; i++) {
      const [node, _] = await createNodeAndEdge(
        texts[i],
        parentId,
        x + (i - texts.length / 2 + 0.5) * 250,
        y
      );
      levelNodes.push(node);
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
    // 只有根节点需要在这里创建
    const currentNode = isRoot
      ? (await createNodeAndEdge(text, parentId, x, y))[0]
      : nodes.find((node) => node.data.label === text);

    if (text.length > 1) {
      const parts = await decompose(text);
      // 使用当前节点的 id 作为子节点的父节点
      const childNodes = await createLevelNodes(
        parts,
        currentNode.id,
        x,
        y + 150
      );

      // 对子节点继续分解
      for (const childNode of childNodes) {
        if (childNode.data.label.length > 1) {
          await createNodesAndEdges(
            childNode.data.label,
            childNode.id,
            childNode.position.x,
            childNode.position.y,
            depth + 1,
            false
          );
        }
      }
    }
  };

  // 处理图表生成
  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setNodes([]);
    setEdges([]);
    await createNodesAndEdges(input, null, 0, 0, 0, true);
    setIsLoading(false);
  }, [input, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="w-full h-screen bg-background text-foreground">
      <div className="p-4 flex gap-4">
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入文本"
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
            "生成流程图"
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
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
