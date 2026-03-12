import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { MainLayout } from '@/components/layout/MainLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { AgentListPage } from '@/pages/AgentListPage'
import { AgentConfigPage } from '@/pages/AgentConfigPage'
import { TeamListPage } from '@/pages/TeamListPage'
import { TeamDetailPage } from '@/pages/TeamDetailPage'
import { WorkflowEditorPage } from '@/pages/WorkflowEditorPage'
import { MonitorPage } from '@/pages/MonitorPage'
import { ChatPage } from '@/pages/ChatPage'
import { SettingsPage } from '@/pages/SettingsPage'

function App() {
  return (
    <ErrorBoundary>
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
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
