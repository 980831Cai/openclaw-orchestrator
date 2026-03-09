import { useState } from 'react'
import { Save, Search, ArrowRight, Zap, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const AVAILABLE_SKILLS = [
  { id: 'web-search', name: 'Web Search', icon: '🔍', description: '搜索互联网获取实时信息' },
  { id: 'code-review', name: 'Code Review', icon: '🔬', description: '审查代码质量和安全性' },
  { id: 'file-editor', name: 'File Editor', icon: '📝', description: '读写和编辑文件' },
  { id: 'terminal', name: 'Terminal', icon: '💻', description: '执行终端命令' },
  { id: 'image-gen', name: 'Image Gen', icon: '🎨', description: '生成和编辑图像' },
  { id: 'data-analysis', name: 'Data Analysis', icon: '📊', description: '分析和可视化数据' },
  { id: 'api-caller', name: 'API Caller', icon: '🔗', description: '调用外部 API 接口' },
  { id: 'doc-writer', name: 'Doc Writer', icon: '📄', description: '生成文档和报告' },
]

interface Props {
  skills: string[]
  onSave: (skills: string[]) => void
}

export function SkillsSelector({ skills, onSave }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(skills))
  const [search, setSearch] = useState('')

  const filteredSkills = AVAILABLE_SKILLS.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Available Skills */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyber-amber" />
              技能市场
            </h3>
            <span className="text-white/30 text-xs">{AVAILABLE_SKILLS.length} 可用</span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索技能..."
              className="pl-9 bg-cyber-bg/50 border-white/5 text-white text-sm h-8"
            />
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {filteredSkills.map((skill) => (
              <button
                key={skill.id}
                onClick={() => toggle(skill.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all',
                  selected.has(skill.id)
                    ? 'bg-cyber-purple/15 border border-cyber-purple/30'
                    : 'bg-cyber-bg/30 border border-white/5 hover:border-white/10'
                )}
              >
                <span className="text-xl">{skill.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{skill.name}</p>
                  <p className="text-white/30 text-xs truncate">{skill.description}</p>
                </div>
                {selected.has(skill.id) && (
                  <Check className="h-4 w-4 text-cyber-green flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Equipped Skills */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-cyber-green" />
              已装备技能
            </h3>
            <span className="text-white/30 text-xs">{selected.size} 已选</span>
          </div>

          {selected.size === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/20">
              <Zap className="h-10 w-10 mb-2" />
              <p className="text-sm">从左侧选择技能装备</p>
            </div>
          ) : (
            <div className="space-y-2">
              {AVAILABLE_SKILLS.filter((s) => selected.has(s.id)).map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-cyber-green/5 border border-cyber-green/20"
                >
                  <span className="text-xl">{skill.icon}</span>
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{skill.name}</p>
                  </div>
                  <button
                    onClick={() => toggle(skill.id)}
                    className="text-white/30 hover:text-cyber-red text-xs"
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Button
        onClick={() => onSave(Array.from(selected))}
        className="bg-gradient-to-r from-cyber-purple to-cyber-violet"
      >
        <Save className="h-4 w-4 mr-2" />
        保存技能配置
      </Button>
    </div>
  )
}
