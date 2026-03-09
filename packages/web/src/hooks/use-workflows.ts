import { useCallback } from 'react'
import { api } from '@/lib/api'
import { useWorkflowStore } from '@/stores/workflow-store'
import type { WorkflowDefinition } from '@/types'

export function useWorkflows() {
  const { workflows, setWorkflows, setLoading, setSelectedWorkflow, setExecution } = useWorkflowStore()

  const fetchWorkflows = useCallback(async () => {
    setLoading(true)
    const data = await api.get<WorkflowDefinition[]>('/workflows')
    setWorkflows(data)
    setLoading(false)
  }, [setWorkflows, setLoading])

  const executeWorkflow = useCallback(async (id: string) => {
    const data = await api.post(`/workflows/${id}/execute`)
    setExecution(data as any)
  }, [setExecution])

  return { workflows, fetchWorkflows, executeWorkflow, setSelectedWorkflow }
}
