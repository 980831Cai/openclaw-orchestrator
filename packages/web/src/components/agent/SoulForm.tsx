import { useState } from 'react'
import { Save, Heart, Shield, Sparkles, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AgentSoul } from '@/types'

interface Props {
  soul: AgentSoul
  onSave: (soul: AgentSoul) => void
}

const SECTIONS = [
  { key: 'coreTruths' as const, label: 'Core Truths', icon: Heart, description: '定义 Agent 的核心信念和价值观' },
  { key: 'boundaries' as const, label: 'Boundaries', icon: Shield, description: '设定行为边界和限制' },
  { key: 'vibe' as const, label: 'Vibe', icon: Sparkles, description: '描述交互风格和语气' },
  { key: 'continuity' as const, label: 'Continuity', icon: Clock, description: '定义记忆和上下文保持策略' },
]

export function SoulForm({ soul, onSave }: Props) {
  const [form, setForm] = useState<AgentSoul>({ ...soul })

  const update = (key: keyof AgentSoul, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SECTIONS.map(({ key, label, icon: Icon, description }) => (
          <div key={key} className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-cyber-violet" />
              <h3 className="text-white font-semibold text-sm">{label}</h3>
            </div>
            <p className="text-white/30 text-xs">{description}</p>
            <textarea
              value={form[key]}
              onChange={(e) => update(key, e.target.value)}
              rows={6}
              className="w-full bg-cyber-bg/50 border border-white/5 text-white/80 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cyber-purple/50 resize-none placeholder:text-white/15"
              placeholder={`输入 ${label} 内容（支持 Markdown）...`}
            />
          </div>
        ))}
      </div>

      <Button
        onClick={() => onSave(form)}
        className="bg-gradient-to-r from-cyber-purple to-cyber-violet"
      >
        <Save className="h-4 w-4 mr-2" />
        保存灵魂配置
      </Button>
    </div>
  )
}
