import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { MAIN_CONTENT_COLLAPSED_OFFSET, MAIN_CONTENT_EXPANDED_OFFSET } from './layout-shell'

export function MainLayout() {
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  return (
    <div className="relative min-h-screen bg-cyber-bg">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-[-10%] top-[-10%] h-[600px] w-[600px] rounded-full bg-cyber-purple/[0.03] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-cyber-cyan/[0.02] blur-[100px]" />
      </div>
      <Sidebar expanded={sidebarExpanded} onExpandedChange={setSidebarExpanded} />
      <CommandPalette />
      <main
        className="relative z-10 h-screen overflow-hidden transition-[margin] duration-300 ease-out"
        style={{ marginLeft: sidebarExpanded ? MAIN_CONTENT_EXPANDED_OFFSET : MAIN_CONTENT_COLLAPSED_OFFSET }}
      >
        <div className="h-full min-h-0 animate-fade-in" style={{ animationDuration: '0.2s' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
