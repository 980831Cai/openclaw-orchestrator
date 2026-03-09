import { useState } from 'react'
import { Save, PlayCircle, Database, ShieldCheck, Wrench, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AgentRules } from '@/types'

interface Props {
  rules: AgentRules
  onSave: (rules: AgentRules) => void
}

const SECTIONS = [
  { key: 'startupFlow' as const, label: '启动流程', icon: PlayCircle, description: 'Agent 会话开始时的行为流程' },
  { key: 'memoryRules' as const, label: '记忆规则', icon: Database, description: '如何保存和检索对话记忆' },
  { key: 'securityRules' as const, label: '安全边界', icon: ShieldCheck, description: '安全限制和敏感内容处理' },
  { key: 'toolProtocols' as const, label: '工具协议', icon: Wrench, description: '工具调用的规范和权限' },
]

export function RulesForm({ rules, onSave }: Props) {
  const [form, setForm] = useState<AgentRules>({ ...rules })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    startupFlow: true,
    memoryRules: true,
    securityRules: true,
    toolProtocols: true,
  })

  const update = (key: keyof AgentRules, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const toggle = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="space-y-4">
      {SECTIONS.map(({ key, label, icon: Icon, description }) => (
        <div key={key} className="glass rounded-2xl overflow-hidden">
          <button
            onClick={() => toggle(key)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Icon className="h-4 w-4 text-cyber-lavender" />
              <div>
                <h3 className="text-white font-semibold text-sm">{label}</h3>
                <p className="text-white/30 text-xs mt-0.5">{description}</p>
              </div>
            </div>
            {expanded[key] ? (
              <ChevronUp className="h-4 w-4 text-white/30" />
            ) : (
              <ChevronDown className="h-4 w-4 text-white/30" />
            )}
          </button>

          <div
            className={cn(
              'overflow-hidden transition-all duration-300',
              expanded[key] ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
            )}
          >
            <div className="px-5 pb-5">
              <textarea
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
                rows={5}
                className="w-full bg-cyber-bg/50 border border-white/5 text-white/80 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cyber-purple/50 resize-none placeholder:text-white/15"
                placeholder={`输入 ${label} 规则...`}
              />
            </div>
          </div>
        </div>
      ))}

      <Button
        onClick={() => onSave(form)}
        className="bg-gradient-to-r from-cyber-purple to-cyber-violet"
      >
        <Save className="h-4 w-4 mr-2" />
        保存规范配置
      </Button>
    </div>
  )
}
