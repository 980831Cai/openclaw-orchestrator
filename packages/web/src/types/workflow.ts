// Workflow-related type definitions
// Migrated from @openclaw/shared to local types
// Enhanced with: ApprovalNode, retry fields, waiting_approval status

export type WorkflowNodeType = 'task' | 'condition' | 'parallel' | 'approval'

export interface TaskNodeData {
  type: 'task'
  label: string
  agentId: string
  task: string
  timeoutSeconds: number
  position?: { x: number; y: number }
  maxRetries?: number      // 最大重试次数，默认 0
  retryDelayMs?: number    // 重试间隔毫秒，默认 2000
}

export interface ConditionNodeData {
  type: 'condition'
  label: string
  expression: string
  branches: Record<string, string>  // key → target node id (supports backtracking)
  position?: { x: number; y: number }
}

export interface ParallelNodeData {
  type: 'parallel'
  label: string
  position?: { x: number; y: number }
}

export interface ApprovalNodeData {
  type: 'approval'
  label: string
  title: string
  description: string
  approver: string           // v1: 当前 Web 用户
  timeoutMinutes: number
  onTimeout: 'reject'        // v1 超时一律 reject
  position?: { x: number; y: number }
}

export type WorkflowNodeData =
  | TaskNodeData
  | ConditionNodeData
  | ParallelNodeData
  | ApprovalNodeData

export interface WorkflowEdge {
  from: string
  to: string
  condition?: string
}

export interface WorkflowDefinition {
  id: string
  name: string
  teamId: string
  nodes: Record<string, WorkflowNodeData>
  edges: WorkflowEdge[]
  maxIterations?: number    // 防无限循环，默认 100
}

export type WorkflowExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'waiting_approval'

export interface WorkflowExecution {
  id: string
  workflowId: string
  status: WorkflowExecutionStatus
  currentNodeId?: string | null
  startedAt: string
  completedAt?: string | null
  logs: WorkflowLog[]
}

export interface WorkflowLog {
  timestamp: string
  nodeId: string
  message: string
  level: 'info' | 'warn' | 'error'
}

// ─── Approval types ───

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalRecord {
  id: string
  executionId: string
  nodeId: string
  title: string
  description: string
  status: ApprovalStatus
  rejectReason?: string
  createdAt: string
  resolvedAt?: string
}
