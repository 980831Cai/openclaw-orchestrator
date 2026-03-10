import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'

export function MainLayout() {
  return (
    <div className="min-h-screen bg-cyber-bg">
      <Sidebar />
      <CommandPalette />
      <main className="ml-[72px] min-h-screen">
        <div className="animate-fade-in" style={{ animationDuration: '0.25s' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
