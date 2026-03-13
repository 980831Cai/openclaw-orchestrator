import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { MAIN_CONTENT_COLLAPSED_OFFSET, MAIN_CONTENT_EXPANDED_OFFSET } from './layout-shell'

export function MainLayout() {
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  return (
    <div className="min-h-screen bg-cyber-bg">
      <Sidebar expanded={sidebarExpanded} onExpandedChange={setSidebarExpanded} />
      <CommandPalette />
      <main
        className="h-screen overflow-hidden transition-[margin] duration-300"
        style={{ marginLeft: sidebarExpanded ? MAIN_CONTENT_EXPANDED_OFFSET : MAIN_CONTENT_COLLAPSED_OFFSET }}
      >
        <div className="h-full min-h-0 animate-fade-in" style={{ animationDuration: '0.25s' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
