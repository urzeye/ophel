import { afterEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import type { PlatformStorage } from "~platform"
import { DOMToolkit } from "~utils/dom-toolkit"

import {
  buildAdapterHealthIssueUrl,
  evaluateAdapterSelectorHealth,
  HealthCheckManager,
  type HealthCheckManagerOptions,
  type HealthCheckSnapshot,
  type HealthSelectorEvaluation,
  resolveHealthWarningReason,
  waitForAdapterSelectorRecovery,
} from "~core/health-check-manager"
import type { ActiveAdapterConfigContext } from "~core/site-adapter-config-runtime"
import {
  REMOTE_CONFIG_STORAGE_KEY,
  SITE_ADAPTER_HEALTH_STORAGE_KEY,
} from "~core/site-pack-storage-constants"
import type { RemoteConfigCheckResult } from "~core/remote-config-types"

vi.mock("~utils/config", () => ({
  APP_VERSION: "1.1.8",
}))

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

const NOW = 1_800_000_000_000
const SITE_INSTANCE_KEY = "test-site"
const FAILED_SELECTOR = 'textarea[data-testid="chat-input"]'

const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value))

type StorageWatcher = (newValue: unknown | undefined, oldValue: unknown | undefined) => void

class MemoryPlatformStorage implements PlatformStorage {
  private readonly values = new Map<string, unknown>()
  private readonly watchers = new Map<string, Set<StorageWatcher>>()

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.values.get(key)
    return value === undefined ? undefined : clone(value as T)
  }

  async set<T>(key: string, value: T): Promise<void> {
    const oldValue = this.values.get(key)
    const stored = clone(value)
    this.values.set(key, stored)
    this.emit(key, stored, oldValue)
  }

  async remove(key: string): Promise<void> {
    const oldValue = this.values.get(key)
    this.values.delete(key)
    this.emit(key, undefined, oldValue)
  }

  watch<T>(
    key: string,
    callback: (newValue: T | undefined, oldValue: T | undefined) => void,
  ): () => void {
    const watcher: StorageWatcher = (newValue, oldValue) =>
      callback(clone(newValue as T | undefined), clone(oldValue as T | undefined))
    const listeners = this.watchers.get(key) ?? new Set<StorageWatcher>()
    listeners.add(watcher)
    this.watchers.set(key, listeners)
    return () => {
      listeners.delete(watcher)
      if (listeners.size === 0) this.watchers.delete(key)
    }
  }

  read<T>(key: string): T | undefined {
    const value = this.values.get(key)
    return value === undefined ? undefined : clone(value as T)
  }

  private emit(key: string, newValue: unknown, oldValue: unknown): void {
    this.watchers.get(key)?.forEach((watcher) => watcher(clone(newValue), clone(oldValue)))
  }
}

interface StoredHealthStateView {
  records: Record<
    string,
    {
      loadId: string
      consecutiveFailures: number
    }
  >
}

const createBuiltinContext = (
  overrides: Partial<ActiveAdapterConfigContext> = {},
): ActiveAdapterConfigContext => ({
  kind: "builtin",
  siteId: "test-site",
  siteName: "Test Site",
  siteInstanceKey: SITE_INSTANCE_KEY,
  origin: "https://chat.example.com",
  signature: "builtin:test-site:app:1.1.8",
  canCheckUpdates: true,
  updateAvailable: false,
  ...overrides,
})

const createSitePackContext = (
  source: "registry" | "local",
  overrides: Partial<ActiveAdapterConfigContext> = {},
): ActiveAdapterConfigContext => ({
  kind: "site-pack",
  siteId: "test-pack",
  siteName: "Test Pack",
  siteInstanceKey: "pack:test-pack@https://chat.example.com",
  origin: "https://chat.example.com",
  signature: "site-pack:test-pack:1",
  canCheckUpdates: source === "registry",
  packId: "test-pack",
  activeVersion: 1,
  source,
  updateAvailable: false,
  ...overrides,
})

const failedEvaluation = (): HealthSelectorEvaluation => ({
  status: "failed",
  failures: [{ key: "textarea", selectors: [FAILED_SELECTOR] }],
})

