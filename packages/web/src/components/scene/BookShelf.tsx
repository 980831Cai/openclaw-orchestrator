import { cn } from '@/lib/utils'

interface BookShelfProps {
  teamId: string
}

const BOOK_COLORS = [
  { from: '#6366F1', to: '#4F46E5' },
  { from: '#8B5CF6', to: '#7C3AED' },
  { from: '#EC4899', to: '#DB2777' },
  { from: '#06B6D4', to: '#0891B2' },
  { from: '#F59E0B', to: '#D97706' },
]

export function BookShelf({ teamId }: BookShelfProps) {
  const bookCount = 3

  return (
    <div className="relative group cursor-pointer">
      <div className={cn(
        'flex items-end gap-2 px-4 py-2.5 rounded-2xl transition-all duration-300',
        'cartoon-card',
      )}>
        {/* Shelf label */}
        <div className="flex items-center gap-1.5 mr-1">
          <span className="text-sm">📚</span>
          <span className="text-white/30 text-[10px] font-bold">知识库</span>
        </div>

        {/* Book spines — cartoon style with rounded tops */}
        <div className="flex items-end gap-[3px]">
          {[...Array(Math.min(bookCount, 5))].map((_, i) => {
            const color = BOOK_COLORS[i % BOOK_COLORS.length]
            const heights = [18, 22, 16, 20, 17]
            return (
              <div
                key={i}
                className="relative rounded-t-sm transition-all duration-300 group-hover:translate-y-[-3px]"
                style={{
                  width: '6px',
                  height: `${heights[i % heights.length]}px`,
                  background: `linear-gradient(180deg, ${color.from}80, ${color.to}60)`,
                  transitionDelay: `${i * 60}ms`,
                  borderRadius: '2px 2px 0 0',
                }}
              >
                {/* Book spine detail line */}
                <div
                  className="absolute top-1 left-1/2 -translate-x-1/2 w-[2px] rounded-full"
                  style={{
                    height: '3px',
                    background: `${color.from}`,
                    opacity: 0.5,
                  }}
                />
              </div>
            )
          })}
        </div>

        {/* Count badge */}
        {bookCount > 0 && (
          <span className="text-white/15 text-[9px] ml-1 px-1 py-0.5 rounded bg-white/3">
            {bookCount}
          </span>
        )}
      </div>

      {/* Shelf edge — wood-like bottom line */}
      <div className="absolute -bottom-0.5 left-2 right-2 h-[2px] rounded-full bg-amber-900/10" />
    </div>
  )
}
