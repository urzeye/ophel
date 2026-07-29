/**
 * 会话管理类型定义
 */

import type { ConversationInfo } from "~adapters/base"
import type { Folder } from "~constants"

export type { Folder }

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Conversation extends ConversationInfo {
  siteId: string
  siteInstanceKey: string
  folderId: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  tagIds?: string[]
}

export interface ConversationData {
  folders: Folder[]
  tags: Tag[]
  lastUsedFolderId: string
  conversations: Record<string, Conversation>
}
