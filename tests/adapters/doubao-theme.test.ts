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

const installDoubaoThemeGlobals = (options?: { systemDark?: boolean; hostname?: string }) => {
  const storage = new MemoryStorage()
  const createdElements: Array<{ id: string; textContent: string }> = []
  const htmlStyle: Record<string, string> = {}
  const bodyStyle: Record<string, string> = {}
  const htmlAttrs: Record<string, string> = {}
  const bodyAttrs: Record<string, string> = {}
  const htmlClassList = createClassList()
  const bodyClassList = createClassList()
  const windowListeners = new Map<string, Set<(event: Event) => void>>()

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
      dataset: {} as Record<string, string>,
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
        if (name === "data-theme") {
          documentStub.documentElement.dataset.theme = value
        }
      },
      removeAttribute: (name: string) => {
        delete htmlAttrs[name]
        if (name === "data-theme") {
          delete documentStub.documentElement.dataset.theme
        }
      },
      dataset: {} as Record<string, string>,
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

  const observerCallbacks: Array<() => void> = []

  class MockMutationObserver {
    private callback: () => void

    constructor(callback: () => void) {
      this.callback = callback
      observerCallbacks.push(callback)
    }

    observe = vi.fn(() => {
      if (!observerCallbacks.includes(this.callback)) {
        observerCallbacks.push(this.callback)
      }
    })
    disconnect = vi.fn(() => {
      const idx = observerCallbacks.indexOf(this.callback)
      if (idx !== -1) observerCallbacks.splice(idx, 1)
    })
  }

  const triggerObservers = () => {
    for (const cb of [...observerCallbacks]) {
      cb()
    }
  }

  const dispatchEvent = vi.fn((event: Event) => {
    const listeners = windowListeners.get(event.type)
    if (listeners) {
      listeners.forEach((listener) => listener(event))
    }
    return true
  })

  vi.stubGlobal("StorageEvent", MockStorageEvent)
  vi.stubGlobal("localStorage", storage)
  vi.stubGlobal("MutationObserver", MockMutationObserver)
  vi.stubGlobal("document", documentStub)
  vi.stubGlobal("window", {
    location: new URL(`https://${options?.hostname ?? "www.doubao.com"}/chat/`),
    innerWidth: 1280,
    innerHeight: 720,
    dispatchEvent,
    addEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      if (!windowListeners.has(type)) {
        windowListeners.set(type, new Set())
      }
      windowListeners.get(type)!.add(listener)
    }),
    removeEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      windowListeners.get(type)?.delete(listener)
    }),
    matchMedia: (query: string) => ({
      matches: options?.systemDark === true && query.includes("prefers-color-scheme: dark"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  })

  return {
    storage,
    dispatchEvent,
    htmlAttrs,
    bodyAttrs,
    htmlClassList,
    bodyClassList,
    triggerObservers,
  }
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

  it("toggles theme: writes storage, strictly sets html[data-theme], leaves body clean, and dispatches StorageEvent", async () => {
    const { storage, dispatchEvent, htmlAttrs, bodyAttrs, htmlClassList, bodyClassList } =
      installDoubaoThemeGlobals()
    const adapter = new DoubaoAdapter()

    // 预设残存的旧污染属性
    bodyAttrs["theme-mode"] = "light"
    bodyAttrs["data-theme"] = "light"
    bodyClassList.add("light")
    htmlClassList.add("light")

    const result = await adapter.toggleTheme("dark")
    expect(result).toBe(true)
    expect(storage.getItem("dbx-web-theme")).toBe("dark")
    // 仅在 html 根节点设置 data-theme，契合豆包原生规范
    expect(htmlAttrs["data-theme"]).toBe("dark")

    // 绝对不能在 body 上残留 theme-mode / data-theme，否则会强行覆盖 Semi Design 输入框
    expect(bodyAttrs["theme-mode"]).toBeUndefined()
    expect(bodyAttrs["data-theme"]).toBeUndefined()
    expect(htmlClassList.contains("dark")).toBe(false)
    expect(htmlClassList.contains("light")).toBe(false)
    expect(bodyClassList.contains("dark")).toBe(false)
    expect(bodyClassList.contains("light")).toBe(false)

    expect(dispatchEvent).toHaveBeenCalled()
    const storageCall = dispatchEvent.mock.calls.find(
      (call) => call[0] instanceof StorageEvent && call[0].key === "dbx-web-theme",
    )
    expect(storageCall).toBeDefined()
    expect((storageCall![0] as StorageEvent).newValue).toBe("dark")
  })

  it("resolves system mode during toggleTheme without polluting body", async () => {
    const { storage, htmlAttrs, bodyAttrs } = installDoubaoThemeGlobals({ systemDark: true })
    const adapter = new DoubaoAdapter()

    await adapter.toggleTheme("system")
    expect(storage.getItem("dbx-web-theme")).toBe("system")
    expect(htmlAttrs["data-theme"]).toBe("dark")
    expect(bodyAttrs["theme-mode"]).toBeUndefined()
  })

  it("does not dispatch StorageEvent when the stored value is unchanged", async () => {
    const { storage, dispatchEvent, htmlAttrs } = installDoubaoThemeGlobals()
    storage.setItem("dbx-web-theme", "light")
    const adapter = new DoubaoAdapter()

    const result = await adapter.toggleTheme("light")
    expect(result).toBe(true)
    expect(storage.getItem("dbx-web-theme")).toBe("light")
    expect(htmlAttrs["data-theme"]).toBe("light")

    const storageCall = dispatchEvent.mock.calls.find(
      (call) => call[0] instanceof StorageEvent && call[0].key === "dbx-web-theme",
    )
    expect(storageCall).toBeUndefined()
  })

  it("cleans existing DOM pollution on adapter construction without overriding html theme", () => {
    const { storage, htmlAttrs, bodyAttrs, bodyClassList, htmlClassList } =
      installDoubaoThemeGlobals()
    storage.setItem("dbx-web-theme", "dark")
    htmlAttrs["data-theme"] = "dark"
    bodyAttrs["theme-mode"] = "light" // 历史遗留污染
    bodyClassList.add("light")
    htmlClassList.add("light")

    new DoubaoAdapter()
    expect(htmlAttrs["data-theme"]).toBe("dark")
    expect(bodyAttrs["theme-mode"]).toBeUndefined()
    expect(bodyClassList.contains("light")).toBe(false)
    expect(htmlClassList.contains("light")).toBe(false)
  })

  it("does not strip other sites' html.dark when constructed off Doubao", () => {
    const { htmlClassList, bodyAttrs, bodyClassList } = installDoubaoThemeGlobals({
      hostname: "chatgpt.com",
    })
    htmlClassList.add("dark")
    bodyAttrs["data-theme"] = "dark"
    bodyClassList.add("dark")

    new DoubaoAdapter()

    expect(htmlClassList.contains("dark")).toBe(true)
    expect(bodyAttrs["data-theme"]).toBe("dark")
    expect(bodyClassList.contains("dark")).toBe(true)
  })

  it("does not mutate host DOM while detecting theme mode", () => {
    const { bodyAttrs, htmlClassList } = installDoubaoThemeGlobals()
    bodyAttrs["theme-mode"] = "light"
    htmlClassList.add("light")

    const adapter = new DoubaoAdapter()
    // 构造函数会在豆包域上清污染；先把残留写回去再探测
    bodyAttrs["theme-mode"] = "light"
    htmlClassList.add("light")

    expect(adapter.detectHostThemeMode()).toBeNull()
    expect(bodyAttrs["theme-mode"]).toBe("light")
    expect(htmlClassList.contains("light")).toBe(true)
  })

  it("synchronizes ThemeManager when host switches theme natively or via storage", () => {
    const { storage, htmlAttrs, triggerObservers } = installDoubaoThemeGlobals()
    const adapter = new DoubaoAdapter()
    const themeManager = new ThemeManager("light", undefined, adapter)
    themeManager.startThemeMonitoring()

    expect(themeManager.getMode()).toBe("light")

    // 模拟豆包原生代码切换为深色模式：修改 dbx-web-theme 与 html[data-theme]
    storage.setItem("dbx-web-theme", "dark")
    htmlAttrs["data-theme"] = "dark"
    triggerObservers()

    expect(themeManager.getMode()).toBe("dark")
    expect(themeManager.getPreference()).toBe("dark")

    // 模拟豆包原生代码切换为浅色模式
    storage.setItem("dbx-web-theme", "light")
    htmlAttrs["data-theme"] = "light"
    triggerObservers()

    expect(themeManager.getMode()).toBe("light")
    expect(themeManager.getPreference()).toBe("light")

    themeManager.destroy()
  })

  it("synchronizes ThemeManager directly via window storage event", () => {
    const { storage } = installDoubaoThemeGlobals()
    const adapter = new DoubaoAdapter()
    const themeManager = new ThemeManager("light", undefined, adapter)
    themeManager.startThemeMonitoring()

    expect(themeManager.getMode()).toBe("light")

    storage.setItem("dbx-web-theme", "dark")
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "dbx-web-theme",
        newValue: "dark",
        storageArea: storage as unknown as Storage,
      }),
    )

    expect(themeManager.getMode()).toBe("dark")
    expect(themeManager.getPreference()).toBe("dark")

    themeManager.destroy()
  })

  it("integrates with ThemeManager setMode and system preference", async () => {
    const { storage, htmlAttrs } = installDoubaoThemeGlobals({ systemDark: true })
    const adapter = new DoubaoAdapter()
    const themeManager = new ThemeManager("light", undefined, adapter)

    await themeManager.setMode("dark")
    expect(storage.getItem("dbx-web-theme")).toBe("dark")
    expect(htmlAttrs["data-theme"]).toBe("dark")

    await themeManager.setMode("light")
    expect(storage.getItem("dbx-web-theme")).toBe("light")
    expect(htmlAttrs["data-theme"]).toBe("light")

    await themeManager.setMode("system")
    expect(storage.getItem("dbx-web-theme")).toBe("system")
    expect(htmlAttrs["data-theme"]).toBe("dark")

    themeManager.destroy()
  })
})
