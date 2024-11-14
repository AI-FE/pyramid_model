"use client";

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
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

// 在文件顶部添加新的类型定义
interface NodeData {
  label: string;
  ratio: number;
  depth: number;
  isNew?: boolean;
  isHighlighted?: boolean;
}

// 自定义节点组件
const CustomNode = ({ data, id }: NodeProps<NodeData>) => {
  const { updateFlowDataNode, flowData } = useFlowStore();
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // 检查节点是否已经被拆分（是否有子节点
  const hasChildren = useMemo(() => {
    const findNode = (data: FlowData | null): boolean => {
      if (!data) return false;
      if (data.id === id) return data.children.length > 0;
      return data.children.some(findNode);
    };
    return findNode(flowData);
  }, [flowData, id]);

  const handleDecompose = async () => {
    if (isDecomposing || data.label.length <= 1 || hasChildren) return;
    setIsDecomposing(true);

    try {
      const parts = await decompose(data.label);
      const children: FlowData[] = parts.map((part) => ({
        id: `node-${Math.random()}`,
        label: part.text,
        depth: data.depth + 1,
        ratio: part.ratio,
        children: [],
      }));

      updateFlowDataNode(id, children);
    } catch (error) {
      console.error("Error decomposing node:", error);
    } finally {
      setIsDecomposing(false);
    }
  };

  return (
    <Card
      className={`w-[200px] transition-all duration-300 ${
        data.isNew ? "scale-0" : "scale-100"
      } ${!data.isHighlighted ? "opacity-20 z-0" : "opacity-100 z-10"}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
        {!hasChildren && data.label.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleDecompose}
            disabled={isDecomposing}
          >
            {isDecomposing ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                拆分中...
              </>
            ) : (
              "拆分"
            )}
          </Button>
        )}
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
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          className="w-3 h-3 !bg-primary border-2 border-background dark:border-background"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          className="w-3 h-3 !bg-primary border-2 border-background dark:border-background"
        />
      </CardContent>
    </Card>
  );
};

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

// 修改 convertFlowDataToNodesAndEdges 函数中的边处理逻辑
const convertFlowDataToNodesAndEdges = (
  data: FlowData,
  parentId: string | null = null,
  x = 0,
  y = 0,
  highlightedNodes: Set<string> = new Set()
): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const NODE_WIDTH = 200;
  const NODE_SPACING = 50;
  const VERTICAL_SPACING = 150;

  // 判断边是否应该高亮
  const shouldHighlightEdge = (sourceId: string, targetId: string): boolean => {
    return highlightedNodes.has(sourceId) && highlightedNodes.has(targetId);
  };

  const processNode = (
    nodeData: FlowData,
    parentId: string | null,
    x: number,
    y: number
  ) => {
    const isHighlighted = highlightedNodes.has(nodeData.id);
    const node: Node = {
      id: nodeData.id,
      type: "custom",
      position: { x, y },
      data: {
        label: nodeData.label,
        ratio: nodeData.ratio,
        depth: nodeData.depth,
        isNew: false,
        isHighlighted,
      },
      zIndex: isHighlighted ? 1 : 0,
    };
    nodes.push(node);

    // 如果有父节点，创建边
    if (parentId) {
      const isHighlighted = shouldHighlightEdge(parentId, nodeData.id);
      edges.push({
        id: `edge-${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        style: {
          stroke: "hsl(var(--primary))",
          strokeWidth: 2,
          opacity: isHighlighted ? 1 : 0.2,
        },
        animated: isHighlighted,
      });
    }

    // 处理子节点
    if (nodeData.children.length > 0) {
      const totalWidth =
        nodeData.children.length * NODE_WIDTH +
        (nodeData.children.length - 1) * NODE_SPACING;
      const startX = x - totalWidth / 2;

      nodeData.children.forEach((child, index) => {
        const childX = startX + index * (NODE_WIDTH + NODE_SPACING);
        const childY = y + VERTICAL_SPACING;
        processNode(child, node.id, childX, childY);

        // 修改兄弟节点之间的连接
        if (index > 0) {
          const prevChildId = nodeData.children[index - 1].id;
          const isHighlighted = shouldHighlightEdge(prevChildId, child.id);
          edges.push({
            id: `sibling-edge-${prevChildId}-${child.id}`,
            source: prevChildId,
            target: child.id,
            sourceHandle: "right",
            targetHandle: "left",
            type: "smoothstep",
            style: {
              stroke: "hsl(var(--primary))",
              strokeWidth: 1,
              opacity: isHighlighted ? 0.5 : 0.1,
            },
            animated: false,
          });
        }
      });
    }
  };

  processNode(data, parentId, x, y);
  return { nodes, edges };
};

