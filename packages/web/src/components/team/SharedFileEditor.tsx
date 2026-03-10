import { useState, useEffect, useCallback, useRef } from 'react'
import { FileText, Save, Eye, Code2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface SharedFileEditorProps {
  content: string
  teamId: string
  onUpdate: (content: string) => void
}

// ─── 轻量 Markdown → HTML 渲染 ───

function renderMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const lines = escaped.split('\n')
  const html: string[] = []
  let inCodeBlock = false
  let inList = false
  let listType: 'ul' | 'ol' = 'ul'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 代码块
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        html.push('</code></pre>')
        inCodeBlock = false
      } else {
        if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false }
        const lang = line.trim().slice(3).trim()
        html.push(`<pre class="md-code-block"><code${lang ? ` data-lang="${lang}"` : ''}>`)
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      html.push(line)
      continue
    }

    // 空行
    if (line.trim() === '') {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false }
      continue
    }

    // HTML 注释 <!-- ... -->
    if (line.trim().startsWith('&lt;!--') && line.trim().endsWith('--&gt;')) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false }
      html.push(`<div class="md-comment">${line.trim()}</div>`)
      continue
    }

    // 标题
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false }
      const level = headingMatch[1].length
      html.push(`<h${level} class="md-h${level}">${inlineRender(headingMatch[2])}</h${level}>`)
      continue
    }

    // 引用
    if (line.trimStart().startsWith('&gt; ') || line.trimStart() === '&gt;') {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false }
      const quoteContent = line.replace(/^\s*&gt;\s?/, '')
      html.push(`<blockquote class="md-quote">${inlineRender(quoteContent)}</blockquote>`)
      continue
    }

    // 分隔线
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false }
      html.push('<hr class="md-hr" />')
      continue
    }

    // 无序列表
    const ulMatch = line.match(/^(\s*)[*\-+]\s+(.+)/)
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>')
        html.push('<ul class="md-ul">')
        inList = true
        listType = 'ul'
      }
      html.push(`<li>${inlineRender(ulMatch[2])}</li>`)
      continue
    }

    // 有序列表
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/)
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>')
        html.push('<ol class="md-ol">')
        inList = true
        listType = 'ol'
      }
      html.push(`<li>${inlineRender(olMatch[2])}</li>`)
      continue
    }

    // 普通段落
    if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false }
    html.push(`<p class="md-p">${inlineRender(line)}</p>`)
  }

  if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>')
  if (inCodeBlock) html.push('</code></pre>')

  return html.join('\n')
}

function inlineRender(text: string): string {
  return text
    // 行内代码
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    // 粗斜体
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 斜体
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener">$1</a>')
}

// ─── SharedFileEditor 主组件 ───

export function SharedFileEditor({ content, teamId, onUpdate }: SharedFileEditorProps) {
  const [text, setText] = useState(content)
  const [mode, setMode] = useState<'split' | 'edit' | 'preview'>('split')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 拖拽分隔线
  const [splitRatio, setSplitRatio] = useState(50) // 左侧占比 %
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

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

  // ─── 拖拽逻辑 ───
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const ratio = Math.max(20, Math.min(80, (x / rect.width) * 100))
      setSplitRatio(ratio)
    }

    const onMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // 双击分隔线收起/展开
  const onDblClick = useCallback(() => {
    setSplitRatio((prev) => (prev < 25 || prev > 75 ? 50 : 20))
  }, [])

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
            <button onClick={() => setMode('edit')} className={cn('p-1.5 transition-colors cursor-pointer', mode === 'edit' ? 'bg-cyber-purple/30 text-white' : 'text-white/30 hover:text-white/50')}>
              <Code2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setMode('split')} className={cn('px-2 py-1.5 text-[10px] transition-colors cursor-pointer', mode === 'split' ? 'bg-cyber-purple/30 text-white' : 'text-white/30 hover:text-white/50')}>
              分屏
            </button>
            <button onClick={() => setMode('preview')} className={cn('p-1.5 transition-colors cursor-pointer', mode === 'preview' ? 'bg-cyber-purple/30 text-white' : 'text-white/30 hover:text-white/50')}>
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
      <div
        ref={containerRef}
        className={cn(
          'rounded-xl overflow-hidden border border-white/5 relative',
          mode === 'split' ? 'flex' : ''
        )}
      >
        {/* Code editor */}
        {(mode === 'edit' || mode === 'split') && (
          <div
            className="relative flex-shrink-0"
            style={mode === 'split' ? { width: `${splitRatio}%` } : { width: '100%' }}
          >
            <div className="absolute top-2 left-3 text-white/15 text-[9px] font-mono z-10">EDIT</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
              className="w-full h-full bg-cyber-bg text-white/80 px-4 pt-7 pb-4 text-sm font-mono focus:outline-none resize-none leading-relaxed min-h-[350px]"
              spellCheck={false}
            />
          </div>
        )}

        {/* Draggable divider (split mode only) */}
        {mode === 'split' && (
          <div
            className="relative flex-shrink-0 w-[5px] cursor-col-resize group z-10 flex items-center justify-center bg-white/5 hover:bg-cyber-purple/20 active:bg-cyber-purple/30 transition-colors"
            onMouseDown={onDragStart}
            onDoubleClick={onDblClick}
            title="拖拽调整宽度 · 双击收起/展开"
          >
            <GripVertical className="w-3 h-3 text-white/20 group-hover:text-white/50 transition-colors" />
          </div>
        )}

        {/* Preview */}
        {(mode === 'preview' || mode === 'split') && (
          <div
            className="relative flex-1 min-w-0"
          >
            <div className="absolute top-2 left-3 text-white/15 text-[9px] font-mono z-10">PREVIEW</div>
            <div
              className="bg-cyber-bg/50 p-4 pt-7 min-h-[350px] overflow-y-auto max-h-[350px] md-preview"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
            />
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
