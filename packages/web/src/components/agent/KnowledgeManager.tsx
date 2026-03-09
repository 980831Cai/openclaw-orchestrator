import { useState, useEffect, useCallback } from 'react'
import { Upload, Link, Search, FileText, Trash2, BookOpen, X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { KnowledgeOwnerType, KnowledgeEntry, KnowledgeSearchResult } from '@/types'

interface Props {
  ownerId: string
  ownerType: KnowledgeOwnerType
}

const SOURCE_ICONS: Record<string, string> = {
  pdf: '📄',
  txt: '📝',
  md: '📋',
  url: '🔗',
}

export function KnowledgeManager({ ownerId, ownerType }: Props) {
  const [url, setUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const basePath = ownerType === 'agent' ? `/agents/${ownerId}` : `/teams/${ownerId}`

  const fetchEntries = useCallback(async () => {
    const data = await api.get<KnowledgeEntry[]>(`${basePath}/knowledge`)
    setEntries(data)
  }, [basePath])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const handleAddUrl = async () => {
    if (!url.trim()) return
    const title = url.replace(/^https?:\/\//, '').split('/')[0] || url
    await api.post(`${basePath}/knowledge`, { sourceType: 'url', sourcePath: url.trim(), title })
    setUrl('')
    fetchEntries()
  }

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!['pdf', 'txt', 'md'].includes(ext || '')) continue
      await api.post(`${basePath}/knowledge`, {
        sourceType: 'file',
        sourcePath: file.name,
        title: file.name,
      })
    }
    fetchEntries()
  }

  const handleDelete = async (entryId: string) => {
    await api.delete(`${basePath}/knowledge/${entryId}`)
    fetchEntries()
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    const results = await api.post<KnowledgeSearchResult[]>(`${basePath}/knowledge/search`, { query: searchQuery })
    setSearchResults(results)
    setSearching(false)
  }

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* File Upload */}
        <div className="glass rounded-2xl p-6">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-4">
            <Upload className="h-4 w-4 text-cyber-blue" />
            文档上传
          </h3>
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer',
              dragOver ? 'border-cyber-purple/60 bg-cyber-purple/10 scale-[1.02]' : 'border-white/10 hover:border-cyber-purple/30'
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
          >
            <Upload className={cn('h-10 w-10 mb-3 transition-colors', dragOver ? 'text-cyber-purple' : 'text-white/20')} />
            <p className="text-white/40 text-sm">{dragOver ? '松开上传' : '拖入文档或点击上传'}</p>
            <p className="text-white/20 text-xs mt-1">支持 PDF / TXT / MD</p>
          </div>
        </div>

        {/* URL Add */}
        <div className="glass rounded-2xl p-6">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-4">
            <Link className="h-4 w-4 text-cyber-cyan" />
            URL 添加
          </h3>
          <div className="space-y-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="输入网页 URL..."
              className="bg-cyber-bg border-white/10 text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            />
            <Button
              onClick={handleAddUrl}
              disabled={!url.trim()}
              className="w-full bg-cyber-cyan/20 text-cyber-cyan hover:bg-cyber-cyan/30 border border-cyber-cyan/30"
            >
              添加 URL
            </Button>
          </div>
        </div>
      </div>

      {/* Document List */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-cyber-lavender" />
            已入库文档
          </h3>
          <span className="text-white/30 text-xs">{entries.length} 文档</span>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-white/20">
            <BookOpen className="h-12 w-12 mb-3" />
            <p className="text-sm">暂无文档，上传文件或添加 URL</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {entries.map((entry, i) => {
              const ext = entry.sourcePath.split('.').pop()?.toLowerCase() || ''
              const icon = SOURCE_ICONS[entry.sourceType === 'url' ? 'url' : ext] || '📄'
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-cyber-bg/50 border border-white/5 hover:border-white/10 transition-all group animate-fade-in"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="w-9 h-9 rounded-lg bg-cyber-purple/10 flex items-center justify-center text-base flex-shrink-0">
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/80 text-sm font-medium truncate">{entry.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-white/30 text-[10px]">{entry.chunkCount} 分块</span>
                      <span className="text-white/15 text-[10px]">·</span>
                      <span className="text-white/20 text-[10px]">{new Date(entry.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {entry.sourceType === 'url' && (
                    <button className="p-1 text-white/15 hover:text-cyber-cyan transition-colors cursor-pointer">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="p-1 text-white/15 hover:text-cyber-red transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Search Test Panel */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-cyber-amber" />
          搜索测试
        </h3>
        <div className="flex gap-3">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="输入查询语句测试检索..."
            className="bg-cyber-bg border-white/10 text-white flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button
            onClick={handleSearch}
            disabled={!searchQuery.trim() || searching}
            className="bg-cyber-amber/20 text-cyber-amber hover:bg-cyber-amber/30 border border-cyber-amber/30"
          >
            {searching ? '检索中...' : '检索'}
          </Button>
        </div>

        {searchResults.length > 0 ? (
          <div className="mt-4 space-y-2">
            {searchResults.map((r, i) => (
              <div key={i} className="p-3 rounded-lg bg-cyber-bg/50 border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white/50 text-[10px]">{r.source}</span>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1.5 rounded-full bg-cyber-bg overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyber-amber to-cyber-green" style={{ width: `${r.score * 100}%` }} />
                    </div>
                    <span className="text-white/30 text-[10px]">{(r.score * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <p className="text-white/60 text-xs">{r.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 text-white/20 text-sm text-center py-6">
            {searchQuery ? '无匹配结果' : '输入查询语句并点击检索查看结果'}
          </div>
        )}
      </div>
    </div>
  )
}