export function FlowChart() {
  const {
    nodes,
    edges,
    flowData,
    setNodes,
    setEdges,
    setFlowData,
    onNodesChange,
    onEdgesChange,
    onConnect,
    resetFlow,
  } = useFlowStore();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(
    new Set()
  );

  // 获取节点的所有祖先节点ID
  const getAncestorIds = useCallback(
    (
      nodeId: string,
      data: FlowData | null
    ): { ancestors: string[]; siblings: string[] } => {
      if (!data) return { ancestors: [], siblings: [] };

      const findAncestorsAndSiblings = (
        currentNode: FlowData,
        targetId: string,
        path: string[],
        parent: FlowData | null = null
      ): { ancestors: string[]; siblings: string[] } | null => {
        // 如果找到目标节点，返回路径和同级节点
        if (currentNode.id === targetId) {
          const siblings = parent
            ? parent.children
                .filter((sibling) => sibling.id !== targetId)
                .map((sibling) => sibling.id)
            : [];
          return { ancestors: path, siblings };
        }

        // 在子节点中查找
        for (const child of currentNode.children) {
          const result = findAncestorsAndSiblings(
            child,
            targetId,
            [...path, currentNode.id],
            currentNode
          );
          if (result) {
            return result;
          }
        }

        return null;
      };

      const result = findAncestorsAndSiblings(data, nodeId, []) || {
        ancestors: [],
        siblings: [],
      };
      return result;
    },
    []
  );

  // 获取节点的所有子孙节点ID
  const getDescendantIds = useCallback(
    (nodeId: string, data: FlowData | null): string[] => {
      if (!data) return [];

      const findDescendants = (currentNode: FlowData): string[] => {
        const descendants: string[] = [currentNode.id];
        currentNode.children.forEach((child) => {
          descendants.push(...findDescendants(child));
        });
        return descendants;
      };

      const findNode = (currentNode: FlowData): FlowData | null => {
        if (currentNode.id === nodeId) return currentNode;
        for (const child of currentNode.children) {
          const result = findNode(child);
          if (result) return result;
        }
        return null;
      };

      const targetNode = data && findNode(data);
      return targetNode ? findDescendants(targetNode) : [];
    },
    []
  );

  // 处理节点hover事件
  const handleNodeMouseEnter = useCallback(
    (nodeId: string) => {
      if (!flowData) return;

      const { ancestors, siblings } = getAncestorIds(nodeId, flowData);
      const descendants = getDescendantIds(nodeId, flowData);
      const highlighted = new Set([
        nodeId,
        ...ancestors,
        ...siblings,
        ...descendants,
      ]);

      setHighlightedNodes(highlighted);
    },
    [flowData, getAncestorIds, getDescendantIds]
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHighlightedNodes(new Set());
  }, []);

  // 从边获取相关节点ID
  const getNodesFromEdge = useCallback(
    (edgeId: string): { sourceId: string; targetId: string } => {
      const [, sourceId, targetId] = edgeId.split("-").pop()?.split("_") || [
        "",
        "",
        "",
      ];
      return { sourceId, targetId };
    },
    []
  );

  // 处理边 hover 事件
  const handleEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (!flowData) return;

      // 获取边连接的两个节点
      const { source: sourceId, target: targetId } = edge;

      // 获取源节点的相关节点
      const sourceRelated = getAncestorIds(sourceId, flowData);
      const sourceDescendants = getDescendantIds(sourceId, flowData);

      // 获取目标节点的相关节点
      const targetRelated = getAncestorIds(targetId, flowData);
      const targetDescendants = getDescendantIds(targetId, flowData);

      // 合并所有需要高亮的节点
      const highlighted = new Set([
        sourceId,
        targetId,
        ...sourceRelated.ancestors,
        ...sourceRelated.siblings,
        ...sourceDescendants,
        ...targetRelated.ancestors,
        ...targetRelated.siblings,
        ...targetDescendants,
      ]);

      setHighlightedNodes(highlighted);
    },
    [flowData, getAncestorIds, getDescendantIds]
  );

  // 修改 useEffect，在转换节点时包含高亮信息
  useEffect(() => {
    if (flowData) {
      const { nodes: newNodes, edges: newEdges } =
        convertFlowDataToNodesAndEdges(flowData, null, 0, 0, highlightedNodes);
      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [flowData, highlightedNodes]);

  const handleGenerate = useCallback(async () => {
    if (!input.trim()) return;

    setIsLoading(true);
    resetFlow();

    try {
      const initialData: FlowData = {
        id: `node-${Math.random()}`,
        label: input,
        depth: 0,
        ratio: 1,
        children: [],
      };
      setFlowData(initialData);
    } catch (error) {
      console.error("Error generating flow:", error);
    } finally {
      setIsLoading(false);
    }
  }, [input, resetFlow, setFlowData]);

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
        onNodeMouseEnter={(_, node) => handleNodeMouseEnter(node.id)}
        onNodeMouseLeave={handleNodeMouseLeave}
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseLeave={handleNodeMouseLeave}
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
