import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface TestManifest {
  id: string
  matches: string[]
}

interface TestPack {
  manifest: TestManifest
  source: "local" | "registry"
  installedAt: number
  enabled: boolean
}

interface TestSnapshot {
  packs: TestPack[]
  issues: unknown[]
}

interface TestOriginBinding {
  mode: "explicit"
  packId: string
}

interface TestOriginBindings {
  bindings: Record<string, TestOriginBinding>
}

interface TestDeclarativeAdapterOptions {
  explicitOrigin?: string
  installSource?: "local" | "registry"
}

interface TestAdapterShape {
  getSiteId(): string
  match(): boolean
  getBuiltinConfig(): Record<string, never>
}

const registryTestState = vi.hoisted(() => {
  const builtinMatches = new Set<string>()
  const constructorFailureIds = new Set<string>()
  const events: string[] = []
  const declarativeInstances: FakeDeclarativeAdapter[] = []
  const snapshot: TestSnapshot = { packs: [], issues: [] }
  const originBindings: TestOriginBindings = { bindings: {} }

  const getCurrentUrl = (): URL | null => {
    try {
      return new URL(globalThis.window.location.href)
    } catch {
      return null
    }
  }

  class FakeSiteAdapter {}

  class FakeDeclarativeAdapter extends FakeSiteAdapter {
    readonly manifest: TestManifest
    readonly options: TestDeclarativeAdapterOptions

    constructor(manifest: TestManifest, options: TestDeclarativeAdapterOptions = {}) {
      super()
      if (constructorFailureIds.has(manifest.id)) {
        throw new Error(`constructor failed for ${manifest.id}`)
      }
      this.manifest = manifest
      this.options = options
      declarativeInstances.push(this)
    }

    getSiteId(): string {
      return `pack:${this.manifest.id}`
    }

    match(): boolean {
      const currentUrl = getCurrentUrl()
      if (!currentUrl) return false

      const forcedOrigin = this.options.explicitOrigin
      if (forcedOrigin) return currentUrl.origin === forcedOrigin

      return this.manifest.matches.some((pattern) => {
        const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern
        return currentUrl.href.startsWith(prefix)
      })
    }
  }

  const createBuiltinAdapterClass = (siteId: string) =>
    class extends FakeSiteAdapter implements TestAdapterShape {
      getSiteId(): string {
        return siteId
      }

      match(): boolean {
        return builtinMatches.has(siteId)
      }

      getBuiltinConfig(): Record<string, never> {
        return {}
      }
    }

  const getEnabledPacks = vi.fn(async () => {
    events.push("packs")
    return snapshot
  })
  const getOriginBindings = vi.fn(async () => {
    events.push("bindings")
    return originBindings
  })
  const applyCachedBuiltinAdapterConfig = vi.fn(async (adapter: TestAdapterShape) => {
    events.push(`patch:${adapter.getSiteId()}`)
  })
  const primeDynamicPlatforms = vi.fn()

  return {
    FakeDeclarativeAdapter,
    FakeSiteAdapter,
    applyCachedBuiltinAdapterConfig,
    builtinMatches,
    constructorFailureIds,
    createBuiltinAdapterClass,
    declarativeInstances,
    events,
    getEnabledPacks,
    getOriginBindings,
    originBindings,
    primeDynamicPlatforms,
    snapshot,
  }
})

vi.mock("~core/pack-manager", () => ({
  isInstalledSitePackEffectivelyEnabled: (pack: TestPack) => pack.enabled,
}))

vi.mock("~core/pack-manager-runtime", () => ({
  createRuntimePackManager: () => ({
    getEnabledPacks: registryTestState.getEnabledPacks,
    getOriginBindings: registryTestState.getOriginBindings,
  }),
}))

vi.mock("~core/platform-catalog", () => ({
  primeDynamicPlatforms: registryTestState.primeDynamicPlatforms,
}))

vi.mock("~core/site-adapter-config-runtime", () => ({
  applyCachedBuiltinAdapterConfig: registryTestState.applyCachedBuiltinAdapterConfig,
}))

