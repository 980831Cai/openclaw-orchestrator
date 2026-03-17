import { cn } from '@/lib/utils'
import type { AgentStatus } from '@/types'

interface AgentAvatarProps {
  emoji: string
  theme?: string
  status?: AgentStatus
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  onClick?: () => void
  /** Show full cartoon body (for config page preview) */
  showBody?: boolean
}

const sizeMap = {
  xs: { container: 'w-8 h-8', emoji: 'text-xs', body: 'w-10 h-14' },
  sm: { container: 'w-10 h-10', emoji: 'text-base', body: 'w-14 h-20' },
  md: { container: 'w-14 h-14', emoji: 'text-xl', body: 'w-20 h-28' },
  lg: { container: 'w-20 h-20', emoji: 'text-3xl', body: 'w-28 h-40' },
  xl: { container: 'w-28 h-28', emoji: 'text-5xl', body: 'w-40 h-56' },
}

const statusColors: Record<AgentStatus, string> = {
  idle: 'bg-white/30',
  busy: 'bg-emerald-400',
  scheduled: 'bg-cyan-400',
  error: 'bg-red-400',
  offline: 'bg-white/15',
}

const statusLabels: Record<AgentStatus, string> = {
  idle: '空闲',
  busy: '工作中',
  scheduled: '值守中',
  error: '异常',
  offline: '离线',
}

// Generate a deterministic cartoon face based on the emoji character
function getCartoonTraits(emoji: string): {
  eyeStyle: number
  mouthStyle: number
  accessory: number
  blush: boolean
} {
  let hash = 0
  for (let i = 0; i < emoji.length; i++) {
    hash = ((hash << 5) - hash + emoji.charCodeAt(i)) | 0
  }
  return {
    eyeStyle: Math.abs(hash % 4),
    mouthStyle: Math.abs((hash >> 4) % 4),
    accessory: Math.abs((hash >> 8) % 5),
    blush: Math.abs(hash % 3) === 0,
  }
}

