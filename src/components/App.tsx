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
import { QueueDispatcher } from "~core/queue-dispatcher"
import { ensureGlobalThemeManager, type ThemeTransitionOrigin } from "~core/theme-manager"
import { useShortcuts } from "~hooks/useShortcuts"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { useConversationsStore } from "~stores/conversations-store"
import { useFoldersStore } from "~stores/folders-store"
import { usePromptsStore } from "~stores/prompts-store"
import { APP_DISPLAY_NAME } from "~utils/config"
import { DEFAULT_SETTINGS, type Prompt } from "~utils/storage"
import { EVENT_EXTENSION_UPDATE_AVAILABLE, MSG_CLEAR_ALL_DATA } from "~utils/messaging"
import { EXPORT_START_TOAST_DURATION, showToast } from "~utils/toast"
import { setLanguage, t } from "~utils/i18n"
import { getHighlightStyles, renderMarkdown } from "~utils/markdown"
import { createSafeHTML } from "~utils/trusted-types"
import { initCopyButtons, showCopySuccess } from "~utils/icons"

import { ConfirmDialog, FolderSelectDialog, TagManagerDialog } from "./ConversationDialogs"
import { DisclaimerModal } from "./DisclaimerModal"
import { MainPanel } from "./MainPanel"
import { QueueOverlay } from "./QueueOverlay"
import { QuickButtons } from "./QuickButtons"
import { SelectedPromptBar } from "./SelectedPromptBar"
import { SettingsModal } from "./SettingsModal"
import { GlobalSearchOverlay } from "./global-search/GlobalSearchOverlay"
import { GlobalSearchResultItemView } from "./global-search/GlobalSearchResultItemView"
import { useGlobalSearchKeyboard } from "./global-search/useGlobalSearchKeyboard"
import { useGlobalSearchPreview } from "./global-search/useGlobalSearchPreview"
import { useGlobalSearchSyntax } from "./global-search/useGlobalSearchSyntax"
import type {
  GlobalSearchCategoryId,
  GlobalSearchMatchReason,
  GlobalSearchResultCategory,
  GlobalSearchResultItem,
  GlobalSearchSyntaxSuggestionItem,
} from "./global-search/types"
import { useGlobalSearchData } from "./global-search/useGlobalSearchData"
import {
  getGlobalSearchTrailingTokenInfo,
  parseGlobalSearchQuery,
  stringifyGlobalSearchQuery,
  toGlobalSearchTokens,
} from "./global-search/syntax"
import { useTagsStore } from "~stores/tags-store"
import {
  APPEARANCE_TAB_IDS,
  FEATURES_TAB_IDS,
  NAV_IDS,
  SITE_SETTINGS_TAB_IDS,
  TAB_IDS,
  resolveSettingRoute,
  searchSettingsItems,
  type SettingsSearchItem,
} from "~constants"
import {
  DEFAULT_KEYBINDINGS,
  formatShortcut,
  SHORTCUT_ACTIONS,
  SHORTCUT_META,
} from "~constants/shortcuts"

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
  [FEATURES_TAB_IDS.REMINDER]: { key: "reminderTab", fallback: "Alerts" },
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

