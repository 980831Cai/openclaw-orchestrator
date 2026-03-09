import { useEffect, useState } from 'react'
import {
  ClipboardList,
  Plus,
  Eye,
  X,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Settings,
  ChevronRight,
  Package,
  Trash2,
  Copy,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Task, TaskListItem, TaskEntry, TaskEntryType, Artifact } from '@/types'

interface TaskBoardProps {
  teamId: string
}

const STATUS_STYLES: Record<string, { bg: string; dot: string; label: string }> = {
  active: { bg: 'bg-cyber-green/10 border-cyber-green/30', dot: 'bg-cyber-green', label: '进行中' },
  completed: { bg: 'bg-cyber-blue/10 border-cyber-blue/30', dot: 'bg-cyber-blue', label: '已完成' },
  archived: { bg: 'bg-white/5 border-white/10', dot: 'bg-white/30', label: '已归档' },
}

const ENTRY_COLORS: Record<TaskEntryType, string> = {
  progress: 'border-l-cyber-blue',
  question: 'border-l-cyber-amber',
  decision: 'border-l-cyber-green',
  output: 'border-l-cyber-violet',
  artifact: 'border-l-cyber-purple',
}

// ─── 产物文件图标映射 ───

function getArtifactIcon(ext: string) {
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'java', 'rs', 'c', 'cpp', 'rb', 'swift', 'kt', 'vue', 'svelte', 'sh', 'css', 'scss', 'html']
  const docExts = ['md', 'txt', 'doc', 'pdf', 'rst']
  const dataExts = ['json', 'csv', 'xml', 'sql']
  const configExts = ['yaml', 'yml', 'toml', 'ini', 'conf', 'env', 'properties']

  if (codeExts.includes(ext)) return <FileCode className="w-4 h-4 text-cyber-blue" />
  if (docExts.includes(ext)) return <FileText className="w-4 h-4 text-cyber-green" />
  if (dataExts.includes(ext)) return <FileJson className="w-4 h-4 text-cyber-amber" />
  if (configExts.includes(ext)) return <Settings className="w-4 h-4 text-cyber-violet" />
  return <File className="w-4 h-4 text-white/40" />
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── TaskBoard 主组件 ───

