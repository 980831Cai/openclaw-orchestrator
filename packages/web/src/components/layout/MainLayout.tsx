import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function MainLayout() {
  return (
    <div className="min-h-screen bg-cyber-bg cyber-grid">
      <Sidebar />
      <main className="ml-[72px] min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
