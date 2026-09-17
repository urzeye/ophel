import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DoubaoAdapter } from "~adapters/doubao"
import { ThemeManager } from "~core/theme-manager"

vi.mock("~utils/export-assets", () => ({
  createExportAssetCollector: vi.fn(() => ({ assets: [], usedPaths: new Set() })),
  formatExportFileAttachments: vi.fn(() => ""),
  formatExportImageAttachments: vi.fn(() => ""),
  isDownloadableExportAssetUrl: vi.fn(() => false),
  normalizeExportAssetUrl: vi.fn(() => null),
}))

vi.mock("~utils/exporter", () => ({
  htmlToMarkdown: vi.fn(() => ""),
}))

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

vi.mock("~utils/i18n", () => ({
  t: (key: string) => key,
}))

class MemoryStorage {
  private readonly data = new Map<string, string>()

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value))
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  clear(): void {
    this.data.clear()
  }
}

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
    toggle: (token: string, force?: boolean) => {
      const shouldHave = force !== undefined ? force : !tokens.has(token)
      if (shouldHave) {
        tokens.add(token)
      } else {
        tokens.delete(token)
      }
      return shouldHave
    },
  }
}

const installDoubaoThemeGlobals = (options?: { systemDark?: boolean }) => {
  const storage = new MemoryStorage()
  const dispatchEvent = vi.fn()
  const createdElements: Array<{ id: string; textContent: string }> = []
  const htmlStyle: Record<string, string> = {}
  const bodyStyle: Record<string, string> = {}
  const htmlAttrs: Record<string, string> = {}
  const bodyAttrs: Record<string, string> = {}
  const htmlClassList = createClassList()
  const bodyClassList = createClassList()

  const documentStub = {
    getElementById: (id: string) => createdElements.find((element) => element.id === id) ?? null,
    createElement: () => {
      const element = { id: "", textContent: "" }
      createdElements.push(element)
      return element
    },
    head: { appendChild: vi.fn() },
    body: {
      classList: bodyClassList,
      className: "",
      style: {
        colorScheme: "",
        setProperty: (key: string, value: string) => {
          bodyStyle[key] = value
        },
        getPropertyValue: (key: string) => bodyStyle[key] ?? "",
        removeProperty: (key: string) => {
          delete bodyStyle[key]
        },
      },
      getAttribute: (name: string) => bodyAttrs[name] ?? null,
      setAttribute: (name: string, value: string) => {
        bodyAttrs[name] = value
      },
      removeAttribute: (name: string) => {
        delete bodyAttrs[name]
      },
      dataset: {},
    },
    documentElement: {
      classList: htmlClassList,
      className: "",
      style: {
        colorScheme: "",
        setProperty: (key: string, value: string) => {
          htmlStyle[key] = value
        },
        getPropertyValue: (key: string) => htmlStyle[key] ?? "",
        removeProperty: (key: string) => {
          delete htmlStyle[key]
        },
      },
      getAttribute: (name: string) => htmlAttrs[name] ?? null,
      setAttribute: (name: string, value: string) => {
        htmlAttrs[name] = value
      },
      removeAttribute: (name: string) => {
        delete htmlAttrs[name]
      },
      dataset: {},
    },
    querySelectorAll: () => [],
    querySelector: () => null,
  }

  class MockStorageEvent extends Event {
    key: string | null
    oldValue: string | null
    newValue: string | null
    storageArea: unknown

    constructor(
      type: string,
      init?: {
        key?: string
        oldValue?: string | null
        newValue?: string | null
        storageArea?: unknown
      },
    ) {
      super(type)
      this.key = init?.key ?? null
      this.oldValue = init?.oldValue ?? null
      this.newValue = init?.newValue ?? null
      this.storageArea = init?.storageArea ?? null
    }
  }
  vi.stubGlobal("StorageEvent", MockStorageEvent)
  vi.stubGlobal("localStorage", storage)
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
  vi.stubGlobal("document", documentStub)
  vi.stubGlobal("window", {
    location: new URL("https://www.doubao.com/chat/"),
    innerWidth: 1280,
    innerHeight: 720,
    dispatchEvent,
    matchMedia: (query: string) => ({
      matches: options?.systemDark === true && query.includes("prefers-color-scheme: dark"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  })

  return { storage, dispatchEvent, htmlAttrs, bodyAttrs, htmlClassList, bodyClassList }
}

describe("Doubao theme adaptation", () => {
  beforeEach(() => {
    installDoubaoThemeGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("supports host theme sync and accepts system theme preference", () => {
    const adapter = new DoubaoAdapter()
    expect(adapter.supportsHostThemeSync()).toBe(true)
    expect(adapter.acceptsSystemThemePreference()).toBe(true)
  })

  it("detects host theme preference from localStorage dbx-web-theme", () => {
    const { storage } = installDoubaoThemeGlobals()
    const adapter = new DoubaoAdapter()

    expect(adapter.detectHostThemePreference()).toBeNull()

    storage.setItem("dbx-web-theme", "dark")
    expect(adapter.detectHostThemePreference()).toBe("dark")

    storage.setItem("dbx-web-theme", "light")
    expect(adapter.detectHostThemePreference()).toBe("light")

    storage.setItem("dbx-web-theme", "system")
    expect(adapter.detectHostThemePreference()).toBe("system")

    storage.setItem("dbx-web-theme", "invalid")
    expect(adapter.detectHostThemePreference()).toBeNull()
  })

  it("detects resolved host theme mode with matchMedia fallback", () => {
    const { storage } = installDoubaoThemeGlobals({ systemDark: true })
    const adapter = new DoubaoAdapter()

    storage.setItem("dbx-web-theme", "dark")
    expect(adapter.detectHostThemeMode()).toBe("dark")

    storage.setItem("dbx-web-theme", "light")
    expect(adapter.detectHostThemeMode()).toBe("light")

    storage.setItem("dbx-web-theme", "system")
    expect(adapter.detectHostThemeMode()).toBe("dark")
  })

  it("falls back to html[data-theme] attribute when dbx-web-theme is unset", () => {
    const { htmlAttrs } = installDoubaoThemeGlobals()
    const adapter = new DoubaoAdapter()

    expect(adapter.detectHostThemeMode()).toBeNull()

    htmlAttrs["data-theme"] = "dark"
    expect(adapter.detectHostThemeMode()).toBe("dark")

    htmlAttrs["data-theme"] = "light"
    expect(adapter.detectHostThemeMode()).toBe("light")
  })

  it("toggles theme: writes storage, applies DOM hints, and dispatches StorageEvent", async () => {
    const { storage, dispatchEvent, htmlAttrs, bodyAttrs, htmlClassList, bodyClassList } =
      installDoubaoThemeGlobals()
    const adapter = new DoubaoAdapter()

    const result = await adapter.toggleTheme("dark")
    expect(result).toBe(true)
    expect(storage.getItem("dbx-web-theme")).toBe("dark")
    expect(htmlAttrs["data-theme"]).toBe("dark")
    expect(bodyAttrs["data-theme"]).toBe("dark")
    expect(bodyAttrs["theme-mode"]).toBe("dark")
    expect(htmlClassList.contains("dark")).toBe(true)
    expect(htmlClassList.contains("light")).toBe(false)
    expect(bodyClassList.contains("dark")).toBe(true)
    expect(bodyClassList.contains("light")).toBe(false)

    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    const event = dispatchEvent.mock.calls[0][0]
    expect(event).toBeInstanceOf(StorageEvent)
    expect(event.key).toBe("dbx-web-theme")
    expect(event.newValue).toBe("dark")
  })

  it("resolves system mode during toggleTheme and applies correct DOM hints", async () => {
    const { storage, htmlAttrs, htmlClassList } = installDoubaoThemeGlobals({ systemDark: true })
    const adapter = new DoubaoAdapter()

    await adapter.toggleTheme("system")
    expect(storage.getItem("dbx-web-theme")).toBe("system")
    expect(htmlAttrs["data-theme"]).toBe("dark")
    expect(htmlClassList.contains("dark")).toBe(true)
  })

  it("initializes DOM hints on adapter construction if theme is already present", () => {
    const { storage, htmlAttrs, htmlClassList } = installDoubaoThemeGlobals()
    storage.setItem("dbx-web-theme", "dark")

    new DoubaoAdapter()
    expect(htmlAttrs["data-theme"]).toBe("dark")
    expect(htmlClassList.contains("dark")).toBe(true)
  })

  it("integrates with ThemeManager setMode and system preference", async () => {
    const { storage } = installDoubaoThemeGlobals({ systemDark: true })
    const adapter = new DoubaoAdapter()
    const themeManager = new ThemeManager("light", undefined, adapter)

    await themeManager.setMode("dark")
    expect(storage.getItem("dbx-web-theme")).toBe("dark")

    await themeManager.setMode("light")
    expect(storage.getItem("dbx-web-theme")).toBe("light")

    await themeManager.setMode("system")
    expect(storage.getItem("dbx-web-theme")).toBe("system")

    themeManager.destroy()
  })
})
