import { useState, useCallback, useEffect } from 'react'
import { Cpu, Check, ChevronDown, Settings, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { AvailableModelsResponse, AvailableModel } from '@/types/settings'

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
  const [modelsData, setModelsData] = useState<AvailableModelsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load available models from API
  const loadModels = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/models/available')
      if (res.ok) {
        const data = await res.json()
        setModelsData(data)
      } else {
        setError('Failed to load models')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadModels()
  }, [loadModels])

  const handleSelect = useCallback((modelId: string) => {
    onSelect(modelId)
    if (compact) setExpanded(false)
  }, [onSelect, compact])

  // Find display name for the current model
  const currentDisplay = (() => {
    if (!modelsData || !currentModel) return null
    
    // Check providers
    for (const p of modelsData.providers) {
      const m = p.models.find((m) => m.id === currentModel)
      if (m) return { name: m.name, provider: p.name, icon: p.icon, available: m.available }
    }
    
    // Check custom models
    const custom = modelsData.customModels.find((m) => m.id === currentModel)
    if (custom) {
      return { name: custom.name, provider: 'Custom', icon: '⚙️', available: custom.available }
    }
    
    // Fallback
    return { name: displayModelId(currentModel), provider: 'Unknown', icon: '❓', available: false }
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
        {currentDisplay && !currentDisplay.available && (
          <AlertCircle className="w-3 h-3 text-cyber-amber" />
        )}
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
          选择模型
        </h3>
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            配置模型
          </Link>
          {compact && (
            <button onClick={() => setExpanded(false)} className="text-white/30 hover:text-white/60 text-xs">
              收起
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-8 text-white/40 text-xs">
          加载模型列表...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-3 rounded-lg bg-cyber-red/10 border border-cyber-red/20 text-cyber-red text-xs">
          {error}
        </div>
      )}

      {/* Models list */}
      {modelsData && !loading && (
        <>
          {/* Default model hint */}
          {modelsData.defaultModel && (
            <div className="p-2 rounded-lg bg-cyber-purple/10 border border-cyber-purple/20 text-xs text-white/50">
              默认模型: <code className="text-white/70">{modelsData.defaultModel}</code>
            </div>
          )}

          {/* Provider groups */}
          {modelsData.providers.map((provider) => {
            if (provider.models.length === 0) return null
            
            return (
              <div key={provider.id} className="space-y-2">
                {/* Provider header */}
                <div className="flex items-center gap-2">
                  <span className="text-sm">{provider.icon}</span>
                  <span className="text-xs font-medium text-white/60">{provider.name}</span>
                  {!provider.configured && (
                    <span className="text-[10px] text-white/15 ml-auto">未配置 API Key</span>
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
                        disabled={!model.available}
                        className={cn(
                          'relative text-left p-3 rounded-xl border transition-all',
                          isSelected
                            ? 'bg-cyber-purple/15 border-cyber-purple/40'
                            : model.available
                              ? 'bg-cyber-bg/40 border-white/5 hover:border-white/15 hover:bg-cyber-bg/60'
                              : 'bg-cyber-bg/20 border-white/3 opacity-40 cursor-not-allowed'
                        )}
                      >
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-cyber-purple flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}

                        <div className="text-sm font-medium text-white">{model.name}</div>
                        {model.desc && (
                          <div className="text-[11px] text-white/30 mt-0.5">{model.desc}</div>
                        )}
                        <div className="text-[10px] text-white/15 mt-1 font-mono">{model.id}</div>
                        {!model.available && (
                          <div className="text-[10px] text-cyber-amber/60 mt-1">需配置 API Key</div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Custom models */}
          {modelsData.customModels.length > 0 && (
            <div className="pt-3 border-t border-white/5 space-y-2">
              <p className="text-xs text-white/40">自定义模型</p>
              <div className="space-y-1">
                {modelsData.customModels.map((model) => {
                  const isSelected = model.id === currentModel
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleSelect(model.id)}
                      disabled={!model.available}
                      className={cn(
                        'w-full text-left p-2 rounded-lg border transition-all text-xs',
                        isSelected
                          ? 'bg-cyber-purple/15 border-cyber-purple/40 text-white'
                          : model.available
                            ? 'bg-cyber-bg/40 border-white/5 hover:border-white/15 text-white/70'
                            : 'bg-cyber-bg/20 border-white/3 opacity-40 text-white/40'
                      )}
                    >
                      <span className="font-mono">{model.id}</span>
                      {!model.available && (
                        <span className="ml-2 text-cyber-amber/60">(未配置)</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Custom model input */}
          <div className="pt-3 border-t border-white/5 space-y-2">
            <p className="text-xs text-white/40">输入自定义模型</p>
            <p className="text-[11px] text-white/20">
              使用 <code className="text-white/30">provider/model-id</code> 格式
            </p>
            <div className="flex gap-2">
              <Input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="例如: openai/gpt-4.1-nano"
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
        </>
      )}
    </div>
  )
}