vi.mock("~platform", () => ({
  platform: { storage: { kind: "test-storage" } },
}))

vi.mock("~adapters/base", () => ({
  SiteAdapter: registryTestState.FakeSiteAdapter,
}))

vi.mock("~adapters/declarative", () => ({
  DeclarativeAdapter: registryTestState.FakeDeclarativeAdapter,
  applyMergedConfig: vi.fn(),
  supportsBuiltinSiteConfig: () => true,
}))

vi.mock("~adapters/aistudio", () => ({
  AIStudioAdapter: registryTestState.createBuiltinAdapterClass("aistudio"),
}))
vi.mock("~adapters/chatglm", () => ({
  ChatGLMAdapter: registryTestState.createBuiltinAdapterClass("chatglm"),
}))
vi.mock("~adapters/chatgpt", () => ({
  ChatGPTAdapter: registryTestState.createBuiltinAdapterClass("chatgpt"),
}))
vi.mock("~adapters/claude", () => ({
  ClaudeAdapter: registryTestState.createBuiltinAdapterClass("claude"),
}))
vi.mock("~adapters/deepseek", () => ({
  DeepSeekAdapter: registryTestState.createBuiltinAdapterClass("deepseek"),
}))
vi.mock("~adapters/doubao", () => ({
  DoubaoAdapter: registryTestState.createBuiltinAdapterClass("doubao"),
}))
vi.mock("~adapters/gemini", () => ({
  GeminiAdapter: registryTestState.createBuiltinAdapterClass("gemini"),
}))
vi.mock("~adapters/gemini-enterprise", () => ({
  GeminiEnterpriseAdapter: registryTestState.createBuiltinAdapterClass("gemini-enterprise"),
}))
vi.mock("~adapters/grok", () => ({
  GrokAdapter: registryTestState.createBuiltinAdapterClass("grok"),
}))
vi.mock("~adapters/ima", () => ({
  ImaAdapter: registryTestState.createBuiltinAdapterClass("ima"),
}))
vi.mock("~adapters/kimi", () => ({
  KimiAdapter: registryTestState.createBuiltinAdapterClass("kimi"),
}))
vi.mock("~adapters/qianwen", () => ({
  QianwenAdapter: registryTestState.createBuiltinAdapterClass("qianwen"),
}))
vi.mock("~adapters/qwen-studio", () => ({
  QwenAiAdapter: registryTestState.createBuiltinAdapterClass("qwenai"),
}))
vi.mock("~adapters/yuanbao", () => ({
  YuanbaoAdapter: registryTestState.createBuiltinAdapterClass("yuanbao"),
}))
vi.mock("~adapters/zai", () => ({
  ZaiAdapter: registryTestState.createBuiltinAdapterClass("zai"),
}))

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../..")

interface CreatePackOptions {
  id: string
  installedAt?: number
  matches?: string[]
  enabled?: boolean
  source?: "local" | "registry"
}

const createPack = ({
  id,
  installedAt = 1,
  matches = [`https://${id}.example/*`],
  enabled = true,
  source = "local",
}: CreatePackOptions): TestPack => ({
  manifest: {
    id,
    matches,
  },
  source,
  installedAt,
  enabled,
})

const setCurrentUrl = (href: string): void => {
  vi.stubGlobal("window", { location: { href } })
}

