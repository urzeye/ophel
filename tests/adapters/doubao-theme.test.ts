import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

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
  }
}

const installDoubaoThemeGlobals = (options?: { systemDark?: boolean }) => {
  const storage = new MemoryStorage()
  const dispatchEvent = vi.fn()
  const createdElements: Array<{ id: string; textContent: string }> = []
  const htmlStyle: Record<string, string> = {}
  const bodyStyle: Record<string, string> = {}
  const htmlDataset: Record<string, string> = {}
  const bodyDataset: Record<string, string> = {}

  const documentStub = {
    getElementById: (id: string) => createdElements.find((element) => element.id === id) ?? null,
    createElement: () => {
      const element = { id: "", textContent: "" }
      createdElements.push(element)
      return element
    },
    head: { appendChild: vi.fn() },
    body: {
      classList: createClassList(),
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
      dataset: bodyDataset,
    },
    documentElement: {
      classList: createClassList(),
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
      dataset: htmlDataset,
      getAttribute: (name: string) => htmlDataset[name] ?? null,
      setAttribute: vi.fn(),
    },
    querySelectorAll: () => [],
    querySelector: () => null,
  }

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

  return { storage, dispatchEvent }
}

beforeEach(() => {
  installDoubaoThemeGlobals()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Doubao host theme storage", () => {
  it("writes only dbx-web-theme for light, dark, and system without dispatching storage events", async () => {
    const { storage, dispatchEvent } = installDoubaoThemeGlobals()
    const adapter = new DoubaoAdapter()

    await expect(adapter.toggleTheme("dark")).resolves.toBe(true)
    expect(storage.getItem("dbx-web-theme")).toBe("dark")

    await expect(adapter.toggleTheme("light")).resolves.toBe(true)
    expect(storage.getItem("dbx-web-theme")).toBe("light")

    await expect(adapter.toggleTheme("system")).resolves.toBe(true)
    expect(storage.getItem("dbx-web-theme")).toBe("system")

    expect(dispatchEvent).not.toHaveBeenCalled()
    expect(storage.getItem("theme")).toBeNull()
  })

  it("reads host preference and resolved mode from dbx-web-theme", () => {
    const { storage } = installDoubaoThemeGlobals({ systemDark: true })
    const adapter = new DoubaoAdapter()

    expect(adapter.detectHostThemePreference()).toBeNull()
    expect(adapter.detectHostThemeMode()).toBeNull()

    storage.setItem("dbx-web-theme", "dark")
    expect(adapter.detectHostThemePreference()).toBe("dark")
    expect(adapter.detectHostThemeMode()).toBe("dark")

    storage.setItem("dbx-web-theme", "light")
    expect(adapter.detectHostThemePreference()).toBe("light")
    expect(adapter.detectHostThemeMode()).toBe("light")

    storage.setItem("dbx-web-theme", "system")
    expect(adapter.detectHostThemePreference()).toBe("system")
    expect(adapter.detectHostThemeMode()).toBe("dark")
  })

  it("lets ThemeManager.setMode write dbx-web-theme through the shipped Doubao adapter path", async () => {
    const { storage, dispatchEvent } = installDoubaoThemeGlobals()
    const adapter = new DoubaoAdapter()
    const themeManager = new ThemeManager("light", undefined, adapter)

    await themeManager.setMode("dark")
    expect(storage.getItem("dbx-web-theme")).toBe("dark")

    await themeManager.setMode("light")
    expect(storage.getItem("dbx-web-theme")).toBe("light")

    await themeManager.setMode("system")
    expect(storage.getItem("dbx-web-theme")).toBe("system")

    expect(dispatchEvent).not.toHaveBeenCalled()
    themeManager.destroy()
  })

  it("keeps ThemeManager Doubao branches on dbx-web-theme without synthesizing storage events", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../src/core/theme-manager.ts", import.meta.url)),
      "utf8",
    )
    const adapterSource = readFileSync(
      fileURLToPath(new URL("../../src/adapters/doubao.ts", import.meta.url)),
      "utf8",
    )

    const doubaoSystemWrite = source.slice(
      source.indexOf("case SITE_IDS.DOUBAO:"),
      source.indexOf("case SITE_IDS.YUANBAO:", source.indexOf("case SITE_IDS.DOUBAO:")),
    )
    const doubaoPreferenceRead = source.slice(
      source.lastIndexOf("case SITE_IDS.DOUBAO: {"),
      source.indexOf("case SITE_IDS.YUANBAO: {", source.lastIndexOf("case SITE_IDS.DOUBAO: {")),
    )

    expect(doubaoSystemWrite).toContain('localStorage.setItem("dbx-web-theme", "system")')
    expect(doubaoSystemWrite).not.toContain("StorageEvent")
    expect(doubaoPreferenceRead).toContain('localStorage.getItem("dbx-web-theme")')
    expect(adapterSource).toContain('const DOUBAO_THEME_STORAGE_KEY = "dbx-web-theme"')
    expect(adapterSource).toContain("localStorage.setItem(DOUBAO_THEME_STORAGE_KEY, targetMode)")
    expect(adapterSource).not.toContain("new StorageEvent")
  })
})
