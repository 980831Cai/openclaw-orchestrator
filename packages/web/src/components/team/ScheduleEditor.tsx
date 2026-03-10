import { useState, useCallback } from 'react'
import { Calendar, RotateCcw, Clock, Settings2, GripVertical, Check, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { TeamSchedule, ScheduleMode, ScheduleEntry, ScheduleSyncResult } from '@/types'

interface ScheduleEditorProps {
  schedule?: TeamSchedule
  teamId: string
  members: Array<{ agentId: string }>
}

const MODE_CONFIG: Record<ScheduleMode, { icon: typeof RotateCcw; label: string; desc: string; color: string }> = {
  'round-robin': { icon: RotateCcw, label: '轮询', desc: '按顺序依次分配任务', color: 'cyber-green' },
  'priority': { icon: Calendar, label: '优先级', desc: '按优先级分配任务', color: 'cyber-blue' },
  'time-based': { icon: Clock, label: '时段', desc: '按时间段安排工作', color: 'cyber-amber' },
  'custom': { icon: Settings2, label: '自定义', desc: '自定义分配规则', color: 'cyber-violet' },
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function ScheduleEditor({ schedule, teamId, members }: ScheduleEditorProps) {
  const [mode, setMode] = useState<ScheduleMode>(schedule?.type || 'round-robin')
  const [entries, setEntries] = useState<ScheduleEntry[]>(schedule?.entries || members.map((m, i) => ({ agentId: m.agentId, order: i + 1 })))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [syncResult, setSyncResult] = useState<ScheduleSyncResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')

  const handleSave = useCallback(async () => {
    setSaveStatus('saving')
    setErrorMsg('')

    const payload: TeamSchedule = {
      type: mode,
      mode: mode,
      entries,
    }

    try {
      const res = await fetch(`/api/teams/${teamId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `HTTP ${res.status}`)
      }

      const data = await res.json()
      const result: ScheduleSyncResult | undefined = data.scheduleSyncResult
      if (result) {
        setSyncResult(result)
      }

      setSaveStatus('saved')
      // Reset status after 3 seconds
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '保存失败')
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 5000)
    }
  }, [mode, entries, teamId])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyber-violet" />
          排班表配置
        </h3>
        <div className="flex items-center gap-2">
          {/* Sync status indicator */}
          {syncResult?.synced && syncResult.syncedAt && (
            <span className="text-[10px] text-cyber-green/60">
              已同步 · {syncResult.jobCount ?? 0} 个调度任务
            </span>
          )}
          {syncResult?.syncError && (
            <span className="text-[10px] text-cyber-amber/60 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              同步异常
            </span>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={cn(
              'border transition-all',
              saveStatus === 'saved'
                ? 'bg-cyber-green/20 text-cyber-green border-cyber-green/30'
                : saveStatus === 'error'
                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                : 'bg-cyber-violet/20 text-cyber-lavender border-cyber-violet/30 hover:bg-cyber-violet/30'
            )}
          >
            {saveStatus === 'saving' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {saveStatus === 'saved' && <Check className="w-3.5 h-3.5 mr-1.5" />}
            {saveStatus === 'error' && <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />}
            {saveStatus === 'saving' ? '保存中...' : saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? errorMsg : '保存排班'}
          </Button>
        </div>
      </div>

      {/* Mode switcher */}
      <div className="flex gap-2">
        {(Object.entries(MODE_CONFIG) as [ScheduleMode, typeof MODE_CONFIG[ScheduleMode]][]).map(([key, cfg]) => {
          const Icon = cfg.icon
          return (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={cn(
                'flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border transition-all cursor-pointer',
                mode === key
                  ? `bg-${cfg.color}/15 border-${cfg.color}/40 text-white`
                  : 'bg-cyber-bg/30 border-white/5 text-white/30 hover:border-white/15 hover:text-white/50'
              )}
            >
              <Icon className="w-4 h-4" />
              <div className="text-left">
                <p className="text-xs font-semibold">{cfg.label}</p>
                <p className="text-[10px] opacity-60">{cfg.desc}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Mode-specific editor */}
      <div className="glass rounded-xl p-4">
        {mode === 'round-robin' && <RoundRobinEditor entries={entries} setEntries={setEntries} />}
        {mode === 'time-based' && <TimeBasedEditor entries={entries} setEntries={setEntries} />}
        {mode === 'custom' && <CustomEditor entries={entries} setEntries={setEntries} />}
      </div>
    </div>
  )
}

function RoundRobinEditor({ entries, setEntries }: { entries: ScheduleEntry[]; setEntries: (e: ScheduleEntry[]) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-white/40 text-xs mb-3">拖拽调整轮询顺序，任务将按此顺序分配给 Agent：</p>
      {entries.length === 0 ? (
        <p className="text-white/20 text-center py-6 text-xs">添加成员后自动生成排班</p>
      ) : (
        entries.sort((a, b) => (a.order || 0) - (b.order || 0)).map((entry, i) => (
          <div key={entry.agentId} className="flex items-center gap-3 p-2.5 rounded-lg bg-cyber-bg/50 border border-white/5 group hover:border-cyber-green/20 transition-colors">
            <GripVertical className="w-4 h-4 text-white/15 cursor-grab" />
            <div className="w-6 h-6 rounded-full bg-cyber-green/20 text-cyber-green text-[10px] font-bold flex items-center justify-center">
              {i + 1}
            </div>
            <span className="text-white/70 text-sm flex-1">{entry.agentId}</span>
            <span className="text-white/20 text-[10px]">优先级 {entry.order || i + 1}</span>
          </div>
        ))
      )}
    </div>
  )
}

function TimeBasedEditor({ entries, setEntries }: { entries: ScheduleEntry[]; setEntries: (e: ScheduleEntry[]) => void }) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="space-y-3">
      <p className="text-white/40 text-xs mb-3">为每个 Agent 设置工作时段：</p>
      {entries.map((entry) => (
        <div key={entry.agentId} className="flex items-center gap-4 p-3 rounded-lg bg-cyber-bg/50 border border-white/5">
          <span className="text-white/70 text-sm w-24 truncate">{entry.agentId}</span>
          <div className="flex items-center gap-2 flex-1">
            <Input
              type="time"
              defaultValue={entry.startTime || '09:00'}
              className="w-28 h-8 text-xs bg-cyber-bg border-white/10 text-white/60"
            />
            <span className="text-white/30 text-xs">至</span>
            <Input
              type="time"
              defaultValue={entry.endTime || '18:00'}
              className="w-28 h-8 text-xs bg-cyber-bg border-white/10 text-white/60"
            />
          </div>
          {/* Mini gantt bar */}
          <div className="w-32 h-3 rounded-full bg-cyber-bg/80 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-cyber-amber/40 to-cyber-amber/20" style={{ width: '40%', marginLeft: '30%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function CustomEditor({ entries, setEntries }: { entries: ScheduleEntry[]; setEntries: (e: ScheduleEntry[]) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-white/40 text-xs mb-3">为每个 Agent 定义自定义规则：</p>
      {entries.map((entry) => (
        <div key={entry.agentId} className="flex items-start gap-4 p-3 rounded-lg bg-cyber-bg/50 border border-white/5">
          <span className="text-white/70 text-sm w-24 truncate pt-1">{entry.agentId}</span>
          <textarea
            defaultValue={entry.customRule || ''}
            placeholder="输入自定义规则表达式..."
            rows={2}
            className="flex-1 bg-cyber-bg border border-white/10 text-white/60 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyber-violet/50 resize-none"
          />
        </div>
      ))}
    </div>
  )
}
