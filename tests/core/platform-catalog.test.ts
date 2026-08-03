import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SitePackManifest } from "~adapters/declarative/types"
import type { PlatformStorage } from "~platform/types"

import type { InstalledSitePack } from "~core/pack-manager"

interface TestCatalogSnapshot {
  packs: InstalledSitePack[]
  issues: unknown[]
}

const catalogTestState = vi.hoisted(() => {
  const snapshot: TestCatalogSnapshot = { packs: [], issues: [] }
  const bindings: Record<string, unknown> = {}
  return {
    language: "en",
    snapshot,
    bindings,
    getEnabledPacks: vi.fn(async () => snapshot),
    getOriginBindings: vi.fn(async () => ({ storageSchemaVersion: 1, bindings })),
  }
})

vi.mock("~utils/i18n", () => ({
  getCurrentLang: () => catalogTestState.language,
  t: (key: string) => key,
}))

vi.mock("~core/pack-manager-runtime", () => ({
  createRuntimePackManager: () => ({
    getEnabledPacks: catalogTestState.getEnabledPacks,
    getOriginBindings: catalogTestState.getOriginBindings,
  }),
}))

interface CreatePackOptions {
  id: string
  name: string
  matches?: string[]
  nameI18n?: Record<string, string>
  installedAt?: number
}

const createPack = ({
  id,
  name,
  matches = [`https://${id}.example/*`],
  nameI18n,
  installedAt = 1,
}: CreatePackOptions): InstalledSitePack => {
  const manifest: SitePackManifest = {
    schemaVersion: 1,
    id,
    version: 1,
    minAppVersion: "1.1.8",
    name,
    ...(nameI18n ? { nameI18n } : {}),
    matches,
    capabilities: ["outline"],
    selectors: { responseContainer: "main" },
  }
  return {
    manifest,
    source: "local",
    installedAt,
    updatedAt: installedAt,
    enabled: true,
  }
}

const storage = {} as PlatformStorage

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  catalogTestState.language = "en"
  catalogTestState.snapshot.packs.length = 0
  catalogTestState.snapshot.issues.length = 0
  for (const key of Object.keys(catalogTestState.bindings)) {
    delete catalogTestState.bindings[key]
  }
  catalogTestState.getEnabledPacks.mockReset()
  catalogTestState.getEnabledPacks.mockImplementation(async () => catalogTestState.snapshot)
  catalogTestState.getOriginBindings.mockReset()
  catalogTestState.getOriginBindings.mockImplementation(async () => ({
    storageSchemaVersion: 1 as const,
    bindings: catalogTestState.bindings,
  }))
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("dynamic SitePack platform metadata", () => {
  it("keeps arbitrary IDs separate and maps ordered localized platform metadata", async () => {
    const emptyMatchPack = createPack({
      id: "local-chat",
      name: "鸭助手",
      matches: [],
      installedAt: 1,
    })
    const wildcardPack = createPack({
      id: "atlas-chat",
      name: "Atlas Chat",
      nameI18n: { "zh-CN": "阿特拉斯对话", en: "Atlas Chat" },
      matches: ["https://*.atlas.example/*"],
      installedAt: 2,
    })
    const [
      { getDynamicPlatforms },
      { isBuiltinSiteId },
      { createEmptySitePackOriginBindingsState },
    ] = await Promise.all([
      import("~core/site-pack-platforms"),
      import("~constants/defaults"),
      import("~core/site-pack-origin-bindings"),
    ])

    const platforms = getDynamicPlatforms(
      [emptyMatchPack, wildcardPack],
      createEmptySitePackOriginBindingsState(),
      "zh-CN",
    )

    expect(isBuiltinSiteId("chatgpt")).toBe(true)
    expect(isBuiltinSiteId("pack:atlas-chat")).toBe(false)
    expect(platforms.map(({ id }) => id)).toEqual(["pack:local-chat", "pack:atlas-chat"])
    expect(platforms[0]).toMatchObject({
      name: "鸭助手",
      entryUrls: [],
      icon: "鸭",
      matchPatterns: [],
    })
    expect(platforms[0].faviconUrl).toBeUndefined()
    expect(platforms[0].pattern.test("https://local-chat.example/chat")).toBe(false)
    expect(platforms[1]).toMatchObject({
      name: "阿特拉斯对话",
      entryUrls: ["https://atlas.example"],
      faviconUrl: "https://atlas.example/favicon.ico",
      icon: "阿",
      matchPatterns: ["https://*.atlas.example/*"],
    })
    expect(platforms[1].pattern.test("https://chat.atlas.example/thread?id=1")).toBe(true)
    expect(platforms[1].pattern.test("http://chat.atlas.example/thread")).toBe(false)
  })

  it("activates user-bound origins for packs that declare no static matches", async () => {
    const genericPack = createPack({
      id: "open-webui",
      name: "Open WebUI",
      matches: [],
    })
    const [{ getDynamicPlatforms }, { createSitePackOriginBindingsState }] = await Promise.all([
      import("~core/site-pack-platforms"),
      import("~core/site-pack-origin-bindings"),
    ])

    const [platform] = getDynamicPlatforms(
      [genericPack],
      createSitePackOriginBindingsState({
        "https://chat.corp.example": { mode: "explicit", packId: "open-webui" },
        "https://other.example": { mode: "explicit", packId: "another-pack" },
      }),
      "en",
    )

    // 只有绑定给该包的域名进入识别范围和快捷入口，绑给其他包的域名不能进来。
    expect(platform.matchPatterns).toEqual(["https://chat.corp.example/*"])
    expect(platform.entryUrls).toEqual(["https://chat.corp.example"])
    expect(platform.pattern.test("https://chat.corp.example/c/abc")).toBe(true)
    expect(platform.pattern.test("https://other.example/c/abc")).toBe(false)
  })
})