const healthyEvaluation = (): HealthSelectorEvaluation => ({ status: "healthy" })

const createRemoteResult = (
  status: RemoteConfigCheckResult["status"] = "up-to-date",
): RemoteConfigCheckResult => ({
  status,
  checkedAt: NOW,
  registryRevision: 10,
  changes: {
    downloadedPacks: 0,
    downloadedPatches: 0,
    removedPacks: 0,
    removedPatches: 0,
    disabledPacks: 0,
    disabledPatches: 0,
    ignoredPatches: 0,
    incompatiblePacks: 0,
    incompatiblePatches: 0,
  },
})

interface CreateManagerOptions {
  storage: PlatformStorage
  loadId: string
  context?: ActiveAdapterConfigContext
  isNewConversation?: () => boolean
  evaluate?: () => HealthSelectorEvaluation
  waitForRecovery?: NonNullable<HealthCheckManagerOptions["waitForRecovery"]>
  checkForUpdates?: () => Promise<RemoteConfigCheckResult>
  refreshConfig?: () => Promise<ActiveAdapterConfigContext>
  delayMs?: number
  storageRefreshDebounceMs?: number
}

const createManager = (options: CreateManagerOptions): HealthCheckManager => {
  const context = options.context ?? createBuiltinContext()
  const adapter = {
    isNewConversation: options.isNewConversation ?? (() => false),
  } as unknown as SiteAdapter

  return new HealthCheckManager({
    adapter,
    storage: options.storage,
    loadId: options.loadId,
    now: () => NOW,
    delayMs: options.delayMs ?? 60_000,
    storageRefreshDebounceMs: options.storageRefreshDebounceMs ?? 0,
    evaluate: options.evaluate ?? failedEvaluation,
    waitForRecovery: options.waitForRecovery ?? (async (_evaluate, initial) => initial),
    checkForUpdates: options.checkForUpdates ?? (async () => createRemoteResult("up-to-date")),
    refreshConfig: options.refreshConfig ?? (async () => context),
  })
}

const createSelectorAdapter = (
  overrides: Partial<{
    isNewConversation: () => boolean
    isSharePage: () => boolean
    getTextareaSelectors: () => string[]
    isValidTextarea: (element: HTMLElement) => boolean
    getResponseContainerSelector: () => string
    getChatContentSelectors: () => string[]
    isUserConversationPage: () => boolean
  }> = {},
): SiteAdapter =>
  ({
    isNewConversation: () => false,
    isSharePage: () => false,
    getTextareaSelectors: () => ["textarea[data-chat-input]"],
    isValidTextarea: () => true,
    getResponseContainerSelector: () => "main[data-responses]",
    getChatContentSelectors: () => ["article[data-message]"],
    isUserConversationPage: () => true,
    ...overrides,
  }) as unknown as SiteAdapter

const readFailureCount = (storage: MemoryPlatformStorage, siteInstanceKey = SITE_INSTANCE_KEY) =>
  storage.read<StoredHealthStateView>(SITE_ADAPTER_HEALTH_STORAGE_KEY)?.records[siteInstanceKey]
    ?.consecutiveFailures

