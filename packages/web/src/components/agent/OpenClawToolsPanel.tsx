import { useEffect, useMemo, useState } from 'react'
import { Blocks, Cable, RefreshCw, Save, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { OpenClawPluginField, OpenClawPluginItem } from '@/types'

function kindLabel(kind: OpenClawPluginItem['kind']) {
  if (kind === 'mcp') return 'MCP'
  if (kind === 'tool') return '工具'
  return '插件'
}

function normalizeFieldValue(type: OpenClawPluginField['type'], value: string, fallback: unknown) {
  if (type === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return value
}

export function OpenClawToolsPanel() {
  const [items, setItems] = useState<OpenClawPluginItem[]>([])
  const [draftEnabled, setDraftEnabled] = useState<Record<string, boolean>>({})
  const [draftConfig, setDraftConfig] = useState<Record<string, Record<string, unknown>>>({})
  const [loading, setLoading] = useState(true)

  const loadPlugins = async () => {
    setLoading(true)
    try {
      const data = await api.get<OpenClawPluginItem[]>('/openclaw/plugins')
      setItems(data)
      setDraftEnabled(
        Object.fromEntries(data.map((item) => [item.id, item.enabled]))
      )
      setDraftConfig(
        Object.fromEntries(data.map((item) => [item.id, item.config || {}]))
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPlugins()
  }, [])

  const stats = useMemo(() => ({
    total: items.length,
    enabled: items.filter((item) => draftEnabled[item.id] ?? item.enabled).length,
    installed: items.filter((item) => item.installed).length,
  }), [items, draftEnabled])

  const updateField = (pluginId: string, field: OpenClawPluginField, value: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      [pluginId]: {
        ...(prev[pluginId] || {}),
        [field.key]: normalizeFieldValue(field.type, value, prev[pluginId]?.[field.key]),
      },
    }))
  }

  const savePlugin = async (pluginId: string) => {
    const updated = await api.put<OpenClawPluginItem>(`/openclaw/plugins/${pluginId}`, {
      enabled: draftEnabled[pluginId] ?? true,
      config: draftConfig[pluginId] || {},
    })
    setItems((prev) => prev.map((item) => (item.id === pluginId ? updated : item)))
    setDraftEnabled((prev) => ({ ...prev, [pluginId]: updated.enabled }))
    setDraftConfig((prev) => ({ ...prev, [pluginId]: updated.config || {} }))
  }

  if (loading) {
    return <div className="glass rounded-2xl p-6 text-sm text-white/40">正在读取 OpenClaw 插件与 MCP 配置...</div>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: '已发现插件', value: stats.total, icon: Blocks, accent: 'text-cyber-purple' },
          { label: '当前启用', value: stats.enabled, icon: Cable, accent: 'text-cyber-green' },
          { label: '已安装到本机', value: stats.installed, icon: Wrench, accent: 'text-cyber-amber' },
        ].map((item) => (
          <div key={item.label} className="glass rounded-2xl p-4 border border-white/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/35">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
              </div>
              <item.icon className={cn('h-5 w-5', item.accent)} />
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-5 border border-white/5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">OpenClaw 工具 / MCP / 插件</h3>
            <p className="mt-1 text-xs text-white/35">
              这里直接扫描 `~/.openclaw/extensions` 的插件清单，并把配置同步回 `openclaw.json` 的 `plugins.entries`。
            </p>
          </div>
          <Button variant="ghost" className="text-white/60 hover:text-white" onClick={() => void loadPlugins()}>
            <RefreshCw className="mr-2 h-4 w-4" /> 刷新
          </Button>
        </div>
        <p className="text-xs text-cyber-amber/90">
          修改插件 / MCP 配置后，通常需要重启 OpenClaw Gateway 才会完全生效。
        </p>
      </div>

      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="glass rounded-2xl p-5 border border-white/5 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-white">{item.name}</h3>
                  <span className="rounded-full border border-cyber-purple/25 bg-cyber-purple/10 px-2 py-1 text-[11px] text-cyber-purple">
                    {kindLabel(item.kind)}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-1 text-[11px] border',
                      item.installed
                        ? 'border-cyber-green/25 bg-cyber-green/10 text-cyber-green'
                        : 'border-cyber-amber/25 bg-cyber-amber/10 text-cyber-amber'
                    )}
                  >
                    {item.installed ? '本机已安装' : '仅配置存在'}
                  </span>
                </div>
                <p className="text-sm text-white/45">{item.description || '暂无描述'}</p>
                <p className="text-[11px] text-white/25">ID: {item.id}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setDraftEnabled((prev) => ({ ...prev, [item.id]: !(prev[item.id] ?? item.enabled) }))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs transition-colors',
                    draftEnabled[item.id] ?? item.enabled
                      ? 'border-cyber-green/25 bg-cyber-green/10 text-cyber-green'
                      : 'border-white/10 bg-cyber-bg/40 text-white/50'
                  )}
                >
                  {draftEnabled[item.id] ?? item.enabled ? '已启用' : '已停用'}
                </button>
                <Button className="bg-gradient-to-r from-cyber-purple to-cyber-violet" onClick={() => void savePlugin(item.id)}>
                  <Save className="mr-2 h-4 w-4" /> 保存插件配置
                </Button>
              </div>
            </div>

            {item.fields.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {item.fields.map((field) => {
                  const currentValue = draftConfig[item.id]?.[field.key]
                  return (
                    <label key={field.key} className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-white">
                        <span>{field.label}</span>
                        {field.required && <span className="text-[11px] text-cyber-amber">必填</span>}
                      </div>
                      <Input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={typeof currentValue === 'boolean' ? String(currentValue) : String(currentValue ?? '')}
                        onChange={(event) => updateField(item.id, field, event.target.value)}
                        className="bg-cyber-bg/40 border-white/10 text-white"
                      />
                      <p className="text-xs text-white/30">{field.description || '无额外说明'}</p>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-cyber-bg/30 px-4 py-5 text-sm text-white/35">
                当前插件没有公开配置字段，但平台仍可控制启停状态并保留已有 `plugins.entries.{item.id}` 配置。
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
