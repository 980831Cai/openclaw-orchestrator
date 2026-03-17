import { lazy, Suspense, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Calendar,
  ClipboardList,
  FileText,
  GitBranch,
  Landmark,
  MessageSquare,
  ScrollText,
  Users,
} from 'lucide-react'
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
import { TeamUsagePanel } from '@/components/team/TeamUsagePanel'
import { TeamAuditPanel } from '@/components/team/TeamAuditPanel'
import { KnowledgeManager } from '@/components/agent/KnowledgeManager'
import { useTeams } from '@/hooks/use-teams'
import { useEmpireOffice } from '@/hooks/use-empire-office'
import { useTeamStore } from '@/stores/team-store'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

/* Lazy-load EmpireOfficeBoard to avoid PixiJS on initial render */
const EmpireOfficeBoard = lazy(() =>
  import('@/components/empire-dashboard/EmpireOfficeBoard').then((m) => ({
    default: m.EmpireOfficeBoard,
  })),
)

const tabTriggerClass =
  'gap-2 rounded-none py-3 text-white/35 data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:text-white/90'

export function TeamDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { fetchTeam } = useTeams()
  const { selectedTeam } = useTeamStore()
  const [activeTab, setActiveTab] = useState('members')
  const [teamMd, setTeamMd] = useState('')
  const { agentRooms } = useEmpireOffice()

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
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-white/25">加载工作室…</div>
      </div>
    )
  }

  const expandedPanelTabs = ['workflows', 'usage', 'audit', 'office']

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Header ── */}
      <div className="flex items-center gap-4 border-b border-white/[0.06] px-6 py-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-white/40 hover:text-white/80"
          onClick={() => navigate('/teams')}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white/90">{selectedTeam.name}</h1>
          <p className="text-[12px] text-white/30">{selectedTeam.description}</p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[11px] text-white/20">
          <span>{selectedTeam.members.length} 成员</span>
          <span className="h-1 w-1 rounded-full bg-white/15" />
          <span>{selectedTeam.goal || '未设置目标'}</span>
        </div>
      </div>

      {/* ── Studio Scene ── */}
      <div className="relative min-h-[400px] max-h-[60vh] flex-1 overflow-hidden">
        <SceneErrorBoundary>
          <StudioScene
            team={selectedTeam}
            teamMd={teamMd}
            onAddMember={() => setActiveTab('members')}
            onViewAgent={(agentId) => navigate(`/chat?agent=${agentId}`)}
          />
        </SceneErrorBoundary>
      </div>

      {/* ── Tabs Panel ── */}
      <div className="border-t border-white/[0.06] bg-cyber-surface/40 backdrop-blur-sm">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto rounded-none border-b border-white/[0.06] bg-transparent px-4">
            <TabsTrigger value="members" className={cn(tabTriggerClass, 'data-[state=active]:border-cyber-purple')}>
              <Users className="h-4 w-4" /> 成员管理
            </TabsTrigger>
            <TabsTrigger value="schedule" className={cn(tabTriggerClass, 'data-[state=active]:border-cyber-purple')}>
              <Calendar className="h-4 w-4" /> 排班表
            </TabsTrigger>
            <TabsTrigger value="tasks" className={cn(tabTriggerClass, 'data-[state=active]:border-cyber-purple')}>
              <ClipboardList className="h-4 w-4" /> 任务看板
            </TabsTrigger>
            <TabsTrigger value="meetings" className={cn(tabTriggerClass, 'data-[state=active]:border-cyber-purple')}>
              <MessageSquare className="h-4 w-4" /> 会议
            </TabsTrigger>
            <TabsTrigger value="office" className={cn(tabTriggerClass, 'data-[state=active]:border-cyber-cyan')}>
              <Landmark className="h-4 w-4" /> 办公室实景
            </TabsTrigger>
            <TabsTrigger value="workflows" className={cn(tabTriggerClass, 'data-[state=active]:border-cyber-amber')}>
              <GitBranch className="h-4 w-4" /> 战术桌
            </TabsTrigger>
            <TabsTrigger value="usage" className={cn(tabTriggerClass, 'data-[state=active]:border-cyan-400')}>
              <Activity className="h-4 w-4" /> 用量
            </TabsTrigger>
            <TabsTrigger value="audit" className={cn(tabTriggerClass, 'data-[state=active]:border-fuchsia-400')}>
              <ScrollText className="h-4 w-4" /> 审计
            </TabsTrigger>
            <TabsTrigger value="memory" className={cn(tabTriggerClass, 'data-[state=active]:border-cyber-purple')}>
              <FileText className="h-4 w-4" /> 团队记忆
            </TabsTrigger>
            <TabsTrigger value="knowledge" className={cn(tabTriggerClass, 'data-[state=active]:border-cyber-purple')}>
              <BookOpen className="h-4 w-4" /> 知识库
            </TabsTrigger>
          </TabsList>

          <div
            className={cn(
              'overflow-y-auto p-6',
              expandedPanelTabs.includes(activeTab) ? 'max-h-[60vh]' : 'max-h-[40vh]',
            )}
          >
            <TabsContent value="members" className="mt-0">
              <MemberManager
                teamId={selectedTeam.id}
                members={selectedTeam.members}
                leadAgentId={selectedTeam.leadAgentId}
                onMembersChange={refreshTeam}
              />
            </TabsContent>
            <TabsContent value="schedule" className="mt-0">
              <ScheduleEditor
                schedule={selectedTeam.schedule}
                teamId={selectedTeam.id}
                members={selectedTeam.members}
              />
            </TabsContent>
            <TabsContent value="tasks" className="mt-0">
              <TaskBoard teamId={selectedTeam.id} />
            </TabsContent>
            <TabsContent value="meetings" className="mt-0">
              <MeetingPanel
                teamId={selectedTeam.id}
                members={selectedTeam.members}
                leadAgentId={selectedTeam.leadAgentId}
              />
            </TabsContent>
            <TabsContent value="office" className="mt-0">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-16 text-white/25">
                    <div className="animate-pulse">加载办公室场景…</div>
                  </div>
                }
              >
                <div className="min-h-[500px]">
                  <EmpireOfficeBoard
                    rooms={agentRooms}
                    onOpenRoom={(roomId) => navigate(`/teams/${roomId}`)}
                    onOpenAgent={(agentId) => navigate(`/chat?agent=${encodeURIComponent(agentId)}`)}
                  />
                </div>
              </Suspense>
            </TabsContent>
            <TabsContent value="workflows" className="mt-0">
              <TeamWorkflowEditor teamId={selectedTeam.id} />
            </TabsContent>
            <TabsContent value="usage" className="mt-0">
              <TeamUsagePanel teamId={selectedTeam.id} members={selectedTeam.members} />
            </TabsContent>
            <TabsContent value="audit" className="mt-0">
              <TeamAuditPanel teamId={selectedTeam.id} />
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