export function TaskBoard({ teamId }: TaskBoardProps) {
  const [tasks, setTasks] = useState<TaskListItem[]>([])
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')

  useEffect(() => {
    api.get<TaskListItem[]>(`/teams/${teamId}/tasks`).then(setTasks)
  }, [teamId])

  const filtered = tasks.filter((t) => filter === 'all' || t.status === filter)

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    await api.post(`/teams/${teamId}/tasks`, { title: newTitle.trim(), description: newDesc.trim() })
    const updated = await api.get<TaskListItem[]>(`/teams/${teamId}/tasks`)
    setTasks(updated)
    setNewTitle('')
    setNewDesc('')
    setCreateOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-cyber-green" />
          {tasks.length} 个任务
        </h3>
        <div className="flex items-center gap-2">
          {/* Filter buttons */}
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {(['all', 'active', 'completed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1 text-[10px] transition-colors cursor-pointer',
                  filter === f ? 'bg-cyber-purple/30 text-white' : 'text-white/30 hover:text-white/50'
                )}
              >
                {f === 'all' ? '全部' : f === 'active' ? '活跃' : '完成'}
              </button>
            ))}
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-cyber-green/20 text-cyber-green border border-cyber-green/30 hover:bg-cyber-green/30">
                <Plus className="h-3.5 w-3.5 mr-1" /> 新任务
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-cyber-surface border-white/10">
              <DialogHeader><DialogTitle className="text-white">创建任务</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="任务标题" className="bg-cyber-bg border-white/10 text-white" />
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="任务描述" rows={3} className="w-full bg-cyber-bg border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyber-green/50 resize-none" />
                <Button onClick={handleCreate} className="w-full bg-gradient-to-r from-cyber-green/80 to-cyber-green" disabled={!newTitle.trim()}>创建</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardList className="w-12 h-12 text-white/10 mx-auto mb-3" />
          <p className="text-white/20">暂无任务</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t, i) => {
            const style = STATUS_STYLES[t.status] || STATUS_STYLES.active
            return (
              <div
                key={t.id}
                className={cn('glass rounded-xl p-3 flex items-center gap-3 transition-all hover:scale-[1.01] cursor-pointer animate-fade-in', style.bg)}
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => setSelectedTask(t.id)}
              >
                <div className={cn('w-2 h-2 rounded-full flex-shrink-0', style.dot)} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{t.title}</p>
                  <p className="text-white/30 text-[10px] mt-0.5">
                    {new Date(t.createdAt).toLocaleDateString()}
                    {(t.artifactCount ?? 0) > 0 && (
                      <span className="ml-2 text-cyber-purple">
                        📦 {t.artifactCount} 个产物
                      </span>
                    )}
                  </p>
                </div>
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full', style.bg)}>
                  {style.label}
                </span>
                <Eye className="w-3.5 h-3.5 text-white/20 hover:text-white/60 transition-colors" />
              </div>
            )
          })}
        </div>
      )}

      {/* Task blackboard overlay */}
      {selectedTask && (
        <TaskBlackboard taskId={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  )
}

// ─── TaskBlackboard：左右分栏布局 ───

function TaskBlackboard({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [task, setTask] = useState<Task | null>(null)
  const [content, setContent] = useState('')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null)
  const [artifactContent, setArtifactContent] = useState<string>('')
  const [artifactLoading, setArtifactLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get<Task>(`/tasks/${taskId}`).then(setTask)
    api.get<{ content: string }>(`/tasks/${taskId}/content`).then((r) => setContent(r.content))
    api.get<Artifact[]>(`/tasks/${taskId}/artifacts`).then(setArtifacts).catch(() => setArtifacts([]))
  }, [taskId])

  const handleArtifactClick = async (filename: string) => {
    if (selectedArtifact === filename) {
      setSelectedArtifact(null)
      setArtifactContent('')
      return
    }

    setSelectedArtifact(filename)
    setArtifactLoading(true)
    try {
      const res = await api.get<{ content: string }>(`/tasks/${taskId}/artifacts/${filename}/content`)
      setArtifactContent(res.content)
    } catch {
      setArtifactContent('⚠️ 无法加载产物内容')
    }
    setArtifactLoading(false)
  }

  const handleCopy = async () => {
    if (artifactContent) {
      await navigator.clipboard.writeText(artifactContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const hasArtifacts = artifacts.length > 0

  return (
    <div className="fixed inset-0 z-50 bg-cyber-bg/90 backdrop-blur-md flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-cyber-green" />
          <div>
            <h2 className="text-white font-bold">{task?.title || '加载中...'}</h2>
            <p className="text-white/30 text-xs">{task?.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasArtifacts && (
            <span className="flex items-center gap-1.5 text-cyber-purple text-xs">
              <Package className="w-3.5 h-3.5" />
              {artifacts.length} 个产物
            </span>
          )}
          {task?.status === 'active' && (
            <span className="flex items-center gap-1.5 text-cyber-green text-xs">
              <span className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
              进行中
            </span>
          )}
          <button onClick={onClose} className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main content: 左右分栏 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 左侧：task.md 通信内容 */}
        <div className={cn(
          'overflow-y-auto p-6 transition-all',
          hasArtifacts ? 'flex-1 border-r border-white/5' : 'flex-1'
        )}>
          {content ? (
            <div className="max-w-3xl mx-auto bg-cyber-panel/40 rounded-2xl border border-white/5 p-6 font-mono text-sm text-white/60 whitespace-pre-wrap leading-relaxed">
              {content}
            </div>
          ) : (
            <div className="text-center py-20 text-white/20">加载 task.md 内容...</div>
          )}
        </div>

        {/* 右侧：产物面板 */}
        {hasArtifacts && (
          <div className="w-[380px] flex flex-col overflow-hidden bg-cyber-panel/20">
            {/* 产物列表头 */}
            <div className="p-4 border-b border-white/5">
              <h3 className="text-white text-sm font-semibold flex items-center gap-2">
                <Package className="w-4 h-4 text-cyber-purple" />
                产物仓库
              </h3>
              <p className="text-white/30 text-[10px] mt-1">点击产物查看内容</p>
            </div>

            {/* 产物列表 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {artifacts.map((artifact, i) => (
                <div key={artifact.id} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                  <button
                    onClick={() => handleArtifactClick(artifact.filename)}
                    className={cn(
                      'w-full text-left rounded-xl p-3 transition-all cursor-pointer',
                      'hover:bg-white/5 border',
                      selectedArtifact === artifact.filename
                        ? 'bg-cyber-purple/10 border-cyber-purple/30'
                        : 'border-transparent'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* 文件图标 */}
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                        {getArtifactIcon(artifact.ext)}
                      </div>

                      {/* 文件信息 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{artifact.filename}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-white/30 text-[10px]">{artifact.agentId}</span>
                          <span className="text-white/10">·</span>
                          <span className="text-white/30 text-[10px]">{formatSize(artifact.size)}</span>
                          <span className="text-white/10">·</span>
                          <span className="text-white/30 text-[10px]">.{artifact.ext}</span>
                        </div>
                        {artifact.description && (
                          <p className="text-white/20 text-[10px] mt-0.5 truncate">{artifact.description}</p>
                        )}
                      </div>

                      {/* 展开指示器 */}
                      <ChevronRight
                        className={cn(
                          'w-3.5 h-3.5 text-white/20 transition-transform flex-shrink-0',
                          selectedArtifact === artifact.filename && 'rotate-90 text-cyber-purple'
                        )}
                      />
                    </div>
                  </button>

                  {/* 展开的产物内容预览 */}
                  {selectedArtifact === artifact.filename && (
                    <div className="mt-1 ml-2 mr-2 rounded-xl bg-cyber-bg/60 border border-white/5 overflow-hidden animate-fade-in">
                      {/* 预览工具栏 */}
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                        <span className="text-white/40 text-[10px] font-mono">{artifact.filename}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy() }}
                            className="p-1 rounded text-white/30 hover:text-white/60 transition-colors cursor-pointer"
                            title="复制内容"
                          >
                            {copied ? (
                              <Check className="w-3 h-3 text-cyber-green" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* 内容区域 */}
                      <div className="max-h-[300px] overflow-y-auto p-3">
                        {artifactLoading ? (
                          <div className="text-center py-8 text-white/20 text-xs">加载中...</div>
                        ) : (
                          <pre className="font-mono text-[11px] text-white/50 whitespace-pre-wrap leading-relaxed break-all">
                            {artifactContent}
                          </pre>
                        )}
                      </div>

                      {/* 元信息 */}
                      <div className="px-3 py-2 border-t border-white/5 bg-white/[0.02] flex items-center gap-3 text-[10px] text-white/20">
                        <span>类型: {artifact.type}</span>
                        <span>大小: {formatSize(artifact.size)}</span>
                        <span>创建: {new Date(artifact.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
