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
      {/* Table surface — cartoon conference table style */}
      <div className={cn(
        'relative w-52 h-40 rounded-2xl overflow-hidden transition-all duration-400',
        'cartoon-card',
      )}>
        {/* Subtle table pattern */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(135deg, rgba(139,92,246,0.03) 25%, transparent 25%, transparent 50%, rgba(139,92,246,0.03) 50%, rgba(139,92,246,0.03) 75%, transparent 75%)',
          backgroundSize: '20px 20px',
        }} />

        {/* Content */}
        <div className="relative z-10 p-4 h-full flex flex-col">
          {/* Header with meeting emoji */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">📋</span>
            <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider">
              团队记忆
            </span>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              {[...Array(Math.min(memberCount, 3))].map((_, i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full border border-white/10"
                  style={{
                    background: `hsl(${i * 90 + 240}, 70%, 60%)`,
                    opacity: 0.4,
                    marginLeft: i > 0 ? '-4px' : '0',
                  }}
                />
              ))}
              {memberCount > 3 && (
                <span className="text-white/20 text-[8px] ml-0.5">+{memberCount - 3}</span>
              )}
            </div>
          </div>

          {/* Separator */}
          <div className="w-full h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent mb-2" />

          {/* Preview text — looks like handwritten notes */}
          <div className="flex-1 overflow-hidden">
            {previewLines.length > 0 ? (
              <div className="space-y-1">
                {previewLines.map((line, i) => (
                  <p
                    key={i}
                    className="text-white/30 text-[9px] font-mono truncate leading-tight pl-2 border-l border-white/5"
                  >
                    {line}
                  </p>
                ))}
                {summary.split('\n').filter(Boolean).length > 4 && (
                  <p className="text-cyber-purple/40 text-[9px] pl-2">…</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <span className="text-2xl opacity-20 mb-1">📝</span>
                <p className="text-white/15 text-[10px]">暂无团队记忆</p>
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
            <span className="text-white/20 text-[9px]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyber-green/30 mr-1" />
              {memberCount} 成员在线
            </span>
            <span className="text-cyber-purple/30 text-[9px] group-hover:text-cyber-purple/60 transition-colors font-medium">
              点击编辑 →
            </span>
          </div>
        </div>
      </div>

      {/* Table shadow */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4/5 h-4 rounded-full bg-black/10 blur-lg" />
    </div>
  )
}
