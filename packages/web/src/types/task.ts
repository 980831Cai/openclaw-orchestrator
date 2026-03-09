// Task-related type definitions
// Migrated from @openclaw/shared to local types

export type TaskEntryType = 'progress' | 'question' | 'decision' | 'output' | 'artifact'

export interface TaskEntry {
  type: TaskEntryType
  agentId: string
  content: string
  timestamp: string
}

export interface Artifact {
  id: string
  filename: string
  ext: string
  type: string
  size: number
  agentId: string
  description?: string
  createdAt: string
}

export interface TaskListItem {
  id: string
  teamId: string
  title: string
  description: string
  status: string
  createdAt: string
  completedAt?: string
  artifactCount?: number
}

export interface Task {
  id: string
  teamId: string
  title: string
  description: string
  status: string
  taskFilePath: string
  participantAgentIds: string[]
  summary?: string
  artifactCount: number
  createdAt: string
  completedAt?: string
  entries?: TaskEntry[]
}
