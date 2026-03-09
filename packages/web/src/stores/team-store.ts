import { create } from 'zustand'
import type { TeamListItem, Team } from '@/types'

interface TeamStore {
  teams: TeamListItem[];
  selectedTeam: Team | null;
  loading: boolean;
  setTeams: (teams: TeamListItem[]) => void;
  setSelectedTeam: (team: Team | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useTeamStore = create<TeamStore>((set) => ({
  teams: [],
  selectedTeam: null,
  loading: false,
  setTeams: (teams) => set({ teams }),
  setSelectedTeam: (team) => set({ selectedTeam: team }),
  setLoading: (loading) => set({ loading }),
}))
