import type {
  GlobalSearchCategoryId,
  GlobalSearchMatchReason,
  GlobalSearchResultCategory,
} from "./types"

interface LocalizedLabelDefinition {
  key: string
  fallback: string
}

interface GlobalSearchCategoryDefinition {
  id: GlobalSearchCategoryId
  label: LocalizedLabelDefinition
  placeholder: LocalizedLabelDefinition
  emptyText: LocalizedLabelDefinition
}

export const GLOBAL_SEARCH_CATEGORY_DEFINITIONS: GlobalSearchCategoryDefinition[] = [
  {
    id: "all",
    label: { key: "globalSearchCategoryAll", fallback: "All" },
    placeholder: { key: "globalSearchPlaceholderAll", fallback: "Search all" },
    emptyText: { key: "globalSearchEmptyAll", fallback: "No matching results" },
  },
  {
    id: "outline",
    label: { key: "globalSearchCategoryOutline", fallback: "Outline" },
    placeholder: { key: "globalSearchPlaceholderOutline", fallback: "Search outline" },
    emptyText: { key: "globalSearchEmptyOutline", fallback: "No outline results" },
  },
  {
    id: "conversations",
    label: { key: "globalSearchCategoryConversations", fallback: "Conversations" },
    placeholder: {
      key: "globalSearchPlaceholderConversations",
      fallback: "Search conversations on current site",
    },
    emptyText: {
      key: "globalSearchEmptyConversations",
      fallback: "No conversation results",
    },
  },
  {
    id: "prompts",
    label: { key: "globalSearchCategoryPrompts", fallback: "Prompts" },
    placeholder: { key: "globalSearchPlaceholderPrompts", fallback: "Search prompts" },
    emptyText: { key: "globalSearchEmptyPrompts", fallback: "No prompt results" },
  },
  {
    id: "settings",
    label: { key: "globalSearchCategorySettings", fallback: "Settings" },
    placeholder: { key: "globalSearchPlaceholderSettings", fallback: "Search settings" },
    emptyText: { key: "globalSearchEmptySettings", fallback: "No matching settings" },
  },
  {
    id: "tips",
    label: { key: "featureTipsCategory", fallback: "Tips" },
    placeholder: { key: "featureTipSearchPlaceholder", fallback: "Search feature tips…" },
    emptyText: { key: "globalSearchEmptyTips", fallback: "No matching tips" },
  },
]

export const GLOBAL_SEARCH_RESULT_CATEGORY_LABELS: Record<
  GlobalSearchResultCategory,
  LocalizedLabelDefinition
> = {
  outline: { key: "globalSearchCategoryOutline", fallback: "Outline" },
  settings: { key: "globalSearchCategorySettings", fallback: "Settings" },
  conversations: { key: "globalSearchCategoryConversations", fallback: "Conversations" },
  prompts: { key: "globalSearchCategoryPrompts", fallback: "Prompts" },
  tips: { key: "featureTipsCategory", fallback: "Tips" },
}

export const GLOBAL_SEARCH_MATCH_REASON_LABEL_DEFINITIONS: Record<
  GlobalSearchMatchReason,
  LocalizedLabelDefinition
> = {
  title: { key: "globalSearchMatchReasonTitle", fallback: "Title match" },
  folder: { key: "globalSearchMatchReasonFolder", fallback: "Folder match" },
  tag: { key: "globalSearchMatchReasonTag", fallback: "Tag match" },
  type: { key: "globalSearchMatchReasonType", fallback: "Type match" },
  code: { key: "globalSearchMatchReasonCode", fallback: "Code match" },
  category: { key: "globalSearchMatchReasonCategory", fallback: "Category match" },
  content: { key: "globalSearchMatchReasonContent", fallback: "Content match" },
  id: { key: "globalSearchMatchReasonId", fallback: "ID match" },
  keyword: { key: "globalSearchMatchReasonKeyword", fallback: "Keyword match" },
  alias: { key: "globalSearchMatchReasonAlias", fallback: "Alias match" },
  fuzzy: { key: "globalSearchMatchReasonFuzzy", fallback: "Fuzzy match" },
}

export const GLOBAL_SEARCH_ALL_CATEGORY_ITEM_LIMIT = 12

export const GLOBAL_SEARCH_RESULTS_LISTBOX_ID = "settings-search-results-listbox"
export const GLOBAL_SEARCH_OPTION_ID_PREFIX = "settings-search-option"
export const GLOBAL_SEARCH_KEYBOARD_SAFE_TOP = 8
export const GLOBAL_SEARCH_KEYBOARD_SAFE_BOTTOM = 12
export const GLOBAL_SEARCH_SHORTCUT_NUDGE_STORAGE_KEY = "ophel:global-search-shortcut-nudge:v1"
export const GLOBAL_SEARCH_SHORTCUT_NUDGE_MAX_SHOWS = 3
export const GLOBAL_SEARCH_SHORTCUT_NUDGE_MIN_INTERVAL = 24 * 60 * 60 * 1000
export const GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_HIDE_MS = 6000
export const GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_DISMISS_SHORTCUT_COUNT = 2
export const GLOBAL_SEARCH_PROMPT_PREVIEW_POINTER_DELAY_MS = 450
export const GLOBAL_SEARCH_PROMPT_PREVIEW_KEYBOARD_DELAY_MS = 700
export const GLOBAL_SEARCH_PROMPT_PREVIEW_HIDE_DELAY_MS = 220
export const GLOBAL_SEARCH_INPUT_DEBOUNCE_MS = 140
export const GLOBAL_SEARCH_SYNTAX_SUGGESTION_LIMIT = 8
export const GLOBAL_SEARCH_FILTER_CHIP_MAX_COUNT = 4
