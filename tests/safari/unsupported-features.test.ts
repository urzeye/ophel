import type { ModulesContext } from "~core/modules-init"
import type { Settings } from "~utils/storage"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  callback: undefined as undefined | ((settings: Settings) => void),
  start: vi.fn(),
  stop: vi.fn(),
  constructor: vi.fn(),
}))

vi.mock("~constants", () => ({
  SITE_IDS: {
    GEMINI: "gemini",
    GEMINI_ENTERPRISE: "gemini-enterprise",
    CHATGPT: "chatgpt",
    AISTUDIO: "aistudio",
  },
}))
vi.mock("~platform", () => ({
  platform: { hasCapability: () => process.env.PLASMO_BROWSER !== "safari" },
}))
vi.mock("~core/watermark-remover", () => ({
  WatermarkRemover: class {
    constructor() {
      state.constructor()
    }
    start = state.start
    stop = state.stop
  },
}))
vi.mock("~core/assistant-mermaid-renderer", () => ({ AssistantMermaidRenderer: vi.fn() }))
vi.mock("~core/chatgpt-perf-manager", () => ({ ChatGptPerfManager: vi.fn() }))
vi.mock("~core/copy-manager", () => ({
  CopyManager: class {
    updateSettings = vi.fn()
  },
}))
vi.mock("~core/layout-manager", () => ({ LayoutManager: vi.fn() }))
vi.mock("~core/markdown-fixer", () => ({ MarkdownFixer: vi.fn() }))
vi.mock("~core/model-locker", () => ({ ModelLocker: vi.fn() }))
vi.mock("~core/page-url-change-broadcaster", () => ({ startPageUrlChangeBroadcaster: vi.fn() }))
vi.mock("~core/reading-history", () => ({ ReadingHistoryManager: vi.fn() }))
vi.mock("~core/scroll-lock-manager", () => ({ ScrollLockManager: vi.fn() }))
vi.mock("~core/tab-manager", () => ({ TabManager: vi.fn() }))
vi.mock("~core/theme-manager", () => ({ ThemeManager: vi.fn(), ensureGlobalThemeManager: vi.fn() }))
vi.mock("~core/usage-counter-manager", () => ({ UsageCounterManager: vi.fn() }))
vi.mock("~core/user-query-markdown", () => ({ UserQueryMarkdownRenderer: vi.fn() }))
vi.mock("~stores/settings-store", () => ({
  getSettingsState: () => ({ language: "en" }),
  subscribeSettings: (callback: (settings: Settings) => void) => {
    state.callback = callback
    return () => {}
  },
}))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key, setLanguage: vi.fn() }))
vi.mock("~utils/storage", () => ({
  getSiteTheme: () => null,
  getSiteModelLock: () => null,
  getSitePanelAvoidance: () => ({ enabled: false }),
  getSitePageWidth: () => ({ enabled: false }),
  getSiteUserQueryWidth: () => ({ enabled: false }),
  getSiteZenMode: () => ({ enabled: false }),
  getSiteCleanMode: () => ({ enabled: false }),
  getSiteAutoHideInput: () => ({ enabled: false }),
  consumeClearAllFlag: vi.fn(),
  consumeSkipReadingHistoryRestoreFlag: vi.fn(),
  CLEAR_ALL_FLAG_TTL_MS: 1000,
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.callback = undefined
})
afterEach(() => vi.unstubAllEnvs())

it.each(["safari", "chrome", "firefox", "userscript"])(
  "preserves stored intent and gates both watermark lifecycle paths for %s",
  async (browser) => {
    vi.stubEnv("PLASMO_BROWSER", browser)
    const { initWatermarkRemover, subscribeModuleUpdates } = await import("~core/modules-init")
    const settings = Object.freeze({
      content: Object.freeze({ watermarkRemoval: true }),
    }) as Settings
    const context = {
      settings,
      siteId: "gemini",
      siteInstanceKey: "gemini",
      adapter: {
        getMarkdownFixerConfig: () => null,
        getCleanModeConfig: () => null,
        getPanelAvoidanceConfig: () => null,
        getAutoHideInputConfig: () => null,
        getEnhancementMode: () => "full",
        getAssistantMermaidSupportMode: () => "native",
      },
    } as unknown as ModulesContext
    initWatermarkRemover(context)
    subscribeModuleUpdates(context)
    expect(state.callback).toBeTypeOf("function")
    state.callback!(settings)

    if (browser === "safari") {
      expect(state.constructor).not.toHaveBeenCalled()
      expect(state.start).not.toHaveBeenCalled()
    } else {
      expect(state.constructor).toHaveBeenCalledOnce()
      expect(state.start).toHaveBeenCalledTimes(2)
      state.callback!({ content: { watermarkRemoval: false } } as Settings)
      expect(state.stop).toHaveBeenCalledOnce()
    }
    expect(settings.content.watermarkRemoval).toBe(true)
  },
)
