import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { InstalledSitePack } from "~core/pack-manager"

import {
  evaluateSiteDetectRule,
  evaluateSitePackDetection,
  scanSitePackDetectMatches,
  waitForSitePackDetectMatches,
} from "./detect"
import type { SiteDetectRule, SitePackManifest } from "./types"

interface FakeMetaElementOptions {
  name?: string
  content?: string
}

interface FakeDocumentOptions {
  selectors?: string[]
  invalidSelectors?: string[]
  generators?: FakeMetaElementOptions[]
}

const createFakeDocument = (options: FakeDocumentOptions = {}) => {
  const selectors = new Set(options.selectors ?? [])
  const invalidSelectors = new Set(options.invalidSelectors ?? [])
  const matchedElement = {} as Element
  const metaElements = (options.generators ?? []).map(
    ({ name = "generator", content = "" }) =>
      ({
        getAttribute: (attribute: string): string | null => {
          if (attribute === "name") return name
          if (attribute === "content") return content
          return null
        },
      }) as Element,
  )
  const querySelector = vi.fn((selector: string): Element | null => {
    if (invalidSelectors.has(selector)) {
      throw new SyntaxError(`Invalid selector: ${selector}`)
    }
    return selectors.has(selector) ? matchedElement : null
  })
  const querySelectorAll = vi.fn((selector: string): NodeListOf<Element> => {
    const matches = selector === "meta[name]" ? metaElements : []
    return matches as unknown as NodeListOf<Element>
  })
  const documentElement = {} as unknown as HTMLElement
  const document = {
    documentElement,
    querySelector,
    querySelectorAll,
  } as unknown as Document

  return {
    document,
    documentElement,
    querySelector,
    selectors,
  }
}

const createManifest = (
  id: string,
  overrides: Partial<SitePackManifest> = {},
): SitePackManifest => ({
  schemaVersion: 1,
  id,
  version: 1,
  minAppVersion: "1.1.8",
  name: id,
  matches: ["https://chat.example/*"],
  capabilities: [],
  selectors: {},
  detect: [{ selectorExists: `[data-pack='${id}']` }],
  ...overrides,
})

const createPack = (
  id: string,
  overrides: Partial<SitePackManifest> = {},
  installedAt = 1,
): InstalledSitePack => ({
  manifest: createManifest(id, overrides),
  source: "local",
  installedAt,
  updatedAt: installedAt,
  enabled: true,
})

const createObserverHarness = () => {
  let callback: MutationCallback | null = null
  const observer = {
    observe: vi.fn(),
    disconnect: vi.fn(),
  }
  const createObserver = vi.fn((nextCallback: MutationCallback) => {
    callback = nextCallback
    return observer
  })
  const trigger = () => {
    if (!callback) throw new Error("MutationObserver callback is not registered")
    callback([], observer as unknown as MutationObserver)
  }

  return { createObserver, observer, trigger }
}