/** SVG-based cartoon character face */
function CartoonFace({
  emoji,
  theme,
  size,
}: {
  emoji: string
  theme: string
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}) {
  const traits = getCartoonTraits(emoji)
  const s = size === 'xs' ? 32 : size === 'sm' ? 40 : size === 'md' ? 56 : size === 'lg' ? 80 : 112
  const cx = s / 2
  const cy = s / 2
  const r = s * 0.42

  // Eye positions
  const eyeSpacing = r * 0.35
  const eyeY = cy - r * 0.08
  const eyeR = r * 0.09

  // Mouth
  const mouthY = cy + r * 0.28

  return (
    <svg viewBox={`0 0 ${s} ${s}`} className="w-full h-full">
      {/* Head circle with gradient */}
      <defs>
        <radialGradient id={`head-${emoji}`} cx="40%" cy="35%">
          <stop offset="0%" stopColor={theme} stopOpacity="0.5" />
          <stop offset="100%" stopColor={theme} stopOpacity="0.2" />
        </radialGradient>
        <radialGradient id={`glow-${emoji}`} cx="50%" cy="50%">
          <stop offset="0%" stopColor={theme} stopOpacity="0.15" />
          <stop offset="100%" stopColor={theme} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ambient glow */}
      <circle cx={cx} cy={cy} r={r * 1.1} fill={`url(#glow-${emoji})`} />

      {/* Head */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={`url(#head-${emoji})`}
        stroke={theme}
        strokeWidth={s * 0.02}
        strokeOpacity="0.35"
      />

      {/* Highlight on forehead */}
      <ellipse
        cx={cx - r * 0.15}
        cy={cy - r * 0.35}
        rx={r * 0.25}
        ry={r * 0.12}
        fill="white"
        opacity="0.06"
      />

      {/* Eyes */}
      {traits.eyeStyle === 0 ? (
        // Round eyes
        <>
          <circle cx={cx - eyeSpacing} cy={eyeY} r={eyeR} fill="white" opacity="0.9" />
          <circle cx={cx + eyeSpacing} cy={eyeY} r={eyeR} fill="white" opacity="0.9" />
          <circle cx={cx - eyeSpacing + eyeR * 0.2} cy={eyeY - eyeR * 0.1} r={eyeR * 0.5} fill="#1a1a2e" />
          <circle cx={cx + eyeSpacing + eyeR * 0.2} cy={eyeY - eyeR * 0.1} r={eyeR * 0.5} fill="#1a1a2e" />
          {/* Eye sparkle */}
          <circle cx={cx - eyeSpacing + eyeR * 0.4} cy={eyeY - eyeR * 0.3} r={eyeR * 0.18} fill="white" opacity="0.8" />
          <circle cx={cx + eyeSpacing + eyeR * 0.4} cy={eyeY - eyeR * 0.3} r={eyeR * 0.18} fill="white" opacity="0.8" />
        </>
      ) : traits.eyeStyle === 1 ? (
        // Cute dot eyes
        <>
          <circle cx={cx - eyeSpacing} cy={eyeY} r={eyeR * 0.6} fill="#1a1a2e" />
          <circle cx={cx + eyeSpacing} cy={eyeY} r={eyeR * 0.6} fill="#1a1a2e" />
          <circle cx={cx - eyeSpacing + eyeR * 0.15} cy={eyeY - eyeR * 0.15} r={eyeR * 0.2} fill="white" opacity="0.7" />
          <circle cx={cx + eyeSpacing + eyeR * 0.15} cy={eyeY - eyeR * 0.15} r={eyeR * 0.2} fill="white" opacity="0.7" />
        </>
      ) : traits.eyeStyle === 2 ? (
        // Happy squint eyes (^_^)
        <>
          <path
            d={`M${cx - eyeSpacing - eyeR} ${eyeY} Q${cx - eyeSpacing} ${eyeY - eyeR * 1.2} ${cx - eyeSpacing + eyeR} ${eyeY}`}
            fill="none"
            stroke="#1a1a2e"
            strokeWidth={eyeR * 0.5}
            strokeLinecap="round"
          />
          <path
            d={`M${cx + eyeSpacing - eyeR} ${eyeY} Q${cx + eyeSpacing} ${eyeY - eyeR * 1.2} ${cx + eyeSpacing + eyeR} ${eyeY}`}
            fill="none"
            stroke="#1a1a2e"
            strokeWidth={eyeR * 0.5}
            strokeLinecap="round"
          />
        </>
      ) : (
        // Star-shaped sparkle eyes
        <>
          <circle cx={cx - eyeSpacing} cy={eyeY} r={eyeR * 0.9} fill="white" opacity="0.9" />
          <circle cx={cx + eyeSpacing} cy={eyeY} r={eyeR * 0.9} fill="white" opacity="0.9" />
          <text
            x={cx - eyeSpacing}
            y={eyeY + eyeR * 0.35}
            textAnchor="middle"
            fontSize={eyeR * 1.4}
            fill={theme}
          >
            ★
          </text>
          <text
            x={cx + eyeSpacing}
            y={eyeY + eyeR * 0.35}
            textAnchor="middle"
            fontSize={eyeR * 1.4}
            fill={theme}
          >
            ★
          </text>
        </>
      )}

      {/* Blush */}
      {traits.blush && (
        <>
          <ellipse
            cx={cx - eyeSpacing - eyeR * 0.3}
            cy={eyeY + eyeR * 1.5}
            rx={eyeR * 0.7}
            ry={eyeR * 0.4}
            fill="#EC4899"
            opacity="0.15"
          />
          <ellipse
            cx={cx + eyeSpacing + eyeR * 0.3}
            cy={eyeY + eyeR * 1.5}
            rx={eyeR * 0.7}
            ry={eyeR * 0.4}
            fill="#EC4899"
            opacity="0.15"
          />
        </>
      )}

      {/* Mouth */}
      {traits.mouthStyle === 0 ? (
        // Smile
        <path
          d={`M${cx - r * 0.15} ${mouthY} Q${cx} ${mouthY + r * 0.15} ${cx + r * 0.15} ${mouthY}`}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth={r * 0.04}
          strokeLinecap="round"
        />
      ) : traits.mouthStyle === 1 ? (
        // Cat mouth :3
        <>
          <path
            d={`M${cx - r * 0.12} ${mouthY} Q${cx - r * 0.03} ${mouthY + r * 0.08} ${cx} ${mouthY}`}
            fill="none"
            stroke="#1a1a2e"
            strokeWidth={r * 0.035}
            strokeLinecap="round"
          />
          <path
            d={`M${cx} ${mouthY} Q${cx + r * 0.03} ${mouthY + r * 0.08} ${cx + r * 0.12} ${mouthY}`}
            fill="none"
            stroke="#1a1a2e"
            strokeWidth={r * 0.035}
            strokeLinecap="round"
          />
        </>
      ) : traits.mouthStyle === 2 ? (
        // Open smile
        <ellipse
          cx={cx}
          cy={mouthY + r * 0.02}
          rx={r * 0.12}
          ry={r * 0.08}
          fill="#1a1a2e"
          opacity="0.7"
        />
      ) : (
        // Small O mouth
        <circle cx={cx} cy={mouthY + r * 0.02} r={r * 0.06} fill="#1a1a2e" opacity="0.5" />
      )}

      {/* Accessories */}
      {traits.accessory === 0 && (
        // Small crown
        <path
          d={`M${cx - r * 0.25} ${cy - r * 0.8}
              L${cx - r * 0.18} ${cy - r * 0.95}
              L${cx - r * 0.05} ${cy - r * 0.82}
              L${cx + r * 0.05} ${cy - r * 0.98}
              L${cx + r * 0.18} ${cy - r * 0.82}
              L${cx + r * 0.25} ${cy - r * 0.95}
              L${cx + r * 0.25} ${cy - r * 0.8} Z`}
          fill="#F59E0B"
          opacity="0.7"
        />
      )}
      {traits.accessory === 1 && (
        // Antenna/headphone
        <>
          <line
            x1={cx}
            y1={cy - r}
            x2={cx}
            y2={cy - r * 1.25}
            stroke={theme}
            strokeWidth={r * 0.04}
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy - r * 1.28} r={r * 0.08} fill={theme} opacity="0.8" />
        </>
      )}
      {traits.accessory === 2 && (
        // Glasses
        <>
          <circle
            cx={cx - eyeSpacing}
            cy={eyeY}
            r={eyeR * 1.4}
            fill="none"
            stroke="white"
            strokeWidth={r * 0.03}
            opacity="0.3"
          />
          <circle
            cx={cx + eyeSpacing}
            cy={eyeY}
            r={eyeR * 1.4}
            fill="none"
            stroke="white"
            strokeWidth={r * 0.03}
            opacity="0.3"
          />
          <line
            x1={cx - eyeSpacing + eyeR * 1.4}
            y1={eyeY}
            x2={cx + eyeSpacing - eyeR * 1.4}
            y2={eyeY}
            stroke="white"
            strokeWidth={r * 0.025}
            opacity="0.3"
          />
        </>
      )}
      {traits.accessory === 3 && (
        // Bow
        <g transform={`translate(${cx + r * 0.35}, ${cy - r * 0.7})`}>
          <ellipse cx={-r * 0.08} cy={0} rx={r * 0.1} ry={r * 0.06} fill="#EC4899" opacity="0.5" />
          <ellipse cx={r * 0.08} cy={0} rx={r * 0.1} ry={r * 0.06} fill="#EC4899" opacity="0.5" />
          <circle cx={0} cy={0} r={r * 0.03} fill="#EC4899" opacity="0.6" />
        </g>
      )}

      {/* The original emoji floating as a small badge */}
      <text
        x={cx + r * 0.62}
        y={cy + r * 0.72}
        textAnchor="middle"
        fontSize={r * 0.38}
        className="select-none"
      >
        {emoji}
      </text>
    </svg>
  )
}

