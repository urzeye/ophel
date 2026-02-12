import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { getAdapter } from "~adapters/index"
import { SITE_IDS } from "~constants/defaults"
import { ConversationManager } from "~core/conversation-manager"
import { InlineBookmarkManager } from "~core/inline-bookmark-manager"
import { OutlineManager, type OutlineNode } from "~core/outline-manager"
import { AI_STUDIO_SHORTCUT_SYNC_EVENT, PromptManager } from "~core/prompt-manager"
import { ThemeManager } from "~core/theme-manager"
import { useShortcuts } from "~hooks/useShortcuts"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { useConversationsStore } from "~stores/conversations-store"
import { useFoldersStore } from "~stores/folders-store"
import { usePromptsStore } from "~stores/prompts-store"
import { DEFAULT_SETTINGS, type Prompt, type Settings } from "~utils/storage"
import { MSG_CLEAR_ALL_DATA } from "~utils/messaging"
import { showToast } from "~utils/toast"
import { setLanguage, t } from "~utils/i18n"
import { getHighlightStyles, renderMarkdown } from "~utils/markdown"
import { createSafeHTML } from "~utils/trusted-types"
import { initCopyButtons, showCopySuccess } from "~utils/icons"

import { ConfirmDialog, FolderSelectDialog, TagManagerDialog } from "./ConversationDialogs"
import { DisclaimerModal } from "./DisclaimerModal"
import { MainPanel } from "./MainPanel"
import { QuickButtons } from "./QuickButtons"
import { SelectedPromptBar } from "./SelectedPromptBar"
import { SettingsModal } from "./SettingsModal"
import { useTagsStore } from "~stores/tags-store"

import { SearchIcon } from "~components/icons"
import {
  APPEARANCE_TAB_IDS,
  FEATURES_TAB_IDS,
  NAV_IDS,
  SETTING_ID_ALIASES,
  SITE_SETTINGS_TAB_IDS,
  TAB_IDS,
  resolveSettingRoute,
  searchSettingsItems,
  type SettingsSearchItem,
} from "~constants"

interface LocalizedLabelDefinition {
  key: string
  fallback: string
}

const SETTINGS_PAGE_LABEL_DEFINITIONS: Record<string, LocalizedLabelDefinition> = {
  [NAV_IDS.GENERAL]: { key: "navGeneral", fallback: "General" },
  [NAV_IDS.FEATURES]: { key: "navFeatures", fallback: "Features" },
  [NAV_IDS.SITE_SETTINGS]: { key: "navSiteSettings", fallback: "Site Config" },
  [NAV_IDS.GLOBAL_SEARCH]: { key: "navGlobalSearch", fallback: "Global Search" },
  [NAV_IDS.APPEARANCE]: { key: "navAppearance", fallback: "Appearance" },
  [NAV_IDS.SHORTCUTS]: { key: "navShortcuts", fallback: "Keyboard Shortcuts" },
  [NAV_IDS.BACKUP]: { key: "navBackup", fallback: "Data Management" },
  [NAV_IDS.PERMISSIONS]: { key: "navPermissions", fallback: "Permissions" },
  [NAV_IDS.ABOUT]: { key: "navAbout", fallback: "About" },
}

const SETTINGS_SUB_TAB_LABEL_DEFINITIONS: Record<string, LocalizedLabelDefinition> = {
  panel: { key: "panelTab", fallback: "Panel" },
  tabOrder: { key: "tabOrderTab", fallback: "Tab Order" },
  shortcuts: { key: "shortcutsTab", fallback: "Quick Buttons" },
  toolsMenu: { key: "toolboxMenu", fallback: "Toolbox" },
  [FEATURES_TAB_IDS.TAB_SETTINGS]: { key: "tabSettingsTab", fallback: "Tab Settings" },
  [FEATURES_TAB_IDS.OUTLINE]: { key: "outlineSettingsTitle", fallback: "Outline" },
  [FEATURES_TAB_IDS.CONVERSATIONS]: {
    key: "conversationsSettingsTitle",
    fallback: "Conversations",
  },
  [FEATURES_TAB_IDS.PROMPTS]: { key: "promptSettingsTitle", fallback: "Prompts" },
  [FEATURES_TAB_IDS.READING_HISTORY]: {
    key: "readingHistorySettings",
    fallback: "Reading History",
  },
  [FEATURES_TAB_IDS.CONTENT]: { key: "contentProcessing", fallback: "Content" },
  [FEATURES_TAB_IDS.TOOLBOX]: { key: "toolboxMenu", fallback: "Toolbox" },
  [SITE_SETTINGS_TAB_IDS.LAYOUT]: { key: "layoutTab", fallback: "Layout" },
  [SITE_SETTINGS_TAB_IDS.MODEL_LOCK]: { key: "tabModelLock", fallback: "Model Lock" },
  gemini: { key: "geminiSettingsTab", fallback: "Gemini" },
  aistudio: { key: "aistudioSettingsTitle", fallback: "AI Studio" },
  chatgpt: { key: "chatgptSettingsTitle", fallback: "ChatGPT" },
  claude: { key: "claudeSettingsTab", fallback: "Claude" },
  [APPEARANCE_TAB_IDS.PRESETS]: { key: "themePresetsTab", fallback: "Theme Presets" },
  [APPEARANCE_TAB_IDS.CUSTOM]: { key: "customStylesTab", fallback: "Custom Styles" },
}

type GlobalSearchCategoryId = "all" | "outline" | "conversations" | "prompts" | "settings"

type GlobalSearchResultCategory = Exclude<GlobalSearchCategoryId, "all">

interface GlobalSearchCategoryDefinition {
  id: GlobalSearchCategoryId
  label: LocalizedLabelDefinition
  placeholder: LocalizedLabelDefinition
  emptyText: LocalizedLabelDefinition
}

interface GlobalSearchTagBadge {
  id: string
  name: string
  color: string
}

type GlobalSearchMatchReason =
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

interface GlobalSearchOutlineTarget {
  index: number
  level: number
  text: string
  isUserQuery: boolean
  queryIndex?: number
  isGhost?: boolean
  scrollTop?: number
}

interface GlobalSearchResultItem {
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

interface GlobalSearchPromptPreviewState {
  itemId: string
  content: string
  anchorRect: DOMRect
}

type GlobalSearchSyntaxOperator = "type" | "folder" | "tag" | "is" | "level" | "date"

type GlobalSearchSyntaxDiagnosticCode = "unknownOperator" | "invalidValue" | "conflict"

interface GlobalSearchSyntaxDiagnostic {
  id: string
  code: GlobalSearchSyntaxDiagnosticCode
  operator: string
  value?: string
  suggestion?: string
}

interface GlobalSearchSyntaxFilter {
  id: string
  key: GlobalSearchSyntaxOperator
  value: string
  normalizedValue: string
}

interface ParsedGlobalSearchQuery {
  rawQuery: string
  plainQuery: string
  filters: GlobalSearchSyntaxFilter[]
  diagnostics: GlobalSearchSyntaxDiagnostic[]
}

interface GlobalSearchSyntaxSuggestionItem {
  id: string
  token: string
  label: string
  description: string
}

interface GlobalSearchGroupedResult {
  category: GlobalSearchResultCategory
  items: GlobalSearchResultItem[]
  totalCount: number
  hasMore: boolean
  isExpanded: boolean
  remainingCount: number
}

type GlobalSearchOpenSource = "shortcut" | "ui" | "event"

interface GlobalSearchShortcutNudgeState {
  shownCount: number
  lastShownAt: number
  dismissed: boolean
  shortcutUsedCount: number
}

const isLikelyMacPlatform = () => {
  if (typeof navigator === "undefined") return false
  const platform = navigator.platform?.toLowerCase?.() || ""
  const userAgent = navigator.userAgent?.toLowerCase?.() || ""
  return platform.includes("mac") || userAgent.includes("mac os")
}

const GLOBAL_SEARCH_CATEGORY_DEFINITIONS: GlobalSearchCategoryDefinition[] = [
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
]

const GLOBAL_SEARCH_RESULT_CATEGORY_LABELS: Record<
  GlobalSearchResultCategory,
  LocalizedLabelDefinition
> = {
  outline: { key: "globalSearchCategoryOutline", fallback: "Outline" },
  settings: { key: "globalSearchCategorySettings", fallback: "Settings" },
  conversations: { key: "globalSearchCategoryConversations", fallback: "Conversations" },
  prompts: { key: "globalSearchCategoryPrompts", fallback: "Prompts" },
}

const GLOBAL_SEARCH_MATCH_REASON_LABEL_DEFINITIONS: Record<
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
}

const GLOBAL_SEARCH_ALL_CATEGORY_ITEM_LIMIT = 12

const GLOBAL_SEARCH_RESULTS_LISTBOX_ID = "settings-search-results-listbox"
const GLOBAL_SEARCH_OPTION_ID_PREFIX = "settings-search-option"
const GLOBAL_SEARCH_KEYBOARD_SAFE_TOP = 8
const GLOBAL_SEARCH_KEYBOARD_SAFE_BOTTOM = 12
const GLOBAL_SEARCH_SHORTCUT_NUDGE_STORAGE_KEY = "ophel:global-search-shortcut-nudge:v1"
const GLOBAL_SEARCH_SHORTCUT_NUDGE_MAX_SHOWS = 3
const GLOBAL_SEARCH_SHORTCUT_NUDGE_MIN_INTERVAL = 24 * 60 * 60 * 1000
const GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_HIDE_MS = 6000
const GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_DISMISS_SHORTCUT_COUNT = 2
const GLOBAL_SEARCH_PROMPT_PREVIEW_POINTER_DELAY_MS = 450
const GLOBAL_SEARCH_PROMPT_PREVIEW_KEYBOARD_DELAY_MS = 700
const GLOBAL_SEARCH_PROMPT_PREVIEW_HIDE_DELAY_MS = 220
const GLOBAL_SEARCH_INPUT_DEBOUNCE_MS = 140
const GLOBAL_SEARCH_SYNTAX_SUGGESTION_LIMIT = 8
const GLOBAL_SEARCH_SYNTAX_OPERATORS: GlobalSearchSyntaxOperator[] = [
  "type",
  "folder",
  "tag",
  "is",
  "level",
  "date",
]
const GLOBAL_SEARCH_FILTER_CHIP_MAX_COUNT = 4
const GLOBAL_SEARCH_TYPE_FILTER_VALUES: GlobalSearchResultCategory[] = [
  "outline",
  "conversations",
  "prompts",
  "settings",
]
const GLOBAL_SEARCH_IS_FILTER_VALUES = ["pinned", "unpinned"] as const
const GLOBAL_SEARCH_LEVEL_FILTER_VALUES = ["0", "1", "2", "3", "4", "5", "6"] as const
const GLOBAL_SEARCH_DATE_FILTER_SHORTCUT_VALUES = ["7d", "30d"] as const
const GLOBAL_SEARCH_DAY_MS = 24 * 60 * 60 * 1000

const SETTING_SEARCH_TITLE_KEY_MAP: Record<string, string> = {
  "aistudio-collapse-advanced": "aistudioCollapseAdvanced",
  "aistudio-collapse-navbar": "aistudioCollapseNavbar",
  "aistudio-collapse-run-settings": "aistudioCollapseRunSettings",
  "aistudio-collapse-tools": "aistudioCollapseTools",
  "aistudio-enable-search": "aistudioEnableSearch",
  "aistudio-markdown-fix": "aistudioMarkdownFixLabel",
  "aistudio-remove-watermark": "aistudioRemoveWatermark",
  "appearance-custom-styles": "customCSS",
  "appearance-preset-dark": "darkModePreset",
  "appearance-preset-light": "lightModePreset",
  "chatgpt-markdown-fix": "chatgptMarkdownFixLabel",
  "global-search-prompt-enter-behavior": "globalSearchPromptEnterBehaviorLabel",
  "claude-session-keys": "claudeSessionKeyTitle",
  "content-formula-copy": "formulaCopyLabel",
  "content-formula-delimiter": "formulaDelimiterLabel",
  "content-table-copy": "tableCopyLabel",
  "content-user-query-markdown": "userQueryMarkdownLabel",
  "conversation-folder-rainbow": "folderRainbowLabel",
  "conversation-sync-unpin": "conversationsSyncUnpinLabel",
  "export-custom-model-name": "exportCustomModelName",
  "export-custom-user-name": "exportCustomUserName",
  "export-filename-timestamp": "exportFilenameTimestamp",
  "export-images-base64": "exportImagesToBase64Label",
  "gemini-markdown-fix": "markdownFixLabel",
  "gemini-policy-max-retries": "maxRetriesLabel",
  "gemini-policy-retry": "policyRetryLabel",
  "gemini-watermark-removal": "watermarkRemovalLabel",
  "layout-page-width-enabled": "enablePageWidth",
  "layout-page-width-value": "pageWidthValueLabel",
  "layout-user-query-width-enabled": "enableUserQueryWidth",
  "layout-user-query-width-value": "userQueryWidthValueLabel",
  "outline-auto-update": "outlineAutoUpdateLabel",
  "outline-follow-mode": "outlineFollowModeLabel",
  "outline-inline-bookmark-mode": "inlineBookmarkModeLabel",
  "outline-panel-bookmark-mode": "panelBookmarkModeLabel",
  "outline-prevent-auto-scroll": "preventAutoScrollLabel",
  "outline-show-word-count": "outlineShowWordCountLabel",
  "outline-update-interval": "outlineUpdateIntervalLabel",
  "panel-auto-hide": "autoHidePanelLabel",
  "panel-default-open": "defaultPanelStateLabel",
  "panel-default-position": "defaultPositionLabel",
  "panel-edge-distance": "defaultEdgeDistanceLabel",
  "panel-edge-snap": "edgeSnapHideLabel",
  "panel-edge-snap-threshold": "edgeSnapThresholdLabel",
  "panel-height": "panelHeightLabel",
  "panel-width": "panelWidthLabel",
  "prompt-double-click-send": "promptDoubleClickSendLabel",
  "quick-buttons-opacity": "quickButtonsOpacityLabel",
  "reading-history-auto-restore": "readingHistoryAutoRestoreLabel",
  "reading-history-cleanup-days": "readingHistoryCleanup",
  "reading-history-persistence": "readingHistoryPersistenceLabel",
  "tab-auto-focus": "autoFocusLabel",
  "tab-auto-rename": "autoRenameTabLabel",
  "tab-notification-sound": "notificationSoundLabel",
  "tab-notification-volume": "notificationVolumeLabel",
  "tab-notify-when-focused": "notifyWhenFocusedLabel",
  "tab-open-new": "openNewTabLabel",
  "tab-privacy-mode": "privacyModeLabel",
  "tab-privacy-title": "privacyTitleLabel",
  "tab-rename-interval": "renameIntervalLabel",
  "tab-show-notification": "showNotificationLabel",
  "tab-show-status": "showStatusLabel",
  "tab-title-format": "titleFormatLabel",
  "tools-menu-export": "export",
  "tools-menu-copyMarkdown": "exportToClipboard",
  "tools-menu-move": "conversationsMoveTo",
  "tools-menu-setTag": "conversationsSetTag",
  "tools-menu-scrollLock": "shortcutToggleScrollLock",
  "tools-menu-modelLock": "modelLockTitle",
  "tools-menu-cleanup": "cleanup",
  "tools-menu-settings": "tabSettings",
}

const MODEL_LOCK_SITE_LABEL_DEFINITIONS: Record<string, LocalizedLabelDefinition> = {
  gemini: { key: "globalSearchSiteGemini", fallback: "Gemini" },
  "gemini-enterprise": {
    key: "globalSearchSiteGeminiEnterprise",
    fallback: "Gemini Enterprise",
  },
  aistudio: { key: "globalSearchSiteAIStudio", fallback: "AI Studio" },
  chatgpt: { key: "globalSearchSiteChatGPT", fallback: "ChatGPT" },
  claude: { key: "globalSearchSiteClaude", fallback: "Claude" },
  grok: { key: "globalSearchSiteGrok", fallback: "Grok" },
}

const toSearchTitleFallback = (settingId: string): string =>
  settingId
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (_matched, first) => first.toUpperCase())

const normalizeGlobalSearchValue = (value: string): string => value.trim().toLowerCase()

const toGlobalSearchTokens = (query: string): string[] =>
  normalizeGlobalSearchValue(query)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