describe("runtime supported-platform catalog", () => {
  it("primes dynamic platforms and rebuilds localized names when language changes", async () => {
    const pack = createPack({
      id: "localized-pack",
      name: "Localized Pack",
      nameI18n: { en: "Localized Pack", "zh-CN": "本地化适配包" },
    })
    const [catalog, { createEmptySitePackOriginBindingsState }] = await Promise.all([
      import("~core/platform-catalog"),
      import("~core/site-pack-origin-bindings"),
    ])

    expect(catalog.getSupportedAiPlatforms().some(({ id }) => id === "pack:localized-pack")).toBe(
      false,
    )

    const primed = catalog.primeDynamicPlatforms([pack], createEmptySitePackOriginBindingsState())
    expect(primed.at(-1)).toMatchObject({
      id: "pack:localized-pack",
      name: "Localized Pack",
    })

    catalogTestState.language = "zh-CN"
    expect(catalog.getSupportedAiPlatforms().at(-1)).toMatchObject({
      id: "pack:localized-pack",
      name: "本地化适配包",
    })
  })

  it("reuses one lazy load and reports snapshot issues", async () => {
    const pack = createPack({ id: "lazy-pack", name: "Lazy Pack" })
    const issue = { code: "invalid-record", packId: "broken-pack" }
    catalogTestState.snapshot.packs.push(pack)
    catalogTestState.snapshot.issues.push(issue)
    const catalog = await import("~core/platform-catalog")

    const first = catalog.loadSupportedAiPlatforms(storage)
    const second = catalog.loadSupportedAiPlatforms(storage)

    expect(first).toBe(second)
    const loaded = await first
    expect(catalogTestState.getEnabledPacks).toHaveBeenCalledTimes(1)
    expect(loaded.at(-1)?.id).toBe("pack:lazy-pack")
    expect(console.warn).toHaveBeenCalledWith("[Ophel] SitePack platform catalog issue:", issue)

    await catalog.loadSupportedAiPlatforms(storage)
    expect(catalogTestState.getEnabledPacks).toHaveBeenCalledTimes(1)
  })

  it("falls back to built-ins and does not retry after storage failure", async () => {
    const failure = new Error("storage unavailable")
    catalogTestState.getEnabledPacks.mockRejectedValueOnce(failure)
    const catalog = await import("~core/platform-catalog")

    const loaded = await catalog.loadSupportedAiPlatforms(storage)

    expect(loaded.some(({ id }) => id.startsWith("pack:"))).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      "[Ophel] Failed to load SitePack platform catalog; using built-in platforms:",
      failure,
    )

    await catalog.loadSupportedAiPlatforms(storage)
    expect(catalogTestState.getEnabledPacks).toHaveBeenCalledTimes(1)
  })
})
