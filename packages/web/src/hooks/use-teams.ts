import { useCallback } from 'react'
import { api } from '@/lib/api'
import { useTeamStore } from '@/stores/team-store'
import type { TeamListItem, Team } from '@/types'

export function useTeams() {
  const { teams, setTeams, setLoading, setSelectedTeam } = useTeamStore()

  const fetchTeams = useCallback(async () => {
    setLoading(true)
    const data = await api.get<TeamListItem[]>('/teams')
    setTeams(data)
    setLoading(false)
  }, [setTeams, setLoading])

  const fetchTeam = useCallback(async (id: string) => {
    setLoading(true)
    const data = await api.get<Team>(`/teams/${id}`)
    setSelectedTeam(data)
    setLoading(false)
  }, [setSelectedTeam, setLoading])

  const createTeam = useCallback(async (name: string, description: string, goal?: string) => {
    const data = await api.post<Team>('/teams', {
      name,
      description,
      goal: goal?.trim() || undefined,
    })
    await fetchTeams()
    return data
  }, [fetchTeams])

  return { teams, fetchTeams, fetchTeam, createTeam }
}
