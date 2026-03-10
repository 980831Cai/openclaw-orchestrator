import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Brain, ScrollText, Zap, BookOpen, Cpu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { IdentityForm } from '@/components/agent/IdentityForm'
import { SoulForm } from '@/components/agent/SoulForm'
import { RulesForm } from '@/components/agent/RulesForm'
import { SkillsSelector } from '@/components/agent/SkillsSelector'
import { KnowledgeManager } from '@/components/agent/KnowledgeManager'
import { ModelSelector } from '@/components/agent/ModelSelector'
import { useAgents } from '@/hooks/use-agents'
import { useAgentStore } from '@/stores/agent-store'

/** Agent character preview card — shows a cartoon character with speech bubble */
function AgentCharacterCard({
  emoji,
  name,
  theme,
  vibe,
  model,
}: {
  emoji: string
  name: string
  theme: string
  vibe: string
  model?: string
}) {
  return (
    <div className="relative w-56 flex-shrink-0">
      {/* Card background */}
      <div
        className="cartoon-card p-5 flex flex-col items-center relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${theme}12, ${theme}06)`,
          borderColor: `${theme}30`,
        }}
      >
        {/* Decorative corner sparkles */}
        <div className="absolute top-3 right-3 text-[10px] animate-cartoon-sparkle" style={{ animationDelay: '0s' }}>✦</div>
        <div className="absolute top-3 left-3 text-[10px] animate-cartoon-sparkle" style={{ animationDelay: '0.7s' }}>✦</div>

        {/* Speech bubble */}
        <div className="relative mb-3 w-full">
          <div
            className="rounded-xl px-3 py-2 text-center"
            style={{
              background: `${theme}10`,
              border: `1px solid ${theme}20`,
            }}
          >
            <p className="text-white/50 text-[10px] leading-relaxed">
              {vibe || '你好，我是你的 AI 助手！'}
            </p>
          </div>
          {/* Bubble tail */}
          <div
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45"
            style={{
              background: `${theme}10`,
              borderRight: `1px solid ${theme}20`,
              borderBottom: `1px solid ${theme}20`,
            }}
          />
        </div>

        {/* Cartoon character body */}
        <div className="my-2">
          <AgentAvatar
            emoji={emoji}
            theme={theme}
            status="idle"
            showBody
          />
        </div>

        {/* Name & model */}
        <div className="text-center mt-2 w-full">
          <h3 className="text-white/90 text-sm font-bold">{name}</h3>
          {model && (
            <div className="flex items-center justify-center gap-1 mt-1">
              <Cpu className="w-2.5 h-2.5 text-white/20" />
              <span className="text-white/25 text-[9px] truncate max-w-[120px]">{model}</span>
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyber-green/10 border border-cyber-green/20">
          <div className="w-1.5 h-1.5 rounded-full bg-cyber-green animate-pulse" />
          <span className="text-cyber-green text-[10px] font-medium">在线</span>
        </div>

        {/* Decorative bottom pattern */}
        <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none" style={{
          background: `linear-gradient(to top, ${theme}06, transparent)`,
        }} />
      </div>
    </div>
  )
}