describe("SitePack detect rule evaluation", () => {
  it("evaluates selector hits and misses", () => {
    const harness = createFakeDocument({ selectors: ["main[data-chat]"] })
    const rule: SiteDetectRule = { selectorExists: "main[data-chat]" }

    expect(evaluateSiteDetectRule(rule, harness.document)).toEqual({
      matched: true,
      issues: [],
    })

    harness.selectors.clear()
    expect(evaluateSiteDetectRule(rule, harness.document)).toEqual({
      matched: false,
      issues: [],
    })
  })

  it("matches generator metadata with trimmed case-insensitive substring semantics", () => {
    const harness = createFakeDocument({
      generators: [
        { name: "theme", content: "ignored" },
        { name: "  GeNeRaToR  ", content: "Powered by WordPress 6.5" },
      ],
    })

    expect(evaluateSiteDetectRule({ metaGenerator: "  wordpress  " }, harness.document)).toEqual({
      matched: true,
      issues: [],
    })
    expect(evaluateSiteDetectRule({ metaGenerator: "ghost" }, harness.document)).toEqual({
      matched: false,
      issues: [],
    })
    expect(evaluateSiteDetectRule({ metaGenerator: "   " }, harness.document)).toEqual({
      matched: false,
      issues: [],
    })
  })

  it("requires every field in one rule and accepts any complete rule in the list", () => {
    const harness = createFakeDocument({
      selectors: ["main[data-chat]", "aside[data-fallback]"],
      generators: [{ content: "Ghost 5" }],
    })

    expect(
      evaluateSiteDetectRule(
        { selectorExists: "main[data-chat]", metaGenerator: "wordpress" },
        harness.document,
      ).matched,
    ).toBe(false)

    const result = evaluateSitePackDetection(
      createManifest("or-pack", {
        detect: [
          { selectorExists: "main[data-chat]", metaGenerator: "wordpress" },
          { selectorExists: "aside[data-fallback]", metaGenerator: "ghost" },
        ],
      }),
      new URL("https://chat.example/thread"),
      harness.document,
    )

    expect(result).toEqual({ eligible: true, matched: true, issues: [] })
  })

  it("isolates invalid selectors and preserves pack and rule context", () => {
    const harness = createFakeDocument({
      selectors: ["main[data-valid]"],
      invalidSelectors: ["main["],
    })
    const result = evaluateSitePackDetection(
      createManifest("invalid-pack", {
        detect: [{ selectorExists: "main[" }, { selectorExists: "main[data-valid]" }],
      }),
      new URL("https://chat.example/thread"),
      harness.document,
    )

    expect(result.eligible).toBe(true)
    expect(result.matched).toBe(true)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "invalid-selector",
        packId: "invalid-pack",
        ruleIndex: 0,
      }),
    ])
    expect(result.issues[0]?.message).toContain("Invalid selector: main[")
  })

  it("keeps empty matches, URL-gated detect packs, and matches-only packs distinct", () => {
    const harness = createFakeDocument({ selectors: ["main[data-chat]"] })
    const currentUrl = new URL("https://chat.example/thread")

    expect(
      evaluateSitePackDetection(
        createManifest("empty-match-pack", {
          matches: [],
          detect: [{ selectorExists: "main[data-chat]" }],
        }),
        currentUrl,
        harness.document,
      ),
    ).toEqual({ eligible: true, matched: true, issues: [] })

    harness.querySelector.mockClear()
    expect(
      evaluateSitePackDetection(
        createManifest("url-gated-pack", {
          matches: ["https://allowed.example/*"],
        }),
        currentUrl,
        harness.document,
      ),
    ).toEqual({ eligible: false, matched: false, issues: [] })
    expect(harness.querySelector).not.toHaveBeenCalled()

    expect(
      evaluateSitePackDetection(
        createManifest("matches-only-pack", { detect: undefined }),
        currentUrl,
        harness.document,
      ),
    ).toEqual({ eligible: false, matched: false, issues: [] })
  })

  it("scans every pack without losing valid matches or structured issues", () => {
    const harness = createFakeDocument({
      selectors: ["main[data-valid]"],
      invalidSelectors: ["main["],
    })
    const invalid = createPack("invalid-scan-pack", {
      detect: [{ selectorExists: "main[" }],
    })
    const missed = createPack("missed-scan-pack", {
      detect: [{ selectorExists: "main[data-missing]" }],
    })
    const matched = createPack("matched-scan-pack", {
      detect: [{ selectorExists: "main[data-valid]" }],
    })

    const result = scanSitePackDetectMatches(
      [invalid, missed, matched],
      new URL("https://chat.example/thread"),
      harness.document,
    )

    expect(result.matches).toEqual([matched])
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "invalid-selector",
        packId: "invalid-scan-pack",
        ruleIndex: 0,
      }),
    ])
  })
})

