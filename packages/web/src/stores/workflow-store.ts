import { create } from 'zustand'
import type { WorkflowDefinition, WorkflowExecution } from '@/types'

interface WorkflowStore {
  workflows: WorkflowDefinition[];
  selectedWorkflow: WorkflowDefinition | null;
  execution: WorkflowExecution | null;
  loading: boolean;
  setWorkflows: (workflows: WorkflowDefinition[]) => void;
  setSelectedWorkflow: (workflow: WorkflowDefinition | null) => void;
  setExecution: (execution: WorkflowExecution | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  workflows: [],
  selectedWorkflow: null,
  execution: null,
  loading: false,
  setWorkflows: (workflows) => set({ workflows }),
  setSelectedWorkflow: (workflow) => set({ selectedWorkflow: workflow }),
  setExecution: (execution) => set({ execution }),
  setLoading: (loading) => set({ loading }),
}))
