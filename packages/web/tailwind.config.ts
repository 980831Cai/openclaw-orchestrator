import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        cyber: {
          bg: '#0F0F23',
          surface: '#1A1A2E',
          panel: '#16213E',
          elevated: '#1E293B',
          purple: '#6366F1',
          violet: '#8B5CF6',
          lavender: '#A78BFA',
          green: '#22C55E',
          red: '#EF4444',
          amber: '#F59E0B',
          blue: '#3B82F6',
          cyan: '#06B6D4',
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'typing': 'typing 1.5s steps(3) infinite',
        'beam': 'beam 2s linear infinite',
        'breathe': 'breathe 4s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.5s ease-out',
        'cartoon-bob': 'cartoonBob 3s ease-in-out infinite',
        'cartoon-wave': 'cartoonWave 4s ease-in-out infinite',
        'cartoon-sparkle': 'cartoonSparkle 2s ease-in-out infinite',
        'cartoon-sway': 'cartoonSway 5s ease-in-out infinite',
        'steam-rise': 'steamRise 2s ease-out infinite',
        'invite-glow': 'inviteGlow 2s ease-in-out infinite',
        'msg-slide-left': 'msgSlideLeft 0.3s ease-out',
        'msg-slide-right': 'msgSlideRight 0.3s ease-out',
        'ring-rotate': 'ringRotate 20s linear infinite',
        'dot-pulse': 'dotPulse 1.4s ease-in-out infinite both',
        'status-breathe': 'statusBreathe 3s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(99, 102, 241, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.6)' },
        },
        typing: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        beam: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(0.3deg)' },
          '75%': { transform: 'rotate(-0.3deg)' },
        },
        cartoonBob: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        cartoonWave: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(5deg)' },
          '75%': { transform: 'rotate(-5deg)' },
        },
        cartoonSparkle: {
          '0%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '50%': { opacity: '1', transform: 'scale(1.2)' },
        },
        cartoonSway: {
          '0%, 100%': { transform: 'rotate(-1deg)' },
          '50%': { transform: 'rotate(1deg)' },
        },
        steamRise: {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '0.5' },
          '100%': { transform: 'translateY(-12px) scale(1.5)', opacity: '0' },
        },
        inviteGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.3)' },
          '50%': { boxShadow: '0 0 0 8px rgba(34, 197, 94, 0)' },
        },
        msgSlideLeft: {
          '0%': { transform: 'translateX(-16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        msgSlideRight: {
          '0%': { transform: 'translateX(16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        ringRotate: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        dotPulse: {
          '0%, 80%, 100%': { transform: 'scale(0)', opacity: '0' },
          '40%': { transform: 'scale(1)', opacity: '1' },
        },
        statusBreathe: {
          '0%, 100%': { boxShadow: '0 0 0 0 currentColor', opacity: '0.8' },
          '50%': { boxShadow: '0 0 12px 2px currentColor', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