const normalizeGlobalSearchRawToken = (rawToken: string): string => {
  if (!rawToken) {
    return ""
  }

  return rawToken
    .replace(/^"|"$/g, "")
    .replace(/\\([\\"\s:])/g, "$1")
    .trim()
}

const tryParseGlobalSearchDateDays = (value: string): number | null => {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d{1,3})d$/)
  if (!match) {
    return null
  }

  const days = Number(match[1])
  if (!Number.isFinite(days) || days <= 0) {
    return null
  }

  return days
}

const shouldTreatGlobalSearchFilterAsConflict = (
  filter: GlobalSearchSyntaxFilter,
  existingFilters: GlobalSearchSyntaxFilter[],
): boolean => {
  const normalizedValue = filter.normalizedValue

  if (filter.key === "type") {
    return existingFilters.some(
      (existingFilter) =>
        existingFilter.key === "type" && existingFilter.normalizedValue !== normalizedValue,
    )
  }

  if (filter.key === "is") {
    return existingFilters.some(
      (existingFilter) =>
        existingFilter.key === "is" && existingFilter.normalizedValue !== normalizedValue,
    )
  }

  if (filter.key === "level") {
    return existingFilters.some(
      (existingFilter) =>
        existingFilter.key === "level" && existingFilter.normalizedValue !== normalizedValue,
    )
  }

  if (filter.key === "date") {
    return existingFilters.some(
      (existingFilter) =>
        existingFilter.key === "date" && existingFilter.normalizedValue !== normalizedValue,
    )
  }

  return false
}

const isValidGlobalSearchFilterValue = (
  operator: GlobalSearchSyntaxOperator,
  normalizedValue: string,
): boolean => {
  if (!normalizedValue) {
    return false
  }

  if (operator === "type") {
    return GLOBAL_SEARCH_TYPE_FILTER_VALUES.includes(normalizedValue as GlobalSearchResultCategory)
  }

  if (operator === "is") {
    return GLOBAL_SEARCH_IS_FILTER_VALUES.includes(
      normalizedValue as (typeof GLOBAL_SEARCH_IS_FILTER_VALUES)[number],
    )
  }

  if (operator === "level") {
    return GLOBAL_SEARCH_LEVEL_FILTER_VALUES.includes(
      normalizedValue as (typeof GLOBAL_SEARCH_LEVEL_FILTER_VALUES)[number],
    )
  }

  if (operator === "date") {
    return tryParseGlobalSearchDateDays(normalizedValue) !== null
  }

  return true
}

const getGlobalSearchFilterValueSuggestion = (
  operator: GlobalSearchSyntaxOperator,
): string | undefined => {
  if (operator === "type") {
    return "outline | conversations | prompts | settings"
  }

  if (operator === "is") {
    return "pinned | unpinned"
  }

  if (operator === "level") {
    return "0 ~ 6"
  }

  if (operator === "date") {
    return "Nd (e.g. 7d, 30d)"
  }

  return undefined
}

const createGlobalSearchFilterId = (
  operator: GlobalSearchSyntaxOperator,
  normalizedValue: string,
  sequence: number,
): string => `${operator}:${normalizedValue}:${sequence}`

const getClosestGlobalSearchOperator = (operator: string): GlobalSearchSyntaxOperator | null => {
  const normalizedOperator = operator.trim().toLowerCase()
  if (!normalizedOperator) {
    return null
  }

  const prefixMatchedOperator = GLOBAL_SEARCH_SYNTAX_OPERATORS.find((candidate) =>
    candidate.startsWith(normalizedOperator),
  )
  if (prefixMatchedOperator) {
    return prefixMatchedOperator
  }

  const containsMatchedOperator = GLOBAL_SEARCH_SYNTAX_OPERATORS.find((candidate) =>
    normalizedOperator.startsWith(candidate),
  )
  if (containsMatchedOperator) {
    return containsMatchedOperator
  }

  return null
}

const parseGlobalSearchQuery = (query: string): ParsedGlobalSearchQuery => {
  const pattern = /(^|\s)([a-z]+):((?:"(?:\\.|[^"])+")|(?:\\.|[^\s])+)/gi
  const filters: GlobalSearchSyntaxFilter[] = []
  const diagnostics: GlobalSearchSyntaxDiagnostic[] = []
  const consumedRanges: Array<{ start: number; end: number }> = []
  const seenFilterCounts: Partial<Record<GlobalSearchSyntaxOperator, number>> = {}

  let match = pattern.exec(query)
  while (match) {
    const rawOperator = (match[2] || "").toLowerCase()
    const rawToken = match[3] || ""
    const tokenStart = (match.index || 0) + (match[1]?.length || 0)
    const tokenEnd = tokenStart + `${rawOperator}:${rawToken}`.length
    const hasUnclosedQuote = rawToken.startsWith('"') !== rawToken.endsWith('"')
    const suggestionOperator = getClosestGlobalSearchOperator(rawOperator)
    const value = normalizeGlobalSearchRawToken(rawToken)
    const normalizedValue = normalizeGlobalSearchValue(value)

    if (!GLOBAL_SEARCH_SYNTAX_OPERATORS.includes(rawOperator as GlobalSearchSyntaxOperator)) {
      diagnostics.push({
        id: `unknown:${rawOperator}:${match.index || 0}`,
        code: "unknownOperator",
        operator: rawOperator,
        suggestion: suggestionOperator || undefined,
      })
      match = pattern.exec(query)
      continue
    }

    const operator = rawOperator as GlobalSearchSyntaxOperator

    if (hasUnclosedQuote) {
      diagnostics.push({
        id: `invalid:${operator}:quote:${match.index || 0}`,
        code: "invalidValue",
        operator,
        value: rawToken,
      })
      consumedRanges.push({ start: tokenStart, end: tokenEnd })
      match = pattern.exec(query)
      continue
    }

    if (!value) {
      diagnostics.push({
        id: `invalid:${operator}:empty:${match.index || 0}`,
        code: "invalidValue",
        operator,
      })
      consumedRanges.push({ start: tokenStart, end: tokenEnd })
      match = pattern.exec(query)
      continue
    }

    if (!isValidGlobalSearchFilterValue(operator, normalizedValue)) {
      diagnostics.push({
        id: `invalid:${operator}:${normalizedValue}:${match.index || 0}`,
        code: "invalidValue",
        operator,
        value,
        suggestion: getGlobalSearchFilterValueSuggestion(operator),
      })
      consumedRanges.push({ start: tokenStart, end: tokenEnd })
      match = pattern.exec(query)
      continue
    }

    const currentSequence = (seenFilterCounts[operator] || 0) + 1
    seenFilterCounts[operator] = currentSequence

    const nextFilter: GlobalSearchSyntaxFilter = {
      id: createGlobalSearchFilterId(operator, normalizedValue, currentSequence),
      key: operator,
      value,
      normalizedValue,
    }

    if (shouldTreatGlobalSearchFilterAsConflict(nextFilter, filters)) {
      diagnostics.push({
        id: `conflict:${operator}:${normalizedValue}:${match.index || 0}`,
        code: "conflict",
        operator,
        value,
      })
      consumedRanges.push({ start: tokenStart, end: tokenEnd })
      match = pattern.exec(query)
      continue
    }

    consumedRanges.push({ start: tokenStart, end: tokenEnd })
    filters.push(nextFilter)

    match = pattern.exec(query)
  }

  if (consumedRanges.length === 0) {
    return {
      rawQuery: query,
      plainQuery: query.trim(),
      filters,
      diagnostics,
    }
  }

  consumedRanges.sort((left, right) => left.start - right.start)

  let plainQuery = ""
  let cursor = 0
  consumedRanges.forEach((range) => {
    if (cursor < range.start) {
      plainQuery += `${query.slice(cursor, range.start)} `
    }
    cursor = range.end
  })

  if (cursor < query.length) {
    plainQuery += query.slice(cursor)
  }

  return {
    rawQuery: query,
    plainQuery: plainQuery.replace(/\s+/g, " ").trim(),
    filters,
    diagnostics,
  }
}

const stringifyGlobalSearchQuery = ({
  plainQuery,
  filters,
}: {
  plainQuery: string
  filters: GlobalSearchSyntaxFilter[]
}): string => {
  const filterText = filters
    .map((filter) => {
      const escapedValue = filter.value.replace(/([\\"])/g, "\\$1")
      const needsQuote = /\s/.test(filter.value)
      const safeValue = needsQuote ? `"${escapedValue}"` : escapedValue
      return `${filter.key}:${safeValue}`
    })
    .join(" ")

  return `${plainQuery} ${filterText}`.replace(/\s+/g, " ").trim()
}

const matchGlobalSearchSyntaxFilters = (
  item: GlobalSearchResultItem,
  filters: GlobalSearchSyntaxFilter[],
): boolean => {
  if (filters.length === 0) {
    return true
  }

  return filters.every((filter) => {
    const value = filter.normalizedValue

    if (filter.key === "type") {
      return item.category.toLowerCase().includes(value)
    }

    if (filter.key === "folder") {
      const folderValue = (item.folderName || item.breadcrumb || "").toLowerCase()
      return folderValue.includes(value)
    }

    if (filter.key === "tag") {
      const tags = item.tagNames || item.tagBadges?.map((tag) => tag.name) || []
      return tags.some((tagName) => tagName.toLowerCase().includes(value))
    }

    if (filter.key === "is") {
      if (value === "pinned") {
        return Boolean(item.isPinned)
      }
      if (value === "unpinned") {
        return !item.isPinned
      }
      return false
    }

    if (filter.key === "level") {
      if (item.category !== "outline") {
        return false
      }

      return String(item.outlineTarget?.level ?? "") === value
    }

    if (filter.key === "date") {
      if (item.category !== "conversations" && item.category !== "prompts") {
        return false
      }

      const days = tryParseGlobalSearchDateDays(value)
      if (days === null) {
        return false
      }

      const timestamp = item.searchTimestamp || 0
      if (timestamp <= 0) {
        return false
      }

      const now = Date.now()
      return now - timestamp <= days * GLOBAL_SEARCH_DAY_MS
    }

    return true
  })
}

const getGlobalSearchTrailingTokenInfo = (
  inputValue: string,
): { token: string; start: number; end: number } | null => {
  const match = inputValue.match(/(^|\s)([^\s]*)$/)
  if (!match) {
    return null
  }

  const token = match[2] || ""
  const end = inputValue.length
  const start = end - token.length

  return {
    token,
    start,
    end,
  }
}

const buildGlobalSearchSnippet = ({
  content,
  normalizedQuery,
  tokens,
  maxLength = 84,
}: {
  content: string
  normalizedQuery: string
  tokens: string[]
  maxLength?: number
}): string => {
  const normalizedContent = content.replace(/\s+/g, " ").trim()
  if (!normalizedContent) return ""

  const candidates = Array.from(new Set([normalizedQuery, ...tokens])).filter(Boolean)
  const lowerContent = normalizedContent.toLowerCase()

  let firstHitIndex = -1
  candidates.forEach((candidate) => {
    const hitIndex = lowerContent.indexOf(candidate)
    if (hitIndex === -1) return
    if (firstHitIndex === -1 || hitIndex < firstHitIndex) {
      firstHitIndex = hitIndex
    }
  })

  if (firstHitIndex < 0) {
    return normalizedContent.length > maxLength
      ? `${normalizedContent.slice(0, maxLength).trim()}…`
      : normalizedContent
  }

  let start = Math.max(0, firstHitIndex - Math.floor(maxLength * 0.25))
  let end = Math.min(normalizedContent.length, start + maxLength)

  if (end >= normalizedContent.length) {
    start = Math.max(0, normalizedContent.length - maxLength)
  }

  const snippet = normalizedContent.slice(start, end).trim()
  const prefix = start > 0 ? "…" : ""
  const suffix = end < normalizedContent.length ? "…" : ""

  return `${prefix}${snippet}${suffix}`
}

const hasPromptVariables = (content: string): boolean => /\{\{(\w+)\}\}/.test(content)

const getFolderDisplayName = (folder: { name: string; icon?: string }): string => {
  const trimmedName = (folder.name || "").trim()
  const trimmedIcon = (folder.icon || "").trim()

  if (!trimmedIcon) {
    return trimmedName
  }

  if (trimmedName.startsWith(trimmedIcon)) {
    return trimmedName.slice(trimmedIcon.length).trim()
  }

  return trimmedName
}

const getGlobalSearchHighlightRanges = (
  value: string,
  tokens: string[],
): Array<{ start: number; end: number }> => {
  if (!value || tokens.length === 0) {
    return []
  }

  const normalizedValue = value.toLowerCase()
  const ranges: Array<{ start: number; end: number }> = []

  tokens.forEach((token) => {
    if (!token) return

    let fromIndex = 0
    while (fromIndex < normalizedValue.length) {
      const hitIndex = normalizedValue.indexOf(token, fromIndex)
      if (hitIndex < 0) {
        break
      }

      ranges.push({ start: hitIndex, end: hitIndex + token.length })
      fromIndex = hitIndex + token.length
    }
  })

  if (ranges.length === 0) {
    return []
  }

  ranges.sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start
    return left.end - right.end
  })

  const mergedRanges: Array<{ start: number; end: number }> = []
  ranges.forEach((range) => {
    const lastRange = mergedRanges[mergedRanges.length - 1]
    if (!lastRange || range.start > lastRange.end) {
      mergedRanges.push({ ...range })
      return
    }

    if (range.end > lastRange.end) {
      lastRange.end = range.end
    }
  })

  return mergedRanges
}

const splitGlobalSearchHighlightSegments = (
  value: string,
  tokens: string[],
): Array<{ text: string; highlighted: boolean }> => {
  if (!value) {
    return []
  }

  const ranges = getGlobalSearchHighlightRanges(value, tokens)
  if (ranges.length === 0) {
    return [{ text: value, highlighted: false }]
  }

  const segments: Array<{ text: string; highlighted: boolean }> = []
  let cursor = 0

  ranges.forEach((range) => {
    if (range.start > cursor) {
      segments.push({ text: value.slice(cursor, range.start), highlighted: false })
    }

    segments.push({ text: value.slice(range.start, range.end), highlighted: true })
    cursor = range.end
  })

  if (cursor < value.length) {
    segments.push({ text: value.slice(cursor), highlighted: false })
  }

  return segments.filter((segment) => segment.text.length > 0)
}

interface GlobalSearchScoreField {
  value: string
  exact: number
  prefix: number
  includes: number
  tokenPrefix: number
  tokenIncludes: number
  matchReason?: GlobalSearchMatchReason
}

interface GlobalSearchScoreResult {
  score: number
  matchLevel: number
  exactHitCount: number
  prefixHitCount: number
  includesHitCount: number
  matchReasons: GlobalSearchMatchReason[]
}

const buildSettingAliasMap = (): Record<string, string[]> => {
  return Object.entries(SETTING_ID_ALIASES).reduce(
    (collector, [aliasId, targetSettingId]) => {
      if (!collector[targetSettingId]) {
        collector[targetSettingId] = []
      }
      collector[targetSettingId].push(aliasId)
      return collector
    },
    {} as Record<string, string[]>,
  )
}

const GLOBAL_SEARCH_SETTING_ALIAS_MAP = buildSettingAliasMap()

const getGlobalSearchScore = ({
  normalizedQuery,
  tokens,
  index,
  fields,
  baseScoreWhenEmpty = 1000,
}: {
  normalizedQuery: string
  tokens: string[]
  index: number
  fields: GlobalSearchScoreField[]
  baseScoreWhenEmpty?: number
}): GlobalSearchScoreResult | null => {
  const searchableText = fields.map((field) => field.value).join(" ")

  if (tokens.some((token) => !searchableText.includes(token))) {
    return null
  }

  if (!normalizedQuery) {
    return {
      score: baseScoreWhenEmpty - index,
      matchLevel: 0,
      exactHitCount: 0,
      prefixHitCount: 0,
      includesHitCount: 0,
      matchReasons: [],
    }
  }

  let score = 0
  let matchLevel = 0
  let exactHitCount = 0
  let prefixHitCount = 0
  let includesHitCount = 0
  const matchReasons = new Set<GlobalSearchMatchReason>()

  fields.forEach((field) => {
    const normalizedValue = field.value
    if (!normalizedValue) {
      return
    }

    let fieldMatchLevel = 0
    let tokenMatchedByPrefix = false
    let tokenMatchedByIncludes = false

    if (normalizedValue === normalizedQuery) {
      score += field.exact
      fieldMatchLevel = 3
      exactHitCount += 1
    } else if (normalizedValue.startsWith(normalizedQuery)) {
      score += field.prefix
      fieldMatchLevel = 2
      prefixHitCount += 1
    } else if (normalizedValue.includes(normalizedQuery)) {
      score += field.includes
      fieldMatchLevel = 1
      includesHitCount += 1
    }

    matchLevel = Math.max(matchLevel, fieldMatchLevel)

    if (fieldMatchLevel > 0 && field.matchReason) {
      matchReasons.add(field.matchReason)
    }

    tokens.forEach((token) => {
      if (normalizedValue.startsWith(token)) {
        score += field.tokenPrefix
        tokenMatchedByPrefix = true
      }
      if (normalizedValue.includes(token)) {
        score += field.tokenIncludes
        tokenMatchedByIncludes = true
      }
    })

    if (fieldMatchLevel === 0) {
      if (tokenMatchedByPrefix) {
        matchLevel = Math.max(matchLevel, 2)
        prefixHitCount += 1
        if (field.matchReason) {
          matchReasons.add(field.matchReason)
        }
      } else if (tokenMatchedByIncludes) {
        matchLevel = Math.max(matchLevel, 1)
        includesHitCount += 1
        if (field.matchReason) {
          matchReasons.add(field.matchReason)
        }
      }
    } else {
      matchLevel = Math.max(matchLevel, fieldMatchLevel)
    }
  })

  return {
    score,
    matchLevel,
    exactHitCount,
    prefixHitCount,
    includesHitCount,
    matchReasons: Array.from(matchReasons),
  }
}

const compareGlobalSearchRankedItems = (
  left: { scoreMeta: GlobalSearchScoreResult; index: number; recency?: number },
  right: { scoreMeta: GlobalSearchScoreResult; index: number; recency?: number },
): number => {
  if (right.scoreMeta.matchLevel !== left.scoreMeta.matchLevel) {
    return right.scoreMeta.matchLevel - left.scoreMeta.matchLevel
  }

  if (right.scoreMeta.exactHitCount !== left.scoreMeta.exactHitCount) {
    return right.scoreMeta.exactHitCount - left.scoreMeta.exactHitCount
  }

  if (right.scoreMeta.prefixHitCount !== left.scoreMeta.prefixHitCount) {
    return right.scoreMeta.prefixHitCount - left.scoreMeta.prefixHitCount
  }

  if (right.scoreMeta.includesHitCount !== left.scoreMeta.includesHitCount) {
    return right.scoreMeta.includesHitCount - left.scoreMeta.includesHitCount
  }

  if (right.scoreMeta.score !== left.scoreMeta.score) {
    return right.scoreMeta.score - left.scoreMeta.score
  }

  const leftRecency = left.recency || 0
  const rightRecency = right.recency || 0
  if (rightRecency !== leftRecency) {
    return rightRecency - leftRecency
  }

  return left.index - right.index
}

export const App = () => {
  // 读取设置 - 使用 Zustand Store
  const { settings, setSettings, updateDeepSetting } = useSettingsStore()
  const isSettingsHydrated = useSettingsHydrated()
  const promptSubmitShortcut = settings?.features?.prompts?.submitShortcut ?? "enter"

  // 订阅 _syncVersion 以在跨上下文同步时强制触发重渲染
  // 当 Options 页面更新设置时，_syncVersion 递增，这会使整个组件重渲染
  const _syncVersion = useSettingsStore((s) => s._syncVersion)
  const [i18nRenderTick, setI18nRenderTick] = useState(0)

  const getLocalizedText = useCallback(
    (definition: LocalizedLabelDefinition) => {
      void i18nRenderTick
      const translated = t(definition.key)
      return translated === definition.key ? definition.fallback : translated
    },
    [i18nRenderTick],
  )

  const formatLocalizedText = useCallback(
    (definition: LocalizedLabelDefinition, params: Record<string, string>) => {
      let text = getLocalizedText(definition)

      Object.keys(params).forEach((paramKey) => {
        text = text.replace(new RegExp(`{${paramKey}}`, "g"), params[paramKey])
      })

      return text
    },
    [getLocalizedText],
  )

  const isMacLike = useMemo(() => isLikelyMacPlatform(), [])
  const globalSearchPrimaryShortcutLabel = isMacLike ? "⌘K" : "Ctrl+K"
  const globalSearchShortcutHintLabel = `${globalSearchPrimaryShortcutLabel} / double shift`

  const globalSearchShortcutNudgeText = useMemo(
    () =>
      formatLocalizedText(
        {
          key: "globalSearchShortcutNudge",
          fallback: "下次可按 {shortcut} 快速打开",
        },
        {
          shortcut: globalSearchShortcutHintLabel,
        },
      ),
    [formatLocalizedText, globalSearchShortcutHintLabel],
  )

  const getGlobalSearchShortcutNudgeState = useCallback((): GlobalSearchShortcutNudgeState => {
    if (typeof window === "undefined") {
      return {
        shownCount: 0,
        lastShownAt: 0,
        dismissed: false,
        shortcutUsedCount: 0,
      }
    }

    try {
      const rawValue = window.localStorage.getItem(GLOBAL_SEARCH_SHORTCUT_NUDGE_STORAGE_KEY)
      if (!rawValue) {
        return {
          shownCount: 0,
          lastShownAt: 0,
          dismissed: false,
          shortcutUsedCount: 0,
        }
      }

      const parsedValue = JSON.parse(rawValue) as Partial<GlobalSearchShortcutNudgeState>

      return {
        shownCount: Number.isFinite(parsedValue.shownCount)
          ? Math.max(0, Number(parsedValue.shownCount))
          : 0,
        lastShownAt: Number.isFinite(parsedValue.lastShownAt)
          ? Math.max(0, Number(parsedValue.lastShownAt))
          : 0,
        dismissed: Boolean(parsedValue.dismissed),
        shortcutUsedCount: Number.isFinite(parsedValue.shortcutUsedCount)
          ? Math.max(0, Number(parsedValue.shortcutUsedCount))
          : 0,
      }
    } catch {
      return {
        shownCount: 0,
        lastShownAt: 0,
        dismissed: false,
        shortcutUsedCount: 0,
      }
    }
  }, [])

  const saveGlobalSearchShortcutNudgeState = useCallback(
    (nextState: GlobalSearchShortcutNudgeState) => {
      if (typeof window === "undefined") {
        return
      }

      try {
        window.localStorage.setItem(
          GLOBAL_SEARCH_SHORTCUT_NUDGE_STORAGE_KEY,
          JSON.stringify(nextState),
        )
      } catch {
        // ignore storage errors
      }
    },
    [],
  )

  const clearGlobalSearchNudgeHideTimer = useCallback(() => {
    if (globalSearchNudgeHideTimerRef.current) {
      clearTimeout(globalSearchNudgeHideTimerRef.current)
      globalSearchNudgeHideTimerRef.current = null
    }
  }, [])

  const clearPromptPreviewTimer = useCallback(() => {
    if (promptPreviewTimerRef.current) {
      clearTimeout(promptPreviewTimerRef.current)
      promptPreviewTimerRef.current = null
    }
  }, [])

  const clearPromptPreviewHideTimer = useCallback(() => {
    if (promptPreviewHideTimerRef.current) {
      clearTimeout(promptPreviewHideTimerRef.current)
      promptPreviewHideTimerRef.current = null
    }
  }, [])

  const getGlobalSearchPromptAnchorElement = useCallback((itemId: string) => {
    const container = settingsSearchResultsRef.current
    if (!container) {
      return null
    }

    const candidates = container.querySelectorAll<HTMLElement>("[data-global-search-item-id]")
    for (const candidate of candidates) {
      if (candidate.dataset.globalSearchItemId === itemId) {
        return candidate
      }
    }

    return null
  }, [])

  const hideGlobalSearchPromptPreview = useCallback(() => {
    clearPromptPreviewTimer()
    clearPromptPreviewHideTimer()
    keyboardPreviewTargetRef.current = null
    setGlobalSearchPromptPreview(null)
  }, [clearPromptPreviewHideTimer, clearPromptPreviewTimer])

  const scheduleHideGlobalSearchPromptPreview = useCallback(
    (delay = GLOBAL_SEARCH_PROMPT_PREVIEW_HIDE_DELAY_MS) => {
      clearPromptPreviewHideTimer()
      promptPreviewHideTimerRef.current = setTimeout(() => {
        hideGlobalSearchPromptPreview()
        promptPreviewHideTimerRef.current = null
      }, delay)
    },
    [clearPromptPreviewHideTimer, hideGlobalSearchPromptPreview],
  )

  const scheduleGlobalSearchPromptPreview = useCallback(
    ({
      item,
      anchorElement,
      delay,
      source,
    }: {
      item: GlobalSearchResultItem
      anchorElement: HTMLElement
      delay: number
      source: "pointer" | "keyboard"
    }) => {
      if (
        item.category !== "prompts" ||
        !item.promptId ||
        !item.promptContent ||
        !item.promptContent.trim()
      ) {
        return
      }

      clearPromptPreviewTimer()
      clearPromptPreviewHideTimer()

      if (source === "keyboard") {
        keyboardPreviewTargetRef.current = item.id
      }

      promptPreviewTimerRef.current = setTimeout(() => {
        if (source === "keyboard" && keyboardPreviewTargetRef.current !== item.id) {
          return
        }

        setGlobalSearchPromptPreview({
          itemId: item.id,
          content: item.promptContent!,
          anchorRect: anchorElement.getBoundingClientRect(),
        })

        promptPreviewTimerRef.current = null
      }, delay)
    },
    [clearPromptPreviewHideTimer, clearPromptPreviewTimer],
  )

  const refreshGlobalSearchPromptPreviewAnchorRect = useCallback(() => {
    setGlobalSearchPromptPreview((current) => {
      if (!current) {
        return current
      }

      const anchorElement = getGlobalSearchPromptAnchorElement(current.itemId)
      if (!anchorElement) {
        return null
      }

      const nextRect = anchorElement.getBoundingClientRect()
      const isSameRect =
        Math.abs(nextRect.top - current.anchorRect.top) < 0.5 &&
        Math.abs(nextRect.left - current.anchorRect.left) < 0.5 &&
        Math.abs(nextRect.right - current.anchorRect.right) < 0.5 &&
        Math.abs(nextRect.bottom - current.anchorRect.bottom) < 0.5

      if (isSameRect) {
        return current
      }

      return {
        ...current,
        anchorRect: nextRect,
      }
    })
  }, [getGlobalSearchPromptAnchorElement])

  const handleGlobalSearchPromptPreviewClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation()

      const target = event.target as HTMLElement
      const copyButton = target.closest(".gh-code-copy-btn") as HTMLElement | null
      if (!copyButton) {
        return
      }

      const code = copyButton.nextElementSibling?.textContent || ""
      if (!code) {
        return
      }

      if (!navigator.clipboard?.writeText) {
        showToast(getLocalizedText({ key: "copyFailed", fallback: "Copy failed" }))
        return
      }

      void navigator.clipboard
        .writeText(code)
        .then(() => {
          showCopySuccess(copyButton, { size: 14 })
        })
        .catch(() => {
          showToast(getLocalizedText({ key: "copyFailed", fallback: "Copy failed" }))
        })
    },
    [getLocalizedText],
  )

  const clearSettingsSearchInputDebounceTimer = useCallback(() => {
    if (!searchInputDebounceTimerRef.current) {
      return
    }

    clearTimeout(searchInputDebounceTimerRef.current)
    searchInputDebounceTimerRef.current = null
  }, [])

  const syncSettingsSearchInputAndQuery = useCallback(
    (nextValue: string) => {
      clearSettingsSearchInputDebounceTimer()
      setSettingsSearchInputValue(nextValue)
      setSettingsSearchQuery(nextValue)
    },
    [clearSettingsSearchInputDebounceTimer],
  )

  const commitSettingsSearchInputValue = useCallback(
    (nextValue: string) => {
      setSettingsSearchInputValue(nextValue)
      clearSettingsSearchInputDebounceTimer()

      searchInputDebounceTimerRef.current = setTimeout(() => {
        setSettingsSearchQuery(nextValue)
        searchInputDebounceTimerRef.current = null
      }, GLOBAL_SEARCH_INPUT_DEBOUNCE_MS)
    },
    [clearSettingsSearchInputDebounceTimer],
  )

  const hideGlobalSearchShortcutNudge = useCallback(() => {
    clearGlobalSearchNudgeHideTimer()
    setShowGlobalSearchShortcutNudge(false)
    setGlobalSearchShortcutNudgeMessage("")
  }, [clearGlobalSearchNudgeHideTimer])

  const dismissGlobalSearchShortcutNudgeForever = useCallback(() => {
    const currentState = getGlobalSearchShortcutNudgeState()
    saveGlobalSearchShortcutNudgeState({
      ...currentState,
      dismissed: true,
    })
    hideGlobalSearchShortcutNudge()
  }, [
    getGlobalSearchShortcutNudgeState,
    hideGlobalSearchShortcutNudge,
    saveGlobalSearchShortcutNudgeState,
  ])

  const markGlobalSearchShortcutUsed = useCallback(() => {
    const currentState = getGlobalSearchShortcutNudgeState()
    const nextShortcutUsedCount = currentState.shortcutUsedCount + 1

    saveGlobalSearchShortcutNudgeState({
      ...currentState,
      shortcutUsedCount: nextShortcutUsedCount,
      dismissed:
        currentState.dismissed ||
        nextShortcutUsedCount >= GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_DISMISS_SHORTCUT_COUNT,
    })

    hideGlobalSearchShortcutNudge()
  }, [
    getGlobalSearchShortcutNudgeState,
    hideGlobalSearchShortcutNudge,
    saveGlobalSearchShortcutNudgeState,
  ])

  const tryShowGlobalSearchShortcutNudge = useCallback(() => {
    const currentState = getGlobalSearchShortcutNudgeState()
    if (currentState.dismissed) {
      return
    }

    if (
      currentState.shortcutUsedCount >= GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_DISMISS_SHORTCUT_COUNT
    ) {
      saveGlobalSearchShortcutNudgeState({
        ...currentState,
        dismissed: true,
      })
      return
    }

    if (currentState.shownCount >= GLOBAL_SEARCH_SHORTCUT_NUDGE_MAX_SHOWS) {
      return
    }

    const now = Date.now()
    if (
      currentState.lastShownAt > 0 &&
      now - currentState.lastShownAt < GLOBAL_SEARCH_SHORTCUT_NUDGE_MIN_INTERVAL
    ) {
      return
    }

    saveGlobalSearchShortcutNudgeState({
      ...currentState,
      shownCount: currentState.shownCount + 1,
      lastShownAt: now,
    })

    setGlobalSearchShortcutNudgeMessage(globalSearchShortcutNudgeText)
    setShowGlobalSearchShortcutNudge(true)
    clearGlobalSearchNudgeHideTimer()
    globalSearchNudgeHideTimerRef.current = setTimeout(() => {
      setShowGlobalSearchShortcutNudge(false)
      setGlobalSearchShortcutNudgeMessage("")
      globalSearchNudgeHideTimerRef.current = null
    }, GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_HIDE_MS)
  }, [
    clearGlobalSearchNudgeHideTimer,
    getGlobalSearchShortcutNudgeState,
    globalSearchShortcutNudgeText,
    saveGlobalSearchShortcutNudgeState,
  ])

  const getPageLabel = useCallback(
    (page: string) => {
      const definition = SETTINGS_PAGE_LABEL_DEFINITIONS[page]
      if (!definition) return page
      return getLocalizedText(definition)
    },
    [getLocalizedText],
  )

  const getSubTabLabel = useCallback(
    (subTab: string) => {
      const definition = SETTINGS_SUB_TAB_LABEL_DEFINITIONS[subTab]
      if (!definition) return subTab
      return getLocalizedText(definition)
    },
    [getLocalizedText],
  )

  const resolveSettingSearchTitle = useCallback(
    (item: SettingsSearchItem): string => {
      const titleKey = SETTING_SEARCH_TITLE_KEY_MAP[item.settingId]
      if (titleKey) {
        return getLocalizedText({
          key: titleKey,
          fallback: toSearchTitleFallback(item.settingId),
        })
      }

      if (item.settingId.startsWith("model-lock-")) {
        const siteKey = item.settingId.slice("model-lock-".length)
        const siteLabelDefinition = MODEL_LOCK_SITE_LABEL_DEFINITIONS[siteKey]
        if (siteLabelDefinition) {
          const modelLockLabel = getLocalizedText({ key: "tabModelLock", fallback: "Model Lock" })
          const siteLabel = getLocalizedText(siteLabelDefinition)
          return `${modelLockLabel}: ${siteLabel}`
        }
      }

      return toSearchTitleFallback(item.settingId)
    },
    [getLocalizedText],
  )

  const getSettingsBreadcrumb = useCallback(
    (settingId: string): string => {
      const route = resolveSettingRoute(settingId)
      if (!route) {
        return getLocalizedText({ key: "globalSearchCategorySettings", fallback: "Settings" })
      }

      const pageLabel = getPageLabel(route.page)
      if (!route.subTab) {
        return pageLabel
      }

      const subTabLabel = getSubTabLabel(route.subTab)
      return `${pageLabel} / ${subTabLabel}`
    },
    [getLocalizedText, getPageLabel, getSubTabLabel],
  )

  // 单例实例
  const adapter = useMemo(() => getAdapter(), [])

  const promptManager = useMemo(() => {
    return adapter ? new PromptManager(adapter) : null
  }, [adapter])

  const conversationManager = useMemo(() => {
    return adapter ? new ConversationManager(adapter) : null
  }, [adapter])

  const outlineManager = useMemo(() => {
    if (!adapter) return null

    // 使用 Zustand 的 updateDeepSetting
    const handleExpandLevelChange = (level: number) => {
      updateDeepSetting("features", "outline", "expandLevel", level)
    }

    const handleShowUserQueriesChange = (show: boolean) => {
      updateDeepSetting("features", "outline", "showUserQueries", show)
    }

    return new OutlineManager(
      adapter,
      settings?.features?.outline ?? DEFAULT_SETTINGS.features.outline,
      handleExpandLevelChange,
      handleShowUserQueriesChange,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在 adapter 变化时重新创建
  }, [adapter, updateDeepSetting])

  // 面板状态 - 初始值来自设置
  const [isPanelOpen, setIsPanelOpen] = useState(false)

  // 使用 ref 保持 settings 的最新引用，避免闭包捕获过期值
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // 初始化面板状态
  useEffect(() => {
    // 确保仅在 hydration 完成且 settings 加载后执行一次初始化
    if (isSettingsHydrated && settings && !isInitializedRef.current) {
      isInitializedRef.current = true
      // 如果 defaultPanelOpen 为 true，打开面板
      if (settings.panel?.defaultOpen) {
        // 如果开启了边缘吸附，且初始边距小于吸附阈值，则直接初始化为吸附状态
        const {
          edgeSnap,
          defaultEdgeDistance = 25,
          edgeSnapThreshold = 18,
          defaultPosition = "right",
        } = settings.panel
        if (edgeSnap && defaultEdgeDistance <= edgeSnapThreshold) {
          setEdgeSnapState(defaultPosition)
        }
        setIsPanelOpen(true)
      }
    }
  }, [isSettingsHydrated, settings])

  useEffect(() => {
    if (!isSettingsHydrated || !settings) return

    let needsUpdate = false
    const nextSettings: Partial<Settings> = {}
    const buttons = settings.collapsedButtons || []
    let nextButtons = buttons

    if (!nextButtons.some((btn) => btn.id === "floatingToolbar")) {
      nextButtons = [...nextButtons]
      const panelIndex = nextButtons.findIndex((btn) => btn.id === "panel")
      const insertIndex = panelIndex >= 0 ? panelIndex + 1 : nextButtons.length
      nextButtons.splice(insertIndex, 0, { id: "floatingToolbar", enabled: true })
      needsUpdate = true
    }

    if (!nextButtons.some((btn) => btn.id === "globalSearch")) {
      if (nextButtons === buttons) {
        nextButtons = [...nextButtons]
      }
      const toolboxIndex = nextButtons.findIndex((btn) => btn.id === "floatingToolbar")
      const insertIndex = toolboxIndex >= 0 ? toolboxIndex + 1 : nextButtons.length
      nextButtons.splice(insertIndex, 0, { id: "globalSearch", enabled: true })
      needsUpdate = true
    }

    if (nextButtons !== buttons) {
      nextSettings.collapsedButtons = nextButtons
    }

    if (!settings.floatingToolbar) {
      nextSettings.floatingToolbar = { open: true }
      needsUpdate = true
    }

    if (needsUpdate) {
      setSettings(nextSettings)
    }
  }, [isSettingsHydrated, settings, setSettings])

  // 选中的提示词状态
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)

  // 设置模态框状态
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isGlobalSettingsSearchOpen, setIsGlobalSettingsSearchOpen] = useState(false)
  const [activeGlobalSearchCategory, setActiveGlobalSearchCategory] =
    useState<GlobalSearchCategoryId>("all")
  const [settingsSearchInputValue, setSettingsSearchInputValue] = useState("")
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("")
  const [settingsSearchActiveIndex, setSettingsSearchActiveIndex] = useState(0)
  const [settingsSearchHoverLocked, setSettingsSearchHoverLocked] = useState(false)
  const [settingsSearchNavigationMode, setSettingsSearchNavigationMode] = useState<
    "keyboard" | "pointer"
  >("pointer")
  const [expandedGlobalSearchCategories, setExpandedGlobalSearchCategories] = useState<
    Partial<Record<GlobalSearchResultCategory, boolean>>
  >({})
  const [showGlobalSearchShortcutNudge, setShowGlobalSearchShortcutNudge] = useState(false)
  const [globalSearchShortcutNudgeMessage, setGlobalSearchShortcutNudgeMessage] = useState("")
  const [showGlobalSearchSyntaxHelp, setShowGlobalSearchSyntaxHelp] = useState(false)
  const [globalSearchPromptPreview, setGlobalSearchPromptPreview] =
    useState<GlobalSearchPromptPreviewState | null>(null)
  const [activeSearchSyntaxSuggestionIndex, setActiveSearchSyntaxSuggestionIndex] = useState(-1)
  const settingsSearchInputRef = useRef<HTMLInputElement | null>(null)
  const globalSearchSyntaxHelpTriggerRef = useRef<HTMLButtonElement | null>(null)
  const globalSearchSyntaxHelpPopoverRef = useRef<HTMLDivElement | null>(null)
  const settingsSearchResultsRef = useRef<HTMLDivElement | null>(null)
  const promptPreviewContainerRef = useRef<HTMLDivElement | null>(null)
  const searchInputDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const settingsSearchWheelFreezeUntilRef = useRef(0)
  const promptPreviewTimerRef = useRef<NodeJS.Timeout | null>(null)
  const promptPreviewHideTimerRef = useRef<NodeJS.Timeout | null>(null)
  const keyboardPreviewTargetRef = useRef<string | null>(null)
  const globalSearchNudgeHideTimerRef = useRef<NodeJS.Timeout | null>(null)
  const globalSearchOpenSourceRef = useRef<GlobalSearchOpenSource>("ui")
  const lastShiftPressedAtRef = useRef(0)
  const [outlineSearchVersion, setOutlineSearchVersion] = useState(0)
  const settingsSearchRestoreFocusRef = useRef<HTMLElement | null>(null)

  // 浮动工具栏

  const [floatingToolbarMoveState, setFloatingToolbarMoveState] = useState<{
    convId: string
    activeFolderId?: string
  } | null>(null)
  const [isFloatingToolbarClearOpen, setIsFloatingToolbarClearOpen] = useState(false)

  // 边缘吸附状态
  const [edgeSnapState, setEdgeSnapState] = useState<"left" | "right" | null>(null)
  // 临时显示状态（当鼠标悬停在面板上时）
  const [isEdgePeeking, setIsEdgePeeking] = useState(false)
  // 是否有活跃的交互（如打开了菜单/对话框），此时即使鼠标移出也不隐藏面板
  // 使用 useRef 避免闭包陷阱和不必要的重渲染
  const isInteractionActiveRef = useRef(false)
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)
  // 快捷键触发的面板显示延迟缩回计时器
  const shortcutPeekTimerRef = useRef<NodeJS.Timeout | null>(null)
  // 使用 ref 跟踪设置模态框状态，避免闭包捕获过期值
  const isSettingsOpenRef = useRef(false)
  // 标记全局搜索是否由设置页切换而来（用于 Esc 返回）
  const searchOpenedFromSettingsRef = useRef(false)
  // 追踪面板内输入框是否聚焦（解决 IME 输入法弹出时 CSS :hover 失效的问题）
  const isInputFocusedRef = useRef(false)
  // 追踪是否已完成初始化，防止重复执行
  const isInitializedRef = useRef(false)

  // 接收到设置导航事件时，自动打开设置弹窗
  useEffect(() => {
    const handleNavigateSettings = (
      _e: CustomEvent<{ page?: string; subTab?: string; settingId?: string }>,
    ) => {
      if (isGlobalSettingsSearchOpen) {
        searchOpenedFromSettingsRef.current = false
        settingsSearchRestoreFocusRef.current = null
        clearSettingsSearchInputDebounceTimer()
        setIsGlobalSettingsSearchOpen(false)
        setActiveGlobalSearchCategory("all")
        setSettingsSearchInputValue("")
        setSettingsSearchQuery("")
        setActiveSearchSyntaxSuggestionIndex(-1)
        setSettingsSearchActiveIndex(0)
        setSettingsSearchHoverLocked(false)
        setSettingsSearchNavigationMode("pointer")
        setExpandedGlobalSearchCategories({})
        settingsSearchWheelFreezeUntilRef.current = 0
      }

      if (!isSettingsOpenRef.current) {
        isSettingsOpenRef.current = true

        if (edgeSnapState && settingsRef.current?.panel?.edgeSnap) {
          setIsEdgePeeking(true)
        }

        setIsSettingsOpen(true)
      }
    }

    window.addEventListener("ophel:navigateSettingsPage", handleNavigateSettings as EventListener)

    return () =>
      window.removeEventListener(
        "ophel:navigateSettingsPage",
        handleNavigateSettings as EventListener,
      )
  }, [clearSettingsSearchInputDebounceTimer, edgeSnapState, isGlobalSettingsSearchOpen])

  const conversationsSnapshot = useConversationsStore((state) => state.conversations)
  const foldersSnapshot = useFoldersStore((state) => state.folders)
  const tagsSnapshot = useTagsStore((state) => state.tags)
  const promptsSnapshot = usePromptsStore((state) => state.prompts)

  const parsedGlobalSearchQuery = useMemo(
    () => parseGlobalSearchQuery(settingsSearchQuery),
    [settingsSearchQuery],
  )

  const activeGlobalSearchSyntaxFilters = useMemo(
    () => parsedGlobalSearchQuery.filters,
    [parsedGlobalSearchQuery.filters],
  )

  const activeGlobalSearchSyntaxDiagnostics = useMemo(
    () => parsedGlobalSearchQuery.diagnostics,
    [parsedGlobalSearchQuery.diagnostics],
  )

  const activeGlobalSearchPlainQuery = useMemo(
    () => parsedGlobalSearchQuery.plainQuery,
    [parsedGlobalSearchQuery.plainQuery],
  )

  const settingsSearchResults = useMemo(
    () => searchSettingsItems(activeGlobalSearchPlainQuery),
    [activeGlobalSearchPlainQuery],
  )

  useEffect(() => {
    if (!outlineManager || !isGlobalSettingsSearchOpen) {
      return
    }

    const syncOutlineForSearch = () => {
      outlineManager.refresh()
      setOutlineSearchVersion((previousVersion) => previousVersion + 1)
    }

    syncOutlineForSearch()

    const unsubscribe = outlineManager.subscribe(() => {
      setOutlineSearchVersion((previousVersion) => previousVersion + 1)
    })

    const pollingId = window.setInterval(() => {
      syncOutlineForSearch()
    }, 1200)

    return () => {
      unsubscribe()
      window.clearInterval(pollingId)
    }
  }, [isGlobalSettingsSearchOpen, outlineManager])

  const settingsSearchHighlightTokens = useMemo(
    () =>
      Array.from(new Set(toGlobalSearchTokens(activeGlobalSearchPlainQuery))).sort(
        (left, right) => right.length - left.length,
      ),
    [activeGlobalSearchPlainQuery],
  )

  const settingsGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    const normalizedQuery = normalizeGlobalSearchValue(activeGlobalSearchPlainQuery)
    const tokens = toGlobalSearchTokens(activeGlobalSearchPlainQuery)

    return settingsSearchResults.map((item) => {
      const title = resolveSettingSearchTitle(item)
      const normalizedTitle = normalizeGlobalSearchValue(title)
      const normalizedKeywords = normalizeGlobalSearchValue((item.keywords || []).join(" "))
      const normalizedSettingId = normalizeGlobalSearchValue(item.settingId)
      const normalizedAliasKeywords = normalizeGlobalSearchValue(
        (GLOBAL_SEARCH_SETTING_ALIAS_MAP[item.settingId] || []).join(" "),
      )

      const matchReasons = new Set<GlobalSearchMatchReason>()

      const markReason = (reason: GlobalSearchMatchReason, value: string) => {
        if (!value) return

        if (normalizedQuery) {
          if (
            value === normalizedQuery ||
            value.startsWith(normalizedQuery) ||
            value.includes(normalizedQuery)
          ) {
            matchReasons.add(reason)
            return
          }
        }

        if (tokens.length > 0) {
          if (tokens.some((token) => value.startsWith(token) || value.includes(token))) {
            matchReasons.add(reason)
          }
        }
      }

      markReason("title", normalizedTitle)
      markReason("keyword", normalizedKeywords)
      markReason("id", normalizedSettingId)
      markReason("alias", normalizedAliasKeywords)

      return {
        id: `settings:${item.settingId}`,
        title,
        breadcrumb: getSettingsBreadcrumb(item.settingId),
        code: item.settingId,
        category: "settings",
        settingId: item.settingId,
        matchReasons: Array.from(matchReasons),
      }
    })
  }, [
    activeGlobalSearchPlainQuery,
    getSettingsBreadcrumb,
    resolveSettingSearchTitle,
    settingsSearchResults,
  ])

  const conversationGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    if (!conversationManager) {
      return []
    }

    void conversationsSnapshot
    void foldersSnapshot
    void tagsSnapshot

    const conversations = conversationManager.getConversations()
    const folders = conversationManager.getFolders()
    const tags = conversationManager.getTags()

    const folderMap = new Map(folders.map((folder) => [folder.id, folder]))
    const tagMap = new Map(tags.map((tag) => [tag.id, tag]))

    const normalizedQuery = normalizeGlobalSearchValue(activeGlobalSearchPlainQuery)
    const tokens = toGlobalSearchTokens(activeGlobalSearchPlainQuery)
    const untitledConversation = getLocalizedText({
      key: "untitledConversation",
      fallback: "Untitled conversation",
    })

    const scoredItems = conversations
      .map((conversation, index) => {
        const title = conversation.title?.trim() || untitledConversation
        const folder = folderMap.get(conversation.folderId)
        const folderLabel = folder
          ? `${folder.icon ? `${folder.icon} ` : ""}${getFolderDisplayName(folder)}`.trim()
          : conversation.folderId
        const tagBadges = (conversation.tagIds || [])
          .map((tagId) => {
            const tag = tagMap.get(tagId)
            if (!tag) return null
            return {
              id: tag.id,
              name: tag.name,
              color: tag.color,
            }
          })
          .filter((tag): tag is GlobalSearchTagBadge => Boolean(tag))

        const normalizedTitle = normalizeGlobalSearchValue(title)
        const normalizedFolder = normalizeGlobalSearchValue(folderLabel)
        const normalizedTags = normalizeGlobalSearchValue(
          tagBadges.map((tag) => tag.name).join(" "),
        )
        const scoreMeta = getGlobalSearchScore({
          normalizedQuery,
          tokens,
          index,
          fields: [
            {
              value: normalizedTitle,
              exact: 220,
              prefix: 140,
              includes: 100,
              tokenPrefix: 24,
              tokenIncludes: 12,
              matchReason: "title",
            },
            {
              value: normalizedFolder,
              exact: 0,
              prefix: 0,
              includes: 72,
              tokenPrefix: 0,
              tokenIncludes: 8,
              matchReason: "folder",
            },
            {
              value: normalizedTags,
              exact: 0,
              prefix: 0,
              includes: 64,
              tokenPrefix: 0,
              tokenIncludes: 8,
              matchReason: "tag",
            },
          ],
        })

        if (scoreMeta === null) {
          return null
        }

        const finalScoreMeta = {
          ...scoreMeta,
          score: scoreMeta.score + (conversation.pinned ? 6 : 0),
        }

        const breadcrumb = folderLabel

        return {
          item: {
            id: `conversations:${conversation.id}`,
            title,
            breadcrumb,
            category: "conversations" as const,
            conversationId: conversation.id,
            conversationUrl: conversation.url,
            tagBadges,
            folderName: folderLabel,
            tagNames: tagBadges.map((tag) => tag.name),
            isPinned: Boolean(conversation.pinned),
            searchTimestamp: conversation.updatedAt || 0,
            matchReasons: finalScoreMeta.matchReasons,
          },
          scoreMeta: finalScoreMeta,
          index,
          recency: conversation.updatedAt || 0,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort(compareGlobalSearchRankedItems)

    return scoredItems.map(({ item }) => item)
  }, [
    conversationManager,
    conversationsSnapshot,
    foldersSnapshot,
    tagsSnapshot,
    getLocalizedText,
    activeGlobalSearchPlainQuery,
  ])

  const promptsGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    const normalizedQuery = normalizeGlobalSearchValue(activeGlobalSearchPlainQuery)
    const tokens = toGlobalSearchTokens(activeGlobalSearchPlainQuery)
    const promptsLabel = getLocalizedText({
      key: "globalSearchCategoryPrompts",
      fallback: "Prompts",
    })
    const uncategorizedLabel = getLocalizedText({
      key: "uncategorized",
      fallback: "Uncategorized",
    })

    const scoredItems = promptsSnapshot
      .map((prompt, index) => {
        const title =
          prompt.title?.trim() ||
          prompt.content?.trim().split("\n")[0] ||
          `${promptsLabel} #${index + 1}`
        const content = prompt.content?.trim() || ""
        const categoryLabel = prompt.category?.trim() || uncategorizedLabel
        const breadcrumb = `${promptsLabel} / ${categoryLabel}`

        const normalizedTitle = normalizeGlobalSearchValue(title)
        const normalizedContent = normalizeGlobalSearchValue(content)
        const normalizedCategory = normalizeGlobalSearchValue(categoryLabel)
        const normalizedPromptId = normalizeGlobalSearchValue(prompt.id)
        const scoreMeta = getGlobalSearchScore({
          normalizedQuery,
          tokens,
          index,
          fields: [
            {
              value: normalizedTitle,
              exact: 220,
              prefix: 140,
              includes: 100,
              tokenPrefix: 24,
              tokenIncludes: 12,
              matchReason: "title",
            },
            {
              value: normalizedCategory,
              exact: 0,
              prefix: 0,
              includes: 70,
              tokenPrefix: 0,
              tokenIncludes: 8,
              matchReason: "category",
            },
            {
              value: normalizedContent,
              exact: 0,
              prefix: 0,
              includes: 60,
              tokenPrefix: 0,
              tokenIncludes: 6,
              matchReason: "content",
            },
            {
              value: normalizedPromptId,
              exact: 0,
              prefix: 0,
              includes: 20,
              tokenPrefix: 0,
              tokenIncludes: 4,
              matchReason: "id",
            },
          ],
        })

        if (scoreMeta === null) {
          return null
        }

        const finalScoreMeta = {
          ...scoreMeta,
          score: scoreMeta.score + (prompt.pinned ? 6 : 0),
        }

        const snippet = finalScoreMeta.matchReasons.includes("content")
          ? buildGlobalSearchSnippet({
              content,
              normalizedQuery,
              tokens,
            })
          : ""

        return {
          item: {
            id: `prompts:${prompt.id}`,
            title,
            breadcrumb,
            snippet,
            category: "prompts" as const,
            promptId: prompt.id,
            promptContent: prompt.content,
            folderName: categoryLabel,
            isPinned: Boolean(prompt.pinned),
            searchTimestamp: prompt.lastUsedAt || 0,
            matchReasons: finalScoreMeta.matchReasons,
          },
          scoreMeta: finalScoreMeta,
          index,
          recency: prompt.lastUsedAt || 0,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort(compareGlobalSearchRankedItems)

    return scoredItems.map(({ item }) => item)
  }, [activeGlobalSearchPlainQuery, getLocalizedText, promptsSnapshot])

  const outlineGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    if (!outlineManager) {
      return []
    }

    void outlineSearchVersion

    const flattenOutlineNodes = (nodes: OutlineNode[]): OutlineNode[] => {
      const collector: OutlineNode[] = []

      const traverse = (items: OutlineNode[]) => {
        items.forEach((node) => {
          collector.push(node)
          if (node.children && node.children.length > 0) {
            traverse(node.children)
          }
        })
      }

      traverse(nodes)
      return collector
    }

    const outlineNodes = flattenOutlineNodes(outlineManager.getTree())
    const normalizedQuery = normalizeGlobalSearchValue(activeGlobalSearchPlainQuery)
    const tokens = toGlobalSearchTokens(activeGlobalSearchPlainQuery)
    const outlineLabel = getLocalizedText({
      key: "globalSearchCategoryOutline",
      fallback: "Outline",
    })
    const outlineQueryLabel = getLocalizedText({
      key: "outlineOnlyUserQueries",
      fallback: "Queries",
    })
    const outlineReplyLabel = getLocalizedText({
      key: "globalSearchOutlineReplies",
      fallback: "Replies",
    })

    const scoredItems = outlineNodes
      .map((node, index) => {
        const title = node.text?.trim()
        if (!title) {
          return null
        }

        const code = node.isUserQuery ? `Q${node.queryIndex ?? index + 1}` : `H${node.level}`
        const roleLabel = node.isUserQuery ? outlineQueryLabel : outlineReplyLabel
        const breadcrumb = node.isUserQuery
          ? `${outlineLabel} / ${roleLabel}`
          : `${outlineLabel} / ${roleLabel} / H${node.level}`

        const normalizedTitle = normalizeGlobalSearchValue(title)
        const normalizedType = normalizeGlobalSearchValue(
          node.isUserQuery ? roleLabel : `${roleLabel} h${node.level}`,
        )
        const normalizedCode = normalizeGlobalSearchValue(code)
        const scoreMeta = getGlobalSearchScore({
          normalizedQuery,
          tokens,
          index,
          fields: [
            {
              value: normalizedTitle,
              exact: 200,
              prefix: 120,
              includes: 90,
              tokenPrefix: 16,
              tokenIncludes: 10,
              matchReason: "title",
            },
            {
              value: normalizedType,
              exact: 0,
              prefix: 0,
              includes: 48,
              tokenPrefix: 0,
              tokenIncludes: 6,
              matchReason: "type",
            },
            {
              value: normalizedCode,
              exact: 0,
              prefix: 0,
              includes: 36,
              tokenPrefix: 0,
              tokenIncludes: 4,
              matchReason: "code",
            },
          ],
        })

        if (scoreMeta === null) {
          return null
        }

        const finalScoreMeta = {
          ...scoreMeta,
          score: scoreMeta.score + (node.isBookmarked ? 4 : 0),
        }

        return {
          item: {
            id: `outline:${node.index}`,
            title,
            breadcrumb,
            code,
            category: "outline" as const,
            matchReasons: finalScoreMeta.matchReasons,
            outlineTarget: {
              index: node.index,
              level: node.level,
              text: title,
              isUserQuery: Boolean(node.isUserQuery),
              queryIndex: node.queryIndex,
              isGhost: Boolean(node.isGhost),
              scrollTop: node.scrollTop,
            },
          },
          scoreMeta: finalScoreMeta,
          index,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort(compareGlobalSearchRankedItems)

    return scoredItems.map(({ item }) => item)
  }, [activeGlobalSearchPlainQuery, outlineManager, getLocalizedText, outlineSearchVersion])

  const normalizedGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(
    () => [
      ...settingsGlobalSearchResults,
      ...conversationGlobalSearchResults,
      ...outlineGlobalSearchResults,
      ...promptsGlobalSearchResults,
    ],
    [
      conversationGlobalSearchResults,
      outlineGlobalSearchResults,
      promptsGlobalSearchResults,
      settingsGlobalSearchResults,
    ],
  )

  const filteredGlobalSearchResults = useMemo(
    () =>
      normalizedGlobalSearchResults.filter((item) =>
        matchGlobalSearchSyntaxFilters(item, activeGlobalSearchSyntaxFilters),
      ),
    [activeGlobalSearchSyntaxFilters, normalizedGlobalSearchResults],
  )

  const globalSearchResultCounts = useMemo(() => {
    const counts = GLOBAL_SEARCH_CATEGORY_DEFINITIONS.reduce(
      (collector, category) => {
        collector[category.id] = 0
        return collector
      },
      {} as Record<GlobalSearchCategoryId, number>,
    )

    filteredGlobalSearchResults.forEach((item) => {
      counts[item.category] += 1
      counts["all"] += 1
    })

    return counts
  }, [filteredGlobalSearchResults])

  const orderedGlobalSearchCategories = useMemo(
    () =>
      GLOBAL_SEARCH_CATEGORY_DEFINITIONS.filter((category) => category.id !== "all").map(
        (category) => category.id as GlobalSearchResultCategory,
      ),
    [],
  )

  const groupedGlobalSearchResults = useMemo<GlobalSearchGroupedResult[]>(() => {
    if (activeGlobalSearchCategory !== "all") {
      return []
    }

    return orderedGlobalSearchCategories
      .map((category) => {
        const categoryItems = filteredGlobalSearchResults.filter(
          (item) => item.category === category,
        )
        const isExpanded = Boolean(expandedGlobalSearchCategories[category])
        const visibleCount = isExpanded
          ? categoryItems.length
          : GLOBAL_SEARCH_ALL_CATEGORY_ITEM_LIMIT
        const items = categoryItems.slice(0, visibleCount)
        const remainingCount = Math.max(0, categoryItems.length - items.length)

        return {
          category,
          items,
          totalCount: categoryItems.length,
          hasMore: remainingCount > 0,
          isExpanded,
          remainingCount,
        }
      })
      .filter((group) => group.items.length > 0)
  }, [
    activeGlobalSearchCategory,
    expandedGlobalSearchCategories,
    filteredGlobalSearchResults,
    orderedGlobalSearchCategories,
  ])

  const visibleGlobalSearchResults = useMemo(() => {
    if (activeGlobalSearchCategory !== "all") {
      return filteredGlobalSearchResults.filter(
        (item) => item.category === activeGlobalSearchCategory,
      )
    }

    return groupedGlobalSearchResults.flatMap((group) => group.items)
  }, [activeGlobalSearchCategory, filteredGlobalSearchResults, groupedGlobalSearchResults])

  const visibleSearchResultIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    visibleGlobalSearchResults.forEach((item, index) => {
      map.set(item.id, index)
    })
    return map
  }, [visibleGlobalSearchResults])

  const activeVisibleGlobalSearchIndex = useMemo(() => {
    if (visibleGlobalSearchResults.length === 0) {
      return -1
    }

    return Math.min(settingsSearchActiveIndex, visibleGlobalSearchResults.length - 1)
  }, [settingsSearchActiveIndex, visibleGlobalSearchResults.length])

  const activeGlobalSearchOptionId =
    activeVisibleGlobalSearchIndex >= 0
      ? `${GLOBAL_SEARCH_OPTION_ID_PREFIX}-${activeVisibleGlobalSearchIndex}`
      : undefined

  const activeGlobalSearchCategoryDefinition = useMemo(
    () =>
      GLOBAL_SEARCH_CATEGORY_DEFINITIONS.find(
        (category) => category.id === activeGlobalSearchCategory,
      ) || GLOBAL_SEARCH_CATEGORY_DEFINITIONS[0],
    [activeGlobalSearchCategory],
  )

  const resolvedActiveGlobalSearchCategoryText = useMemo(
    () => ({
      label: getLocalizedText(activeGlobalSearchCategoryDefinition.label),
      placeholder: getLocalizedText(activeGlobalSearchCategoryDefinition.placeholder),
      emptyText: getLocalizedText(activeGlobalSearchCategoryDefinition.emptyText),
    }),
    [activeGlobalSearchCategoryDefinition, getLocalizedText],
  )

  const resolvedGlobalSearchCategoryLabels = useMemo(
    () =>
      GLOBAL_SEARCH_CATEGORY_DEFINITIONS.reduce(
        (collector, category) => {
          collector[category.id] = getLocalizedText(category.label)
          return collector
        },
        {} as Record<GlobalSearchCategoryId, string>,
      ),
    [getLocalizedText],
  )

  const resolvedGlobalSearchResultCategoryLabels = useMemo(
    () =>
      (
        Object.entries(GLOBAL_SEARCH_RESULT_CATEGORY_LABELS) as [
          GlobalSearchResultCategory,
          LocalizedLabelDefinition,
        ][]
      ).reduce(
        (collector, [category, definition]) => {
          collector[category] = getLocalizedText(definition)
          return collector
        },
        {} as Record<GlobalSearchResultCategory, string>,
      ),
    [getLocalizedText],
  )

  const resolvedGlobalSearchMatchReasonLabels = useMemo(
    () =>
      (
        Object.entries(GLOBAL_SEARCH_MATCH_REASON_LABEL_DEFINITIONS) as [
          GlobalSearchMatchReason,
          LocalizedLabelDefinition,
        ][]
      ).reduce(
        (collector, [reason, definition]) => {
          collector[reason] = getLocalizedText(definition)
          return collector
        },
        {} as Record<GlobalSearchMatchReason, string>,
      ),
    [getLocalizedText],
  )

  const globalSearchFilterChipLabelPrefixMap = useMemo(
    () => ({
      type: getLocalizedText({ key: "globalSearchSyntaxOperatorType", fallback: "Type" }),
      folder: getLocalizedText({ key: "globalSearchSyntaxOperatorFolder", fallback: "Folder" }),
      tag: getLocalizedText({ key: "globalSearchSyntaxOperatorTag", fallback: "Tag" }),
      is: getLocalizedText({ key: "globalSearchSyntaxOperatorIs", fallback: "State" }),
      level: getLocalizedText({ key: "globalSearchSyntaxOperatorLevel", fallback: "Level" }),
      date: getLocalizedText({ key: "globalSearchSyntaxOperatorDate", fallback: "Date" }),
    }),
    [getLocalizedText],
  )

  const globalSearchSuggestionOperatorLabels = useMemo(
    () => ({
      type: getLocalizedText({ key: "globalSearchSyntaxOperatorType", fallback: "Type" }),
      folder: getLocalizedText({ key: "globalSearchSyntaxOperatorFolder", fallback: "Folder" }),
      tag: getLocalizedText({ key: "globalSearchSyntaxOperatorTag", fallback: "Tag" }),
      is: getLocalizedText({ key: "globalSearchSyntaxOperatorIs", fallback: "State" }),
      level: getLocalizedText({ key: "globalSearchSyntaxOperatorLevel", fallback: "Level" }),
      date: getLocalizedText({ key: "globalSearchSyntaxOperatorDate", fallback: "Date" }),
    }),
    [getLocalizedText],
  )

  const globalSearchSuggestionLevelDescription = useMemo(
    () =>
      getLocalizedText({
        key: "globalSearchSyntaxSuggestionLevelDesc",
        fallback: "Filter outline level (0 = user query)",
      }),
    [getLocalizedText],
  )

  const globalSearchSuggestionDateDescription = useMemo(
    () =>
      getLocalizedText({
        key: "globalSearchSyntaxSuggestionDateDesc",
        fallback: "Filter by recent days (conversations and prompts only)",
      }),
    [getLocalizedText],
  )

  const globalSearchSuggestionOperatorDescriptions = useMemo(
    () => ({
      type: getLocalizedText({
        key: "globalSearchSyntaxSuggestionTypeDesc",
        fallback: "Filter by result type",
      }),
      folder: getLocalizedText({
        key: "globalSearchSyntaxSuggestionFolderDesc",
        fallback: "Filter by folder or category",
      }),
      tag: getLocalizedText({
        key: "globalSearchSyntaxSuggestionTagDesc",
        fallback: "Filter by tag name",
      }),
      is: getLocalizedText({
        key: "globalSearchSyntaxSuggestionIsDesc",
        fallback: "Filter by status",
      }),
      level: getLocalizedText({
        key: "globalSearchSyntaxSuggestionLevelDesc",
        fallback: "Filter outline level (0 = user query)",
      }),
      date: getLocalizedText({
        key: "globalSearchSyntaxSuggestionDateDesc",
        fallback: "Filter by recent days (conversations and prompts only)",
      }),
    }),
    [getLocalizedText],
  )

  const globalSearchSuggestionTypeDescriptions = useMemo(
    () => ({
      outline: getLocalizedText({ key: "globalSearchCategoryOutline", fallback: "Outline" }),
      conversations: getLocalizedText({
        key: "globalSearchCategoryConversations",
        fallback: "Conversations",
      }),
      prompts: getLocalizedText({ key: "globalSearchCategoryPrompts", fallback: "Prompts" }),
      settings: getLocalizedText({ key: "globalSearchCategorySettings", fallback: "Settings" }),
    }),
    [getLocalizedText],
  )

  const globalSearchSuggestionIsDescriptions = useMemo(
    () => ({
      pinned: getLocalizedText({ key: "globalSearchSyntaxPinned", fallback: "Pinned" }),
      unpinned: getLocalizedText({ key: "globalSearchSyntaxUnpinned", fallback: "Unpinned" }),
    }),
    [getLocalizedText],
  )

  const globalSearchSyntaxDiagnosticMessages = useMemo(
    () => ({
      unknownOperator: getLocalizedText({
        key: "globalSearchSyntaxDiagnosticUnknownOperator",
        fallback: "Unknown operator",
      }),
      invalidValue: getLocalizedText({
        key: "globalSearchSyntaxDiagnosticInvalidValue",
        fallback: "Invalid filter value",
      }),
      conflict: getLocalizedText({
        key: "globalSearchSyntaxDiagnosticConflict",
        fallback: "Conflicting filters removed",
      }),
    }),
    [getLocalizedText],
  )

  const globalSearchSyntaxHelpTitle = useMemo(
    () =>
      getLocalizedText({
        key: "globalSearchSyntaxHelpTitle",
        fallback: "Search syntax examples",
      }),
    [getLocalizedText],
  )

  const globalSearchSyntaxHelpDescription = useMemo(
    () =>
      getLocalizedText({
        key: "globalSearchSyntaxHelpDesc",
        fallback: "Click to insert. Keywords are English-only.",
      }),
    [getLocalizedText],
  )

  const globalSearchSyntaxHelpItems = useMemo<GlobalSearchSyntaxSuggestionItem[]>(
    () => [
      {
        id: "help:type:outline",
        token: "type:outline",
        label: "type:outline",
        description: globalSearchSuggestionTypeDescriptions.outline,
      },
      {
        id: "help:type:conversations",
        token: "type:conversations",
        label: "type:conversations",
        description: globalSearchSuggestionTypeDescriptions.conversations,
      },
      {
        id: "help:type:prompts",
        token: "type:prompts",
        label: "type:prompts",
        description: globalSearchSuggestionTypeDescriptions.prompts,
      },
      {
        id: "help:type:settings",
        token: "type:settings",
        label: "type:settings",
        description: globalSearchSuggestionTypeDescriptions.settings,
      },
      {
        id: "help:is:pinned",
        token: "is:pinned",
        label: "is:pinned",
        description: globalSearchSuggestionIsDescriptions.pinned,
      },
      {
        id: "help:is:unpinned",
        token: "is:unpinned",
        label: "is:unpinned",
        description: globalSearchSuggestionIsDescriptions.unpinned,
      },
      {
        id: "help:level:0",
        token: "level:0",
        label: "level:0",
        description: getLocalizedText({
          key: "globalSearchSyntaxSuggestionLevelQueryDesc",
          fallback: "Outline user query",
        }),
      },
      {
        id: "help:date:7d",
        token: "date:7d",
        label: "date:7d",
        description: globalSearchSuggestionDateDescription,
      },
      {
        id: "help:date:30d",
        token: "date:30d",
        label: "date:30d",
        description: globalSearchSuggestionDateDescription,
      },
      {
        id: "help:folder:inbox",
        token: "folder:inbox",
        label: "folder:inbox",
        description: globalSearchSuggestionOperatorDescriptions.folder,
      },
      {
        id: "help:tag:work",
        token: "tag:work",
        label: "tag:work",
        description: globalSearchSuggestionOperatorDescriptions.tag,
      },
    ],
    [
      getLocalizedText,
      globalSearchSuggestionDateDescription,
      globalSearchSuggestionIsDescriptions.pinned,
      globalSearchSuggestionIsDescriptions.unpinned,
      globalSearchSuggestionOperatorDescriptions.folder,
      globalSearchSuggestionOperatorDescriptions.tag,
      globalSearchSuggestionTypeDescriptions.conversations,
      globalSearchSuggestionTypeDescriptions.outline,
      globalSearchSuggestionTypeDescriptions.prompts,
      globalSearchSuggestionTypeDescriptions.settings,
    ],
  )

  const globalSearchListboxLabel = useMemo(
    () =>
      getLocalizedText({
        key: "globalSearchResultsLabel",
        fallback: "Global search results",
      }),
    [getLocalizedText],
  )

  const globalSearchPromptPreviewPosition = useMemo(() => {
    if (!globalSearchPromptPreview || typeof window === "undefined") {
      return null
    }

    const viewportPadding = 16
    const gap = 12
    const previewWidth = Math.max(280, Math.min(420, window.innerWidth - viewportPadding * 2))
    const previewEstimatedHeight = Math.max(
      220,
      Math.min(420, window.innerHeight - viewportPadding * 2),
    )

    let left = globalSearchPromptPreview.anchorRect.right + gap
    if (left + previewWidth > window.innerWidth - viewportPadding) {
      left = globalSearchPromptPreview.anchorRect.left - previewWidth - gap
    }

    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - previewWidth - viewportPadding),
    )

    const top = Math.max(
      viewportPadding,
      Math.min(
        globalSearchPromptPreview.anchorRect.top,
        window.innerHeight - viewportPadding - previewEstimatedHeight,
      ),
    )

    return { top, left }
  }, [globalSearchPromptPreview])

  const activeGlobalSearchFilterChips = useMemo(
    () =>
      activeGlobalSearchSyntaxFilters
        .slice(0, GLOBAL_SEARCH_FILTER_CHIP_MAX_COUNT)
        .map((filter) => ({
          id: filter.id,
          key: filter.key,
          value: filter.value,
          label: `${globalSearchFilterChipLabelPrefixMap[filter.key]}: ${filter.value}`,
        })),
    [activeGlobalSearchSyntaxFilters, globalSearchFilterChipLabelPrefixMap],
  )

  const hasOverflowGlobalSearchFilterChips =
    activeGlobalSearchSyntaxFilters.length > GLOBAL_SEARCH_FILTER_CHIP_MAX_COUNT

  const globalSearchSyntaxSuggestions = useMemo<GlobalSearchSyntaxSuggestionItem[]>(() => {
    if (!isGlobalSettingsSearchOpen) {
      return []
    }

    const trailingTokenInfo = getGlobalSearchTrailingTokenInfo(settingsSearchInputValue)
    const trailingToken = trailingTokenInfo?.token || ""
    const hasTrailingToken = trailingToken.length > 0
    const normalizedTrailingToken = trailingToken.toLowerCase()
    const trailingTokenOperatorMatch = trailingToken.match(/^([a-z]+):(.*)$/i)

    if (trailingTokenOperatorMatch) {
      const operator = trailingTokenOperatorMatch[1].toLowerCase() as GlobalSearchSyntaxOperator
      if (!GLOBAL_SEARCH_SYNTAX_OPERATORS.includes(operator)) {
        return []
      }

      const rawValue = trailingTokenOperatorMatch[2] || ""
      const normalizedRawValue = rawValue.toLowerCase()
      const suggestions: GlobalSearchSyntaxSuggestionItem[] = []
      const appendSuggestion = (candidate: GlobalSearchSyntaxSuggestionItem) => {
        if (suggestions.some((item) => item.id === candidate.id)) {
          return
        }
        suggestions.push(candidate)
      }

      if (operator === "type") {
        GLOBAL_SEARCH_TYPE_FILTER_VALUES.forEach((value) => {
          if (rawValue && !value.toLowerCase().startsWith(normalizedRawValue)) {
            return
          }

          appendSuggestion({
            id: `type:${value}`,
            token: `type:${value}`,
            label: `type:${value} · ${globalSearchSuggestionTypeDescriptions[value]}`,
            description: globalSearchSuggestionOperatorDescriptions.type,
          })
        })
      } else if (operator === "is") {
        const value = "pinned"
        if (!rawValue || value.startsWith(normalizedRawValue)) {
          appendSuggestion({
            id: "is:pinned",
            token: "is:pinned",
            label: `is:pinned · ${globalSearchSuggestionIsDescriptions.pinned}`,
            description: globalSearchSuggestionOperatorDescriptions.is,
          })
        }

        const unpinnedValue = "unpinned"
        if (!rawValue || unpinnedValue.startsWith(normalizedRawValue)) {
          appendSuggestion({
            id: "is:unpinned",
            token: "is:unpinned",
            label: `is:unpinned · ${globalSearchSuggestionIsDescriptions.unpinned}`,
            description: globalSearchSuggestionOperatorDescriptions.is,
          })
        }
      } else if (operator === "level") {
        GLOBAL_SEARCH_LEVEL_FILTER_VALUES.forEach((value) => {
          if (rawValue && !value.startsWith(normalizedRawValue)) {
            return
          }

          const isQueryLevel = value === "0"
          appendSuggestion({
            id: `level:${value}`,
            token: `level:${value}`,
            label: `level:${value}`,
            description: isQueryLevel
              ? getLocalizedText({
                  key: "globalSearchSyntaxSuggestionLevelQueryDesc",
                  fallback: "Outline user query",
                })
              : globalSearchSuggestionLevelDescription,
          })
        })
      } else if (operator === "date") {
        const dynamicDayMatch = normalizedRawValue.match(/^(\d{0,3})d?$/)
        if (dynamicDayMatch) {
          const dayValue = dynamicDayMatch[1]
          if (dayValue) {
            const dynamicToken = `${dayValue}d`
            const dynamicDays = Number(dayValue)
            if (dynamicDays > 0) {
              appendSuggestion({
                id: `date:${dynamicToken}`,
                token: `date:${dynamicToken}`,
                label: `date:${dynamicToken}`,
                description: globalSearchSuggestionDateDescription,
              })
            }
          }
        }

        GLOBAL_SEARCH_DATE_FILTER_SHORTCUT_VALUES.forEach((value) => {
          if (rawValue && !value.startsWith(normalizedRawValue)) {
            return
          }

          appendSuggestion({
            id: `date:${value}`,
            token: `date:${value}`,
            label: `date:${value}`,
            description: globalSearchSuggestionDateDescription,
          })
        })
      }

      if (operator === "folder") {
        const folderCandidates = new Map<string, string>()
        filteredGlobalSearchResults.forEach((item) => {
          const candidate = (item.folderName || "").trim()
          if (!candidate) {
            return
          }

          const normalizedCandidate = candidate.toLowerCase()
          if (rawValue && !normalizedCandidate.includes(normalizedRawValue)) {
            return
          }

          folderCandidates.set(normalizedCandidate, candidate)
        })

        Array.from(folderCandidates.values())
          .slice(0, GLOBAL_SEARCH_SYNTAX_SUGGESTION_LIMIT)
          .forEach((candidate) => {
            const needsQuote = /\s/.test(candidate)
            const filterToken = needsQuote ? `folder:"${candidate}"` : `folder:${candidate}`

            appendSuggestion({
              id: `folder:${candidate.toLowerCase()}`,
              token: filterToken,
              label: `folder:${candidate}`,
              description: globalSearchSuggestionOperatorDescriptions.folder,
            })
          })
      }

      if (operator === "tag") {
        const tagCandidates = new Map<string, string>()
        filteredGlobalSearchResults.forEach((item) => {
          const candidateTags = item.tagNames || item.tagBadges?.map((tag) => tag.name) || []
          candidateTags.forEach((tagName) => {
            const candidate = tagName.trim()
            if (!candidate) {
              return
            }

            const normalizedCandidate = candidate.toLowerCase()
            if (rawValue && !normalizedCandidate.includes(normalizedRawValue)) {
              return
            }

            tagCandidates.set(normalizedCandidate, candidate)
          })
        })

        Array.from(tagCandidates.values())
          .slice(0, GLOBAL_SEARCH_SYNTAX_SUGGESTION_LIMIT)
          .forEach((candidate) => {
            const needsQuote = /\s/.test(candidate)
            const filterToken = needsQuote ? `tag:"${candidate}"` : `tag:${candidate}`

            appendSuggestion({
              id: `tag:${candidate.toLowerCase()}`,
              token: filterToken,
              label: `tag:${candidate}`,
              description: globalSearchSuggestionOperatorDescriptions.tag,
            })
          })
      }

      return suggestions.slice(0, GLOBAL_SEARCH_SYNTAX_SUGGESTION_LIMIT)
    }

    const operatorSuggestions = GLOBAL_SEARCH_SYNTAX_OPERATORS.filter((operator) => {
      if (!hasTrailingToken) {
        return true
      }
      return operator.startsWith(normalizedTrailingToken)
    }).map((operator) => ({
      id: `operator:${operator}`,
      token: `${operator}:`,
      label: `${operator}: ${globalSearchSuggestionOperatorLabels[operator]}`,
      description: globalSearchSuggestionOperatorDescriptions[operator],
    }))

    return operatorSuggestions.slice(0, GLOBAL_SEARCH_SYNTAX_SUGGESTION_LIMIT)
  }, [
    filteredGlobalSearchResults,
    globalSearchSuggestionOperatorDescriptions,
    globalSearchSuggestionOperatorLabels,
    globalSearchSuggestionDateDescription,
    globalSearchSuggestionIsDescriptions,
    globalSearchSuggestionLevelDescription,
    globalSearchSuggestionTypeDescriptions,
    getLocalizedText,
    isGlobalSettingsSearchOpen,
    settingsSearchInputValue,
  ])

  const shouldShowGlobalSearchSyntaxSuggestions =
    globalSearchSyntaxSuggestions.length > 0 &&
    Boolean(getGlobalSearchTrailingTokenInfo(settingsSearchInputValue)?.token)

  const applyGlobalSearchSyntaxSuggestion = useCallback(
    (suggestion: GlobalSearchSyntaxSuggestionItem) => {
      const trailingTokenInfo = getGlobalSearchTrailingTokenInfo(settingsSearchInputValue)
      const shouldAppendTrailingSpace = !suggestion.token.endsWith(":")
      const nextToken = `${suggestion.token}${shouldAppendTrailingSpace ? " " : ""}`
      const nextValue = trailingTokenInfo
        ? `${settingsSearchInputValue.slice(0, trailingTokenInfo.start)}${nextToken}`
        : `${settingsSearchInputValue}${settingsSearchInputValue.endsWith(" ") ? "" : " "}${nextToken}`

      syncSettingsSearchInputAndQuery(nextValue)
      setActiveSearchSyntaxSuggestionIndex(-1)
      setSettingsSearchActiveIndex(0)

      window.requestAnimationFrame(() => {
        const inputElement = settingsSearchInputRef.current
        if (!inputElement) {
          return
        }

        const cursorPosition = nextValue.length
        inputElement.focus({ preventScroll: true })
        inputElement.setSelectionRange(cursorPosition, cursorPosition)
      })
    },
    [settingsSearchInputValue, syncSettingsSearchInputAndQuery],
  )

  const applyGlobalSearchSyntaxHelpItem = useCallback(
    (item: GlobalSearchSyntaxSuggestionItem) => {
      applyGlobalSearchSyntaxSuggestion(item)
      setShowGlobalSearchSyntaxHelp(false)
    },
    [applyGlobalSearchSyntaxSuggestion],
  )

  const handleRemoveGlobalSearchFilterChip = useCallback(
    (chipId: string) => {
      const nextFilters = activeGlobalSearchSyntaxFilters.filter((filter) => filter.id !== chipId)
      const nextQuery = stringifyGlobalSearchQuery({
        plainQuery: activeGlobalSearchPlainQuery,
        filters: nextFilters,
      })

      syncSettingsSearchInputAndQuery(nextQuery)
      setActiveSearchSyntaxSuggestionIndex(-1)
      setSettingsSearchActiveIndex(0)
    },
    [
      activeGlobalSearchPlainQuery,
      activeGlobalSearchSyntaxFilters,
      syncSettingsSearchInputAndQuery,
    ],
  )

  const clearAllGlobalSearchSyntaxFilters = useCallback(() => {
    syncSettingsSearchInputAndQuery(activeGlobalSearchPlainQuery)
    setActiveSearchSyntaxSuggestionIndex(-1)
    setSettingsSearchActiveIndex(0)
  }, [activeGlobalSearchPlainQuery, syncSettingsSearchInputAndQuery])

  const activeGlobalSearchContext = useMemo(() => {
    if (activeVisibleGlobalSearchIndex < 0) {
      return null
    }

    const activeItem = visibleGlobalSearchResults[activeVisibleGlobalSearchIndex]
    if (!activeItem) {
      return null
    }

    const label = resolvedGlobalSearchResultCategoryLabels[activeItem.category]
    const currentItemText = formatLocalizedText(
      {
        key: "globalSearchContextCurrentItem",
        fallback: "第 {current} 项",
      },
      {
        current: String(activeVisibleGlobalSearchIndex + 1),
      },
    )

    if (activeGlobalSearchCategory !== "all") {
      return {
        label,
        meta: `${currentItemText} · ${formatLocalizedText(
          {
            key: "globalSearchContextTotalItems",
            fallback: "共 {total} 项",
          },
          {
            total: String(visibleGlobalSearchResults.length),
          },
        )}`,
      }
    }

    const activeGroup = groupedGlobalSearchResults.find(
      (group) => group.category === activeItem.category,
    )

    if (!activeGroup) {
      return {
        label,
        meta: `${currentItemText} · ${formatLocalizedText(
          {
            key: "globalSearchContextTotalItems",
            fallback: "共 {total} 项",
          },
          {
            total: String(visibleGlobalSearchResults.length),
          },
        )}`,
      }
    }

    return {
      label,
      meta: `${currentItemText} · ${formatLocalizedText(
        {
          key: "globalSearchContextShownProgress",
          fallback: "已显示 {shown}/{total}",
        },
        {
          shown: String(activeGroup.items.length),
          total: String(activeGroup.totalCount),
        },
      )}`,
    }
  }, [
    activeGlobalSearchCategory,
    activeVisibleGlobalSearchIndex,
    formatLocalizedText,
    groupedGlobalSearchResults,
    resolvedGlobalSearchResultCategoryLabels,
    visibleGlobalSearchResults,
  ])

  const closeSettingsModal = useCallback(() => {
    isSettingsOpenRef.current = false
    setIsSettingsOpen(false)

    const currentSettings = settingsRef.current
    if (!currentSettings?.panel?.edgeSnap) return

    let panel: HTMLElement | null = null
    const shadowHost = document.querySelector("plasmo-csui, #ophel-userscript-root")
    if (shadowHost?.shadowRoot) {
      panel = shadowHost.shadowRoot.querySelector(".gh-main-panel") as HTMLElement
    }
    if (!panel) {
      panel = document.querySelector(".gh-main-panel") as HTMLElement
    }

    if (!panel) return

    const isAlreadySnapped =
      panel.classList.contains("edge-snapped-left") ||
      panel.classList.contains("edge-snapped-right")

    if (isAlreadySnapped) return

    const rect = panel.getBoundingClientRect()
    const snapThreshold = currentSettings?.panel?.edgeSnapThreshold ?? 30

    if (rect.left < snapThreshold) {
      setEdgeSnapState("left")
    } else if (window.innerWidth - rect.right < snapThreshold) {
      setEdgeSnapState("right")
    }
  }, [])

  const openGlobalSettingsSearch = useCallback(
    (source: GlobalSearchOpenSource = "ui") => {
      globalSearchOpenSourceRef.current = source

      if (isSettingsOpenRef.current) {
        searchOpenedFromSettingsRef.current = true
        closeSettingsModal()
      } else {
        searchOpenedFromSettingsRef.current = false
      }

      if (edgeSnapState && settingsRef.current?.panel?.edgeSnap) {
        setIsEdgePeeking(true)
      }

      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && activeElement !== document.body) {
        settingsSearchRestoreFocusRef.current = activeElement
      } else {
        settingsSearchRestoreFocusRef.current = null
      }

      clearSettingsSearchInputDebounceTimer()
      setSettingsSearchInputValue("")
      setSettingsSearchQuery("")
      setShowGlobalSearchSyntaxHelp(false)
      setActiveSearchSyntaxSuggestionIndex(-1)
      setActiveGlobalSearchCategory("all")
      setSettingsSearchActiveIndex(0)
      setSettingsSearchHoverLocked(false)
      setSettingsSearchNavigationMode("pointer")
      setExpandedGlobalSearchCategories({})
      settingsSearchWheelFreezeUntilRef.current = 0
      setIsGlobalSettingsSearchOpen(true)
    },
    [clearSettingsSearchInputDebounceTimer, closeSettingsModal, edgeSnapState],
  )

  const closeGlobalSettingsSearch = useCallback(
    (options?: { restoreFocus?: boolean; reopenSettings?: boolean }) => {
      const shouldRestoreFocus = options?.restoreFocus ?? true
      const shouldReopenSettings = options?.reopenSettings ?? false
      const restoreElement = settingsSearchRestoreFocusRef.current
      settingsSearchRestoreFocusRef.current = null
      searchOpenedFromSettingsRef.current = false

      clearSettingsSearchInputDebounceTimer()
      setIsGlobalSettingsSearchOpen(false)
      setActiveGlobalSearchCategory("all")
      setSettingsSearchInputValue("")
      setSettingsSearchQuery("")
      setShowGlobalSearchSyntaxHelp(false)
      setActiveSearchSyntaxSuggestionIndex(-1)
      setSettingsSearchActiveIndex(0)
      setSettingsSearchHoverLocked(false)
      setSettingsSearchNavigationMode("pointer")
      setExpandedGlobalSearchCategories({})
      settingsSearchWheelFreezeUntilRef.current = 0

      if (shouldReopenSettings) {
        isSettingsOpenRef.current = true

        if (edgeSnapState && settingsRef.current?.panel?.edgeSnap) {
          setIsEdgePeeking(true)
        }

        setIsSettingsOpen(true)
        return
      }

      if (!shouldRestoreFocus || !restoreElement || !restoreElement.isConnected) {
        return
      }

      window.requestAnimationFrame(() => {
        if (!restoreElement.isConnected) {
          return
        }

        try {
          restoreElement.focus({ preventScroll: true })
        } catch {
          restoreElement.focus()
        }
      })
    },
    [clearSettingsSearchInputDebounceTimer, edgeSnapState],
  )

  const openSettingsModal = useCallback(() => {
    if (isGlobalSettingsSearchOpen) {
      closeGlobalSettingsSearch({ restoreFocus: false })
    }

    searchOpenedFromSettingsRef.current = false
    isSettingsOpenRef.current = true

    if (edgeSnapState && settingsRef.current?.panel?.edgeSnap) {
      setIsEdgePeeking(true)
    }

    setIsSettingsOpen(true)
  }, [closeGlobalSettingsSearch, edgeSnapState, isGlobalSettingsSearchOpen])

  const navigateToSearchResult = useCallback(
    (item: GlobalSearchResultItem) => {
      closeGlobalSettingsSearch({ restoreFocus: false })

      if (item.category === "settings" && item.settingId) {
        window.dispatchEvent(
          new CustomEvent("ophel:navigateSettingsPage", {
            detail: { settingId: item.settingId },
          }),
        )
        return
      }

      if (item.category === "outline" && item.outlineTarget && outlineManager) {
        const findOutlineNodeByIndex = (
          nodes: OutlineNode[],
          targetIndex: number,
        ): OutlineNode | null => {
          for (const node of nodes) {
            if (node.index === targetIndex) {
              return node
            }
            if (node.children && node.children.length > 0) {
              const found = findOutlineNodeByIndex(node.children, targetIndex)
              if (found) return found
            }
          }
          return null
        }

        const targetNode = findOutlineNodeByIndex(
          outlineManager.getTree(),
          item.outlineTarget.index,
        )
        let targetElement = targetNode?.element || null

        if (!targetElement || !targetElement.isConnected) {
          if (item.outlineTarget.isUserQuery && item.outlineTarget.queryIndex) {
            const found = outlineManager.findUserQueryElement(
              item.outlineTarget.queryIndex,
              item.outlineTarget.text,
            )
            if (found) {
              targetElement = found
            }
          } else {
            const found = outlineManager.findElementByHeading(
              item.outlineTarget.level,
              item.outlineTarget.text,
            )
            if (found) {
              targetElement = found
            }
          }
        }

        if (targetElement && targetElement.isConnected) {
          targetElement.scrollIntoView({
            behavior: "instant",
            block: "start",
            __bypassLock: true,
          } as ScrollIntoViewOptions & { __bypassLock?: boolean })
          targetElement.classList.add("outline-highlight")
          setTimeout(() => targetElement?.classList.remove("outline-highlight"), 2000)
          return
        }

        if (item.outlineTarget.isGhost && item.outlineTarget.scrollTop !== undefined) {
          const scrollContainer = outlineManager.getScrollContainer()
          if (scrollContainer) {
            scrollContainer.scrollTo({
              top: item.outlineTarget.scrollTop,
              behavior: "smooth",
            })
            showToast(t("bookmarkContentMissing") || "收藏内容不存在，已跳转到保存位置", 3000)
            return
          }
        }

        showToast(t("bookmarkContentMissing") || "收藏内容已被删除或折叠", 2000)
        return
      }

      if (item.category === "prompts" && item.promptId) {
        const targetPrompt = promptsSnapshot.find((prompt) => prompt.id === item.promptId)
        if (!targetPrompt) {
          return
        }

        const openPromptsTab = () => {
          setIsPanelOpen(true)

          const tabOrder = settings?.features?.order || DEFAULT_SETTINGS.features.order
          const promptsTabIndex = tabOrder.indexOf(TAB_IDS.PROMPTS)
          if (promptsTabIndex >= 0) {
            window.dispatchEvent(
              new CustomEvent("ophel:switchTab", {
                detail: { index: promptsTabIndex },
              }),
            )
          }
        }

        const locatePrompt = () => {
          setSelectedPrompt(null)
          openPromptsTab()

          const pendingDetail = {
            promptId: targetPrompt.id,
          }
          const ophelWindow = window as Window & {
            __ophelPendingLocatePrompt?: typeof pendingDetail | null
          }
          ophelWindow.__ophelPendingLocatePrompt = pendingDetail

          window.dispatchEvent(
            new CustomEvent("ophel:locatePrompt", {
              detail: pendingDetail,
            }),
          )
        }

        const promptEnterBehavior = settings?.globalSearch?.promptEnterBehavior ?? "smart"
        if (promptEnterBehavior === "locate") {
          locatePrompt()
          return
        }

        if (!promptManager) {
          openPromptsTab()
          return
        }

        if (hasPromptVariables(targetPrompt.content)) {
          setSelectedPrompt(null)
          openPromptsTab()

          const pendingDetail = {
            promptId: targetPrompt.id,
            submitAfterInsert: false,
          }
          const ophelWindow = window as Window & {
            __ophelPendingPromptVariableDialog?: typeof pendingDetail | null
          }
          ophelWindow.__ophelPendingPromptVariableDialog = pendingDetail

          window.dispatchEvent(
            new CustomEvent("ophel:openPromptVariableDialog", {
              detail: pendingDetail,
            }),
          )
          return
        }

        void (async () => {
          const inserted = await promptManager.insertPrompt(targetPrompt.content)
          if (inserted) {
            promptManager.updateLastUsed(targetPrompt.id)
            setSelectedPrompt(targetPrompt)
            showToast(`${t("inserted") || "已插入"}: ${targetPrompt.title}`)
            return
          }

          locatePrompt()
          showToast(t("insertFailed") || "未找到输入框，请点击输入框后重试")
        })()

        return
      }

      if (item.category === "conversations" && item.conversationId) {
        adapter?.navigateToConversation(item.conversationId, item.conversationUrl)
      }
    },
    [adapter, closeGlobalSettingsSearch, outlineManager, promptManager, promptsSnapshot, settings],
  )

  useEffect(() => {
    if (!isGlobalSettingsSearchOpen) {
      return
    }

    settingsSearchInputRef.current?.focus()
    settingsSearchInputRef.current?.select()
  }, [isGlobalSettingsSearchOpen])

  useEffect(() => {
    if (!isGlobalSettingsSearchOpen) {
      return
    }

    if (globalSearchOpenSourceRef.current !== "ui") {
      return
    }

    tryShowGlobalSearchShortcutNudge()
  }, [isGlobalSettingsSearchOpen, tryShowGlobalSearchShortcutNudge])

  useEffect(() => {
    return () => {
      clearGlobalSearchNudgeHideTimer()
    }
  }, [clearGlobalSearchNudgeHideTimer])

  useEffect(() => {
    const handleOpenSearchShortcut = (event: KeyboardEvent) => {
      if (isGlobalSettingsSearchOpen) {
        return
      }

      // 非 Shift 按键会中断双击 Shift 检测，防止输入时误触
      if (event.key !== "Shift") {
        lastShiftPressedAtRef.current = 0
      }

      const isSearchHotkey =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "k"

      if (isSearchHotkey) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        markGlobalSearchShortcutUsed()
        openGlobalSettingsSearch("shortcut")
        return
      }

      if (event.key !== "Shift" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      const now = Date.now()
      if (now - lastShiftPressedAtRef.current <= 360) {
        event.preventDefault()
        event.stopPropagation()
        lastShiftPressedAtRef.current = 0
        markGlobalSearchShortcutUsed()
        openGlobalSettingsSearch("shortcut")
        return
      }

      lastShiftPressedAtRef.current = now
    }

    window.addEventListener("keydown", handleOpenSearchShortcut, true)
    return () => {
      window.removeEventListener("keydown", handleOpenSearchShortcut, true)
    }
  }, [isGlobalSettingsSearchOpen, markGlobalSearchShortcutUsed, openGlobalSettingsSearch])

  useEffect(() => {
    const handleOpenSearchEvent = () => {
      openGlobalSettingsSearch("event")
    }

    window.addEventListener("ophel:openSettingsSearch", handleOpenSearchEvent)
    return () => {
      window.removeEventListener("ophel:openSettingsSearch", handleOpenSearchEvent)
    }
  }, [openGlobalSettingsSearch])

  useEffect(() => {
    if (!isGlobalSettingsSearchOpen) {
      return
    }

    const handleSearchNavigation = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()

        if (showGlobalSearchSyntaxHelp) {
          setShowGlobalSearchSyntaxHelp(false)
          return
        }

        const shouldReturnToSettings = searchOpenedFromSettingsRef.current
        closeGlobalSettingsSearch({
          restoreFocus: !shouldReturnToSettings,
          reopenSettings: shouldReturnToSettings,
        })
        return
      }

      if (event.key === "Tab") {
        event.preventDefault()
        event.stopPropagation()

        const currentIndex = GLOBAL_SEARCH_CATEGORY_DEFINITIONS.findIndex(
          (category) => category.id === activeGlobalSearchCategory,
        )

        if (currentIndex < 0) {
          setActiveGlobalSearchCategory("all")
          setSettingsSearchActiveIndex(0)
          setSettingsSearchHoverLocked(false)
          setSettingsSearchNavigationMode("keyboard")
          return
        }

        const categoriesLength = GLOBAL_SEARCH_CATEGORY_DEFINITIONS.length
        const nextIndex = event.shiftKey
          ? (currentIndex - 1 + categoriesLength) % categoriesLength
          : (currentIndex + 1) % categoriesLength

        setActiveGlobalSearchCategory(GLOBAL_SEARCH_CATEGORY_DEFINITIONS[nextIndex].id)
        setSettingsSearchActiveIndex(0)
        setSettingsSearchHoverLocked(false)
        setSettingsSearchNavigationMode("keyboard")
        return
      }

      if (shouldShowGlobalSearchSyntaxSuggestions) {
        if (event.key === "ArrowDown") {
          event.preventDefault()
          event.stopPropagation()
          setActiveSearchSyntaxSuggestionIndex((previousIndex) => {
            if (globalSearchSyntaxSuggestions.length === 0) {
              return -1
            }

            const nextIndex = previousIndex + 1
            if (nextIndex >= globalSearchSyntaxSuggestions.length) {
              return 0
            }
            return nextIndex
          })
          return
        }

        if (event.key === "ArrowUp") {
          event.preventDefault()
          event.stopPropagation()
          setActiveSearchSyntaxSuggestionIndex((previousIndex) => {
            if (globalSearchSyntaxSuggestions.length === 0) {
              return -1
            }

            const nextIndex = previousIndex - 1
            if (nextIndex < 0) {
              return globalSearchSyntaxSuggestions.length - 1
            }
            return nextIndex
          })
          return
        }

        if (event.key === "Enter" && activeSearchSyntaxSuggestionIndex >= 0) {
          const selectedSuggestion =
            globalSearchSyntaxSuggestions[activeSearchSyntaxSuggestionIndex]
          if (!selectedSuggestion) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          applyGlobalSearchSyntaxSuggestion(selectedSuggestion)
          return
        }
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        event.stopPropagation()
        setSettingsSearchHoverLocked(true)
        setSettingsSearchNavigationMode("keyboard")
        setSettingsSearchActiveIndex((prev) => {
          if (visibleGlobalSearchResults.length === 0) return 0
          return (prev + 1) % visibleGlobalSearchResults.length
        })
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        event.stopPropagation()
        setSettingsSearchHoverLocked(true)
        setSettingsSearchNavigationMode("keyboard")
        setSettingsSearchActiveIndex((prev) => {
          if (visibleGlobalSearchResults.length === 0) return 0
          return (prev - 1 + visibleGlobalSearchResults.length) % visibleGlobalSearchResults.length
        })
        return
      }

      if (event.key === "Enter") {
        if (visibleGlobalSearchResults.length === 0) return

        const selected =
          visibleGlobalSearchResults[settingsSearchActiveIndex] || visibleGlobalSearchResults[0]
        if (!selected) return

        if (!visibleGlobalSearchResults[settingsSearchActiveIndex]) {
          setSettingsSearchActiveIndex(0)
        }

        event.preventDefault()
        event.stopPropagation()
        navigateToSearchResult(selected)
      }
    }

    window.addEventListener("keydown", handleSearchNavigation, true)
    return () => {
      window.removeEventListener("keydown", handleSearchNavigation, true)
    }
  }, [
    activeGlobalSearchCategory,
    activeSearchSyntaxSuggestionIndex,
    applyGlobalSearchSyntaxSuggestion,
    showGlobalSearchSyntaxHelp,
    closeGlobalSettingsSearch,
    globalSearchSyntaxSuggestions,
    isGlobalSettingsSearchOpen,
    navigateToSearchResult,
    settingsSearchActiveIndex,
    shouldShowGlobalSearchSyntaxSuggestions,
    visibleGlobalSearchResults,
  ])

  useEffect(() => {
    if (visibleGlobalSearchResults.length === 0) {
      if (settingsSearchActiveIndex !== 0) {
        setSettingsSearchActiveIndex(0)
      }
      return
    }

    if (settingsSearchActiveIndex >= visibleGlobalSearchResults.length) {
      setSettingsSearchActiveIndex(0)
    }
  }, [settingsSearchActiveIndex, visibleGlobalSearchResults.length])

  useEffect(() => {
    if (!shouldShowGlobalSearchSyntaxSuggestions) {
      if (activeSearchSyntaxSuggestionIndex !== -1) {
        setActiveSearchSyntaxSuggestionIndex(-1)
      }
      return
    }

    if (activeSearchSyntaxSuggestionIndex >= globalSearchSyntaxSuggestions.length) {
      setActiveSearchSyntaxSuggestionIndex(globalSearchSyntaxSuggestions.length - 1)
    }
  }, [
    activeSearchSyntaxSuggestionIndex,
    globalSearchSyntaxSuggestions.length,
    shouldShowGlobalSearchSyntaxSuggestions,
  ])

  useEffect(
    () => () => {
      clearSettingsSearchInputDebounceTimer()
    },
    [clearSettingsSearchInputDebounceTimer],
  )

  useEffect(() => {
    if (!isGlobalSettingsSearchOpen || !showGlobalSearchSyntaxHelp) {
      return
    }

    const handleOutsidePress = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }

      if (globalSearchSyntaxHelpTriggerRef.current?.contains(target)) {
        return
      }

      if (globalSearchSyntaxHelpPopoverRef.current?.contains(target)) {
        return
      }

      setShowGlobalSearchSyntaxHelp(false)
    }

    document.addEventListener("mousedown", handleOutsidePress, true)

    return () => {
      document.removeEventListener("mousedown", handleOutsidePress, true)
    }
  }, [isGlobalSettingsSearchOpen, showGlobalSearchSyntaxHelp])

  useEffect(() => {
    if (!isGlobalSettingsSearchOpen) {
      hideGlobalSearchPromptPreview()
      return
    }

    if (settingsSearchNavigationMode !== "keyboard") {
      return
    }

    const activeItem = visibleGlobalSearchResults[settingsSearchActiveIndex]
    if (!activeItem || activeItem.category !== "prompts") {
      hideGlobalSearchPromptPreview()
      return
    }

    const container = settingsSearchResultsRef.current
    if (!container) {
      return
    }

    const anchorElement = container.querySelector<HTMLElement>(
      `[data-global-search-index=\"${settingsSearchActiveIndex}\"]`,
    )

    if (!anchorElement) {
      return
    }

    scheduleGlobalSearchPromptPreview({
      item: activeItem,
      anchorElement,
      delay: GLOBAL_SEARCH_PROMPT_PREVIEW_KEYBOARD_DELAY_MS,
      source: "keyboard",
    })
  }, [
    hideGlobalSearchPromptPreview,
    isGlobalSettingsSearchOpen,
    scheduleGlobalSearchPromptPreview,
    settingsSearchActiveIndex,
    settingsSearchNavigationMode,
    visibleGlobalSearchResults,
  ])

  useEffect(() => {
    setSettingsSearchActiveIndex(0)
    setSettingsSearchHoverLocked(false)
    setSettingsSearchNavigationMode("pointer")
    setExpandedGlobalSearchCategories({})
    settingsSearchWheelFreezeUntilRef.current = 0
    hideGlobalSearchPromptPreview()
  }, [activeGlobalSearchCategory, hideGlobalSearchPromptPreview, settingsSearchQuery])

  useEffect(() => {
    if (!isGlobalSettingsSearchOpen) {
      hideGlobalSearchPromptPreview()
    }
  }, [hideGlobalSearchPromptPreview, isGlobalSettingsSearchOpen])

  useEffect(() => {
    if (!globalSearchPromptPreview || !promptPreviewContainerRef.current) {
      return
    }

    initCopyButtons(promptPreviewContainerRef.current, { size: 14 })
  }, [globalSearchPromptPreview])

  useEffect(() => {
    if (!isGlobalSettingsSearchOpen || !globalSearchPromptPreview) {
      return
    }

    const handlePositionUpdate = () => {
      refreshGlobalSearchPromptPreviewAnchorRect()
    }

    const resultContainer = settingsSearchResultsRef.current
    window.addEventListener("resize", handlePositionUpdate)
    window.addEventListener("scroll", handlePositionUpdate, true)
    resultContainer?.addEventListener("scroll", handlePositionUpdate)

    return () => {
      window.removeEventListener("resize", handlePositionUpdate)
      window.removeEventListener("scroll", handlePositionUpdate, true)
      resultContainer?.removeEventListener("scroll", handlePositionUpdate)
    }
  }, [
    globalSearchPromptPreview,
    isGlobalSettingsSearchOpen,
    refreshGlobalSearchPromptPreviewAnchorRect,
  ])

  useEffect(() => {
    return () => {
      clearPromptPreviewTimer()
      clearPromptPreviewHideTimer()
    }
  }, [clearPromptPreviewHideTimer, clearPromptPreviewTimer])

  const ensureGlobalSearchItemVisible = useCallback(
    (container: HTMLDivElement, activeItem: HTMLElement) => {
      const containerRect = container.getBoundingClientRect()
      const activeRect = activeItem.getBoundingClientRect()
      const safeTopBoundary = containerRect.top + GLOBAL_SEARCH_KEYBOARD_SAFE_TOP
      const safeBottomBoundary = containerRect.bottom - GLOBAL_SEARCH_KEYBOARD_SAFE_BOTTOM

      if (activeRect.top < safeTopBoundary) {
        const delta = activeRect.top - safeTopBoundary
        container.scrollTop = Math.max(0, container.scrollTop + delta)
        return
      }

      if (activeRect.bottom > safeBottomBoundary) {
        const delta = activeRect.bottom - safeBottomBoundary
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
        container.scrollTop = Math.min(maxScrollTop, container.scrollTop + delta)
      }
    },
    [],
  )

  useEffect(() => {
    if (!isGlobalSettingsSearchOpen) {
      return
    }

    if (settingsSearchNavigationMode !== "keyboard") {
      return
    }

    const container = settingsSearchResultsRef.current
    if (!container) {
      return
    }

    const activeItem = container.querySelector<HTMLElement>(
      `[data-global-search-index=\"${settingsSearchActiveIndex}\"]`,
    )
    if (!activeItem) {
      return
    }

    ensureGlobalSearchItemVisible(container, activeItem)
  }, [
    ensureGlobalSearchItemVisible,
    isGlobalSettingsSearchOpen,
    settingsSearchActiveIndex,
    settingsSearchNavigationMode,
    visibleGlobalSearchResults,
  ])

  // 取消快捷键触发的延迟缩回计时器
  const cancelShortcutPeekTimer = useCallback(() => {
    if (shortcutPeekTimerRef.current) {
      clearTimeout(shortcutPeekTimerRef.current)
      shortcutPeekTimerRef.current = null
    }
  }, [])

  const handleInteractionChange = useCallback((isActive: boolean) => {
    isInteractionActiveRef.current = isActive
  }, [])

  // 当设置中的语言变化时，同步更新 i18n
  useEffect(() => {
    if (isSettingsHydrated && settings?.language) {
      setLanguage(settings.language)
      setI18nRenderTick((prev) => prev + 1)
    }
  }, [settings?.language, isSettingsHydrated])

  // 处理提示词选中
  const handlePromptSelect = useCallback((prompt: Prompt | null) => {
    setSelectedPrompt(prompt)
  }, [])

  // 清除选中的提示词
  const handleClearSelectedPrompt = useCallback(() => {
    setSelectedPrompt(null)
    // 同时清空输入框（可选）
    if (adapter) {
      adapter.clearTextarea()
    }
  }, [adapter])

  // 单独用 useEffect 同步 settings 变化到 manager
  useEffect(() => {
    if (outlineManager && settings) {
      outlineManager.updateSettings(settings.features?.outline)
    }
  }, [outlineManager, settings])

  // 同步 ConversationManager 设置
  useEffect(() => {
    if (conversationManager && settings) {
      conversationManager.updateSettings({
        syncUnpin: settings.features?.conversations?.syncUnpin ?? false,
      })
    }
  }, [conversationManager, settings])

  // 从 window 获取 main.ts 创建的全局 ThemeManager 实例
  // 这样只有一个 ThemeManager 实例，避免竞争条件
  const themeManager = useMemo(() => {
    const globalTM = window.__ophelThemeManager
    if (globalTM) {
      return globalTM
    }
    // 降级：如果 main.ts 还没创建，则临时创建一个（不应该发生）
    console.warn("[App] Global ThemeManager not found, creating fallback instance")
    // 使用当前站点的配置
    const currentAdapter = getAdapter()
    const siteId = currentAdapter?.getSiteId() || "_default"
    const fallbackTheme =
      settings?.theme?.sites?.[siteId as keyof typeof settings.theme.sites] ||
      settings?.theme?.sites?._default
    return new ThemeManager(
      fallbackTheme?.mode || "light", // 使用 settings 中的 mode，而非本地状态
      undefined,
      adapter,
      fallbackTheme?.lightStyleId || "google-gradient",
      fallbackTheme?.darkStyleId || "classic-dark",
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在初始化时获取
  }, [])

  // 使用 useSyncExternalStore 订阅 ThemeManager 的主题模式
  // 这让 ThemeManager 成为唯一的主题状态源，避免双重状态导致的同步问题
  const themeMode = useSyncExternalStore(themeManager.subscribe, themeManager.getSnapshot)

  // 动态注册主题变化回调，当页面主题变化时同步更新 settings
  // 注意：themeMode 由 useSyncExternalStore 自动订阅更新，不需要手动 setThemeMode
  useEffect(() => {
    const handleThemeModeChange = (
      mode: "light" | "dark",
      preference?: "light" | "dark" | "system",
    ) => {
      const nextPreference = preference || mode
      // 使用 ref 获取最新 settings，避免闭包捕获过期值
      const currentSettings = settingsRef.current
      const sites = currentSettings?.theme?.sites || {}

      // 获取当前站点 ID
      const currentAdapter = getAdapter()
      const siteId = currentAdapter?.getSiteId() || "_default"

      // 确保站点配置有完整的默认值，但优先使用已有配置
      const existingSite = sites[siteId as keyof typeof sites] || sites._default
      const siteConfig = {
        lightStyleId: "google-gradient",
        darkStyleId: "classic-dark",
        mode: "light" as const,
        ...existingSite, // 已有配置覆盖默认值
      }

      // 只更新 mode 字段，保留用户已有的主题配置
      setSettings({
        theme: {
          ...currentSettings?.theme,
          sites: {
            ...sites,
            [siteId]: {
              ...siteConfig,
              mode: nextPreference, // 最后更新 mode，确保生效
            },
          },
        },
      })
    }
    themeManager.setOnModeChange(handleThemeModeChange)

    // 清理时移除回调
    return () => {
      themeManager.setOnModeChange(undefined)
    }
  }, [themeManager, setSettings]) // 移除 settings?.theme 依赖，通过 ref 访问最新值

  const themeSites = settings?.theme?.sites
  const syncUnpin = settings?.features?.conversations?.syncUnpin
  const inlineBookmarkMode = settings?.features?.outline?.inlineBookmarkMode
  const hasSettings = Boolean(settings)
  const collapsedButtons = settings?.collapsedButtons || DEFAULT_SETTINGS.collapsedButtons
  const floatingToolbarEnabled =
    collapsedButtons.find((btn) => btn.id === "floatingToolbar")?.enabled ?? true
  const floatingToolbarOpen = settings?.floatingToolbar?.open ?? true
  const isScrollLockActive = settings?.panel?.preventAutoScroll ?? false
  const ghostBookmarkCount = outlineManager?.getGhostBookmarkIds().length ?? 0

  useEffect(() => {
    if (!floatingToolbarEnabled || !floatingToolbarOpen) {
      setFloatingToolbarMoveState(null)
      setIsFloatingToolbarClearOpen(false)
    }
  }, [floatingToolbarEnabled, floatingToolbarOpen])

  // 监听主题预置变化，动态更新 ThemeManager
  // Zustand 不存在 Plasmo useStorage 的缓存问题，无需启动保护期
  useEffect(() => {
    if (!isSettingsHydrated) return // 等待 hydration 完成

    // 使用当前站点的配置而非 _default
    const currentAdapter = getAdapter()
    const siteId = currentAdapter?.getSiteId() || "_default"
    const siteTheme = themeSites?.[siteId as keyof typeof themeSites] || themeSites?._default
    const lightId = siteTheme?.lightStyleId
    const darkId = siteTheme?.darkStyleId

    if (lightId && darkId) {
      themeManager.setPresets(lightId, darkId)
    }
  }, [themeSites, themeManager, isSettingsHydrated])

  // 监听自定义样式变化，同步到 ThemeManager
  useEffect(() => {
    if (!isSettingsHydrated) return
    themeManager.setCustomStyles(settings?.theme?.customStyles || [])
  }, [settings?.theme?.customStyles, themeManager, isSettingsHydrated])

  // 主题切换（异步处理，支持 View Transitions API 动画）
  // 不在这里更新 React 状态，由 ThemeManager 的 onModeChange 回调在动画完成后统一处理
  const handleThemeToggle = useCallback(
    async (event?: MouseEvent) => {
      await themeManager.toggle(event)
      // 状态更新由 onModeChange 回调处理，不在这里直接更新
      // 这避免了动画完成前触发 React 重渲染导致的闪烁
    },
    [themeManager],
  )

  // 启动主题监听器
  useEffect(() => {
    // 不再调用 updateMode，由 main.ts 负责初始应用
    // 只启动监听器，监听页面主题变化（浏览器自动切换等场景）
    themeManager.monitorTheme()

    return () => {
      // 清理监听器
      themeManager.stopMonitoring()
    }
  }, [themeManager])

  // 初始化
  useEffect(() => {
    if (promptManager) {
      promptManager.init()
    }
    if (conversationManager) {
      conversationManager.init()
    }
    if (outlineManager) {
      outlineManager.refresh()
      const refreshInterval = setInterval(() => {
        outlineManager.refresh()
      }, 2000)
      return () => {
        clearInterval(refreshInterval)
        conversationManager?.destroy()
      }
    }
  }, [promptManager, conversationManager, outlineManager])

  useEffect(() => {
    if (!conversationManager || typeof chrome === "undefined") return

    const handler = (message: any, _sender: any, sendResponse: any) => {
      if (message?.type === MSG_CLEAR_ALL_DATA) {
        conversationManager.destroy()
        sendResponse({ success: true })
        return true
      }
      return false
    }

    chrome.runtime.onMessage.addListener(handler)
    return () => {
      chrome.runtime.onMessage.removeListener(handler)
    }
  }, [conversationManager])

  useEffect(() => {
    if (!conversationManager) return
    conversationManager.updateSettings({
      syncUnpin: syncUnpin ?? false,
    })
  }, [conversationManager, syncUnpin])

  // 初始化页面内收藏图标
  useEffect(() => {
    if (!outlineManager || !adapter || !hasSettings) return

    const mode = inlineBookmarkMode || "always"
    const inlineBookmarkManager = new InlineBookmarkManager(outlineManager, adapter, mode)

    return () => {
      inlineBookmarkManager.cleanup()
    }
  }, [outlineManager, adapter, inlineBookmarkMode, hasSettings])

  // 滚动锁定切换
  const handleToggleScrollLock = useCallback(() => {
    const current = settingsRef.current
    if (!current) return
    const newState = !current.panel?.preventAutoScroll

    setSettings({
      panel: {
        ...current.panel,
        preventAutoScroll: newState,
      },
    })

    // 简单的提示，实际文案建议放在 useShortcuts或统一管理
    // 这里暂时使用硬编码中文，后续可优化
    showToast(newState ? t("preventAutoScrollEnabled") : t("preventAutoScrollDisabled"))
  }, [setSettings])

  const handleFloatingToolbarExport = useCallback(async () => {
    if (!conversationManager || !adapter) return
    const sessionId = adapter.getSessionId()
    if (!sessionId) {
      showToast(t("exportNeedOpenFirst") || "请先打开要导出的会话")
      return
    }
    showToast(t("exportStarted") || "开始导出...")
    const success = await conversationManager.exportConversation(sessionId, "markdown")
    if (!success) {
      showToast(t("exportFailed") || "导出失败")
    }
  }, [conversationManager, adapter])

  const handleFloatingToolbarMoveToFolder = useCallback(() => {
    if (!conversationManager || !adapter) return
    const sessionId = adapter.getSessionId()
    if (!sessionId) {
      showToast(t("noConversationToLocate") || "未找到会话")
      return
    }
    const conv = conversationManager.getConversation(sessionId)
    setFloatingToolbarMoveState({
      convId: sessionId,
      activeFolderId: conv?.folderId,
    })
  }, [conversationManager, adapter])

  const handleFloatingToolbarClearGhost = useCallback(() => {
    if (!outlineManager) return
    const cleared = outlineManager.clearGhostBookmarks()
    if (cleared === 0) {
      showToast(t("floatingToolbarClearGhostEmpty") || "没有需要清理的无效收藏")
      return
    }
    showToast(`${t("cleared") || "已清理"} (${cleared})`)
  }, [outlineManager])

  // 复制为 Markdown 处理器
  const handleCopyMarkdown = useCallback(async () => {
    if (!conversationManager || !adapter) return
    const sessionId = adapter.getSessionId()
    if (!sessionId) {
      showToast(t("exportNeedOpenFirst") || "请先打开要导出的会话")
      return
    }
    showToast(t("exportLoading") || "正在加载...")
    const success = await conversationManager.exportConversation(sessionId, "clipboard")
    if (!success) {
      showToast(t("exportFailed") || "导出失败")
    }
  }, [conversationManager, adapter])

  // 模型锁定切换处理器 (按站点)
  const handleModelLockToggle = useCallback(() => {
    if (!adapter) return
    const siteId = adapter.getSiteId()
    const current = settingsRef.current
    if (!current) return

    const modelLockConfig = current.modelLock?.[siteId] || { enabled: false, keyword: "" }

    // 如果没有配置关键词
    if (!modelLockConfig.keyword) {
      if (modelLockConfig.enabled) {
        // 用户意图是关闭 → 直接关闭，不跳转设置
        setSettings({
          modelLock: {
            ...current.modelLock,
            [siteId]: {
              ...modelLockConfig,
              enabled: false,
            },
          },
        })
        showToast(t("modelLockDisabled") || "模型锁定已关闭")
      } else {
        // 用户意图是开启 → 自动开启开关 + 跳转设置让用户配置
        showToast(t("modelLockNoKeyword") || "请先在设置中配置模型关键词")
        setSettings({
          modelLock: {
            ...current.modelLock,
            [siteId]: {
              ...modelLockConfig,
              enabled: true,
            },
          },
        })
        openSettingsModal()
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("ophel:navigateSettingsPage", {
              detail: { page: "siteSettings", subTab: "modelLock" },
            }),
          )
        }, 100)
      }
      return
    }

    const newEnabled = !modelLockConfig.enabled

    setSettings({
      modelLock: {
        ...current.modelLock,
        [siteId]: {
          ...modelLockConfig,
          enabled: newEnabled,
        },
      },
    })

    showToast(
      newEnabled
        ? t("modelLockEnabled") || "模型锁定已开启"
        : t("modelLockDisabled") || "模型锁定已关闭",
    )
  }, [adapter, openSettingsModal, setSettings])

  // 获取当前站点的模型锁定状态
  const isModelLocked = useMemo(() => {
    if (!adapter || !settings) return false
    const siteId = adapter.getSiteId()
    return settings.modelLock?.[siteId]?.enabled || false
  }, [adapter, settings])

  // 快捷键管理
  useShortcuts({
    settings,
    adapter,
    outlineManager,
    conversationManager,
    onPanelToggle: () => setIsPanelOpen((prev) => !prev),
    onThemeToggle: handleThemeToggle,
    onOpenSettings: openSettingsModal,
    isPanelVisible: isPanelOpen,
    isSnapped: !!edgeSnapState && !isEdgePeeking, // 吸附且未显示
    onShowSnappedPanel: () => {
      // 强制显示吸附的面板
      setIsEdgePeeking(true)
      // 启动 3 秒延迟缩回计时器
      cancelShortcutPeekTimer()
      shortcutPeekTimerRef.current = setTimeout(() => {
        setIsEdgePeeking(false)
        shortcutPeekTimerRef.current = null
      }, 3000)
    },
    onToggleScrollLock: handleToggleScrollLock,
  })

  // 当自动吸附设置变化时的处理：关闭自动吸附时立即重置吸附状态
  // 开启自动吸附的处理在 SettingsModal onClose 回调中
  useEffect(() => {
    if (edgeSnapState && !settings?.panel?.edgeSnap) {
      setEdgeSnapState(null)
      setIsEdgePeeking(false)
    }
  }, [settings?.panel?.edgeSnap, edgeSnapState])

  // 监听默认位置变化，重置吸附状态
  // 当用户切换默认位置（如从左到右）时，如果是吸附状态，需要重置以便面板能跳转到新位置
  const prevDefaultPosition = useRef(settings?.panel?.defaultPosition)
  useEffect(() => {
    const currentPos = settings?.panel?.defaultPosition
    // 初始化 ref
    if (prevDefaultPosition.current === undefined && currentPos) {
      prevDefaultPosition.current = currentPos
      return
    }

    if (currentPos && prevDefaultPosition.current !== currentPos) {
      prevDefaultPosition.current = currentPos
      // 只有在当前有吸附状态时才需要重置
      if (edgeSnapState) {
        // 保持吸附状态，但切换方向
        setEdgeSnapState(currentPos)
        setIsEdgePeeking(false)
      }
    }
  }, [settings?.panel?.defaultPosition, edgeSnapState])

  // 使用 MutationObserver 监听 Portal 元素（菜单/对话框/设置模态框）的存在
  // 当 Portal 元素存在时，强制设置 isEdgePeeking 为 true，防止 CSS :hover 失效导致面板隐藏
  useEffect(() => {
    if (!edgeSnapState || !settings?.panel?.edgeSnap) return

    const portalSelector =
      ".conversations-dialog-overlay, .conversations-folder-menu, .conversations-tag-filter-menu, .prompt-modal, .gh-dialog-overlay, .settings-modal-overlay"

    // 检查当前是否有 Portal 元素存在
    const checkPortalExists = () => {
      const portals = document.body.querySelectorAll(portalSelector)
      const searchOverlays = document.body.querySelectorAll(".settings-search-overlay")
      return portals.length > 0 || searchOverlays.length > 0
    }

    // 追踪之前的 Portal 状态，用于检测 Portal 关闭
    let prevHasPortal = checkPortalExists()

    // 创建 MutationObserver 监听 document.body 的子元素变化
    const observer = new MutationObserver(() => {
      const hasPortal = checkPortalExists()

      if (hasPortal && !prevHasPortal) {
        // Portal 元素刚出现，强制保持面板显示
        // 因为 Portal 覆盖层会导致 CSS :hover 失效
        setIsEdgePeeking(true)

        // 清除隐藏定时器
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
      } else if (!hasPortal && prevHasPortal) {
        // Portal 元素刚消失，延迟后检查是否需要隐藏
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = setTimeout(() => {
          // 500ms 后检查：如果没有新的 Portal，且没有活跃交互，则隐藏
          if (!checkPortalExists() && !isInteractionActiveRef.current) {
            setIsEdgePeeking(false)
          }
        }, 500)
      }

      prevHasPortal = hasPortal
    })

    // 开始观察 document.body 的直接子元素变化
    observer.observe(document.body, {
      childList: true,
      subtree: false,
    })

    // 初始检查
    if (checkPortalExists()) {
      setIsEdgePeeking(true)
    }

    return () => {
      observer.disconnect()
    }
  }, [edgeSnapState, settings?.panel?.edgeSnap])

  // 监听面板内输入框的聚焦状态
  // 解决问题：当用户在输入框中打字时，IME 输入法弹出会导致浏览器丢失 CSS :hover 状态
  // 方案：在输入框聚焦时主动设置 isEdgePeeking = true，不依赖纯 CSS :hover
  useEffect(() => {
    if (!edgeSnapState || !settings?.panel?.edgeSnap) return

    // 获取 Shadow DOM 根节点
    const shadowHost = document.querySelector("plasmo-csui, #ophel-userscript-root")
    const shadowRoot = shadowHost?.shadowRoot
    if (!shadowRoot) return

    const handleFocusIn = (e: Event) => {
      const target = e.target as HTMLElement
      // 检查是否是输入元素（input、textarea 或可编辑区域）
      const isInputElement =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.getAttribute("contenteditable") === "true"

      if (isInputElement) {
        // 排除设置模态框内的输入框
        // 设置模态框有自己的状态管理（isSettingsOpenRef），不需要在这里处理
        if (target.closest(".settings-modal-overlay, .settings-modal")) {
          return
        }

        isInputFocusedRef.current = true
        // 确保面板保持显示状态
        setIsEdgePeeking(true)
        // 清除任何隐藏计时器
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
      }
    }

    const handleFocusOut = (e: Event) => {
      const target = e.target as HTMLElement
      const isInputElement =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.getAttribute("contenteditable") === "true"

      if (isInputElement) {
        // 排除设置模态框内的输入框
        if (target.closest(".settings-modal-overlay, .settings-modal")) {
          return
        }

        isInputFocusedRef.current = false
        // 延迟检查是否需要隐藏
        // 给用户一点时间可能重新聚焦到其他输入框
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = setTimeout(() => {
          // 如果没有其他保持显示的条件，则隐藏
          if (
            !isInputFocusedRef.current &&
            !isSettingsOpenRef.current &&
            !isInteractionActiveRef.current
          ) {
            const portalElements = document.body.querySelectorAll(
              ".conversations-dialog-overlay, .conversations-folder-menu, .conversations-tag-filter-menu, .prompt-modal, .gh-dialog-overlay, .settings-modal-overlay",
            )
            const searchOverlays = document.body.querySelectorAll(".settings-search-overlay")
            if (portalElements.length === 0 && searchOverlays.length === 0) {
              setIsEdgePeeking(false)
            }
          }
        }, 300)
      }
    }

    // 监听 Shadow DOM 内的焦点事件
    shadowRoot.addEventListener("focusin", handleFocusIn, true)
    shadowRoot.addEventListener("focusout", handleFocusOut, true)

    return () => {
      shadowRoot.removeEventListener("focusin", handleFocusIn, true)
      shadowRoot.removeEventListener("focusout", handleFocusOut, true)
    }
  }, [edgeSnapState, settings?.panel?.edgeSnap])

  useEffect(() => {
    // 只有在开启自动隐藏时，才监听点击外部
    // 如果没有开启自动隐藏，无论是否吸附，点击外部都不应有反应
    const shouldHandle = settings?.panel?.autoHide
    if (!shouldHandle || !isPanelOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      // 使用 composedPath() 支持 Shadow DOM
      const path = e.composedPath()

      // 检查点击路径中是否包含面板、快捷按钮或 Portal 元素（菜单/对话框）
      const isInsidePanelOrPortal = path.some((el) => {
        if (!(el instanceof Element)) return false
        // 检查是否是面板内部
        if (el.closest?.(".gh-main-panel")) return true
        // 检查是否是快捷按钮
        if (el.closest?.(".gh-quick-buttons")) return true
        // 检查是否是 Portal 元素（菜单、对话框、设置模态框）
        if (el.closest?.(".conversations-dialog-overlay")) return true
        if (el.closest?.(".conversations-folder-menu")) return true
        if (el.closest?.(".conversations-tag-filter-menu")) return true
        if (el.closest?.(".prompt-modal")) return true
        if (el.closest?.(".gh-dialog-overlay")) return true
        if (el.closest?.(".settings-modal-overlay")) return true
        if (el.closest?.(".settings-search-overlay")) return true
        return false
      })

      if (!isInsidePanelOrPortal) {
        // 如果开启了边缘吸附，点击外部应触发吸附（缩回边缘），而不是完全关闭
        if (settings?.panel?.edgeSnap) {
          if (!edgeSnapState) {
            setEdgeSnapState(settings.panel.defaultPosition || "right")
            setIsEdgePeeking(false)
          }
          // 如果已经是吸附状态，点击外部不做处理（保持吸附）
        } else {
          // 普通模式：点击外部关闭面板
          setIsPanelOpen(false)
        }
      }
    }

    // 延迟添加监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClickOutside, true)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener("click", handleClickOutside, true)
    }
  }, [
    settings?.panel?.autoHide,
    settings?.panel?.edgeSnap,
    isPanelOpen,
    edgeSnapState,
    settings?.panel?.defaultPosition,
  ])

  const showAiStudioSubmitShortcutSyncToast = useCallback(
    (submitShortcut: "enter" | "ctrlEnter") => {
      if (!adapter || adapter.getSiteId() !== SITE_IDS.AISTUDIO) return

      const markerKey = "ophel:aistudio-submit-shortcut-sync-toast"
      const markerValue = `synced:${submitShortcut}`
      let shouldShow = true

      try {
        if (sessionStorage.getItem(markerKey) === markerValue) {
          shouldShow = false
        } else {
          sessionStorage.setItem(markerKey, markerValue)
        }
      } catch {
        // ignore sessionStorage errors
      }

      if (!shouldShow) return

      const shortcutLabel = submitShortcut === "ctrlEnter" ? "Ctrl + Enter" : "Enter"
      showToast(`AI Studio ${t("promptSubmitShortcutLabel")}: ${shortcutLabel}`)
    },
    [adapter],
  )

  // Submit shortcut behaviors
  useEffect(() => {
    if (!adapter || adapter.getSiteId() !== SITE_IDS.AISTUDIO) return

    const handleShortcutSync = (event: Event) => {
      const detail = (event as CustomEvent<{ submitShortcut?: "enter" | "ctrlEnter" }>).detail
      const submitShortcut = detail?.submitShortcut
      if (submitShortcut === "enter" || submitShortcut === "ctrlEnter") {
        showAiStudioSubmitShortcutSyncToast(submitShortcut)
      }
    }

    window.addEventListener(AI_STUDIO_SHORTCUT_SYNC_EVENT, handleShortcutSync as EventListener)
    return () => {
      window.removeEventListener(AI_STUDIO_SHORTCUT_SYNC_EVENT, handleShortcutSync as EventListener)
    }
  }, [adapter, showAiStudioSubmitShortcutSyncToast])

  // Keep AI Studio local submit-key behavior in sync with extension setting
  useEffect(() => {
    if (!adapter || !promptManager || adapter.getSiteId() !== SITE_IDS.AISTUDIO) return
    promptManager.syncAiStudioSubmitShortcut(promptSubmitShortcut)
  }, [adapter, promptManager, promptSubmitShortcut])

  // Manual send: trigger only when focused element is the chat input
  useEffect(() => {
    if (!adapter || !promptManager) return

    const insertNewLine = (editor: HTMLElement) => {
      if (editor instanceof HTMLTextAreaElement) {
        const start = editor.selectionStart ?? editor.value.length
        const end = editor.selectionEnd ?? editor.value.length
        editor.setRangeText("\n", start, end, "end")
        editor.dispatchEvent(new Event("input", { bubbles: true }))
        return
      }

      if (editor.getAttribute("contenteditable") !== "true") return

      editor.focus()

      const shiftEnterEvent: KeyboardEventInit = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true,
        shiftKey: true,
      }

      const beforeHTML = editor.innerHTML
      editor.dispatchEvent(new KeyboardEvent("keydown", shiftEnterEvent))
      editor.dispatchEvent(new KeyboardEvent("keypress", shiftEnterEvent))
      editor.dispatchEvent(new KeyboardEvent("keyup", shiftEnterEvent))

      // Fallback for editors that ignore synthetic keyboard events.
      if (editor.innerHTML === beforeHTML) {
        if (!document.execCommand("insertLineBreak")) {
          document.execCommand("insertParagraph")
        }
        editor.dispatchEvent(new Event("input", { bubbles: true }))
      }
    }

    const handleKeydown = (e: KeyboardEvent) => {
      if (!e.isTrusted) return
      if (e.key !== "Enter") return
      if (e.isComposing || e.keyCode === 229) return

      const path = e.composedPath()
      const editor = path.find(
        (element) => element instanceof HTMLElement && adapter.isValidTextarea(element),
      ) as HTMLElement | undefined

      if (!editor) return

      const hasPrimaryModifier = e.ctrlKey || e.metaKey
      const hasAnyModifier = hasPrimaryModifier || e.altKey
      const isSubmitKey =
        promptSubmitShortcut === "ctrlEnter"
          ? hasPrimaryModifier && !e.altKey && !e.shiftKey
          : !hasAnyModifier && !e.shiftKey
      const shouldInsertNewlineInCtrlEnterMode =
        promptSubmitShortcut === "ctrlEnter" && !hasAnyModifier && !e.shiftKey

      if (isSubmitKey) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()

        void (async () => {
          promptManager.syncAiStudioSubmitShortcut(promptSubmitShortcut)
          const success = await promptManager.submitPrompt(promptSubmitShortcut)
          if (success) {
            setSelectedPrompt(null)
          }
        })()
        return
      }

      // In Ctrl+Enter mode, block plain Enter to avoid accidental native submit
      if (shouldInsertNewlineInCtrlEnterMode) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        insertNewLine(editor)
      }
    }

    // Claude 特殊处理：在部分页面中，站点自身会较早消费 Enter，
    // document 捕获阶段可能已来不及拦截（表现为 Ctrl+Enter 模式下 Enter 仍触发发送）。
    // 因此 Claude 使用 window 捕获监听以提前拦截。
    // 注意：这里 return 后不会再注册 document 监听，不会双重挂载。
    if (adapter.getSiteId() === SITE_IDS.CLAUDE) {
      window.addEventListener("keydown", handleKeydown, true)
      return () => {
        window.removeEventListener("keydown", handleKeydown, true)
      }
    }

    // 其他站点保持原有 document 捕获监听，避免扩大行为影响面。
    document.addEventListener("keydown", handleKeydown, true)
    return () => {
      document.removeEventListener("keydown", handleKeydown, true)
    }
  }, [adapter, promptManager, promptSubmitShortcut])

  // Clear selected prompt tag after clicking native send button
  useEffect(() => {
    if (!adapter || !selectedPrompt) return

    const handleSend = () => {
      setSelectedPrompt(null)
    }

    const handleClick = (e: MouseEvent) => {
      const selectors = adapter.getSubmitButtonSelectors()
      if (selectors.length === 0) return

      const path = e.composedPath()
      for (const target of path) {
        if (target === document || target === window) break
        for (const selector of selectors) {
          try {
            if ((target as Element).matches?.(selector)) {
              setTimeout(handleSend, 100)
              return
            }
          } catch {
            // ignore invalid selectors
          }
        }
      }
    }

    document.addEventListener("click", handleClick, true)

    return () => {
      document.removeEventListener("click", handleClick, true)
    }
  }, [adapter, selectedPrompt])

  // 切换会话时自动清空选中的提示词悬浮条及输入框
  useEffect(() => {
    if (!selectedPrompt || !adapter) return

    // 记录当前 URL
    let currentUrl = window.location.href

    // 清空悬浮条和输入框
    const clearPromptAndTextarea = () => {
      setSelectedPrompt(null)
      // 同时清空输入框（adapter.clearTextarea 内部有校验，不会误选全页面）
      adapter.clearTextarea()
    }

    // 使用 popstate 监听浏览器前进/后退
    const handlePopState = () => {
      if (window.location.href !== currentUrl) {
        clearPromptAndTextarea()
      }
    }

    // 使用定时器检测 URL 变化（SPA 路由）
    // 因为 pushState/replaceState 不会触发 popstate
    const checkUrlChange = () => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href
        clearPromptAndTextarea()
      }
    }

    // 每 500ms 检查一次 URL 变化
    const intervalId = setInterval(checkUrlChange, 500)
    window.addEventListener("popstate", handlePopState)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener("popstate", handlePopState)
    }
  }, [selectedPrompt, adapter])

  // 浮动工具栏设置标签状态
  const [floatingToolbarTagState, setFloatingToolbarTagState] = useState<{
    convId: string
  } | null>(null)

  const handleFloatingToolbarSetTag = useCallback(() => {
    if (!conversationManager || !adapter) return
    const sessionId = adapter.getSessionId()
    if (!sessionId) {
      showToast(t("noConversationToLocate") || "未找到当前会话")
      return
    }
    setFloatingToolbarTagState({
      convId: sessionId,
    })
  }, [conversationManager, adapter])

  const { tags, addTag, updateTag, deleteTag } = useTagsStore()

  const handleToggleGlobalSearchGroup = useCallback((category: GlobalSearchResultCategory) => {
    setSettingsSearchNavigationMode("pointer")
    setExpandedGlobalSearchCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }))
  }, [])

  const renderSearchHighlightedParts = useCallback(
    (value: string, variant: "default" | "tag" | "code" = "default") => {
      const segments = splitGlobalSearchHighlightSegments(value, settingsSearchHighlightTokens)

      return segments.map((segment, index) =>
        segment.highlighted ? (
          <mark
            key={`highlight-${index}-${segment.text.length}`}
            className={`settings-search-highlight ${
              variant === "tag"
                ? "settings-search-highlight-tag"
                : variant === "code"
                  ? "settings-search-highlight-code"
                  : ""
            }`.trim()}>
            {segment.text}
          </mark>
        ) : (
          <React.Fragment key={`plain-${index}-${segment.text.length}`}>
            {segment.text}
          </React.Fragment>
        ),
      )
    },
    [settingsSearchHighlightTokens],
  )

  const outlineRoleLabels = useMemo(
    () => ({
      query: getLocalizedText({ key: "outlineOnlyUserQueries", fallback: "Query" }),
      reply: getLocalizedText({ key: "globalSearchOutlineReplies", fallback: "Replies" }),
    }),
    [getLocalizedText],
  )

  const renderSearchResultItem = (item: GlobalSearchResultItem, index: number) => {
    const isOutlineItem = item.category === "outline" && Boolean(item.outlineTarget)
    const isConversationItem = item.category === "conversations"
    const isPromptItem = item.category === "prompts"
    const isOutlineQuery = isOutlineItem && Boolean(item.outlineTarget?.isUserQuery)
    const outlineRoleLabel = isOutlineQuery ? outlineRoleLabels.query : outlineRoleLabels.reply
    const showCodeOnMeta = Boolean(item.code) && !isOutlineItem
    const promptSnippetPrefix =
      item.category === "prompts" && item.matchReasons?.includes("content")
        ? `${resolvedGlobalSearchMatchReasonLabels.content}：`
        : ""
    const matchReasonBadges =
      item.matchReasons && item.matchReasons.length > 0
        ? item.matchReasons.map((reason) => ({
            reason,
            label: resolvedGlobalSearchMatchReasonLabels[reason],
          }))
        : []

    return (
      <div
        key={item.id}
        id={`${GLOBAL_SEARCH_OPTION_ID_PREFIX}-${index}`}
        role="option"
        aria-selected={index === settingsSearchActiveIndex}
        tabIndex={-1}
        data-global-search-index={index}
        data-global-search-item-id={item.id}
        className={`settings-search-item ${index === settingsSearchActiveIndex ? "active" : ""} ${
          isOutlineItem
            ? isOutlineQuery
              ? "outline-item outline-query"
              : "outline-item outline-reply"
            : ""
        } ${isConversationItem ? "conversation-item" : ""}`.trim()}
        onMouseMove={() => {
          setSettingsSearchNavigationMode("pointer")

          if (Date.now() < settingsSearchWheelFreezeUntilRef.current) {
            return
          }

          if (settingsSearchHoverLocked) {
            setSettingsSearchHoverLocked(false)
            return
          }
          setSettingsSearchActiveIndex(index)
        }}
        onMouseEnter={(event) => {
          if (!isPromptItem) {
            return
          }

          keyboardPreviewTargetRef.current = null
          setSettingsSearchNavigationMode("pointer")
          scheduleGlobalSearchPromptPreview({
            item,
            anchorElement: event.currentTarget,
            delay: GLOBAL_SEARCH_PROMPT_PREVIEW_POINTER_DELAY_MS,
            source: "pointer",
          })
        }}
        onMouseLeave={() => {
          if (!isPromptItem) {
            return
          }

          scheduleHideGlobalSearchPromptPreview()
        }}
        onClick={() => navigateToSearchResult(item)}>
        <div className="settings-search-item-title" title={item.title}>
          {isOutlineItem ? (
            <div className="settings-search-outline-head">
              <span
                className={`settings-search-outline-role ${isOutlineQuery ? "query" : "reply"}`}
                title={outlineRoleLabel}>
                {outlineRoleLabel}
              </span>
              {item.code ? (
                <span className="settings-search-outline-code" title={item.code}>
                  {renderSearchHighlightedParts(item.code, "code")}
                </span>
              ) : null}
              <span className="settings-search-item-title-text">
                {renderSearchHighlightedParts(item.title)}
              </span>
            </div>
          ) : (
            <span className="settings-search-item-title-text">
              {renderSearchHighlightedParts(item.title)}
            </span>
          )}
        </div>
        {item.snippet ? (
          <div
            className="settings-search-item-snippet"
            title={`${promptSnippetPrefix}${item.snippet}`}>
            {promptSnippetPrefix ? (
              <span className="settings-search-item-snippet-prefix">{promptSnippetPrefix}</span>
            ) : null}
            {renderSearchHighlightedParts(item.snippet)}
          </div>
        ) : null}
        <div className={`settings-search-item-meta ${showCodeOnMeta ? "" : "no-code"}`.trim()}>
          <div className="settings-search-item-meta-left">
            <span className="settings-search-item-breadcrumb" title={item.breadcrumb}>
              {renderSearchHighlightedParts(item.breadcrumb)}
            </span>
            {item.category === "conversations" && item.tagBadges && item.tagBadges.length > 0 ? (
              <div className="settings-search-tag-list">
                {item.tagBadges.map((tag) => (
                  <span
                    key={tag.id}
                    className="settings-search-tag"
                    style={{ backgroundColor: tag.color }}
                    title={tag.name}>
                    {renderSearchHighlightedParts(tag.name)}
                  </span>
                ))}
              </div>
            ) : null}
            {matchReasonBadges.length > 0 ? (
              <div className="settings-search-match-reason-list">
                {matchReasonBadges.map((reasonBadge) => (
                  <span key={reasonBadge.reason} className="settings-search-match-reason-badge">
                    {reasonBadge.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {showCodeOnMeta ? (
            <code title={item.code}>{renderSearchHighlightedParts(item.code!, "code")}</code>
          ) : null}
        </div>
      </div>
    )
  }

  if (!adapter || !promptManager || !conversationManager || !outlineManager) {
    return null
  }

  return (
    <div className="gh-root">
      <MainPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        promptManager={promptManager}
        conversationManager={conversationManager}
        outlineManager={outlineManager}
        adapter={adapter}
        onThemeToggle={handleThemeToggle}
        themeMode={themeMode}
        selectedPromptId={selectedPrompt?.id}
        onPromptSelect={handlePromptSelect}
        edgeSnapState={edgeSnapState}
        isEdgePeeking={isEdgePeeking}
        onEdgeSnap={(side) => setEdgeSnapState(side)}
        onUnsnap={() => {
          setEdgeSnapState(null)
          setIsEdgePeeking(false)
        }}
        onInteractionStateChange={handleInteractionChange}
        onOpenSettings={() => {
          openSettingsModal()
        }}
        onMouseEnter={() => {
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
          }
          // 取消快捷键触发的延迟缩回计时器
          cancelShortcutPeekTimer()
          // 当处于吸附状态时，鼠标进入面板应设置 isEdgePeeking = true
          // 这样 onMouseLeave 时才能正确隐藏
          if (edgeSnapState && settings?.panel?.edgeSnap && !isEdgePeeking) {
            setIsEdgePeeking(true)
          }
        }}
        onMouseLeave={() => {
          // 边缘吸附恢复逻辑：鼠标移出面板时结束 peek 状态
          // 增加 200ms 缓冲，防止移动到外部菜单（Portal）时瞬间隐藏
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current)

          hideTimerRef.current = setTimeout(() => {
            // 优先检查设置模态框状态（使用 ref 确保读取到最新的值）
            if (isSettingsOpenRef.current) return

            // 检查是否有输入框正在聚焦（防止 IME 输入法弹出时隐藏）
            if (isInputFocusedRef.current) return

            // 检查是否有任何菜单/对话框/弹窗处于打开状态
            const interactionActive = isInteractionActiveRef.current
            const portalElements = document.body.querySelectorAll(
              ".conversations-dialog-overlay, .conversations-folder-menu, .conversations-tag-filter-menu, .prompt-modal, .gh-dialog-overlay, .settings-modal-overlay",
            )
            const searchOverlays = document.body.querySelectorAll(".settings-search-overlay")
            const hasPortal = portalElements.length > 0 || searchOverlays.length > 0

            // 如果有活跃交互或 Portal 元素，不隐藏面板
            if (interactionActive || hasPortal) return

            // 安全检查后隐藏面板
            if (edgeSnapState && settings?.panel?.edgeSnap && isEdgePeeking) {
              setIsEdgePeeking(false)
            }
          }, 200)
        }}
      />

      <QuickButtons
        isPanelOpen={isPanelOpen}
        onPanelToggle={() => {
          if (!isPanelOpen) {
            // 展开面板：如果处于吸附状态，进入 peek 模式
            if (edgeSnapState && settings?.panel?.edgeSnap) {
              setIsEdgePeeking(true)
            }
          } else {
            // 关闭面板：重置 peek 状态
            setIsEdgePeeking(false)
          }
          setIsPanelOpen(!isPanelOpen)
        }}
        onThemeToggle={handleThemeToggle}
        themeMode={themeMode}
        onExport={handleFloatingToolbarExport}
        onMove={handleFloatingToolbarMoveToFolder}
        onSetTag={handleFloatingToolbarSetTag}
        onScrollLock={() => handleToggleScrollLock()}
        onSettings={() => {
          // 打开 SettingsModal 并跳转到工具箱设置 Tab
          openSettingsModal()
          // 延迟发送导航事件，确保 Modal 已挂载
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("ophel:navigateSettingsPage", {
                detail: { page: "general", subTab: "toolsMenu" },
              }),
            )
          }, 50)
        }}
        scrollLocked={isScrollLockActive}
        onCleanup={() => {
          if (ghostBookmarkCount === 0) {
            showToast(t("floatingToolbarClearGhostEmpty") || "没有需要清理的无效收藏")
            return
          }
          setIsFloatingToolbarClearOpen(true)
        }}
        onGlobalSearch={openGlobalSettingsSearch}
        onCopyMarkdown={handleCopyMarkdown}
        onModelLockToggle={handleModelLockToggle}
        isModelLocked={isModelLocked}
      />
      {/* 选中提示词悬浮条 */}
      {selectedPrompt && (
        <SelectedPromptBar
          title={selectedPrompt.title}
          onClear={handleClearSelectedPrompt}
          adapter={adapter}
        />
      )}
      {/* 设置模态框 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          isSettingsOpenRef.current = false
          setIsSettingsOpen(false)

          // 关闭设置模态框后，检测面板位置，如果在边缘且自动吸附已开启则自动吸附
          // 使用 settingsRef 确保读取到最新的设置值
          const currentSettings = settingsRef.current
          if (!currentSettings?.panel?.edgeSnap) return

          // 查询面板元素（在 Plasmo Shadow DOM 内部）
          // 先尝试在 Shadow DOM 内查找，再尝试普通 DOM
          let panel: HTMLElement | null = null
          const shadowHost = document.querySelector("plasmo-csui, #ophel-userscript-root")
          if (shadowHost?.shadowRoot) {
            panel = shadowHost.shadowRoot.querySelector(".gh-main-panel") as HTMLElement
          }
          if (!panel) {
            panel = document.querySelector(".gh-main-panel") as HTMLElement
          }

          if (!panel) return

          // 通过检查类名判断当前是否已吸附（避免闭包捕获问题）
          const isAlreadySnapped =
            panel.classList.contains("edge-snapped-left") ||
            panel.classList.contains("edge-snapped-right")

          if (isAlreadySnapped) return

          // 检测面板位置
          const rect = panel.getBoundingClientRect()
          const snapThreshold = currentSettings?.panel?.edgeSnapThreshold ?? 30

          if (rect.left < snapThreshold) {
            setEdgeSnapState("left")
          } else if (window.innerWidth - rect.right < snapThreshold) {
            setEdgeSnapState("right")
          }
        }}
        siteId={adapter.getSiteId()}
      />
      {isGlobalSettingsSearchOpen && (
        <div
          className="settings-search-overlay gh-interactive"
          onClick={() => {
            hideGlobalSearchPromptPreview()
            closeGlobalSettingsSearch()
          }}>
          <div className="settings-search-modal" onClick={(event) => event.stopPropagation()}>
            <div className="settings-search-input-wrap">
              <SearchIcon size={16} />
              <input
                ref={settingsSearchInputRef}
                className="settings-search-input"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={true}
                aria-haspopup="listbox"
                aria-controls={GLOBAL_SEARCH_RESULTS_LISTBOX_ID}
                aria-activedescendant={activeGlobalSearchOptionId}
                value={settingsSearchInputValue}
                onChange={(event) => {
                  commitSettingsSearchInputValue(event.target.value)
                  setActiveSearchSyntaxSuggestionIndex(-1)
                  setSettingsSearchActiveIndex(0)
                }}
                placeholder={`${resolvedActiveGlobalSearchCategoryText.placeholder}（${globalSearchPrimaryShortcutLabel}）`}
              />
              <span className="settings-search-hotkey">⌨ {globalSearchShortcutHintLabel}</span>
              <div className="settings-search-help">
                <button
                  ref={globalSearchSyntaxHelpTriggerRef}
                  type="button"
                  className={`settings-search-help-trigger ${
                    showGlobalSearchSyntaxHelp ? "active" : ""
                  }`}
                  aria-expanded={showGlobalSearchSyntaxHelp}
                  aria-label={getLocalizedText({
                    key: "globalSearchSyntaxHelpTriggerAria",
                    fallback: "Open search syntax help",
                  })}
                  onClick={() => setShowGlobalSearchSyntaxHelp((previous) => !previous)}>
                  ?
                </button>
                {showGlobalSearchSyntaxHelp ? (
                  <div
                    ref={globalSearchSyntaxHelpPopoverRef}
                    className="settings-search-help-popover"
                    role="dialog"
                    aria-label={globalSearchSyntaxHelpTitle}>
                    <div className="settings-search-help-title">{globalSearchSyntaxHelpTitle}</div>
                    <div className="settings-search-help-tip">
                      {globalSearchSyntaxHelpDescription}
                    </div>
                    <div className="settings-search-help-items">
                      {globalSearchSyntaxHelpItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="settings-search-help-item"
                          onClick={() => applyGlobalSearchSyntaxHelpItem(item)}>
                          <span className="settings-search-help-token">{item.token}</span>
                          <span className="settings-search-help-desc">{item.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {activeGlobalSearchFilterChips.length > 0 ? (
              <div className="settings-search-filter-chips" aria-label="active search filters">
                {activeGlobalSearchFilterChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className="settings-search-filter-chip"
                    onClick={() => handleRemoveGlobalSearchFilterChip(chip.id)}
                    title={getLocalizedText({
                      key: "globalSearchSyntaxChipRemove",
                      fallback: "Click to remove filter",
                    })}>
                    <span className="settings-search-filter-chip-label">{chip.label}</span>
                    <span className="settings-search-filter-chip-close" aria-hidden>
                      ×
                    </span>
                  </button>
                ))}
                {hasOverflowGlobalSearchFilterChips ? (
                  <span className="settings-search-filter-chip-overflow">
                    {formatLocalizedText(
                      {
                        key: "globalSearchSyntaxChipOverflow",
                        fallback: "+{count} more",
                      },
                      {
                        count: String(
                          activeGlobalSearchSyntaxFilters.length -
                            GLOBAL_SEARCH_FILTER_CHIP_MAX_COUNT,
                        ),
                      },
                    )}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="settings-search-filter-chip-clear-all"
                  onClick={clearAllGlobalSearchSyntaxFilters}>
                  {getLocalizedText({ key: "clear", fallback: "Clear" })}
                </button>
              </div>
            ) : null}

            {shouldShowGlobalSearchSyntaxSuggestions ? (
              <div className="settings-search-syntax-suggestions" role="listbox">
                {globalSearchSyntaxSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    role="option"
                    aria-selected={activeSearchSyntaxSuggestionIndex === index}
                    className={`settings-search-syntax-suggestion ${
                      activeSearchSyntaxSuggestionIndex === index ? "active" : ""
                    }`}
                    onMouseEnter={() => setActiveSearchSyntaxSuggestionIndex(index)}
                    onClick={() => applyGlobalSearchSyntaxSuggestion(suggestion)}>
                    <span className="settings-search-syntax-suggestion-token">
                      {suggestion.label}
                    </span>
                    <span className="settings-search-syntax-suggestion-desc">
                      {suggestion.description}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {activeGlobalSearchSyntaxDiagnostics.length > 0 ? (
              <div className="settings-search-syntax-diagnostics" role="status" aria-live="polite">
                {activeGlobalSearchSyntaxDiagnostics.map((diagnostic) => {
                  const diagnosticTitle =
                    globalSearchSyntaxDiagnosticMessages[diagnostic.code] ||
                    globalSearchSyntaxDiagnosticMessages.invalidValue

                  return (
                    <div key={diagnostic.id} className="settings-search-syntax-diagnostic">
                      <span className="settings-search-syntax-diagnostic-title">
                        {diagnosticTitle}
                      </span>
                      <span className="settings-search-syntax-diagnostic-detail">
                        {diagnostic.operator}
                        {diagnostic.value ? `:${diagnostic.value}` : ""}
                        {diagnostic.suggestion ? ` → ${diagnostic.suggestion}:` : ""}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : null}

            {showGlobalSearchShortcutNudge && globalSearchShortcutNudgeMessage ? (
              <div className="settings-search-shortcut-nudge" role="status" aria-live="polite">
                <span className="settings-search-shortcut-nudge-text">
                  {globalSearchShortcutNudgeMessage}
                </span>
                <button
                  type="button"
                  className="settings-search-shortcut-nudge-action"
                  onClick={hideGlobalSearchShortcutNudge}>
                  {getLocalizedText({ key: "close", fallback: "Close" })}
                </button>
                <button
                  type="button"
                  className="settings-search-shortcut-nudge-action"
                  onClick={dismissGlobalSearchShortcutNudgeForever}>
                  {getLocalizedText({
                    key: "globalSearchShortcutNudgeDismiss",
                    fallback: "Don’t remind me",
                  })}
                </button>
              </div>
            ) : null}

            <div
              className="settings-search-categories"
              role="tablist"
              aria-label={getLocalizedText({
                key: "globalSearchCategoriesLabel",
                fallback: "Global search categories",
              })}>
              {GLOBAL_SEARCH_CATEGORY_DEFINITIONS.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={activeGlobalSearchCategory === category.id}
                  className={`settings-search-category ${
                    activeGlobalSearchCategory === category.id ? "active" : ""
                  }`}
                  onClick={() => {
                    setActiveGlobalSearchCategory(category.id)
                    setSettingsSearchActiveIndex(0)
                  }}>
                  <span>{resolvedGlobalSearchCategoryLabels[category.id]}</span>
                  <span className="settings-search-category-count">
                    {globalSearchResultCounts[category.id]}
                  </span>
                </button>
              ))}
            </div>

            {activeGlobalSearchContext ? (
              <div className="settings-search-context-bar">
                <span className="settings-search-context-label">
                  {activeGlobalSearchContext.label}
                </span>
                <span className="settings-search-context-meta">
                  {activeGlobalSearchContext.meta}
                </span>
              </div>
            ) : null}

            <div
              id={GLOBAL_SEARCH_RESULTS_LISTBOX_ID}
              className="settings-search-results"
              role="listbox"
              aria-label={globalSearchListboxLabel}
              ref={settingsSearchResultsRef}
              onWheel={() => {
                setSettingsSearchNavigationMode("pointer")
                settingsSearchWheelFreezeUntilRef.current = Date.now() + 200
                hideGlobalSearchPromptPreview()
              }}>
              {visibleGlobalSearchResults.length === 0 ? (
                <div className="settings-search-empty">
                  <div>{resolvedActiveGlobalSearchCategoryText.emptyText}</div>
                  <div className="settings-search-empty-guide-title">
                    {getLocalizedText({
                      key: "globalSearchSyntaxEmptyGuideTitle",
                      fallback: "Try search filters",
                    })}
                  </div>
                  <div className="settings-search-empty-guide-desc">
                    {getLocalizedText({
                      key: "globalSearchSyntaxEmptyGuideDesc",
                      fallback: "Use filter syntax to narrow results quickly",
                    })}
                  </div>
                  <div className="settings-search-empty-guide-examples">
                    <button
                      type="button"
                      className="settings-search-empty-guide-example"
                      onClick={() => syncSettingsSearchInputAndQuery("type:prompts ")}>
                      type:prompts
                    </button>
                    <button
                      type="button"
                      className="settings-search-empty-guide-example"
                      onClick={() => syncSettingsSearchInputAndQuery("is:pinned ")}>
                      is:pinned
                    </button>
                    <button
                      type="button"
                      className="settings-search-empty-guide-example"
                      onClick={() => syncSettingsSearchInputAndQuery("folder:inbox ")}>
                      folder:inbox
                    </button>
                    <button
                      type="button"
                      className="settings-search-empty-guide-example"
                      onClick={() => syncSettingsSearchInputAndQuery("tag:work ")}>
                      tag:work
                    </button>
                    <button
                      type="button"
                      className="settings-search-empty-guide-example"
                      onClick={() => syncSettingsSearchInputAndQuery("level:0 ")}>
                      level:0
                    </button>
                    <button
                      type="button"
                      className="settings-search-empty-guide-example"
                      onClick={() => syncSettingsSearchInputAndQuery("date:7d ")}>
                      date:7d
                    </button>
                  </div>
                </div>
              ) : activeGlobalSearchCategory === "all" ? (
                groupedGlobalSearchResults.map((group) => (
                  <section key={group.category} className="settings-search-group">
                    <div className="settings-search-group-title">
                      <span>{resolvedGlobalSearchResultCategoryLabels[group.category]}</span>
                      {group.totalCount > GLOBAL_SEARCH_ALL_CATEGORY_ITEM_LIMIT ? (
                        <span className="settings-search-group-count">
                          {group.items.length}/{group.totalCount}
                        </span>
                      ) : null}
                    </div>
                    {group.items.map((item) =>
                      renderSearchResultItem(item, visibleSearchResultIndexMap.get(item.id) ?? 0),
                    )}
                    {group.hasMore || group.isExpanded ? (
                      <button
                        type="button"
                        className="settings-search-group-more"
                        onClick={() => handleToggleGlobalSearchGroup(group.category)}>
                        {group.isExpanded
                          ? getLocalizedText({ key: "collapse", fallback: "Collapse" })
                          : `${getLocalizedText({ key: "floatingToolbarMore", fallback: "More" })} (+${
                              group.remainingCount
                            })`}
                      </button>
                    ) : null}
                  </section>
                ))
              ) : (
                visibleGlobalSearchResults.map((item, index) => renderSearchResultItem(item, index))
              )}
            </div>

            <div className="settings-search-footer">
              {getLocalizedText({
                key: "globalSearchFooterTips",
                fallback: "Enter to jump · ↑↓ to select · Tab category · Esc to close",
              })}
            </div>
          </div>
          {globalSearchPromptPreview && globalSearchPromptPreviewPosition ? (
            <>
              <div
                ref={promptPreviewContainerRef}
                className="settings-search-prompt-preview-float gh-markdown-preview"
                style={{
                  top: globalSearchPromptPreviewPosition.top,
                  left: globalSearchPromptPreviewPosition.left,
                }}
                onMouseEnter={() => {
                  clearPromptPreviewTimer()
                  clearPromptPreviewHideTimer()
                }}
                onMouseLeave={() => {
                  scheduleHideGlobalSearchPromptPreview()
                }}
                onClick={handleGlobalSearchPromptPreviewClick}
                dangerouslySetInnerHTML={{
                  __html: createSafeHTML(renderMarkdown(globalSearchPromptPreview.content, false)),
                }}
              />
              <style>{getHighlightStyles()}</style>
            </>
          ) : null}
        </div>
      )}
      {floatingToolbarMoveState && (
        <FolderSelectDialog
          folders={conversationManager.getFolders()}
          excludeFolderId={
            conversationManager.getConversation(floatingToolbarMoveState.convId)?.folderId
          }
          activeFolderId={floatingToolbarMoveState.activeFolderId}
          onSelect={async (folderId) => {
            await conversationManager.moveConversation(floatingToolbarMoveState.convId, folderId)
            setFloatingToolbarMoveState(null)
          }}
          onCancel={() => setFloatingToolbarMoveState(null)}
        />
      )}
      {floatingToolbarTagState && (
        <TagManagerDialog
          tags={tags}
          conv={conversationManager.getConversation(floatingToolbarTagState.convId)}
          onCancel={() => setFloatingToolbarTagState(null)}
          onCreateTag={async (name, color) => {
            return addTag(name, color)
          }}
          onUpdateTag={async (tagId, name, color) => {
            return updateTag(tagId, name, color)
          }}
          onDeleteTag={async (tagId) => {
            deleteTag(tagId)
          }}
          onSetConversationTags={async (convId, tagIds) => {
            await conversationManager.updateConversation(convId, { tagIds })
          }}
          onRefresh={() => {
            // 强制刷新会话列表 ? conversationManager 会触发 onChange
          }}
        />
      )}
      {isFloatingToolbarClearOpen && (
        <ConfirmDialog
          title={t("floatingToolbarClearGhost") || "清除无效收藏"}
          message={(
            t("floatingToolbarClearGhostConfirm") || "是否清除本会话中的 {count} 个无效收藏？"
          ).replace("{count}", String(ghostBookmarkCount))}
          danger
          onConfirm={() => {
            setIsFloatingToolbarClearOpen(false)
            handleFloatingToolbarClearGhost()
          }}
          onCancel={() => setIsFloatingToolbarClearOpen(false)}
        />
      )}
      <DisclaimerModal />
    </div>
  )
}
