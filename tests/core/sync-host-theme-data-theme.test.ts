import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  const classList = {
    contains: () => false,
    add() {},
    remove() {},
  }
  const chromeGlobal = globalThis as {
    chrome?: {
      runtime?: Record<string, unknown>
      storage?: { local: { set: (...args: unknown[]) => void; get: (...args: unknown[]) => void } }
    }
  }
  chromeGlobal.chrome = {
    ...chromeGlobal.chrome,
    runtime: {
      getManifest: () => ({ version: "0.0.0-test" }),
      getURL: (path: string) => `chrome-extension://ophel-test/${path}`,
      lastError: undefined,
      ...chromeGlobal.chrome?.runtime,
    },
    storage: {
      local: {
        set: (_items: unknown, callback?: () => void) => {
          callback?.()
        },
        get: (_keys: unknown, callback?: (items: Record<string, unknown>) => void) => {
          callback?.({})
        },
      },
    },
  }
  ;(globalThis as { document?: unknown }).document = {
    documentElement: {
      classList,
      className: "",
      getAttribute: () => null,
      dataset: {},
    },
    body: {
      classList,
      className: "",
      style: { colorScheme: "" },
      dataset: {},
    },
    getElementById: () => null,
    createElement: () => ({ id: "", textContent: "" }),
    head: { appendChild() {} },
    querySelectorAll: () => [],
    querySelector: () => null,
  }
  ;(globalThis as { window?: unknown }).window = globalThis
})

import type { SiteAdapter } from "~adapters/base"
import { getModuleInstances, syncHostThemeWithSettings } from "~core/modules-init"
import type { ThemeManager } from "~core/theme-manager"
import { DEFAULT_SETTINGS } from "~constants/default-settings"
import type { Settings } from "~types/settings"

const createClassList = () => {
  const tokens = new Set<string>()
  return {
    contains: (token: string) => tokens.has(token),
    add: (...values: string[]) => {
      for (const value of values) tokens.add(value)
    },
    remove: (...values: string[]) => {
      for (const value of values) tokens.delete(value)
    },
  }
}

const stubHostDocument = (htmlDataTheme: string | null) => {
  const attributes: Record<string, string> = {}
  if (htmlDataTheme) {
    attributes["data-theme"] = htmlDataTheme
  }

  vi.stubGlobal("document", {
    documentElement: {
      classList: createClassList(),
      className: "",
      getAttribute: (name: string) => attributes[name] ?? null,
      dataset: htmlDataTheme ? { theme: htmlDataTheme } : {},
    },
    body: {
      classList: createClassList(),
      className: "",
      style: { colorScheme: "" },
      dataset: {},
    },
  })
}

const createSettings = (mode: "light" | "dark"): Settings => {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.theme.sites.doubao = {
    ...settings.theme.sites.doubao,
    mode,
  }
  return settings
}

const createAdapter = () => {
  const detectHostThemeMode = vi.fn(() => null)
  const toggleTheme = vi.fn().mockResolvedValue(true)
  const adapter = {
    supportsHostThemeSync: () => true,
    detectHostThemeMode,
    toggleTheme,
  } as unknown as SiteAdapter
  return { adapter, detectHostThemeMode, toggleTheme }
}

describe("syncHostThemeWithSettings html[data-theme]", () => {
  const applyTheme = vi.fn()
  let previousThemeManager: ThemeManager | null

  beforeEach(() => {
    vi.clearAllMocks()
    previousThemeManager = getModuleInstances().themeManager
    getModuleInstances().themeManager = { applyTheme } as unknown as ThemeManager
  })

  afterEach(() => {
    getModuleInstances().themeManager = previousThemeManager
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("writes light when html[data-theme]=dark and Ophel target is light", async () => {
    stubHostDocument("dark")
    const { adapter, detectHostThemeMode, toggleTheme } = createAdapter()

    await syncHostThemeWithSettings({
      adapter,
      settings: createSettings("light"),
      siteId: "doubao",
      siteInstanceKey: "doubao",
    })

    expect(toggleTheme).toHaveBeenCalledTimes(1)
    expect(toggleTheme).toHaveBeenCalledWith("light")
    expect(applyTheme).toHaveBeenCalledWith("light")
    expect(detectHostThemeMode).not.toHaveBeenCalled()
  })

  it("does not extra-write when html[data-theme]=dark and Ophel target is dark", async () => {
    stubHostDocument("dark")
    const { adapter, detectHostThemeMode, toggleTheme } = createAdapter()

    await syncHostThemeWithSettings({
      adapter,
      settings: createSettings("dark"),
      siteId: "doubao",
      siteInstanceKey: "doubao",
    })

    expect(toggleTheme).not.toHaveBeenCalled()
    expect(applyTheme).not.toHaveBeenCalled()
    expect(detectHostThemeMode).not.toHaveBeenCalled()
  })
})
