import { cn } from '@/lib/utils'

interface MeetingTableProps {
  summary: string
  memberCount: number
}

export function MeetingTable({ summary, memberCount }: MeetingTableProps) {
  const previewLines = summary
    ? summary.split('\n').filter(Boolean).slice(0, 4)
    : []

  return (
    <div className="relative group cursor-pointer">
      {/* Table surface */}
      <div className={cn(
        'relative w-48 h-36 rounded-2xl overflow-hidden transition-all duration-500',
        'bg-gradient-to-br from-cyber-panel/80 to-cyber-surface/60',
        'border border-white/10 group-hover:border-cyber-purple/30',
        'group-hover:glow-purple group-hover:scale-105'
      )}>
        {/* Scan line effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute w-full h-[1px] bg-gradient-to-r from-transparent via-cyber-purple/30 to-transparent animate-beam"
            style={{ top: '30%' }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 p-4 h-full flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 rounded flex items-center justify-center text-[10px] bg-cyber-purple/20">
              📋
            </div>
            <span className="text-cyber-lavender text-[10px] font-semibold uppercase tracking-wider">
              team.md
            </span>
          </div>

          {/* Preview text */}
          <div className="flex-1 overflow-hidden">
            {previewLines.length > 0 ? (
              <div className="space-y-0.5">
                {previewLines.map((line, i) => (
                  <p
                    key={i}
                    className="text-white/30 text-[9px] font-mono truncate leading-tight"
                  >
                    {line}
                  </p>
                ))}
                {summary.split('\n').filter(Boolean).length > 4 && (
                  <p className="text-cyber-purple/50 text-[9px]">...</p>
                )}
              </div>
            ) : (
              <p className="text-white/15 text-[10px] italic">暂无团队记忆</p>
            )}
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
            <span className="text-white/20 text-[9px]">{memberCount} 成员</span>
            <span className="text-cyber-purple/40 text-[9px] group-hover:text-cyber-lavender transition-colors">
              点击编辑 →
            </span>
          </div>
        </div>

        {/* Subtle holographic overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-cyber-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </div>

      {/* Table shadow */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4/5 h-4 rounded-full bg-cyber-purple/5 blur-lg" />
    </div>
  )
}