const createWarningSnapshot = (
  context: ActiveAdapterConfigContext = createBuiltinContext(),
): HealthCheckSnapshot => ({
  phase: "warning",
  context,
  failedSelectors: [{ key: "textarea", selectors: [FAILED_SELECTOR] }],
  consecutiveFailures: 2,
  warningReason: resolveHealthWarningReason(context),
  checkedAt: NOW,
  isCheckingUpdates: false,
  error: null,
  updateError: null,
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("evaluateAdapterSelectorHealth", () => {
  it("reports every configured core selector group that does not match", () => {
    vi.mocked(DOMToolkit.query).mockReturnValue(null)

    expect(evaluateAdapterSelectorHealth(createSelectorAdapter())).toEqual({
      status: "failed",
      failures: [
        { key: "textarea", selectors: ["textarea[data-chat-input]"] },
        { key: "responseContainer", selectors: ["main[data-responses]"] },
        { key: "chatContent", selectors: ["article[data-message]"] },
      ],
    })
  })

  it("reports healthy on a conversation page when every core selector matches", () => {
    vi.mocked(DOMToolkit.query).mockReturnValue({} as Element)

    expect(evaluateAdapterSelectorHealth(createSelectorAdapter())).toEqual({ status: "healthy" })
    expect(DOMToolkit.query).toHaveBeenCalledTimes(3)
  })

  it("exempts pages outside a user conversation without querying the DOM", () => {
    // 站点功能页（如 /library、设置页）既不是新会话页也不是会话页，
    // 本就没有聊天元素，不应触发任何选择器断言。
    const adapter = createSelectorAdapter({ isUserConversationPage: () => false })

    expect(evaluateAdapterSelectorHealth(adapter)).toEqual({ status: "exempt" })
    expect(DOMToolkit.query).not.toHaveBeenCalled()
  })
})

describe("HealthCheckManager failure history", () => {
  it("shows a warning only on the second failed page load", async () => {
    const storage = new MemoryPlatformStorage()
    const firstManager = createManager({ storage, loadId: "load-1" })

    const firstSnapshot = await firstManager.runCheckNow()
    expect(firstSnapshot).toMatchObject({ phase: "pending", consecutiveFailures: 1 })
    expect(readFailureCount(storage)).toBe(1)
    firstManager.destroy()

    const secondManager = createManager({ storage, loadId: "load-2" })
    const secondSnapshot = await secondManager.runCheckNow()

    expect(secondSnapshot).toMatchObject({
      phase: "warning",
      consecutiveFailures: 2,
      warningReason: "site-changed",
    })
    expect(readFailureCount(storage)).toBe(2)
    secondManager.destroy()
  })

  it("does not increment repeated checks from the same page load", async () => {
    const storage = new MemoryPlatformStorage()
    const manager = createManager({ storage, loadId: "same-load" })

    await manager.runCheckNow()
    const secondSnapshot = await manager.runCheckNow()

    expect(secondSnapshot).toMatchObject({ phase: "pending", consecutiveFailures: 1 })
    expect(readFailureCount(storage)).toBe(1)
    manager.destroy()
  })

  it("clears failure history after a healthy load", async () => {
    const storage = new MemoryPlatformStorage()
    const failedManager = createManager({ storage, loadId: "load-1" })
    await failedManager.runCheckNow()
    failedManager.destroy()

    const healthyManager = createManager({
      storage,
      loadId: "load-2",
      evaluate: healthyEvaluation,
    })
    expect(await healthyManager.runCheckNow()).toMatchObject({
      phase: "healthy",
      consecutiveFailures: 0,
    })
    expect(storage.read(SITE_ADAPTER_HEALTH_STORAGE_KEY)).toBeUndefined()
    healthyManager.destroy()

    const nextFailureManager = createManager({ storage, loadId: "load-3" })
    expect(await nextFailureManager.runCheckNow()).toMatchObject({
      phase: "pending",
      consecutiveFailures: 1,
    })
    nextFailureManager.destroy()
  })

  it("exempts new-conversation loads without clearing prior evidence", async () => {
    const storage = new MemoryPlatformStorage()
    const firstManager = createManager({ storage, loadId: "load-1" })
    await firstManager.runCheckNow()
    firstManager.destroy()

    const evaluate = vi.fn(failedEvaluation)
    const exemptManager = createManager({
      storage,
      loadId: "load-2",
      isNewConversation: () => true,
      evaluate,
    })
    expect(await exemptManager.runCheckNow()).toMatchObject({
      phase: "exempt",
      consecutiveFailures: 0,
    })
    expect(evaluate).not.toHaveBeenCalled()
    expect(readFailureCount(storage)).toBe(1)
    exemptManager.destroy()

    const nextFailureManager = createManager({ storage, loadId: "load-3" })
    expect(await nextFailureManager.runCheckNow()).toMatchObject({
      phase: "warning",
      consecutiveFailures: 2,
    })
    nextFailureManager.destroy()
  })
})

describe("HealthCheckManager recovery", () => {
  it("recovers during the bounded late-DOM window", async () => {
    vi.useFakeTimers()
    let recovered = false
    const evaluate = () => (recovered ? healthyEvaluation() : failedEvaluation())
    const controller = new AbortController()
    const result = waitForAdapterSelectorRecovery(
      evaluate,
      failedEvaluation(),
      controller.signal,
      1_000,
    )

    recovered = true
    await vi.advanceTimersByTimeAsync(250)

    await expect(result).resolves.toEqual({ status: "healthy" })
  })

  it("recovers after a manual configuration update", async () => {
    const storage = new MemoryPlatformStorage()
    const firstManager = createManager({ storage, loadId: "load-1" })
    await firstManager.runCheckNow()
    firstManager.destroy()

    let healthy = false
    const checkForUpdates = vi.fn(async () => {
      healthy = true
      return createRemoteResult("updated")
    })
    const manager = createManager({
      storage,
      loadId: "load-2",
      evaluate: () => (healthy ? healthyEvaluation() : failedEvaluation()),
      checkForUpdates,
    })
    expect(await manager.runCheckNow()).toMatchObject({ phase: "warning" })

    const result = await manager.checkConfigurationUpdates()

    expect(checkForUpdates).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ remoteStatus: "updated", recovered: true })
    expect(result.snapshot).toMatchObject({ phase: "healthy", consecutiveFailures: 0 })
    expect(storage.read(SITE_ADAPTER_HEALTH_STORAGE_KEY)).toBeUndefined()
    manager.destroy()
  })

  it("recovers when watched remote configuration storage changes", async () => {
    const storage = new MemoryPlatformStorage()
    const firstManager = createManager({ storage, loadId: "load-1" })
    await firstManager.runCheckNow()
    firstManager.destroy()

    let healthy = false
    const refreshConfig = vi.fn(async () => createBuiltinContext())
    const manager = createManager({
      storage,
      loadId: "load-2",
      evaluate: () => (healthy ? healthyEvaluation() : failedEvaluation()),
      refreshConfig,
      storageRefreshDebounceMs: 0,
    })
    manager.start()
    try {
      expect(await manager.runCheckNow()).toMatchObject({ phase: "warning" })

      healthy = true
      await storage.set(REMOTE_CONFIG_STORAGE_KEY, { registryRevision: 11 })

      await vi.waitFor(() => {
        expect(manager.getSnapshot().phase).toBe("healthy")
      })
      expect(refreshConfig.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(storage.read(SITE_ADAPTER_HEALTH_STORAGE_KEY)).toBeUndefined()
    } finally {
      manager.destroy()
    }
  })
})

describe("HealthCheckManager warning semantics", () => {
  it("classifies registry updates, local packs, and general site changes", () => {
    expect(
      resolveHealthWarningReason(
        createSitePackContext("registry", {
          registryVersion: 2,
          updateAvailable: true,
        }),
      ),
    ).toBe("site-pack-update")
    expect(resolveHealthWarningReason(createSitePackContext("local"))).toBe("local-site-pack")
    expect(resolveHealthWarningReason(createBuiltinContext())).toBe("site-changed")
  })

  it("requires a confirmed failure before building an issue report", () => {
    expect(() =>
      buildAdapterHealthIssueUrl(
        {
          ...createWarningSnapshot(),
          context: null,
          failedSelectors: [],
        },
        "extension",
        "en",
      ),
    ).toThrow("A confirmed adapter health failure is required")
  })

  it("prefills explicit diagnostics without reading the page route or content", () => {
    vi.stubGlobal("window", {
      location: new URL("https://chat.example.com/private/thread?token=secret"),
    })
    const reportUrl = new URL(
      buildAdapterHealthIssueUrl(createWarningSnapshot(), "userscript", "en"),
    )
    const description = reportUrl.searchParams.get("bug_description") ?? ""
    const serialized = reportUrl.searchParams.toString()

    expect(description).toContain("Origin: https://chat.example.com")
    expect(description).toContain(`- textarea: ${FAILED_SELECTOR}`)
    expect(description).toContain("Ophel version:")
    expect(reportUrl.searchParams.get("installation_type")).toBe("Userscript")
    expect(serialized).not.toContain("private%2Fthread")
    expect(serialized).not.toContain("token%3Dsecret")
    expect(serialized).not.toContain("conversation_content")
  })
})
