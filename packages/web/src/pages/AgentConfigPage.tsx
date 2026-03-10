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

      {/* Hero Section */}
      <div
        className="relative rounded-2xl p-8 mb-8 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${selectedAgent.identity.theme || '#6366F1'}15, ${selectedAgent.identity.theme || '#6366F1'}05)`,
        }}
      >
        <div className="relative z-10 flex items-center gap-6">
          <AgentAvatar
            emoji={selectedAgent.identity.emoji}
            theme={selectedAgent.identity.theme}
            status="idle"
            size="xl"
          />
          <div>
            <h1 className="text-3xl font-bold text-white">{selectedAgent.name}</h1>
            <p className="text-white/40 mt-1">{selectedAgent.identity.vibe || 'AI Assistant'}</p>
            <div className="flex items-center gap-2 mt-3 relative">
              <ModelSelector
                currentModel={selectedAgent.model}
                onSelect={handleModelChange}
                compact
              />
              <span className="text-xs px-3 py-1 rounded-full bg-cyber-green/20 text-cyber-green border border-cyber-green/30">
                在线
              </span>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-5"
          style={{ background: `radial-gradient(circle, ${selectedAgent.identity.theme || '#6366F1'}, transparent)` }}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-cyber-surface/50 border border-white/5 p-1 h-auto">
          <TabsTrigger value="identity" className="data-[state=active]:bg-cyber-purple/20 data-[state=active]:text-white text-white/50 gap-2">
            <Sparkles className="h-4 w-4" /> 身份
          </TabsTrigger>
          <TabsTrigger value="model" className="data-[state=active]:bg-cyber-purple/20 data-[state=active]:text-white text-white/50 gap-2">
            <Cpu className="h-4 w-4" /> 模型
          </TabsTrigger>
          <TabsTrigger value="soul" className="data-[state=active]:bg-cyber-purple/20 data-[state=active]:text-white text-white/50 gap-2">
            <Brain className="h-4 w-4" /> 灵魂
          </TabsTrigger>
          <TabsTrigger value="rules" className="data-[state=active]:bg-cyber-purple/20 data-[state=active]:text-white text-white/50 gap-2">
            <ScrollText className="h-4 w-4" /> 规范
          </TabsTrigger>
          <TabsTrigger value="skills" className="data-[state=active]:bg-cyber-purple/20 data-[state=active]:text-white text-white/50 gap-2">
            <Zap className="h-4 w-4" /> 技能
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="data-[state=active]:bg-cyber-purple/20 data-[state=active]:text-white text-white/50 gap-2">
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
          <div className="glass rounded-2xl p-6">
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
