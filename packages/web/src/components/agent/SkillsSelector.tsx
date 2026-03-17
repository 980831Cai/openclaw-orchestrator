import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Plus, RefreshCw, Save, Search, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { SkillCatalogItem } from '@/types'

interface Props {
  skills: string[]
  onSave: (skills: string[]) => Promise<unknown> | void
}

function sourceLabel(sources: SkillCatalogItem['sources']) {
  if (sources.includes('platform') && sources.includes('agent-config')) return '平台 + Agent'
  if (sources.includes('agent-config')) return 'Agent 已使用'
  if (sources.includes('platform')) return '平台配置'
  return '内置推荐'
}

export function SkillsSelector({ skills, onSave }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(skills))
  const [catalog, setCatalog] = useState<SkillCatalogItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [customId, setCustomId] = useState('')
  const [customName, setCustomName] = useState('')
  const [customDescription, setCustomDescription] = useState('')

  const loadCatalog = async () => {
    setLoading(true)
    try {
      const data = await api.get<SkillCatalogItem[]>('/skills/catalog')
      setCatalog(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelected(new Set(skills))
  }, [skills])

  useEffect(() => {
    void loadCatalog()
  }, [])

  const filteredSkills = useMemo(
    () => catalog.filter((skill) => {
      const keyword = search.toLowerCase()
      return skill.name.toLowerCase().includes(keyword) || skill.id.toLowerCase().includes(keyword)
    }),
    [catalog, search]
  )

  const selectedSkills = useMemo(() => {
    return Array.from(selected).map((skillId) => {
      return catalog.find((skill) => skill.id === skillId) || {
        id: skillId,
        name: skillId,
        description: '当前 Agent 已使用，但技能目录里还没有描述信息。',
        configuredCount: 1,
        configuredAgents: [],
        sources: ['agent-config'] as SkillCatalogItem['sources'],
      }
    })
  }, [catalog, selected])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addCustomSkill = async () => {
    const payload = {
      id: customId.trim(),
      name: customName.trim(),
      description: customDescription.trim(),
    }
    const saved = await api.put<SkillCatalogItem>('/skills/catalog', payload)
    setCatalog((prev) => {
      const rest = prev.filter((item) => item.id !== saved.id)
      return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    })
    setSelected((prev) => new Set([...prev, saved.id]))
    setCustomId('')
    setCustomName('')
    setCustomDescription('')
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-5 border border-white/5 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">动态 Skills 目录</h3>
            <p className="mt-1 text-xs text-white/35">
              先读取 OpenClaw 当前 Agent 已配置的 `skills.json`，再合并平台自定义目录；保存后会把选中的 Skill 回写到当前 Agent。
            </p>
          </div>
          <Button variant="ghost" className="text-white/60 hover:text-white" onClick={() => void loadCatalog()}>
            <RefreshCw className="mr-2 h-4 w-4" /> 刷新目录
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5 space-y-4 border border-white/5">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyber-amber" /> 技能市场
            </h3>
            <span className="text-white/30 text-xs">{catalog.length} 可选</span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索技能 ID / 名称..."
              className="pl-9 bg-cyber-bg/50 border-white/5 text-white text-sm h-8"
            />
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {loading ? (
              <div className="py-12 text-center text-sm text-white/30">正在读取 OpenClaw Skills...</div>
            ) : filteredSkills.map((skill) => (
              <button
                key={skill.id}
                onClick={() => toggle(skill.id)}
                className={cn(
                  'w-full space-y-2 rounded-xl border p-3 text-left transition-all',
                  selected.has(skill.id)
                    ? 'border-cyber-purple/30 bg-cyber-purple/15'
                    : 'border-white/5 bg-cyber-bg/30 hover:border-white/10'
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-lg">🧠</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-white text-sm font-medium">{skill.name}</p>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/45">
                        {sourceLabel(skill.sources)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/25">{skill.id}</p>
                    <p className="mt-1 text-xs text-white/35 line-clamp-2">{skill.description || '暂无描述'}</p>
                  </div>
                  {selected.has(skill.id) && <Check className="h-4 w-4 text-cyber-green flex-shrink-0" />}
                </div>
                <div className="flex items-center justify-between text-[11px] text-white/30">
                  <span>已被 {skill.configuredCount} 个 Agent 使用</span>
                  {skill.configuredAgents.length > 0 && <span>{skill.configuredAgents.join(' / ')}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass rounded-2xl p-5 space-y-4 border border-white/5">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-cyber-green" /> 已装备技能
              </h3>
              <span className="text-white/30 text-xs">{selected.size} 已选</span>
            </div>

            {selectedSkills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/20">
                <Zap className="h-10 w-10 mb-2" />
                <p className="text-sm">从左侧选择 Skill 后保存到当前 Agent</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center gap-3 rounded-xl border border-cyber-green/20 bg-cyber-green/5 p-3"
                  >
                    <span className="text-xl">⚙️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{skill.name}</p>
                      <p className="text-xs text-white/30 truncate">{skill.id}</p>
                    </div>
                    <button onClick={() => toggle(skill.id)} className="text-white/30 hover:text-cyber-red text-xs">
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass rounded-2xl p-5 space-y-4 border border-white/5">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <Plus className="h-4 w-4 text-cyber-amber" /> 平台新增 Skill
              </h3>
              <span className="text-white/30 text-xs">会同步到 OpenClaw 目录</span>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Input
                value={customId}
                onChange={(event) => setCustomId(event.target.value)}
                placeholder="skill-id"
                className="bg-cyber-bg/40 border-white/10 text-white"
              />
              <Input
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="展示名称"
                className="bg-cyber-bg/40 border-white/10 text-white"
              />
            </div>
            <Input
              value={customDescription}
              onChange={(event) => setCustomDescription(event.target.value)}
              placeholder="这个 Skill 主要解决什么问题"
              className="bg-cyber-bg/40 border-white/10 text-white"
            />
            <Button onClick={() => void addCustomSkill()} className="bg-cyber-amber/20 text-cyber-amber hover:bg-cyber-amber/30">
              <Plus className="mr-2 h-4 w-4" /> 写入平台 Skill 目录
            </Button>
          </div>
        </div>
      </div>

      <Button onClick={() => void onSave(Array.from(selected))} className="bg-gradient-to-r from-cyber-purple to-cyber-violet">
        <Save className="h-4 w-4 mr-2" /> 保存当前 Agent Skills
      </Button>
    </div>
  )
}
