import { useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import type { AgentIdentity } from '@/types'

const EMOJI_OPTIONS = ['🤖','🧠','🎨','📝','🔧','🛡️','🎯','💡','🚀','⚡','🔬','📊','🎭','🌟','🦊','🐙','👾','🤹','🧙','🦾']

const THEME_COLORS = ['#6366F1','#8B5CF6','#EC4899','#F43F5E','#EF4444','#F97316','#F59E0B','#22C55E','#06B6D4','#3B82F6']

interface Props {
  identity: AgentIdentity
  onSave: (identity: AgentIdentity) => void
}

export function IdentityForm({ identity, onSave }: Props) {
  const [form, setForm] = useState<AgentIdentity>({ ...identity })

  const update = (key: keyof AgentIdentity, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Edit form */}
      <div className="lg:col-span-2 space-y-6">
        <div className="glass rounded-2xl p-6 space-y-5">
          <div>
            <Label className="text-white/70 text-sm">名称</Label>
            <Input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="mt-1.5 bg-cyber-bg border-white/10 text-white"
            />
          </div>

          <div>
            <Label className="text-white/70 text-sm">Emoji</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => update('emoji', e)}
                  className={`w-10 h-10 flex items-center justify-center rounded-xl text-lg transition-all
                    ${form.emoji === e ? 'bg-cyber-purple/30 border-2 border-cyber-purple scale-110' : 'bg-cyber-bg/50 border border-white/5 hover:border-white/20'}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-white/70 text-sm">主题色</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {THEME_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => update('theme', c)}
                  className={`w-8 h-8 rounded-full transition-all ${form.theme === c ? 'ring-2 ring-white ring-offset-2 ring-offset-cyber-bg scale-110' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <Label className="text-white/70 text-sm">风格描述</Label>
            <Input
              value={form.vibe || ''}
              onChange={(e) => update('vibe', e.target.value)}
              placeholder="例如：专业、友好、高效..."
              className="mt-1.5 bg-cyber-bg border-white/10 text-white placeholder:text-white/20"
            />
          </div>

          <div>
            <Label className="text-white/70 text-sm">开场白</Label>
            <textarea
              value={form.greeting || ''}
              onChange={(e) => update('greeting', e.target.value)}
              placeholder="Agent 首次见面时说的话..."
              rows={3}
              className="mt-1.5 w-full bg-cyber-bg border border-white/10 text-white rounded-lg px-3 py-2 text-sm placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-cyber-purple/50 resize-none"
            />
          </div>

          <Button
            onClick={() => onSave(form)}
            className="bg-gradient-to-r from-cyber-purple to-cyber-violet"
          >
            <Save className="h-4 w-4 mr-2" />
            保存身份配置
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="flex flex-col items-center gap-4">
        <div className="glass rounded-2xl p-8 w-full flex flex-col items-center">
          <p className="text-white/30 text-xs mb-4 uppercase tracking-wider">预览</p>
          <AgentAvatar emoji={form.emoji} theme={form.theme} status="idle" size="xl" />
          <h3 className="text-white font-semibold mt-4">{form.name || 'Unnamed'}</h3>
          <p className="text-white/40 text-sm mt-1">{form.vibe || 'No vibe set'}</p>
          {form.greeting && (
            <div className="mt-4 p-3 rounded-xl bg-cyber-bg/50 border border-white/5 text-white/60 text-sm max-w-full">
              "{form.greeting}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