interface GlobalSearchCategoryDefinition {
  id: GlobalSearchCategoryId
  label: LocalizedLabelDefinition
  placeholder: LocalizedLabelDefinition
  emptyText: LocalizedLabelDefinition
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
  fuzzy: { key: "globalSearchMatchReasonFuzzy", fallback: "Fuzzy match" },
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
const GLOBAL_SEARCH_FILTER_CHIP_MAX_COUNT = 4

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
  "conversation-sync-delete": "conversationsSyncDeleteLabel",
  "global-search-fuzzy-search": "globalSearchEnableFuzzySearchLabel",
  "global-search-double-shift": "doubleShiftToSearch",
  "global-search-shortcut-setting-link": "globalSearchShortcutSettingLabel",
  "global-search-prompt-enter-behavior": "globalSearchPromptEnterBehaviorLabel",
  "claude-session-keys": "claudeSessionKeyTitle",
  "content-assistant-mermaid": "assistantMermaidLabel",
  "content-formula-copy": "formulaCopyLabel",
  "content-formula-delimiter": "formulaDelimiterLabel",
  "content-table-copy": "tableCopyLabel",
  "content-user-query-markdown": "userQueryMarkdownLabel",
  "conversation-folder-rainbow": "folderRainbowLabel",
  "conversation-sync-unpin": "conversationsSyncUnpinLabel",
  "export-custom-model-name": "exportCustomModelName",
  "export-custom-user-name": "exportCustomUserName",
  "export-filename-timestamp": "exportFilenameTimestamp",
  "export-include-thoughts": "exportIncludeThoughtsLabel",
  "export-images-base64": "exportImagesToBase64Label",
  "gemini-markdown-fix": "markdownFixLabel",
  "gemini-policy-max-retries": "maxRetriesLabel",
  "gemini-policy-retry": "policyRetryLabel",
  "gemini-watermark-removal": "watermarkRemovalLabel",
  "layout-page-width-enabled": "enablePageWidth",
  "layout-page-width-value": "pageWidthValueLabel",
  "layout-user-query-width-enabled": "enableUserQueryWidth",
  "layout-user-query-width-value": "userQueryWidthValueLabel",
  "layout-zen-mode-enabled": "zenModeTitle",
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
  "prompt-queue": "queueSettingLabel",
  "quick-buttons-opacity": "quickButtonsOpacityLabel",
  "reading-history-auto-restore": "readingHistoryAutoRestoreLabel",
  "reading-history-cleanup-days": "readingHistoryCleanup",
  "reading-history-persistence": "readingHistoryPersistenceLabel",
  "shortcuts-enabled": "enableShortcuts",
  "shortcuts-global-url": "globalShortcutUrl",
  "shortcuts-browser-shortcuts": "globalShortcutsTitle",
  "shortcuts-prompt-submit-shortcut": "promptSubmitShortcutLabel",
  "tab-auto-focus": "autoFocusLabel",
  "tab-auto-rename": "autoRenameTabLabel",
  "tab-notification-sound": "notificationSoundLabel",
  "tab-notification-sound-preset": "notificationSoundPresetLabel",
  "tab-notification-volume": "notificationVolumeLabel",
  "tab-notification-repeat-count": "notificationRepeatCountLabel",
  "tab-notification-repeat-interval": "notificationRepeatIntervalLabel",
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
  "usage-monitor-enabled": "usageMonitorEnabledLabel",
  "usage-monitor-daily-limit": "usageMonitorDailyLimitLabel",
  "usage-monitor-auto-reset": "usageMonitorAutoResetLabel",
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
  qwenai: { key: "globalSearchSiteQwenAi", fallback: "QwenAI" },
  ima: { key: "globalSearchSiteIma", fallback: "ima" },
  zai: { key: "globalSearchSiteZai", fallback: "Z.ai" },
}

const toSearchTitleFallback = (settingId: string): string =>
  settingId
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (_matched, first) => first.toUpperCase())