describe("SitePack bounded detect scanning", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("settles an immediate match with one final scan", async () => {
    const harness = createFakeDocument({ selectors: ["main[data-ready]"] })
    const pack = createPack("ready-pack", {
      detect: [{ selectorExists: "main[data-ready]" }],
    })

    const pendingResult = waitForSitePackDetectMatches(
      [pack],
      new URL("https://chat.example/thread"),
      {
        document: harness.document,
        timeoutMs: 100,
        maxAttempts: 4,
        settleMs: 20,
      },
    )

    expect(harness.querySelector).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20)

    await expect(pendingResult).resolves.toMatchObject({
      status: "matched",
      matches: [pack],
      issues: [],
      attempts: 2,
      elapsedMs: 20,
    })
    expect(harness.querySelector).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("throttles mutations, detects a delayed match, and cleans up", async () => {
    const harness = createFakeDocument()
    const observerHarness = createObserverHarness()
    const pack = createPack("delayed-pack", {
      detect: [{ selectorExists: "main[data-delayed]" }],
    })

    const pendingResult = waitForSitePackDetectMatches(
      [pack],
      new URL("https://chat.example/thread"),
      {
        document: harness.document,
        timeoutMs: 100,
        maxAttempts: 5,
        scanIntervalMs: 10,
        settleMs: 5,
        createObserver: observerHarness.createObserver,
      },
    )

    expect(observerHarness.observer.observe).toHaveBeenCalledWith(harness.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    })
    harness.selectors.add("main[data-delayed]")
    observerHarness.trigger()
    observerHarness.trigger()

    await vi.advanceTimersByTimeAsync(9)
    expect(harness.querySelector).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.querySelector).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5)

    await expect(pendingResult).resolves.toMatchObject({
      status: "matched",
      matches: [pack],
      attempts: 3,
      elapsedMs: 15,
    })
    expect(observerHarness.observer.disconnect).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("records an unavailable observer and still performs the bounded final scan", async () => {
    const harness = createFakeDocument()
    const pack = createPack("no-observer-pack", {
      detect: [{ selectorExists: "main[data-late]" }],
    })

    const pendingResult = waitForSitePackDetectMatches(
      [pack],
      new URL("https://chat.example/thread"),
      {
        document: harness.document,
        timeoutMs: 40,
        maxAttempts: 4,
        settleMs: 0,
        createObserver: null,
      },
    )

    harness.selectors.add("main[data-late]")
    await vi.advanceTimersByTimeAsync(40)

    await expect(pendingResult).resolves.toMatchObject({
      status: "matched",
      matches: [pack],
      attempts: 2,
      elapsedMs: 40,
      issues: [expect.objectContaining({ code: "observer-unavailable" })],
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("returns timeout after the final scan and disconnects the observer", async () => {
    const harness = createFakeDocument()
    const observerHarness = createObserverHarness()
    const pack = createPack("timeout-pack", {
      detect: [{ selectorExists: "main[data-never]" }],
    })

    const pendingResult = waitForSitePackDetectMatches(
      [pack],
      new URL("https://chat.example/thread"),
      {
        document: harness.document,
        timeoutMs: 50,
        maxAttempts: 4,
        settleMs: 0,
        createObserver: observerHarness.createObserver,
      },
    )

    await vi.advanceTimersByTimeAsync(50)

    await expect(pendingResult).resolves.toMatchObject({
      status: "timeout",
      matches: [],
      issues: [],
      attempts: 2,
      elapsedMs: 50,
    })
    expect(observerHarness.observer.disconnect).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("returns attempt-limit, deduplicates repeated issues, and cancels the timeout", async () => {
    const harness = createFakeDocument({ invalidSelectors: ["main["] })
    const observerHarness = createObserverHarness()
    const pack = createPack("attempt-pack", {
      detect: [{ selectorExists: "main[" }],
    })

    const pendingResult = waitForSitePackDetectMatches(
      [pack],
      new URL("https://chat.example/thread"),
      {
        document: harness.document,
        timeoutMs: 100,
        maxAttempts: 2,
        scanIntervalMs: 10,
        settleMs: 0,
        createObserver: observerHarness.createObserver,
      },
    )

    observerHarness.trigger()
    await vi.advanceTimersByTimeAsync(10)

    const result = await pendingResult
    expect(result).toMatchObject({
      status: "attempt-limit",
      matches: [],
      attempts: 2,
      elapsedMs: 10,
    })
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({
      code: "invalid-selector",
      packId: "attempt-pack",
      ruleIndex: 0,
    })
    expect(observerHarness.observer.disconnect).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