const importRegistry = () => import("~adapters/index")

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  registryTestState.builtinMatches.clear()
  registryTestState.constructorFailureIds.clear()
  registryTestState.declarativeInstances.length = 0
  registryTestState.events.length = 0
  registryTestState.snapshot.packs.length = 0
  registryTestState.snapshot.issues.length = 0
  registryTestState.originBindings.bindings = {}
  setCurrentUrl("https://unmatched.example/")
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("AdapterRegistry initialization", () => {
  it("uses one readiness promise and loads packs after cached built-in patches", async () => {
    const pack = createPack({ id: "static-pack", matches: ["https://static.example/*"] })
    registryTestState.snapshot.packs.push(pack)
    setCurrentUrl("https://static.example/chat")
    const registry = await importRegistry()

    const readyPromise = registry.registryReady()
    const initializationPromise = registry.initAdapterRegistry()

    expect(readyPromise).toBe(initializationPromise)
    await readyPromise

    const packsEventIndex = registryTestState.events.indexOf("packs")
    expect(packsEventIndex).toBe(15)
    expect(
      registryTestState.events
        .slice(0, packsEventIndex)
        .every((event) => event.startsWith("patch:")),
    ).toBe(true)
    expect(registryTestState.events.slice(packsEventIndex)).toEqual(["packs", "bindings"])
    expect(registryTestState.getEnabledPacks).toHaveBeenCalledTimes(1)
    expect(registryTestState.getOriginBindings).toHaveBeenCalledTimes(1)
    expect(registryTestState.declarativeInstances).toHaveLength(1)
    expect(registry.getAdapter()?.getSiteId()).toBe("pack:static-pack")
    expect(registryTestState.primeDynamicPlatforms).toHaveBeenCalledWith(
      [pack],
      registryTestState.originBindings,
    )

    expect(registry.initAdapterRegistry()).toBe(readyPromise)
    await registry.initAdapterRegistry()
    expect(registryTestState.getEnabledPacks).toHaveBeenCalledTimes(1)
    expect(registryTestState.declarativeInstances).toHaveLength(1)
  })

  it("keeps built-ins first and orders effective packs by installation time", async () => {
    const later = createPack({
      id: "later-pack",
      installedAt: 20,
      matches: ["https://priority.example/*"],
    })
    const disabled = createPack({
      id: "disabled-pack",
      installedAt: 1,
      matches: ["https://priority.example/*"],
      enabled: false,
    })
    const earlier = createPack({
      id: "earlier-pack",
      installedAt: 10,
      matches: ["https://priority.example/*"],
    })
    const issue = { code: "malformed-pack", path: "packs/broken" }
    registryTestState.snapshot.packs.push(later, disabled, earlier)
    registryTestState.snapshot.issues.push(issue)
    registryTestState.builtinMatches.add("chatgpt")
    setCurrentUrl("https://priority.example/chat")
    const registry = await importRegistry()

    await registry.initAdapterRegistry()

    expect(registry.getAdapter()?.getSiteId()).toBe("chatgpt")
    registryTestState.builtinMatches.delete("chatgpt")
    expect(registry.getAdapter()?.getSiteId()).toBe("pack:earlier-pack")
    expect(registryTestState.declarativeInstances.map(({ manifest }) => manifest.id)).toEqual([
      "earlier-pack",
      "later-pack",
    ])
    expect(registryTestState.primeDynamicPlatforms).toHaveBeenCalledWith(
      [earlier, later],
      registryTestState.originBindings,
    )
    expect(console.warn).toHaveBeenCalledWith("[Ophel] SitePack registry issue:", issue)
  })

  it("skips one package constructor failure without hiding valid packages", async () => {
    const broken = createPack({
      id: "broken-pack",
      installedAt: 1,
      matches: ["https://isolation.example/*"],
    })
    const valid = createPack({
      id: "valid-pack",
      installedAt: 2,
      matches: ["https://isolation.example/*"],
    })
    registryTestState.snapshot.packs.push(broken, valid)
    registryTestState.constructorFailureIds.add("broken-pack")
    setCurrentUrl("https://isolation.example/chat")
    const registry = await importRegistry()

    await registry.registryReady()

    expect(registry.getAdapter()?.getSiteId()).toBe("pack:valid-pack")
    expect(registryTestState.primeDynamicPlatforms).toHaveBeenCalledWith(
      [valid],
      registryTestState.originBindings,
    )
    expect(console.error).toHaveBeenCalledWith(
      "[Ophel] Failed to initialize SitePack broken-pack; skipping package:",
      expect.any(Error),
    )
  })

  it("keeps built-in matching usable when installed storage cannot be read", async () => {
    registryTestState.getEnabledPacks.mockRejectedValueOnce(new Error("storage unavailable"))
    registryTestState.builtinMatches.add("chatgpt")
    const registry = await importRegistry()

    await expect(registry.registryReady()).resolves.toBeUndefined()

    expect(registry.getAdapter()?.getSiteId()).toBe("chatgpt")
    expect(registryTestState.getOriginBindings).not.toHaveBeenCalled()
    expect(registryTestState.primeDynamicPlatforms).toHaveBeenCalledWith([], {
      storageSchemaVersion: 1,
      bindings: {},
    })
    expect(console.error).toHaveBeenCalledWith(
      "[Ophel] Failed to load installed SitePacks; continuing with built-in adapters:",
      expect.any(Error),
    )
  })
})