const hasPromptVariables = (content: string): boolean => /\{\{([^\s{}]+)\}\}/.test(content)

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
  const globalSearchPrimaryBinding = useMemo(() => {
    const userBinding = settings?.shortcuts?.keybindings?.[SHORTCUT_ACTIONS.OPEN_GLOBAL_SEARCH]
    if (userBinding === null) {
      return null
    }
    return userBinding || DEFAULT_KEYBINDINGS[SHORTCUT_ACTIONS.OPEN_GLOBAL_SEARCH]
  }, [settings?.shortcuts?.keybindings])
  const globalSearchPrimaryShortcutLabel = globalSearchPrimaryBinding
    ? formatShortcut(globalSearchPrimaryBinding, isMacLike)
    : ""
  const isDoubleShiftSearchShortcutEnabled =
    settings?.globalSearch?.doubleShift ?? DEFAULT_SETTINGS.globalSearch.doubleShift
  const globalSearchShortcutHintLabel = useMemo(() => {
    const labels: string[] = []

    if (globalSearchPrimaryShortcutLabel) {
      labels.push(globalSearchPrimaryShortcutLabel)
    }
    if (isDoubleShiftSearchShortcutEnabled) {
      labels.push("double shift")
    }

    return labels.join(" / ")
  }, [globalSearchPrimaryShortcutLabel, isDoubleShiftSearchShortcutEnabled])
  const globalSearchOverlayHotkeyLabel =
    globalSearchShortcutHintLabel || t("shortcutNotSet") || "未设置"
  const isGlobalSearchFuzzySearchEnabled =
    settings?.globalSearch?.enableFuzzySearch ?? DEFAULT_SETTINGS.globalSearch.enableFuzzySearch

  const globalSearchShortcutNudgeText = useMemo(() => {
    if (!globalSearchShortcutHintLabel) {
      return ""
    }

    return formatLocalizedText(
      {
        key: "globalSearchShortcutNudge",
        fallback: "下次可按 {shortcut} 快速打开",
      },
      {
        shortcut: globalSearchShortcutHintLabel,
      },
    )
  }, [formatLocalizedText, globalSearchShortcutHintLabel])

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

  const toggleGlobalSearchFuzzySearch = useCallback(() => {
    setSettings({
      globalSearch: {
        ...DEFAULT_SETTINGS.globalSearch,
        ...(settings?.globalSearch || {}),
        enableFuzzySearch: !isGlobalSearchFuzzySearchEnabled,
      },
    })
  }, [isGlobalSearchFuzzySearchEnabled, setSettings, settings?.globalSearch])

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
    if (!globalSearchShortcutNudgeText) {
      return
    }

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

      if (item.settingId.startsWith("shortcut-binding-")) {
        const actionId = item.settingId.slice("shortcut-binding-".length)
        const shortcutMeta = SHORTCUT_META[actionId as keyof typeof SHORTCUT_META]
        if (shortcutMeta) {
          const shortcutsLabel = getLocalizedText({
            key: "navShortcuts",
            fallback: "Keyboard Shortcuts",
          })
          const actionLabel = getLocalizedText({
            key: shortcutMeta.labelKey,
            fallback: shortcutMeta.label,
          })
          return `${shortcutsLabel}: ${actionLabel}`
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

  const queueDispatcher = useMemo(() => {
    return adapter && promptManager ? new QueueDispatcher(adapter, promptManager) : null
  }, [adapter, promptManager])

  // QueueDispatcher lifecycle
  useEffect(() => {
    if (!queueDispatcher) return
    const isQueueEnabled = settings?.features?.prompts?.promptQueue ?? false
    if (isQueueEnabled) {
      queueDispatcher.start()
    } else {
      queueDispatcher.stop()
    }
    return () => queueDispatcher.stop()
  }, [queueDispatcher, settings?.features?.prompts?.promptQueue])

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
  const [activeSearchSyntaxSuggestionIndex, setActiveSearchSyntaxSuggestionIndex] = useState(-1)
  const [showExtensionUpdateNotice, setShowExtensionUpdateNotice] = useState(
    () => typeof window !== "undefined" && Boolean(window.__OPHEL_EXTENSION_UPDATE_AVAILABLE__),
  )
  const [extensionUpdateVersion, setExtensionUpdateVersion] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.__OPHEL_PENDING_UPDATE_VERSION__ || null : null,
  )
  const settingsSearchInputRef = useRef<HTMLInputElement | null>(null)
  const globalSearchSyntaxHelpTriggerRef = useRef<HTMLButtonElement | null>(null)
  const globalSearchSyntaxHelpPopoverRef = useRef<HTMLDivElement | null>(null)
  const settingsSearchResultsRef = useRef<HTMLDivElement | null>(null)
  const promptPreviewContainerRef = useRef<HTMLDivElement | null>(null)
  const searchInputDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const settingsSearchWheelFreezeUntilRef = useRef(0)
  const globalSearchNudgeHideTimerRef = useRef<NodeJS.Timeout | null>(null)
  const globalSearchOpenSourceRef = useRef<GlobalSearchOpenSource>("ui")
  const lastShiftPressedAtRef = useRef(0)
  const [outlineSearchVersion, setOutlineSearchVersion] = useState(0)
  const settingsSearchRestoreFocusRef = useRef<HTMLElement | null>(null)

  const {
    globalSearchPromptPreview,
    globalSearchPromptPreviewPosition,
    clearPromptPreviewTimer,
    clearPromptPreviewHideTimer,
    hideGlobalSearchPromptPreview,
    scheduleHideGlobalSearchPromptPreview,
    scheduleGlobalSearchPromptPreview,
    scheduleGlobalSearchPointerPreview,
    refreshGlobalSearchPromptPreviewAnchorRect,
  } = useGlobalSearchPreview({
    settingsSearchResultsRef,
    pointerDelayMs: GLOBAL_SEARCH_PROMPT_PREVIEW_POINTER_DELAY_MS,
    hideDelayMs: GLOBAL_SEARCH_PROMPT_PREVIEW_HIDE_DELAY_MS,
  })

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
    // 始终返回完整设置列表，交给后续全局搜索评分流程做多语言匹配
    () => searchSettingsItems(""),
    [],
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

  const {
    filteredGlobalSearchResults,
    globalSearchResultCounts,
    groupedGlobalSearchResults,
    visibleGlobalSearchResults,
  } = useGlobalSearchData({
    activeGlobalSearchPlainQuery,
    enableFuzzySearch: isGlobalSearchFuzzySearchEnabled,
    activeGlobalSearchSyntaxFilters,
    settingsSearchResults,
    resolveSettingSearchTitle,
    getSettingsBreadcrumb,
    conversationManager,
    conversationsSnapshot,
    foldersSnapshot,
    tagsSnapshot,
    promptsSnapshot,
    outlineManager,
    outlineSearchVersion,
    getLocalizedText,
    activeGlobalSearchCategory,
    expandedGlobalSearchCategories,
    allCategoryItemLimit: GLOBAL_SEARCH_ALL_CATEGORY_ITEM_LIMIT,
  })

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

  const {
    activeGlobalSearchFilterChips,
    hasOverflowGlobalSearchFilterChips,
    globalSearchSyntaxDiagnosticMessages,
    globalSearchSyntaxHelpTitle,
    globalSearchSyntaxHelpDescription,
    globalSearchSyntaxHelpItems,
    globalSearchSyntaxSuggestions,
    shouldShowGlobalSearchSyntaxSuggestions,
  } = useGlobalSearchSyntax({
    getLocalizedText,
    activeGlobalSearchSyntaxFilters,
    filterChipMaxCount: GLOBAL_SEARCH_FILTER_CHIP_MAX_COUNT,
    isGlobalSettingsSearchOpen,
    settingsSearchInputValue,
    filteredGlobalSearchResults,
    suggestionLimit: GLOBAL_SEARCH_SYNTAX_SUGGESTION_LIMIT,
  })

  const globalSearchListboxLabel = useMemo(
    () =>
      getLocalizedText({
        key: "globalSearchResultsLabel",
        fallback: "Global search results",
      }),
    [getLocalizedText],
  )

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
    async (item: GlobalSearchResultItem) => {
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
          const found = await outlineManager.resolveOutlineTarget(
            item.outlineTarget,
            item.outlineTarget.queryIndex,
          )
          if (found) {
            targetElement = found
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

  // Create a ref for isGlobalSettingsSearchOpen to access it in the event listener without re-binding
  const isGlobalSettingsSearchOpenRef = useRef(isGlobalSettingsSearchOpen)
  useEffect(() => {
    isGlobalSettingsSearchOpenRef.current = isGlobalSettingsSearchOpen
  }, [isGlobalSettingsSearchOpen])

  const openGlobalSearchByShortcut = useCallback(() => {
    if (isGlobalSettingsSearchOpenRef.current) {
      return
    }

    // 通过自定义快捷键触发时重置双击 Shift 状态，避免误判
    lastShiftPressedAtRef.current = 0
    markGlobalSearchShortcutUsed()
    openGlobalSettingsSearch("shortcut")
  }, [markGlobalSearchShortcutUsed, openGlobalSettingsSearch])

  useEffect(() => {
    const handleOpenSearchShortcut = (event: KeyboardEvent) => {
      // Use ref to check if search is already open
      if (isGlobalSettingsSearchOpenRef.current) {
        return
      }

      // 非 Shift 按键会中断双击 Shift 检测，防止输入时误触
      if (event.key !== "Shift") {
        lastShiftPressedAtRef.current = 0
      }

      if (event.key !== "Shift" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      const now = Date.now()
      // Use settingsRef to get the latest settings without re-binding listener
      const isDoubleShiftEnabled =
        settingsRef.current?.globalSearch?.doubleShift ?? DEFAULT_SETTINGS.globalSearch.doubleShift

      if (isDoubleShiftEnabled && now - lastShiftPressedAtRef.current <= 360) {
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
  }, [markGlobalSearchShortcutUsed, openGlobalSettingsSearch])

  useEffect(() => {
    const handleOpenSearchEvent = () => {
      openGlobalSettingsSearch("event")
    }

    window.addEventListener("ophel:openSettingsSearch", handleOpenSearchEvent)
    return () => {
      window.removeEventListener("ophel:openSettingsSearch", handleOpenSearchEvent)
    }
  }, [openGlobalSettingsSearch])

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

  useGlobalSearchKeyboard({
    isGlobalSettingsSearchOpen,
    showGlobalSearchSyntaxHelp,
    setShowGlobalSearchSyntaxHelp,
    activeGlobalSearchCategory,
    categoryIds: GLOBAL_SEARCH_CATEGORY_DEFINITIONS.map((category) => category.id),
    setActiveGlobalSearchCategory,
    settingsSearchActiveIndex,
    setSettingsSearchActiveIndex,
    settingsSearchNavigationMode,
    setSettingsSearchNavigationMode,
    setSettingsSearchHoverLocked,
    shouldShowGlobalSearchSyntaxSuggestions,
    globalSearchSyntaxSuggestions,
    activeSearchSyntaxSuggestionIndex,
    setActiveSearchSyntaxSuggestionIndex,
    applyGlobalSearchSyntaxSuggestion,
    visibleGlobalSearchResults,
    navigateToSearchResult,
    closeGlobalSettingsSearch,
    getShouldReturnToSettingsOnEscape: () => searchOpenedFromSettingsRef.current,
    settingsSearchResultsRef,
    keyboardSafeTop: GLOBAL_SEARCH_KEYBOARD_SAFE_TOP,
    keyboardSafeBottom: GLOBAL_SEARCH_KEYBOARD_SAFE_BOTTOM,
  })

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
  // userscript 场景下 App 可能先于核心模块渲染，这里统一复用全局单例
  const themeManager = useMemo(() => {
    const currentAdapter = getAdapter()
    const siteId = currentAdapter?.getSiteId() || "_default"
    const fallbackTheme =
      settings?.theme?.sites?.[siteId as keyof typeof settings.theme.sites] ||
      settings?.theme?.sites?._default

    return ensureGlobalThemeManager({
      mode: fallbackTheme?.mode || "light",
      adapter,
      lightPresetId: fallbackTheme?.lightStyleId || "google-gradient",
      darkPresetId: fallbackTheme?.darkStyleId || "classic-dark",
    })
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
  const syncDelete = settings?.features?.conversations?.syncDelete
  const inlineBookmarkMode = settings?.features?.outline?.inlineBookmarkMode
  const hasSettings = Boolean(settings)
  const quickButtonsSettings = settings?.quickButtons || DEFAULT_SETTINGS.quickButtons
  const collapsedButtons = quickButtonsSettings.collapsed
  const floatingToolbarEnabled =
    collapsedButtons.find((btn) => btn.id === "floatingToolbar")?.enabled ?? true
  const floatingToolbarOpen = quickButtonsSettings.floatingToolbar?.open ?? true
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
    async (event?: ThemeTransitionOrigin) => {
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

    const handler = (
      message: { type?: string } | undefined,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: { success: boolean }) => void,
    ) => {
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
    const handleExtensionUpdateAvailable = (event: Event) => {
      const customEvent = event as CustomEvent<{ version?: string }>
      const nextVersion =
        customEvent.detail?.version || window.__OPHEL_PENDING_UPDATE_VERSION__ || null

      setExtensionUpdateVersion(nextVersion)
      setShowExtensionUpdateNotice(true)
    }

    window.addEventListener(EVENT_EXTENSION_UPDATE_AVAILABLE, handleExtensionUpdateAvailable)

    if (window.__OPHEL_EXTENSION_UPDATE_AVAILABLE__) {
      setShowExtensionUpdateNotice(true)
      setExtensionUpdateVersion(window.__OPHEL_PENDING_UPDATE_VERSION__ || null)
    }

    return () => {
      window.removeEventListener(EVENT_EXTENSION_UPDATE_AVAILABLE, handleExtensionUpdateAvailable)
    }
  }, [])

  useEffect(() => {
    window.__OPHEL_EXTENSION_UPDATE_NOTICE_ACTIVE__ = showExtensionUpdateNotice

    if (showExtensionUpdateNotice) {
      document.getElementById("ophel-extension-update-fallback")?.remove()
    }

    return () => {
      window.__OPHEL_EXTENSION_UPDATE_NOTICE_ACTIVE__ = false
    }
  }, [showExtensionUpdateNotice])

  const handleDismissExtensionUpdateNotice = useCallback(() => {
    window.__OPHEL_EXTENSION_UPDATE_AVAILABLE__ = false
    setShowExtensionUpdateNotice(false)
  }, [])

  const handleReloadAfterExtensionUpdate = useCallback(() => {
    window.location.reload()
  }, [])

  useEffect(() => {
    if (!conversationManager) return
    conversationManager.updateSettings({
      syncUnpin: syncUnpin ?? false,
      syncDelete: syncDelete ?? true,
    })
  }, [conversationManager, syncUnpin, syncDelete])

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
    showToast(
      t("exportStarted") || "正在导出会话，请勿操作当前页面...",
      EXPORT_START_TOAST_DURATION,
    )
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
    onOpenGlobalSearch: openGlobalSearchByShortcut,
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

      // 防守：如果事件来自队列 overlay 内部，不拦截（让队列自己处理）
      const path = e.composedPath()
      const isFromQueue = path.some(
        (el) =>
          el instanceof HTMLElement &&
          (el.classList?.contains("gh-queue-panel") ||
            el.classList?.contains("gh-queue-input") ||
            el.classList?.contains("gh-queue-item-edit-input")),
      )
      if (isFromQueue) return

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

  const extensionUpdateKickerText = getLocalizedText({
    key: "extensionUpdateNoticeKicker",
    fallback: "Extension updated",
  })
  const extensionUpdateDescription = extensionUpdateVersion
    ? formatLocalizedText(
        {
          key: "extensionUpdateNoticeWithVersion",
          fallback: `${APP_DISPLAY_NAME} has been updated to v{version}. Reload this page to keep using the latest version.`,
        },
        { version: extensionUpdateVersion },
      )
    : getLocalizedText({
        key: "extensionUpdateNotice",
        fallback: `${APP_DISPLAY_NAME} has been updated. Reload this page to keep using the latest version.`,
      })
  const extensionUpdateActionLabel = getLocalizedText({
    key: "extensionUpdateNoticeAction",
    fallback: "Reload page",
  })
  const extensionUpdateCloseLabel = t("close") || "关闭"

  const outlineRoleLabels = useMemo(
    () => ({
      query: getLocalizedText({ key: "outlineOnlyUserQueries", fallback: "Query" }),
      reply: getLocalizedText({ key: "globalSearchOutlineReplies", fallback: "Replies" }),
    }),
    [getLocalizedText],
  )

  const renderSearchResultItem = (item: GlobalSearchResultItem, index: number) => (
    <GlobalSearchResultItemView
      key={item.id}
      item={item}
      index={index}
      optionIdPrefix={GLOBAL_SEARCH_OPTION_ID_PREFIX}
      isActive={index === settingsSearchActiveIndex}
      highlightTokens={settingsSearchHighlightTokens}
      outlineRoleLabels={outlineRoleLabels}
      matchReasonLabels={resolvedGlobalSearchMatchReasonLabels}
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
        setSettingsSearchNavigationMode("pointer")
        scheduleGlobalSearchPointerPreview({
          item,
          anchorElement: event.currentTarget,
        })
      }}
      onMouseLeave={() => {
        scheduleHideGlobalSearchPromptPreview()
      }}
      onClick={() => navigateToSearchResult(item)}
    />
  )

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
      <GlobalSearchOverlay
        isOpen={isGlobalSettingsSearchOpen}
        onClose={() => {
          hideGlobalSearchPromptPreview()
          closeGlobalSettingsSearch()
        }}
        inputRef={settingsSearchInputRef}
        resultsRef={settingsSearchResultsRef}
        activeOptionId={activeGlobalSearchOptionId}
        inputValue={settingsSearchInputValue}
        inputPlaceholder={
          globalSearchPrimaryShortcutLabel
            ? `${resolvedActiveGlobalSearchCategoryText.placeholder}（${globalSearchPrimaryShortcutLabel}）`
            : resolvedActiveGlobalSearchCategoryText.placeholder
        }
        onInputChange={(nextValue) => {
          commitSettingsSearchInputValue(nextValue)
          setActiveSearchSyntaxSuggestionIndex(-1)
          setSettingsSearchActiveIndex(0)
        }}
        hotkeyLabel={globalSearchOverlayHotkeyLabel}
        fuzzySearchToggleLabel={getLocalizedText({
          key: "globalSearchFuzzySearchToggle",
          fallback: "Fuzzy",
        })}
        fuzzySearchToggleAriaLabel={getLocalizedText({
          key: "globalSearchFuzzySearchToggleAria",
          fallback: "Toggle fuzzy search",
        })}
        isFuzzySearchEnabled={isGlobalSearchFuzzySearchEnabled}
        onToggleFuzzySearch={toggleGlobalSearchFuzzySearch}
        syntaxHelpTriggerRef={globalSearchSyntaxHelpTriggerRef}
        syntaxHelpPopoverRef={globalSearchSyntaxHelpPopoverRef}
        showSyntaxHelp={showGlobalSearchSyntaxHelp}
        onToggleSyntaxHelp={() => setShowGlobalSearchSyntaxHelp((previous) => !previous)}
        syntaxHelpTriggerAriaLabel={getLocalizedText({
          key: "globalSearchSyntaxHelpTriggerAria",
          fallback: "Open search syntax help",
        })}
        syntaxHelpTitle={globalSearchSyntaxHelpTitle}
        syntaxHelpDescription={globalSearchSyntaxHelpDescription}
        syntaxHelpItems={globalSearchSyntaxHelpItems}
        onApplySyntaxHelpItem={applyGlobalSearchSyntaxHelpItem}
        activeFilterChips={activeGlobalSearchFilterChips}
        hasOverflowFilterChips={hasOverflowGlobalSearchFilterChips}
        overflowFilterChipText={formatLocalizedText(
          {
            key: "globalSearchSyntaxChipOverflow",
            fallback: "+{count} more",
          },
          {
            count: String(
              activeGlobalSearchSyntaxFilters.length - GLOBAL_SEARCH_FILTER_CHIP_MAX_COUNT,
            ),
          },
        )}
        filterChipRemoveTitle={getLocalizedText({
          key: "globalSearchSyntaxChipRemove",
          fallback: "Click to remove filter",
        })}
        clearFiltersLabel={getLocalizedText({ key: "clear", fallback: "Clear" })}
        onRemoveFilterChip={handleRemoveGlobalSearchFilterChip}
        onClearAllFilterChips={clearAllGlobalSearchSyntaxFilters}
        shouldShowSyntaxSuggestions={shouldShowGlobalSearchSyntaxSuggestions}
        syntaxSuggestions={globalSearchSyntaxSuggestions}
        activeSyntaxSuggestionIndex={activeSearchSyntaxSuggestionIndex}
        onHoverSyntaxSuggestion={setActiveSearchSyntaxSuggestionIndex}
        onApplySyntaxSuggestion={applyGlobalSearchSyntaxSuggestion}
        syntaxDiagnostics={activeGlobalSearchSyntaxDiagnostics}
        resolveSyntaxDiagnosticTitle={(code) =>
          globalSearchSyntaxDiagnosticMessages[
            code as keyof typeof globalSearchSyntaxDiagnosticMessages
          ] || globalSearchSyntaxDiagnosticMessages.invalidValue
        }
        showShortcutNudge={showGlobalSearchShortcutNudge}
        shortcutNudgeMessage={globalSearchShortcutNudgeMessage}
        closeLabel={getLocalizedText({ key: "close", fallback: "Close" })}
        dismissShortcutNudgeLabel={getLocalizedText({
          key: "globalSearchShortcutNudgeDismiss",
          fallback: "Don’t remind me",
        })}
        onHideShortcutNudge={hideGlobalSearchShortcutNudge}
        onDismissShortcutNudgeForever={dismissGlobalSearchShortcutNudgeForever}
        categoriesLabel={getLocalizedText({
          key: "globalSearchCategoriesLabel",
          fallback: "Global search categories",
        })}
        categories={GLOBAL_SEARCH_CATEGORY_DEFINITIONS.map((category) => ({
          id: category.id,
          label: resolvedGlobalSearchCategoryLabels[category.id],
          count: globalSearchResultCounts[category.id],
        }))}
        activeCategoryId={activeGlobalSearchCategory}
        onSelectCategory={(categoryId) => {
          setActiveGlobalSearchCategory(categoryId)
          setSettingsSearchActiveIndex(0)
        }}
        activeContext={activeGlobalSearchContext}
        listboxId={GLOBAL_SEARCH_RESULTS_LISTBOX_ID}
        listboxLabel={globalSearchListboxLabel}
        onResultsWheel={() => {
          setSettingsSearchNavigationMode("pointer")
          settingsSearchWheelFreezeUntilRef.current = Date.now() + 200
          hideGlobalSearchPromptPreview()
        }}
        visibleResults={visibleGlobalSearchResults}
        groupedResults={groupedGlobalSearchResults}
        getGroupLabel={(categoryId) => resolvedGlobalSearchResultCategoryLabels[categoryId]}
        allCategoryItemLimit={GLOBAL_SEARCH_ALL_CATEGORY_ITEM_LIMIT}
        isAllCategory={activeGlobalSearchCategory === "all"}
        emptyText={resolvedActiveGlobalSearchCategoryText.emptyText}
        emptyGuideTitle={getLocalizedText({
          key: "globalSearchSyntaxEmptyGuideTitle",
          fallback: "Try search filters",
        })}
        emptyGuideDescription={getLocalizedText({
          key: "globalSearchSyntaxEmptyGuideDesc",
          fallback: "Use filter syntax to narrow results quickly",
        })}
        emptyGuideExamples={[
          {
            id: "example:type-prompts",
            token: "type:prompts",
            onClick: () => syncSettingsSearchInputAndQuery("type:prompts "),
          },
          {
            id: "example:is-pinned",
            token: "is:pinned",
            onClick: () => syncSettingsSearchInputAndQuery("is:pinned "),
          },
          {
            id: "example:folder-inbox",
            token: "folder:inbox",
            onClick: () => syncSettingsSearchInputAndQuery("folder:inbox "),
          },
          {
            id: "example:tag-work",
            token: "tag:work",
            onClick: () => syncSettingsSearchInputAndQuery("tag:work "),
          },
          {
            id: "example:level-0",
            token: "level:0",
            onClick: () => syncSettingsSearchInputAndQuery("level:0 "),
          },
          {
            id: "example:date-7d",
            token: "date:7d",
            onClick: () => syncSettingsSearchInputAndQuery("date:7d "),
          },
        ]}
        renderSearchResultItem={renderSearchResultItem}
        resolveVisibleResultIndex={(item, fallbackIndex) =>
          visibleSearchResultIndexMap.get(item.id) ?? fallbackIndex
        }
        collapseLabel={getLocalizedText({ key: "collapse", fallback: "Collapse" })}
        moreLabel={getLocalizedText({ key: "floatingToolbarMore", fallback: "More" })}
        onToggleCategoryGroup={handleToggleGlobalSearchGroup}
        footerTips={getLocalizedText({
          key: "globalSearchFooterTips",
          fallback: "Enter to jump · ↑↓ to select · Tab category · Esc to close",
        })}
        promptPreview={
          globalSearchPromptPreview && globalSearchPromptPreviewPosition ? (
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
          ) : undefined
        }
      />
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
      {adapter && queueDispatcher && (settings?.features?.prompts?.promptQueue ?? false) && (
        <QueueOverlay adapter={adapter} dispatcher={queueDispatcher} />
      )}
      {showExtensionUpdateNotice && (
        <section className="gh-update-notice gh-interactive" role="status" aria-live="polite">
          <button
            type="button"
            className="gh-update-notice-close"
            aria-label={extensionUpdateCloseLabel}
            onClick={handleDismissExtensionUpdateNotice}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <div className="gh-update-notice-kicker">
            <svg
              className="gh-update-notice-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            {extensionUpdateKickerText}
          </div>
          <p className="gh-update-notice-message">{extensionUpdateDescription}</p>
          <div className="gh-update-notice-actions">
            <button
              type="button"
              className="gh-update-notice-button gh-update-notice-button--primary"
              onClick={handleReloadAfterExtensionUpdate}>
              {extensionUpdateActionLabel}
            </button>
          </div>
        </section>
      )}
      <DisclaimerModal />
    </div>
  )
}
