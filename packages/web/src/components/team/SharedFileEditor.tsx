import { useState, useEffect } from 'react'
import { FileText, Save, Eye, Code2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface SharedFileEditorProps {
  content: string
  teamId: string
  onUpdate: (content: string) => void
}

export function SharedFileEditor({ content, teamId, onUpdate }: SharedFileEditorProps) {
  const [text, setText] = useState(content)
  const [mode, setMode] = useState<'split' | 'edit' | 'preview'>('split')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setText(content)
  }, [content])

  const handleSave = async () => {
    setSaving(true)
    await api.put(`/teams/${teamId}/shared`, { content: text })
    onUpdate(text)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const hasChanges = text !== content

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyber-blue" />
          team.md — 团队永久记忆
        </h3>
        <div className="flex items-center gap-2">
          {/* Mode switcher */}
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button onClick={() => setMode('edit')} className={cn('p-1.5 transition-colors cursor-pointer', mode === 'edit' ? 'bg-cyber-purple/30 text-white' : 'text-white/30')}>
              <Code2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setMode('split')} className={cn('px-2 py-1.5 text-[10px] transition-colors cursor-pointer', mode === 'split' ? 'bg-cyber-purple/30 text-white' : 'text-white/30')}>
              分屏
            </button>
            <button onClick={() => setMode('preview')} className={cn('p-1.5 transition-colors cursor-pointer', mode === 'preview' ? 'bg-cyber-purple/30 text-white' : 'text-white/30')}>
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={cn(
              'border transition-all',
              hasChanges
                ? 'bg-cyber-blue/20 text-cyber-blue border-cyber-blue/30 hover:bg-cyber-blue/30'
                : saved
                ? 'bg-cyber-green/20 text-cyber-green border-cyber-green/30'
                : 'bg-white/5 text-white/30 border-white/10'
            )}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {saving ? '保存中...' : saved ? '已保存' : '保存'}
          </Button>
        </div>
      </div>

      {/* Editor area */}
      <div className={cn(
        'rounded-xl overflow-hidden border border-white/5',
        mode === 'split' ? 'grid grid-cols-2 divide-x divide-white/5' : ''
      )}>
        {/* Code editor */}
        {(mode === 'edit' || mode === 'split') && (
          <div className="relative">
            <div className="absolute top-2 left-3 text-white/15 text-[9px] font-mono">EDIT</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
              className="w-full bg-cyber-bg text-white/80 px-4 pt-7 pb-4 text-sm font-mono focus:outline-none resize-none leading-relaxed"
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview */}
        {(mode === 'preview' || mode === 'split') && (
          <div className="relative">
            <div className="absolute top-2 left-3 text-white/15 text-[9px] font-mono">PREVIEW</div>
            <div className="bg-cyber-bg/50 p-4 pt-7 text-white/60 text-sm min-h-[350px] leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-[350px]">
              {text || <span className="text-white/15 italic">暂无内容</span>}
            </div>
          </div>
        )}
      </div>

      {/* Auto-appended summaries hint */}
      <p className="text-white/15 text-[10px] flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-cyber-green/40" />
        完成任务后，关键经验会自动追加到此文件
      </p>
    </div>
  )
}
