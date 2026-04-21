import type { ShortcutActionId } from "~constants/shortcuts"

export type GlobalSearchCategoryId =
  | "all"
  | "outline"
  | "conversations"
  | "prompts"
  | "settings"
  | "tips"

export type GlobalSearchResultCategory = Exclude<GlobalSearchCategoryId, "all">

export type GlobalSearchMatchReason =
  | "title"
  | "folder"
  | "tag"
  | "type"
  | "code"
  | "category"
  | "content"
  | "id"
  | "keyword"
  | "alias"
  | "fuzzy"

export type GlobalSearchHighlightField = "title" | "breadcrumb" | "snippet" | "code"

export interface GlobalSearchFuzzyMatchMeta {
  field?: GlobalSearchHighlightField
  indexes?: number[]
  isTypoFallback?: boolean
}

export interface GlobalSearchTagBadge {
  id: string
  name: string
  color: string
}

export interface GlobalSearchOutlineTarget {
  index: number
  level: number
  text: string
  isUserQuery: boolean
  queryIndex?: number
  isGhost?: boolean
  scrollTop?: number
}

export interface GlobalSearchResultItem {
  id: string
  title: string
  breadcrumb: string
  snippet?: string
  code?: string
  category: GlobalSearchResultCategory
  settingId?: string
  conversationId?: string
  conversationUrl?: string
  promptId?: string
  promptContent?: string
  tagBadges?: GlobalSearchTagBadge[]
  folderName?: string
  tagNames?: string[]
  isPinned?: boolean
  searchTimestamp?: number
  matchReasons?: GlobalSearchMatchReason[]
  fuzzyMatch?: GlobalSearchFuzzyMatchMeta
  outlineTarget?: GlobalSearchOutlineTarget
  /** 标记这是一个功能技巧条目 */
  tipId?: string
  /** 语义目标名称，对应面板内 data-tip-target 属性值 */
  tipHighlightTarget?: string
  /** 点击技巧项后优先展示的操作提示文案 */
  tipActionText?: string
  /** 该技巧关联的快捷键 ID 列表（对应 DEFAULT_KEYBINDINGS 的 key）*/
  tipShortcutIds?: ShortcutActionId[]
}

export interface GlobalSearchGroupedResult {
  category: GlobalSearchResultCategory
  items: GlobalSearchResultItem[]
  totalCount: number
  hasMore: boolean
  isExpanded: boolean
  remainingCount: number
}

export interface GlobalSearchPromptPreviewState {
  itemId: string
  content: string
  anchorRect: DOMRect
}

export interface GlobalSearchSyntaxSuggestionItem {
  id: string
  token: string
  label: string
  description: string
}