/** Cartoon character body for config page */
function CartoonBody({
  emoji,
  theme,
  status,
}: {
  emoji: string
  theme: string
  status: AgentStatus
}) {
  const traits = getCartoonTraits(emoji)

  return (
    <div className="flex flex-col items-center">
      {/* Head - larger */}
      <div className="w-24 h-24 relative">
        <CartoonFace emoji={emoji} theme={theme} size="lg" />
      </div>

      {/* Body */}
      <svg viewBox="0 0 100 70" className="w-28 -mt-2">
        {/* Torso */}
        <path
          d="M30 8 Q30 0, 50 0 Q70 0, 70 8 L75 45 Q75 55, 50 55 Q25 55, 25 45 Z"
          fill={theme}
          fillOpacity="0.2"
          stroke={theme}
          strokeWidth="1.5"
          strokeOpacity="0.4"
        />

        {/* Collar / tie decoration */}
        <path
          d="M44 2 L50 12 L56 2"
          fill="none"
          stroke={theme}
          strokeWidth="1.5"
          strokeOpacity="0.5"
          strokeLinecap="round"
        />

        {/* Arms */}
        <path
          d={status === 'busy'
            ? "M28 12 Q10 15, 15 35 Q17 40, 22 38"
            : "M28 12 Q15 20, 18 40 Q20 45, 25 42"
          }
          fill="none"
          stroke={theme}
          strokeWidth="2"
          strokeOpacity="0.35"
          strokeLinecap="round"
        />
        <path
          d={status === 'busy'
            ? "M72 12 Q85 8, 82 30 Q80 36, 78 34"
            : "M72 12 Q85 20, 82 40 Q80 45, 75 42"
          }
          fill="none"
          stroke={theme}
          strokeWidth="2"
          strokeOpacity="0.35"
          strokeLinecap="round"
        />

        {/* Hands */}
        <circle
          cx={status === 'busy' ? 20 : 23}
          cy={status === 'busy' ? 38 : 43}
          r="4"
          fill={theme}
          fillOpacity="0.25"
        />
        <circle
          cx={status === 'busy' ? 80 : 77}
          cy={status === 'busy' ? 32 : 43}
          r="4"
          fill={theme}
          fillOpacity="0.25"
        />

        {/* Laptop for busy status */}
        {status === 'busy' && (
          <g opacity="0.5">
            <rect x="60" y="28" width="22" height="14" rx="2" fill={theme} fillOpacity="0.2" stroke={theme} strokeWidth="1" strokeOpacity="0.3" />
            <rect x="62" y="30" width="18" height="9" rx="1" fill={theme} fillOpacity="0.15" />
            <line x1="60" y1="42" x2="82" y2="42" stroke={theme} strokeWidth="1.5" strokeOpacity="0.3" />
          </g>
        )}

        {/* ID badge */}
        {traits.accessory < 3 && (
          <g opacity="0.4">
            <rect x="42" y="22" width="16" height="10" rx="2" fill="white" fillOpacity="0.1" stroke="white" strokeWidth="0.5" strokeOpacity="0.2" />
            <circle cx="50" cy="26" r="2" fill="white" fillOpacity="0.15" />
          </g>
        )}
      </svg>
    </div>
  )
}