describe("AdapterRegistry origin activation", () => {
  it("activates an explicit package even when its static matches do not match", async () => {
    const fallback = createPack({
      id: "fallback-pack",
      installedAt: 1,
      matches: ["https://custom.example/*"],
    })
    const explicit = createPack({
      id: "explicit-pack",
      installedAt: 2,
      matches: ["https://other.example/*"],
      source: "registry",
    })
    registryTestState.snapshot.packs.push(fallback, explicit)
    registryTestState.originBindings.bindings["https://custom.example"] = {
      mode: "explicit",
      packId: "explicit-pack",
    }
    setCurrentUrl("https://custom.example/chat")
    const registry = await importRegistry()

    await registry.initAdapterRegistry()

    expect(registry.getAdapter()?.getSiteId()).toBe("pack:explicit-pack")
    expect(registryTestState.declarativeInstances.at(-1)?.options).toEqual({
      explicitOrigin: "https://custom.example",
      installSource: "registry",
    })
    expect(registryTestState.primeDynamicPlatforms).toHaveBeenCalledWith(
      [fallback, explicit],
      registryTestState.originBindings,
    )
  })

  it("does not fall back when an explicit binding has no valid enabled package", async () => {
    const fallback = createPack({
      id: "fallback-pack",
      matches: ["https://custom.example/*"],
    })
    registryTestState.snapshot.packs.push(fallback)
    registryTestState.originBindings.bindings["https://custom.example"] = {
      mode: "explicit",
      packId: "missing-pack",
    }
    setCurrentUrl("https://custom.example/chat")
    const registry = await importRegistry()

    await registry.initAdapterRegistry()

    expect(registry.getAdapter()).toBeNull()
    expect(console.error).toHaveBeenCalledWith(
      "[Ophel] Explicit SitePack binding https://custom.example -> missing-pack has no enabled, valid package; dynamic fallback is disabled for this origin.",
    )
  })
})

describe("AdapterRegistry bootstrap contracts", () => {
  it("keeps the panel and both platform entries behind registry initialization", async () => {
    const [uiEntry, extensionEntry, userscriptEntry, appSource] = await Promise.all([
      readFile(path.join(REPOSITORY_ROOT, "src", "contents", "ui-entry.tsx"), "utf8"),
      readFile(path.join(REPOSITORY_ROOT, "src", "contents", "main.ts"), "utf8"),
      readFile(path.join(REPOSITORY_ROOT, "src", "platform", "userscript", "entry.tsx"), "utf8"),
      readFile(path.join(REPOSITORY_ROOT, "src", "components", "App.tsx"), "utf8"),
    ])

    expect(uiEntry).toMatch(
      /void registryReady\(\)[\s\S]*setIsRegistryReady\(true\)[\s\S]*if \(!isRegistryReady \|\| !adapter\) return null[\s\S]*return <App key={adapter\.getSiteInstanceKey\(\)} adapter={adapter} \/>/,
    )
    expect(extensionEntry).toContain("await initAdapterRegistry()")
    expect(userscriptEntry).toContain("await initAdapterRegistry()")
    expect(appSource).toContain("const fallbackAdapter = useMemo(() => getAdapter(), [])")
  })
})
