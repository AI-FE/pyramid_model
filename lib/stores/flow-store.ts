import { create } from "zustand";
import {
  Node,
  Edge,
  Connection,
  addEdge,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from "reactflow";

// 在文件顶部添加 FlowData 接口定义
export interface FlowData {
  id: string;
  label: string;
  depth: number;
  ratio: number;
  children: FlowData[];
}

interface FlowState {
  nodes: Node[];
  edges: Edge[];
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  resetFlow: () => void;
  initializeFromData: (data: FlowData) => void;
}

export const useFlowStore = create<FlowState>((set) => ({
  nodes: [],
  edges: [],
  setNodes: (nodes) =>
    set((state) => ({
      nodes: typeof nodes === "function" ? nodes(state.nodes) : nodes,
    })),
  setEdges: (edges) =>
    set((state) => ({
      edges: typeof edges === "function" ? edges(state.edges) : edges,
    })),
  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }));
  },
  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },
  onConnect: (connection) => {
    set((state) => ({
      edges: addEdge(connection, state.edges),
    }));
  },
  resetFlow: () => set({ nodes: [], edges: [] }),
  initializeFromData: (data: FlowData) => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // 递归函数来处理节点和边
    const processNode = (node: FlowData, x: number = 0, y: number = 0) => {
      // 创建节点
      nodes.push({
        id: node.id,
        type: "custom",
        position: { x, y },
        data: {
          label: node.label,
          ratio: node.ratio,
          depth: node.depth,
          isNew: false,
        },
      });

      // 处理子节点
      const NODE_WIDTH = 200;
      const NODE_SPACING = 50;
      const childrenCount = node.children.length;
      const totalWidth =
        childrenCount * NODE_WIDTH + (childrenCount - 1) * NODE_SPACING;
      const startX = x - totalWidth / 2;

      node.children.forEach((child, index) => {
        const childX = startX + index * (NODE_WIDTH + NODE_SPACING);
        const childY = y + 150;

        // 创建父子节点之间的边
        edges.push({
          id: `edge-${node.id}-${child.id}`,
          source: node.id,
          target: child.id,
          style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
          animated: true,
        });

        // 递归处理子节点
        processNode(child, childX, childY);

        // 添加兄弟节点之间的连接
        if (index > 0) {
          const prevChild = node.children[index - 1];
          edges.push({
            id: `sibling-edge-${prevChild.id}-${child.id}`,
            source: prevChild.id,
            target: child.id,
            type: "smoothstep",
            style: {
              stroke: "hsl(var(--primary))",
              strokeWidth: 1,
              opacity: 0.5,
            },
            animated: false,
          });
        }
      });
    };

    processNode(data);
    set({ nodes, edges });
  },
}));
