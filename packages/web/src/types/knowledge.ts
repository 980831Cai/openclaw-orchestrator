// Knowledge-related type definitions
// Migrated from @openclaw/shared to local types

export type KnowledgeOwnerType = 'agent' | 'team'

export interface KnowledgeEntry {
  id: string
  ownerType: KnowledgeOwnerType
  ownerId: string
  sourceType: string
  sourcePath: string
  title: string
  chunkCount: number
  createdAt: string
}

export interface KnowledgeSearchResult {
  id: string
  title: string
  content: string
  score: number
  sourceType: string
  sourcePath: string
  source?: string
}