export function AgentConfigPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { fetchAgent, updateAgent } = useAgents()
  const { selectedAgent } = useAgentStore()
  const [activeTab, setActiveTab] = useState('identity')

  /** Update the model for the current agent */
  const handleModelChange = useCallback(async (modelId: string) => {
    if (!selectedAgent) return
    await updateAgent(selectedAgent.id, { model: modelId })
  }, [selectedAgent, updateAgent])

  useEffect(() => {
    if (id) fetchAgent(id)
  }, [id, fetchAgent])

  if (!selectedAgent) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-white/30">Loading agent...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      {/* Back button */}
      <Button
        variant="ghost"
        className="text-white/50 hover:text-white mb-6"
        onClick={() => navigate('/agents')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        返回列表
      </Button>

      {/* Hero Section — side by side: info + character preview */}
      <div className="flex gap-6 mb-8">
        {/* Left: Agent info and quick config */}
        <div
          className="flex-1 relative rounded-2xl p-8 overflow-hidden cartoon-card"
          style={{
            borderColor: `${selectedAgent.identity.theme || '#6366F1'}30`,
          }}
        >
          {/* Background gradient */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(135deg, ${selectedAgent.identity.theme || '#6366F1'}08, transparent)`,
            }}
          />

          <div className="relative z-10 flex items-start gap-6">
            {/* Cartoon avatar (head only) */}
            <AgentAvatar
              emoji={selectedAgent.identity.emoji}
              theme={selectedAgent.identity.theme}
              status="idle"
              size="xl"
            />

            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white">{selectedAgent.name}</h1>
              <p className="text-white/35 mt-1 text-sm">{selectedAgent.identity.vibe || 'AI Assistant'}</p>

              {/* Model selector + status */}
              <div className="flex items-center gap-2 mt-4 relative">
                <ModelSelector
                  currentModel={selectedAgent.model}
                  onSelect={handleModelChange}
                  compact
                />
                <span className="text-xs px-3 py-1 rounded-full bg-cyber-green/15 text-cyber-green border border-cyber-green/25 font-medium">
                  在线
                </span>
              </div>

              {/* Quick stats */}
              <div className="flex gap-4 mt-4">
                <div className="flex items-center gap-1.5 text-white/20 text-[10px]">
                  <Brain className="w-3 h-3" />
                  <span>{selectedAgent.soul?.personality ? '已设灵魂' : '默认'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-white/20 text-[10px]">
                  <ScrollText className="w-3 h-3" />
                  <span>{Object.values(selectedAgent.rules || {}).filter(Boolean).length || 0} 条规范</span>
                </div>
                <div className="flex items-center gap-1.5 text-white/20 text-[10px]">
                  <Zap className="w-3 h-3" />
                  <span>{selectedAgent.skills?.length || 0} 个技能</span>
                </div>
              </div>
            </div>
          </div>

          {/* Decorative radial */}
          <div
            className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-3 pointer-events-none"
            style={{ background: `radial-gradient(circle, ${selectedAgent.identity.theme || '#6366F1'}, transparent)` }}
          />
        </div>

        {/* Right: Character preview card */}
        <AgentCharacterCard
          emoji={selectedAgent.identity.emoji}
          name={selectedAgent.name}
          theme={selectedAgent.identity.theme || '#6366F1'}
          vibe={selectedAgent.identity.vibe || ''}
          model={selectedAgent.model}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white/3 border border-white/5 p-1 h-auto rounded-xl">
          <TabsTrigger value="identity" className="data-[state=active]:bg-cyber-purple/15 data-[state=active]:text-white text-white/40 gap-2 rounded-lg">
            <Sparkles className="h-4 w-4" /> 身份
          </TabsTrigger>
          <TabsTrigger value="model" className="data-[state=active]:bg-cyber-purple/15 data-[state=active]:text-white text-white/40 gap-2 rounded-lg">
            <Cpu className="h-4 w-4" /> 模型
          </TabsTrigger>
          <TabsTrigger value="soul" className="data-[state=active]:bg-cyber-purple/15 data-[state=active]:text-white text-white/40 gap-2 rounded-lg">
            <Brain className="h-4 w-4" /> 灵魂
          </TabsTrigger>
          <TabsTrigger value="rules" className="data-[state=active]:bg-cyber-purple/15 data-[state=active]:text-white text-white/40 gap-2 rounded-lg">
            <ScrollText className="h-4 w-4" /> 规范
          </TabsTrigger>
          <TabsTrigger value="skills" className="data-[state=active]:bg-cyber-purple/15 data-[state=active]:text-white text-white/40 gap-2 rounded-lg">
            <Zap className="h-4 w-4" /> 技能
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="data-[state=active]:bg-cyber-purple/15 data-[state=active]:text-white text-white/40 gap-2 rounded-lg">
            <BookOpen className="h-4 w-4" /> 知识库
          </TabsTrigger>
        </TabsList>

        <TabsContent value="identity">
          <IdentityForm
            identity={selectedAgent.identity}
            onSave={(identity) => updateAgent(selectedAgent.id, { identity })}
          />
        </TabsContent>

        <TabsContent value="model">
          <div className="cartoon-card p-6">
            <ModelSelector
              currentModel={selectedAgent.model}
              onSelect={handleModelChange}
            />
          </div>
        </TabsContent>

        <TabsContent value="soul">
          <SoulForm
            soul={selectedAgent.soul}
            onSave={(soul) => updateAgent(selectedAgent.id, { soul })}
          />
        </TabsContent>

        <TabsContent value="rules">
          <RulesForm
            rules={selectedAgent.rules}
            onSave={(rules) => updateAgent(selectedAgent.id, { rules })}
          />
        </TabsContent>

        <TabsContent value="skills">
          <SkillsSelector
            skills={selectedAgent.skills}
            onSave={(skills) => updateAgent(selectedAgent.id, { skills })}
          />
        </TabsContent>

        <TabsContent value="knowledge">
          <KnowledgeManager ownerId={selectedAgent.id} ownerType="agent" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
