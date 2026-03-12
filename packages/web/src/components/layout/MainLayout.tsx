import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'

export function MainLayout() {
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  return (
    <div className="min-h-screen bg-cyber-bg">
      <Sidebar expanded={sidebarExpanded} onExpandedChange={setSidebarExpanded} />
      <CommandPalette />
      <main
        className="h-screen overflow-hidden transition-[margin] duration-300"
        style={{ marginLeft: sidebarExpanded ? 200 : 72 }}
      >
        <div className="h-full min-h-0 animate-fade-in" style={{ animationDuration: '0.25s' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