export function AgentAvatar({
  emoji,
  theme = '#6366F1',
  status = 'idle',
  size = 'md',
  className,
  onClick,
  showBody = false,
}: AgentAvatarProps) {
  if (showBody) {
    return (
      <div
        className={cn(
          'relative cursor-pointer transition-all duration-300',
          status === 'busy' && 'animate-cartoon-bob',
          className
        )}
        onClick={onClick}
      >
        <CartoonBody emoji={emoji} theme={theme} status={status} />

        {/* Status label */}
        <div className={cn(
          'absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-medium border backdrop-blur-sm',
          status === 'busy' && 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
          status === 'idle' && 'bg-white/[0.04] text-white/35 border-white/[0.06]',
          status === 'scheduled' && 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
          status === 'error' && 'bg-red-500/15 text-red-400 border-red-500/20',
          status === 'offline' && 'bg-white/[0.02] text-white/20 border-white/[0.04]',
        )}>
          {statusLabels[status]}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative flex items-center justify-center cursor-pointer transition-all duration-300',
        sizeMap[size].container,
        status === 'idle' && 'animate-breathe',
        status === 'busy' && 'animate-cartoon-bob',
        className
      )}
      onClick={onClick}
    >
      {/* Cartoon face */}
      <CartoonFace emoji={emoji} theme={theme} size={size} />

      {/* Status indicator dot */}
      <div
        className={cn(
          'absolute -bottom-0.5 -right-0.5 rounded-full border-[1.5px] border-cyber-bg',
          statusColors[status],
          status === 'busy' && 'animate-pulse',
          size === 'xs' ? 'w-2 h-2' : size === 'sm' ? 'w-2.5 h-2.5' : size === 'md' ? 'w-3 h-3' : 'w-4 h-4'
        )}
      />

      {/* Busy typing bubble */}
      {status === 'busy' && size !== 'sm' && size !== 'xs' && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-white/[0.06] backdrop-blur-xl border border-white/[0.08] text-[10px] text-white/60 whitespace-nowrap">
          <span className="inline-flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      )}

      {/* Error indicator */}
      {status === 'error' && size !== 'sm' && size !== 'xs' && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-red-400 text-sm font-bold animate-bounce">
          ⚠
        </div>
      )}
    </div>
  )
}
