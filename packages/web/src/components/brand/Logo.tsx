import { cn } from '@/lib/utils'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  animated?: boolean
  className?: string
  mood?: 'happy' | 'working' | 'worried' | 'waving'
}

const sizeMap = {
  sm: { icon: 28, text: 'text-xs' },
  md: { icon: 36, text: 'text-sm' },
  lg: { icon: 48, text: 'text-lg' },
  xl: { icon: 72, text: 'text-2xl' },
}

/**
 * OpenClaw Logo — A cute mechanical cat paw (Claw = 爪子)
 * SVG-based, no external image dependencies.
 *
 * Features:
 * - Rounded paw pads with digital circuit glow lines
 * - Small antenna indicating "online" status
 * - Mood variations: happy / working / worried / waving
 */
export function Logo({
  size = 'md',
  showText = false,
  animated = true,
  className,
  mood = 'happy',
}: LogoProps) {
  const s = sizeMap[size].icon

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'relative flex-shrink-0',
          animated && mood === 'happy' && 'animate-breathe',
          animated && mood === 'waving' && 'animate-cartoon-wave',
          animated && mood === 'working' && 'animate-cartoon-bob',
        )}
        style={{ width: s, height: s }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" aria-label="OpenClaw Logo">
          <defs>
            {/* Main gradient */}
            <radialGradient id="paw-grad" cx="45%" cy="40%">
              <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#6366F1" stopOpacity="0.8" />
            </radialGradient>
            {/* Pad glow */}
            <radialGradient id="pad-glow" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.3" />
            </radialGradient>
            {/* Circuit glow */}
            <filter id="circuit-glow">
              <feGaussianBlur stdDeviation="1" />
            </filter>
          </defs>

          {/* ── Paw body (palm) ── */}
          <ellipse
            cx="50"
            cy="58"
            rx="28"
            ry="24"
            fill="url(#paw-grad)"
            stroke="#7C3AED"
            strokeWidth="1.5"
            strokeOpacity="0.4"
          />

          {/* Highlight on palm */}
          <ellipse cx="44" cy="50" rx="10" ry="6" fill="white" opacity="0.08" />

          {/* ── Toe beans (4 toes) ── */}
          {/* Left outer toe */}
          <ellipse cx="26" cy="38" rx="10" ry="12" fill="url(#paw-grad)" stroke="#7C3AED" strokeWidth="1.2" strokeOpacity="0.3" />
          {/* Left inner toe */}
          <ellipse cx="40" cy="30" rx="9" ry="11" fill="url(#paw-grad)" stroke="#7C3AED" strokeWidth="1.2" strokeOpacity="0.3" />
          {/* Right inner toe */}
          <ellipse cx="58" cy="30" rx="9" ry="11" fill="url(#paw-grad)" stroke="#7C3AED" strokeWidth="1.2" strokeOpacity="0.3" />
          {/* Right outer toe */}
          <ellipse cx="72" cy="38" rx="10" ry="12" fill="url(#paw-grad)" stroke="#7C3AED" strokeWidth="1.2" strokeOpacity="0.3" />

          {/* ── Paw pads (toe beans - pink) ── */}
          <ellipse cx="26" cy="38" rx="5" ry="6" fill="url(#pad-glow)" />
          <ellipse cx="40" cy="31" rx="4.5" ry="5.5" fill="url(#pad-glow)" />
          <ellipse cx="58" cy="31" rx="4.5" ry="5.5" fill="url(#pad-glow)" />
          <ellipse cx="72" cy="38" rx="5" ry="6" fill="url(#pad-glow)" />
          {/* Main pad */}
          <ellipse cx="50" cy="60" rx="12" ry="9" fill="url(#pad-glow)" />

          {/* ── Digital circuit lines (tech feel) ── */}
          <g filter="url(#circuit-glow)" opacity="0.5">
            <line x1="38" y1="55" x2="42" y2="42" stroke="#C4B5FD" strokeWidth="0.8" strokeLinecap="round" />
            <line x1="42" y1="42" x2="50" y2="42" stroke="#C4B5FD" strokeWidth="0.8" strokeLinecap="round" />
            <line x1="62" y1="55" x2="58" y2="42" stroke="#C4B5FD" strokeWidth="0.8" strokeLinecap="round" />
            <line x1="50" y1="65" x2="50" y2="70" stroke="#C4B5FD" strokeWidth="0.8" strokeLinecap="round" />
            {/* Tiny circuit nodes */}
            <circle cx="42" cy="42" r="1.2" fill="#C4B5FD" />
            <circle cx="50" cy="42" r="1.2" fill="#C4B5FD" />
            <circle cx="50" cy="70" r="1.2" fill="#C4B5FD" />
          </g>

          {/* ── Antenna (online indicator) ── */}
          <line
            x1="50"
            y1="20"
            x2="50"
            y2="10"
            stroke="#A78BFA"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.6"
          />
          <circle cx="50" cy="8" r="3" fill="#22C55E" opacity="0.8">
            {animated && (
              <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
            )}
          </circle>
          {/* Antenna glow ring */}
          <circle cx="50" cy="8" r="5" fill="none" stroke="#22C55E" strokeWidth="0.5" opacity="0.3">
            {animated && (
              <animate attributeName="r" values="4;7;4" dur="2s" repeatCount="indefinite" />
            )}
          </circle>

          {/* ── Face expression based on mood ── */}
          {mood === 'happy' && (
            <g>
              {/* Happy eyes (^_^) */}
              <path d="M41 52 Q44 49 47 52" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
              <path d="M53 52 Q56 49 59 52" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
              {/* Small smile */}
              <path d="M46 59 Q50 62 54 59" fill="none" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
            </g>
          )}
          {mood === 'working' && (
            <g>
              {/* Focused eyes (−_−) */}
              <line x1="41" y1="51" x2="47" y2="51" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              <line x1="53" y1="51" x2="59" y2="51" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              {/* Straight mouth */}
              <line x1="46" y1="59" x2="54" y2="59" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.3" />
            </g>
          )}
          {mood === 'worried' && (
            <g>
              {/* Worried eyes */}
              <circle cx="44" cy="51" r="2" fill="white" opacity="0.5" />
              <circle cx="56" cy="51" r="2" fill="white" opacity="0.5" />
              {/* Worried mouth (wavy) */}
              <path d="M44 60 Q47 58 50 60 Q53 62 56 60" fill="none" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
            </g>
          )}
          {mood === 'waving' && (
            <g>
              {/* Waving — right outer toe tilted up */}
              {/* Excited eyes (star!) */}
              <text x="44" y="54" textAnchor="middle" fontSize="6" fill="white" opacity="0.6">★</text>
              <text x="56" y="54" textAnchor="middle" fontSize="6" fill="white" opacity="0.6">★</text>
              {/* Big smile */}
              <path d="M44 58 Q50 64 56 58" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
            </g>
          )}
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <span className={cn('font-bold text-white/90 tracking-tight leading-tight', sizeMap[size].text)}>
            OpenClaw
          </span>
          <span className="text-white/30 text-[9px] tracking-widest uppercase leading-tight">
            Orchestrator
          </span>
        </div>
      )}
    </div>
  )
}
