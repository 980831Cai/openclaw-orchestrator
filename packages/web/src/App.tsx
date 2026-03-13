import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { useWebSocket } from '@/hooks/use-websocket'
import { DashboardPage } from '@/pages/DashboardPage'
import { AgentListPage } from '@/pages/AgentListPage'
import { AgentConfigPage } from '@/pages/AgentConfigPage'
import { TeamListPage } from '@/pages/TeamListPage'
import { TeamDetailPage } from '@/pages/TeamDetailPage'
import { WorkflowEditorPage } from '@/pages/WorkflowEditorPage'
import { MonitorPage } from '@/pages/MonitorPage'
import { ChatPage } from '@/pages/ChatPage'

function App() {
  useWebSocket()

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/agents" element={<AgentListPage />} />
          <Route path="/agents/:id" element={<AgentConfigPage />} />
          <Route path="/teams" element={<TeamListPage />} />
          <Route path="/teams/:id" element={<TeamDetailPage />} />
          <Route path="/workflows" element={<WorkflowEditorPage />} />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:agentId" element={<ChatPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
