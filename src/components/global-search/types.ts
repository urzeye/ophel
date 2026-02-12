export type GlobalSearchCategoryId = "all" | "outline" | "conversations" | "prompts" | "settings"

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
  outlineTarget?: GlobalSearchOutlineTarget
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
