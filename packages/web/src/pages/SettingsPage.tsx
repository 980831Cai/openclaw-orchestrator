import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Key, Cpu, Check, Eye, EyeOff, Save, Globe, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────

interface ProviderKeyStatus {
  id: string
  name: string
  icon?: string
  configured: boolean
  maskedKey?: string | null
  envRef?: boolean
  baseUrl?: string | null
}

interface DefaultModelConfig {
  defaultModel: string | null
}

// ─── Provider Key Configuration Component ─────────────────

function ProviderKeyConfig({
  provider,
  status,
  onSaved,
}: {
  provider: { id: string; name: string; icon: string }
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
      const res = await fetch('/api/settings/providers/key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        onSaved()
        setEditing(false)
        setValue('')
        setBaseUrl('')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`确定要删除 ${provider.name} 的 API Key 吗？`)) return
    try {
      await fetch('/api/settings/providers/key', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id }),
      })
      onSaved()
    } catch (err) {
      console.error('Failed to delete key:', err)
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
            className="bg-cyber-bg border-white/10 text-white text-sm flex-1 placeholder:text-white/15"
            autoFocus
          />
          <button onClick={() => setVisible(!visible)} className="text-white/30 hover:text-white/60 p-2">
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <Button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="bg-cyber-purple/30 text-white"
          >
            <Save className="w-4 h-4" />
          </Button>
          <button
            onClick={() => { setEditing(false); setValue(''); setBaseUrl('') }}
            className="text-white/30 hover:text-white/60 text-sm px-3"
          >
            取消
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBaseUrl(!showBaseUrl)}
            className="text-xs text-white/20 hover:text-white/40 flex items-center gap-1"
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
            className="bg-cyber-bg border-white/10 text-white text-sm placeholder:text-white/15"
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        {status?.configured ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-cyber-green/70 font-mono">{status.maskedKey}</span>
              {status.envRef && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyber-amber/10 text-cyber-amber/60 border border-cyber-amber/20">
                  环境变量
                </span>
              )}
            </div>
            {status.baseUrl && (
              <div className="text-[10px] text-white/30 font-mono truncate">
                {status.baseUrl}
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-white/20">未配置</span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-cyber-purple/60 hover:text-cyber-purple px-3 py-1 rounded border border-cyber-purple/20 hover:border-cyber-purple/40"
        >
          {status?.configured ? '修改' : '配置'}
        </button>
        {status?.configured && (
          <button
            onClick={handleDelete}
            className="text-xs text-cyber-red/60 hover:text-cyber-red px-3 py-1 rounded border border-cyber-red/20 hover:border-cyber-red/40"
          >
            删除
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Settings Page ──────────────────────────────────

const KNOWN_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', icon: '🟣' },
  { id: 'openai', name: 'OpenAI', icon: '🟢' },
  { id: 'google', name: 'Google', icon: '🔵' },
  { id: 'deepseek', name: 'DeepSeek', icon: '🐋' },
]

export function SettingsPage() {
  const [providers, setProviders] = useState<ProviderKeyStatus[]>([])
  const [defaultModel, setDefaultModel] = useState<string>('')
  const [savingDefault, setSavingDefault] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const [providersRes, modelsRes] = await Promise.all([
        fetch('/api/settings/providers'),
        fetch('/api/settings/models/available'),
      ])
      
      if (providersRes.ok) {
        setProviders(await providersRes.json())
      }
      
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json()
        setDefaultModel(modelsData.defaultModel || '')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSaveDefaultModel = async () => {
    if (!defaultModel.trim()) return
    setSavingDefault(true)
    try {
      // Update openclaw.json agents.defaults.model.primary
      const res = await fetch('/api/settings/default-model', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: defaultModel.trim() }),
      })
      if (res.ok) {
        // Show success feedback
      }
    } finally {
      setSavingDefault(false)
    }
  }

  const getProviderStatus = (providerId: string) =>
    providers.find((p) => p.id === providerId)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-white/30">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-cyber-purple" />
          OpenClaw 配置
        </h1>
        <p className="text-white/40 mt-2">
          管理模型提供商的 API Key 和默认模型设置。配置写入 <code className="text-white/60">~/.openclaw/openclaw.json</code>，与 OpenClaw 运行时共享。
        </p>
      </div>

      {/* Default Model Section */}
      <div className="cartoon-card p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-cyber-purple" />
          默认模型
        </h2>
        <p className="text-sm text-white/40 mb-4">
          当 Agent 未指定模型时使用此默认模型。格式：<code className="text-white/60">provider/model-id</code>
        </p>
        <div className="flex gap-3">
          <Input
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="例如: anthropic/claude-sonnet-4-5"
            className="bg-cyber-bg border-white/10 text-white flex-1 placeholder:text-white/15"
          />
          <Button
            onClick={handleSaveDefaultModel}
            disabled={savingDefault || !defaultModel.trim()}
            className="bg-cyber-purple/30 text-white"
          >
            {savingDefault ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* Provider API Keys Section */}
      <div className="cartoon-card p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-cyber-purple" />
          模型提供商
        </h2>
        <p className="text-sm text-white/40 mb-4">
          配置各厂商的 API Key。支持直接输入或环境变量引用格式 <code className="text-white/60">{'${VAR_NAME}'}</code>。
        </p>

        <div className="space-y-4">
          {KNOWN_PROVIDERS.map((provider) => {
            const status = getProviderStatus(provider.id)
            return (
              <div key={provider.id} className="p-4 rounded-lg bg-cyber-bg/30 border border-white/5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{provider.icon}</span>
                  <span className="text-sm font-medium text-white/80">{provider.name}</span>
                  {status?.configured && (
                    <div className="ml-auto flex items-center gap-1 text-cyber-green text-xs">
                      <Check className="w-3 h-3" />
                      已配置
                    </div>
                  )}
                </div>
                <ProviderKeyConfig
                  provider={provider}
                  status={status}
                  onSaved={loadData}
                />
              </div>
            )
          })}

          {/* Custom providers */}
          {providers
            .filter((p) => !KNOWN_PROVIDERS.find((kp) => kp.id === p.id))
            .map((provider) => (
              <div key={provider.id} className="p-4 rounded-lg bg-cyber-bg/30 border border-white/5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{provider.icon || '⚙️'}</span>
                  <span className="text-sm font-medium text-white/80">{provider.name}</span>
                  {provider.configured && (
                    <div className="ml-auto flex items-center gap-1 text-cyber-green text-xs">
                      <Check className="w-3 h-3" />
                      已配置
                    </div>
                  )}
                </div>
                <ProviderKeyConfig
                  provider={{ id: provider.id, name: provider.name, icon: provider.icon || '⚙️' }}
                  status={provider}
                  onSaved={loadData}
                />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
