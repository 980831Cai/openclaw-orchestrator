import { useState, useCallback, useEffect } from 'react'
import { Cpu, Check, ChevronDown, Key, Eye, EyeOff, Save, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ─── Provider & Model definitions (aligned with OpenClaw openclaw.json) ──
// Model IDs use the canonical OpenClaw format: provider/model-name

export interface ModelDef {
  /** Full model ID in provider/model-name format */
  id: string
  name: string
  desc: string
}

export interface ProviderDef {
  id: string
  name: string
  icon: string
  models: ModelDef[]
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '🟣',
    models: [
      { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4', desc: '最强综合能力' },
      { id: 'anthropic/claude-haiku-3.5', name: 'Claude 3.5 Haiku', desc: '快速且便宜' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🟢',
    models: [
      { id: 'openai/gpt-4o', name: 'GPT-4o', desc: '旗舰多模态' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', desc: '极低成本' },
      { id: 'openai/o3', name: 'o3', desc: '深度推理' },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    icon: '🔵',
    models: [
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: '长上下文' },
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', desc: '快速便宜' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🐋',
    models: [
      { id: 'deepseek/deepseek-v3', name: 'DeepSeek V3', desc: '编程和数学' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', desc: '推理' },
    ],
  },
]

// ─── API Key status type ─────────────────────────────────────────────

interface ProviderKeyStatus {
  id: string
  name: string
  icon?: string
  configured: boolean
  maskedKey?: string | null
  envRef?: boolean
  baseUrl?: string | null
}

// ─── API Key editing row ─────────────────────────────────────────────

function ApiKeyRow({
  provider,
  status,
  onSaved,
}: {
  provider: ProviderDef
  status?: ProviderKeyStatus
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [showBaseUrl, setShowBaseUrl] = useState(false)

  const handleSave = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      const body: Record<string, string> = {
        provider: provider.id,
        api_key: value.trim(),
      }
      if (baseUrl.trim()) {
        body.base_url = baseUrl.trim()
      }
      await fetch('/api/settings/providers/key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      onSaved()
      setEditing(false)
      setValue('')
      setBaseUrl('')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`输入 ${provider.name} API Key...`}
            className="bg-cyber-bg border-white/10 text-white text-xs h-8 flex-1 placeholder:text-white/15"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          <button onClick={() => setVisible(!visible)} className="text-white/30 hover:text-white/60">
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="h-7 px-2 bg-cyber-purple/30 text-white text-xs"
          >
            <Save className="w-3 h-3" />
          </Button>
          <button
            onClick={() => { setEditing(false); setValue(''); setBaseUrl('') }}
            className="text-white/30 hover:text-white/60 text-xs"
          >
            取消
          </button>
        </div>
        {/* Optional base URL */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBaseUrl(!showBaseUrl)}
            className="text-[10px] text-white/20 hover:text-white/40 flex items-center gap-1"
          >
            <Globe className="w-3 h-3" />
            {showBaseUrl ? '收起 Base URL' : '自定义 Base URL（可选）'}
          </button>
        </div>
        {showBaseUrl && (
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="bg-cyber-bg border-white/10 text-white text-xs h-7 placeholder:text-white/15"
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {status?.configured ? (
        <>
          <span className="text-[11px] text-cyber-green/70 font-mono">{status.maskedKey}</span>
          {status.envRef && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyber-amber/10 text-cyber-amber/60 border border-cyber-amber/20">
              环境变量
            </span>
          )}
          <span className="text-[10px] text-cyber-green/50">已配置</span>
        </>
      ) : (
        <span className="text-[11px] text-white/20">未配置</span>
      )}
      <button
        onClick={() => setEditing(true)}
        className="text-[10px] text-cyber-purple/60 hover:text-cyber-purple ml-auto"
      >
        {status?.configured ? '修改' : '配置'}
      </button>
    </div>
  )
}

// ─── Helper: extract display name from provider/model-id ─────────────

function displayModelId(fullId: string): string {
  if (fullId.includes('/')) {
    return fullId.split('/').slice(1).join('/')
  }
  return fullId
}

// ─── Main component ──────────────────────────────────────────────────

interface ModelSelectorProps {
  currentModel?: string
  onSelect: (modelId: string) => void
  /** compact mode for Hero area */
  compact?: boolean
}

export function ModelSelector({ currentModel, onSelect, compact = false }: ModelSelectorProps) {
  const [expanded, setExpanded] = useState(!compact)
  const [customModel, setCustomModel] = useState('')
  const [showApiKeys, setShowApiKeys] = useState(false)
  const [providerStatuses, setProviderStatuses] = useState<ProviderKeyStatus[]>([])

  // Load provider key status
  const loadProviderStatuses = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/providers')
      if (res.ok) {
        const data = await res.json()
        setProviderStatuses(data)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadProviderStatuses()
  }, [loadProviderStatuses])

  const getProviderStatus = (providerId: string) =>
    providerStatuses.find((s) => s.id === providerId)

  const handleSelect = useCallback((modelId: string) => {
    onSelect(modelId)
    if (compact) setExpanded(false)
  }, [onSelect, compact])

  // Find display name for the current model
  const currentDisplay = (() => {
    for (const p of PROVIDERS) {
      const m = p.models.find((m) => m.id === currentModel)
      if (m) return { name: m.name, provider: p.name, icon: p.icon }
    }
    if (currentModel) return { name: displayModelId(currentModel), provider: '自定义', icon: '⚙️' }
    return null
  })()

  // ── compact mode: collapsed state ──
  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyber-surface/50 border border-white/10
                   hover:border-cyber-purple/40 transition-all group"
      >
        <Cpu className="w-3.5 h-3.5 text-cyber-purple" />
        <span className="text-xs text-white/80">
          {currentDisplay ? `${currentDisplay.icon} ${currentDisplay.name}` : '未选择模型'}
        </span>
        <ChevronDown className="w-3 h-3 text-white/30 group-hover:text-white/60 transition-colors" />
      </button>
    )
  }

  return (
    <div
      className={cn(
        'space-y-5',
        compact &&
          'absolute top-full left-0 mt-2 z-50 w-[480px] glass rounded-2xl p-5 border border-white/10 shadow-2xl shadow-black/50'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyber-purple" />
          模型配置
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowApiKeys(!showApiKeys)}
            className={cn(
              'flex items-center gap-1.5 text-xs transition-colors',
              showApiKeys ? 'text-cyber-amber' : 'text-white/30 hover:text-white/60'
            )}
          >
            <Key className="w-3.5 h-3.5" />
            API Keys
          </button>
          {compact && (
            <button onClick={() => setExpanded(false)} className="text-white/30 hover:text-white/60 text-xs">
              收起
            </button>
          )}
        </div>
      </div>

      {/* API Key config area */}
      {showApiKeys && (
        <div className="space-y-3 p-3 rounded-xl bg-cyber-bg/50 border border-white/5">
          <p className="text-[11px] text-white/30">
            配置各厂商 API Key。Key 写入本地 <code className="text-white/40">~/.openclaw/openclaw.json</code>，
            与 OpenClaw 运行时共享配置。支持环境变量引用格式 <code className="text-white/40">{'${VAR_NAME}'}</code>。
          </p>
          {PROVIDERS.map((provider) => (
            <div key={provider.id} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{provider.icon}</span>
                <span className="text-xs text-white/60 font-medium">{provider.name}</span>
              </div>
              <ApiKeyRow
                provider={provider}
                status={getProviderStatus(provider.id)}
                onSaved={loadProviderStatuses}
              />
            </div>
          ))}
        </div>
      )}

      {/* Model list grouped by provider */}
      {PROVIDERS.map((provider) => {
        const status = getProviderStatus(provider.id)
        const hasKey = status?.configured ?? false

        return (
          <div key={provider.id} className="space-y-2">
            {/* Provider header */}
            <div className="flex items-center gap-2">
              <span className="text-sm">{provider.icon}</span>
              <span className="text-xs font-medium text-white/60">{provider.name}</span>
              {!hasKey && (
                <span className="text-[10px] text-white/15 ml-auto">需配置 API Key</span>
              )}
            </div>

            {/* Model cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {provider.models.map((model) => {
                const isSelected = model.id === currentModel

                return (
                  <button
                    key={model.id}
                    onClick={() => handleSelect(model.id)}
                    className={cn(
                      'relative text-left p-3 rounded-xl border transition-all',
                      isSelected
                        ? 'bg-cyber-purple/15 border-cyber-purple/40'
                        : hasKey
                          ? 'bg-cyber-bg/40 border-white/5 hover:border-white/15 hover:bg-cyber-bg/60'
                          : 'bg-cyber-bg/20 border-white/3 opacity-50 hover:opacity-70'
                    )}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-cyber-purple flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}

                    <div className="text-sm font-medium text-white">{model.name}</div>
                    <div className="text-[11px] text-white/30 mt-0.5">{model.desc}</div>
                    <div className="text-[10px] text-white/15 mt-1 font-mono">{model.id}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Custom model input */}
      <div className="pt-3 border-t border-white/5 space-y-2">
        <p className="text-xs text-white/40">自定义模型</p>
        <p className="text-[11px] text-white/20">
          使用 <code className="text-white/30">provider/model-id</code> 格式，如 <code className="text-white/30">openai/gpt-4.1-nano</code>
        </p>
        <div className="flex gap-2">
          <Input
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="例如: openai/gpt-4.1-nano, anthropic/claude-opus-4 ..."
            className="bg-cyber-bg border-white/10 text-white text-xs flex-1 placeholder:text-white/15"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customModel.trim()) {
                handleSelect(customModel.trim())
                setCustomModel('')
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!customModel.trim()}
            className="border-white/10 text-white/50 hover:text-white text-xs"
            onClick={() => {
              if (customModel.trim()) {
                handleSelect(customModel.trim())
                setCustomModel('')
              }
            }}
          >
            应用
          </Button>
        </div>
      </div>
    </div>
  )
}

export { PROVIDERS }
