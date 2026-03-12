import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, Calendar, FileText, BookOpen, ClipboardList, GitBranch, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StudioScene } from '@/components/scene/StudioScene'
import { SceneErrorBoundary } from '@/components/ErrorBoundary'
import { MemberManager } from '@/components/team/MemberManager'
import { ScheduleEditor } from '@/components/team/ScheduleEditor'
import { TaskBoard } from '@/components/team/TaskBoard'
import { TeamWorkflowEditor } from '@/components/team/TeamWorkflowEditor'
import { SharedFileEditor } from '@/components/team/SharedFileEditor'
import { MeetingPanel } from '@/components/team/MeetingPanel'
import { KnowledgeManager } from '@/components/agent/KnowledgeManager'
import { useTeams } from '@/hooks/use-teams'
import { useTeamStore } from '@/stores/team-store'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export function TeamDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { fetchTeam } = useTeams()
  const { selectedTeam } = useTeamStore()
  const [activeTab, setActiveTab] = useState('members')
  const [teamMd, setTeamMd] = useState('')

  useEffect(() => {
    if (id) {
      fetchTeam(id)
      api.get<{ content: string }>(`/teams/${id}/shared`).then((r) => setTeamMd(r.content))
    }
  }, [id, fetchTeam])

  const refreshTeam = () => {
    if (id) fetchTeam(id)
  }

  if (!selectedTeam) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-white/30">Loading studio...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-4 p-4 border-b border-white/5">
        <Button variant="ghost" size="sm" className="text-white/50 hover:text-white" onClick={() => navigate('/teams')}>
          <ArrowLeft className="h-4 w-4 mr-1" />返回
        </Button>
        <div>
          <h1 className="text-xl font-bold text-white">{selectedTeam.name}</h1>
          <p className="text-white/30 text-xs">{selectedTeam.description}</p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-white/20 text-xs">
          <span>{selectedTeam.members.length} 成员</span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span>{selectedTeam.goal || '未设置目标'}</span>
        </div>
      </div>

      {/* Studio Scene (60% height) */}
      <div className="flex-1 min-h-[400px] max-h-[60vh] relative overflow-hidden">
        <SceneErrorBoundary>
          <StudioScene
            team={selectedTeam}
            teamMd={teamMd}
            onAddMember={() => setActiveTab('members')}
            onViewAgent={(agentId) => navigate(`/chat?agent=${agentId}`)}
          />
        </SceneErrorBoundary>
      </div>

      {/* Bottom control panel (40%) */}
      <div className="border-t border-white/5 bg-cyber-surface/50">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-transparent border-b border-white/5 rounded-none px-4 h-auto">
            <TabsTrigger value="members" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-cyber-purple data-[state=active]:text-white text-white/40 rounded-none gap-2 py-3">
              <Users className="h-4 w-4" /> 成员管理
            </TabsTrigger>
            <TabsTrigger value="schedule" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-cyber-purple data-[state=active]:text-white text-white/40 rounded-none gap-2 py-3">
              <Calendar className="h-4 w-4" /> 排班表
            </TabsTrigger>
            <TabsTrigger value="tasks" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-cyber-purple data-[state=active]:text-white text-white/40 rounded-none gap-2 py-3">
              <ClipboardList className="h-4 w-4" /> 任务看板
            </TabsTrigger>
            <TabsTrigger value="meetings" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-cyber-purple data-[state=active]:text-white text-white/40 rounded-none gap-2 py-3">
              <MessageSquare className="h-4 w-4" /> 会议
            </TabsTrigger>
            <TabsTrigger value="workflows" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-cyber-amber data-[state=active]:text-white text-white/40 rounded-none gap-2 py-3">
              <GitBranch className="h-4 w-4" /> 战术桌
            </TabsTrigger>
            <TabsTrigger value="memory" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-cyber-purple data-[state=active]:text-white text-white/40 rounded-none gap-2 py-3">
              <FileText className="h-4 w-4" /> 团队记忆
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-cyber-purple data-[state=active]:text-white text-white/40 rounded-none gap-2 py-3">
              <BookOpen className="h-4 w-4" /> 知识库
            </TabsTrigger>
          </TabsList>

          <div className={cn('p-6 overflow-y-auto', activeTab === 'workflows' ? 'max-h-[60vh]' : 'max-h-[40vh]')}>
            <TabsContent value="members" className="mt-0">
              <MemberManager teamId={selectedTeam.id} members={selectedTeam.members} leadAgentId={selectedTeam.leadAgentId} onMembersChange={refreshTeam} />
            </TabsContent>
            <TabsContent value="schedule" className="mt-0">
              <ScheduleEditor schedule={selectedTeam.schedule} teamId={selectedTeam.id} members={selectedTeam.members} />
            </TabsContent>
            <TabsContent value="tasks" className="mt-0">
              <TaskBoard teamId={selectedTeam.id} />
            </TabsContent>
            <TabsContent value="meetings" className="mt-0">
              <MeetingPanel teamId={selectedTeam.id} members={selectedTeam.members} leadAgentId={selectedTeam.leadAgentId} />
            </TabsContent>
            <TabsContent value="workflows" className="mt-0">
              <TeamWorkflowEditor teamId={selectedTeam.id} />
            </TabsContent>
            <TabsContent value="memory" className="mt-0">
              <SharedFileEditor content={teamMd} teamId={selectedTeam.id} onUpdate={setTeamMd} />
            </TabsContent>
            <TabsContent value="knowledge" className="mt-0">
              <KnowledgeManager ownerId={selectedTeam.id} ownerType="team" />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
