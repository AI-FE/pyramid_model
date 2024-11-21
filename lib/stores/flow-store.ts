import { create } from "zustand";
import { Node, Edge } from "reactflow";

export interface FlowData {
  id: string;
  label: string;
  depth: number;
  ratio: number;
  children: FlowData[];
  isNew?: boolean;
}

interface FlowState {
  nodes: Node[];
  edges: Edge[];
  flowData: FlowData | null;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setFlowData: (data: FlowData) => void;
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: any) => void;
  resetFlow: () => void;
  updateFlowDataNode: (nodeId: string, children: FlowData[]) => void;
}

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  flowData: null,
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setFlowData: (data) => set({ flowData: data }),
  onNodesChange: (changes) => {
    // 实现节点变化逻辑
  },
  onEdgesChange: (changes) => {
    // 实现边变化逻辑
  },
  onConnect: (connection) => {
    // 实现连接逻辑
  },
  resetFlow: () => set({ nodes: [], edges: [], flowData: null }),
  updateFlowDataNode: (nodeId: string, children: FlowData[]) => {
    const updateNode = (data: FlowData): FlowData => {
      if (data.id === nodeId) {
        return { ...data, children };
      }
      return {
        ...data,
        children: data.children.map(updateNode),
      };
    };

    set((state) => ({
      flowData: state.flowData ? updateNode(state.flowData) : null,
    }));
  },
}));
