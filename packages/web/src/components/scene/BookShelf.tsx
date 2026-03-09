import { BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BookShelfProps {
  teamId: string
}

const BOOK_COLORS = [
  'from-indigo-500 to-purple-600',
  'from-cyan-500 to-blue-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
]

export function BookShelf({ teamId }: BookShelfProps) {
  const bookCount = 3

  return (
    <div className="relative group cursor-pointer">
      <div className={cn(
        'flex items-end gap-1 px-3 py-2 rounded-xl transition-all duration-300',
        'bg-cyber-panel/40 border border-white/5',
        'group-hover:border-cyber-cyan/30 group-hover:scale-105'
      )}>
        {/* Shelf icon */}
        <div className="flex items-center gap-1.5 mr-2">
          <BookOpen className="w-3.5 h-3.5 text-cyber-cyan/60" />
          <span className="text-white/30 text-[10px] font-semibold">知识库</span>
        </div>

        {/* Book spines */}
        <div className="flex items-end gap-0.5">
          {[...Array(Math.min(bookCount, 5))].map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-2 rounded-t-sm bg-gradient-to-t transition-all duration-300',
                BOOK_COLORS[i % BOOK_COLORS.length],
                'group-hover:translate-y-[-2px]'
              )}
              style={{
                height: `${14 + (i % 3) * 4}px`,
                transitionDelay: `${i * 50}ms`,
                opacity: 0.6,
              }}
            />
          ))}
        </div>

        {bookCount > 0 && (
          <span className="text-white/20 text-[9px] ml-1">{bookCount}</span>
        )}
      </div>
    </div>
  )
}
