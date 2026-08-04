import type { SiteAdapter } from "~adapters/base"
import type { PlatformStorage } from "~platform"
import { APP_VERSION } from "~utils/config"
import { DOMToolkit } from "~utils/dom-toolkit"
import { EVENT_PAGE_URL_CHANGE } from "~utils/messaging"

import type { ActiveAdapterConfigContext } from "./site-adapter-config-runtime"
import {
  INSTALLED_SITE_PACKS_STORAGE_KEY,
  REMOTE_CONFIG_STORAGE_KEY,
  SITE_ADAPTER_HEALTH_STORAGE_KEY,
} from "./site-pack-storage-constants"
import type { RemoteConfigCheckResult, RemoteConfigCheckStatus } from "./remote-config-types"

export const SITE_ADAPTER_HEALTH_STORAGE_SCHEMA_VERSION = 1 as const
export const HEALTH_CHECK_DELAY_MS = 8_000
export const HEALTH_CHECK_RECOVERY_WINDOW_MS = 4_000
export const HEALTH_CHECK_FAILURE_THRESHOLD = 2

const HEALTH_CHECK_RECOVERY_POLL_MS = 250
const HEALTH_CHECK_MUTATION_DEBOUNCE_MS = 100
const HEALTH_CHECK_STORAGE_REFRESH_DEBOUNCE_MS = 100
const MAX_HEALTH_RECORDS = 100

export type HealthSelectorKey = "textarea" | "responseContainer" | "chatContent"
export type HealthWarningReason = "site-pack-update" | "local-site-pack" | "site-changed"
export type HealthCheckPhase =
  | "idle"
  | "scheduled"
  | "checking"
  | "healthy"
  | "pending"
  | "warning"
  | "exempt"
  | "error"

export interface HealthSelectorFailure {
  key: HealthSelectorKey
  selectors: string[]
}

export type HealthSelectorEvaluation =
  | { status: "healthy" }
  | { status: "exempt" }
  | { status: "failed"; failures: HealthSelectorFailure[] }

interface StoredHealthFailureRecord {
  signature: string
  loadId: string
  checkedAt: number
  consecutiveFailures: number
  failedSelectors: HealthSelectorFailure[]
}

interface StoredHealthState {
  storageSchemaVersion: typeof SITE_ADAPTER_HEALTH_STORAGE_SCHEMA_VERSION
  records: Record<string, StoredHealthFailureRecord>
}

export interface HealthCheckSnapshot {
  phase: HealthCheckPhase
  context: ActiveAdapterConfigContext | null
  failedSelectors: readonly HealthSelectorFailure[]
  consecutiveFailures: number
  warningReason: HealthWarningReason | null
  checkedAt: number | null
  isCheckingUpdates: boolean
  error: string | null
  updateError: string | null
}

export interface HealthCheckUpdateResult {
  remoteStatus: RemoteConfigCheckStatus
  recovered: boolean
  snapshot: HealthCheckSnapshot
}

export interface HealthCheckManagerOptions {
  adapter: SiteAdapter
  storage: PlatformStorage
  checkForUpdates: () => Promise<RemoteConfigCheckResult>
  refreshConfig: () => Promise<ActiveAdapterConfigContext>
  evaluate?: () => HealthSelectorEvaluation
  waitForRecovery?: (
    evaluate: () => HealthSelectorEvaluation,
    initial: HealthSelectorEvaluation,
    signal: AbortSignal,
  ) => Promise<HealthSelectorEvaluation>
  now?: () => number
  loadId?: string
  delayMs?: number
  storageRefreshDebounceMs?: number
}

export const IDLE_HEALTH_CHECK_SNAPSHOT: HealthCheckSnapshot = Object.freeze({
  phase: "idle",
  context: null,
  failedSelectors: Object.freeze([]),
  consecutiveFailures: 0,
  warningReason: null,
  checkedAt: null,
  isCheckingUpdates: false,
  error: null,
  updateError: null,
})

const HEALTH_SELECTOR_KEYS = new Set<HealthSelectorKey>([
  "textarea",
  "responseContainer",
  "chatContent",
])

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const createEmptyStoredState = (): StoredHealthState => ({
  storageSchemaVersion: SITE_ADAPTER_HEALTH_STORAGE_SCHEMA_VERSION,
  records: {},
})

const cloneFailures = (failures: readonly HealthSelectorFailure[]): HealthSelectorFailure[] =>
  failures.map((failure) => ({ key: failure.key, selectors: [...failure.selectors] }))

const parseFailure = (value: unknown, path: string): HealthSelectorFailure => {
  if (!isPlainRecord(value)) {
    throw new Error(`${path} must be an object`)
  }
  const keys = Object.keys(value)
  if (keys.some((key) => key !== "key" && key !== "selectors")) {
    throw new Error(`${path} contains unknown fields`)
  }
  if (typeof value.key !== "string" || !HEALTH_SELECTOR_KEYS.has(value.key as HealthSelectorKey)) {
    throw new Error(`${path}.key is invalid`)
  }
  if (
    !Array.isArray(value.selectors) ||
    value.selectors.length === 0 ||
    !value.selectors.every((selector) => typeof selector === "string" && selector.length > 0)
  ) {
    throw new Error(`${path}.selectors must be a non-empty string array`)
  }
  return {
    key: value.key as HealthSelectorKey,
    selectors: [...value.selectors],
  }
}

const parseRecord = (value: unknown, path: string): StoredHealthFailureRecord => {
  if (!isPlainRecord(value)) {
    throw new Error(`${path} must be an object`)
  }
  const allowedKeys = new Set([
    "signature",
    "loadId",
    "checkedAt",
    "consecutiveFailures",
    "failedSelectors",
  ])
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error(`${path} contains unknown fields`)
  }
  if (typeof value.signature !== "string" || value.signature.length === 0) {
    throw new Error(`${path}.signature must be a non-empty string`)
  }
  if (typeof value.loadId !== "string" || value.loadId.length === 0) {
    throw new Error(`${path}.loadId must be a non-empty string`)
  }
  if (!Number.isSafeInteger(value.checkedAt) || (value.checkedAt as number) < 0) {
    throw new Error(`${path}.checkedAt must be a non-negative integer`)
  }
  if (
    !Number.isSafeInteger(value.consecutiveFailures) ||
    (value.consecutiveFailures as number) < 1
  ) {
    throw new Error(`${path}.consecutiveFailures must be a positive integer`)
  }
  if (!Array.isArray(value.failedSelectors) || value.failedSelectors.length === 0) {
    throw new Error(`${path}.failedSelectors must be a non-empty array`)
  }

  return {
    signature: value.signature,
    loadId: value.loadId,
    checkedAt: value.checkedAt as number,
    consecutiveFailures: value.consecutiveFailures as number,
    failedSelectors: value.failedSelectors.map((failure, index) =>
      parseFailure(failure, `${path}.failedSelectors[${index}]`),
    ),
  }
}

const parseStoredState = (value: unknown): StoredHealthState => {
  if (value === undefined) return createEmptyStoredState()
  if (!isPlainRecord(value)) {
    throw new Error("Site adapter health state must be an object")
  }
  if (value.storageSchemaVersion !== SITE_ADAPTER_HEALTH_STORAGE_SCHEMA_VERSION) {
    throw new Error(`Unsupported site adapter health schema: ${String(value.storageSchemaVersion)}`)
  }
  if (!isPlainRecord(value.records)) {
    throw new Error("Site adapter health records must be an object")
  }

  const records = Object.fromEntries(
    Object.entries(value.records).map(([siteInstanceKey, record]) => [
      siteInstanceKey,
      parseRecord(record, `records.${siteInstanceKey}`),
    ]),
  )
  return {
    storageSchemaVersion: SITE_ADAPTER_HEALTH_STORAGE_SCHEMA_VERSION,
    records,
  }
}

const pruneStoredRecords = (
  records: Record<string, StoredHealthFailureRecord>,
): Record<string, StoredHealthFailureRecord> => {
  const entries = Object.entries(records)
  if (entries.length <= MAX_HEALTH_RECORDS) return records

  return Object.fromEntries(
    entries
      .sort((left, right) => right[1].checkedAt - left[1].checkedAt)
      .slice(0, MAX_HEALTH_RECORDS),
  )
}

export const resolveHealthWarningReason = (
  context: ActiveAdapterConfigContext,
): HealthWarningReason => {
  if (context.kind === "site-pack" && context.updateAvailable) {
    return "site-pack-update"
  }
  if (context.kind === "site-pack" && context.source === "local") {
    return "local-site-pack"
  }
  return "site-changed"
}

const hasSelectorMatch = (
  selectors: readonly string[],
  filter?: (element: Element) => boolean,
): boolean =>
  Boolean(
    DOMToolkit.query([...selectors], {
      shadow: true,
      useCache: false,
      ...(filter ? { filter } : {}),
    }),
  )

export function evaluateAdapterSelectorHealth(adapter: SiteAdapter): HealthSelectorEvaluation {
  // 只在选择器承重的历史会话页上断言；新会话页、分享页和站点其他功能页
  // （如 library、设置页）本就没有这些元素，一律豁免以避免误报。
  // isUserConversationPage 的契约已排除新会话页与分享页。
  if (!adapter.isUserConversationPage()) return { status: "exempt" }

  const failures: HealthSelectorFailure[] = []
  const textareaSelectors = adapter.getTextareaSelectors().filter(Boolean)
  if (
    textareaSelectors.length > 0 &&
    !hasSelectorMatch(
      textareaSelectors,
      (element) => element instanceof HTMLElement && adapter.isValidTextarea(element),
    )
  ) {
    failures.push({ key: "textarea", selectors: textareaSelectors })
  }

  const responseContainerSelector = adapter.getResponseContainerSelector().trim()
  if (responseContainerSelector && !hasSelectorMatch([responseContainerSelector])) {
    failures.push({ key: "responseContainer", selectors: [responseContainerSelector] })
  }

  const chatContentSelectors = adapter.getChatContentSelectors().filter(Boolean)
  if (chatContentSelectors.length > 0 && !hasSelectorMatch(chatContentSelectors)) {
    failures.push({ key: "chatContent", selectors: chatContentSelectors })
  }

  return failures.length > 0 ? { status: "failed", failures } : { status: "healthy" }
}

const createAbortError = (): Error => {
  const error = new Error("Health check aborted")
  error.name = "AbortError"
  return error
}

export function waitForAdapterSelectorRecovery(
  evaluate: () => HealthSelectorEvaluation,
  initial: HealthSelectorEvaluation,
  signal: AbortSignal,
  timeoutMs: number = HEALTH_CHECK_RECOVERY_WINDOW_MS,
): Promise<HealthSelectorEvaluation> {
  if (initial.status !== "failed" || timeoutMs <= 0) return Promise.resolve(initial)
  if (signal.aborted) return Promise.reject(createAbortError())

  return new Promise((resolve, reject) => {
    let settled = false
    let mutationTimer: ReturnType<typeof setTimeout> | null = null
    let observer: MutationObserver | null = null

    const cleanup = () => {
      if (mutationTimer) clearTimeout(mutationTimer)
      clearTimeout(timeoutTimer)
      clearInterval(pollTimer)
      observer?.disconnect()
      signal.removeEventListener("abort", handleAbort)
    }

    const finish = (evaluation: HealthSelectorEvaluation) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(evaluation)
    }

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const scan = () => {
      if (signal.aborted) {
        fail(createAbortError())
        return
      }
      try {
        const evaluation = evaluate()
        if (evaluation.status !== "failed") finish(evaluation)
      } catch (error) {
        fail(error)
      }
    }

    const handleAbort = () => fail(createAbortError())
    const timeoutTimer = setTimeout(() => {
      try {
        finish(evaluate())
      } catch (error) {
        fail(error)
      }
    }, timeoutMs)
    const pollTimer = setInterval(scan, HEALTH_CHECK_RECOVERY_POLL_MS)

    if (typeof MutationObserver !== "undefined" && document.documentElement) {
      observer = new MutationObserver(() => {
        if (mutationTimer) clearTimeout(mutationTimer)
        mutationTimer = setTimeout(scan, HEALTH_CHECK_MUTATION_DEBOUNCE_MS)
      })
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-hidden"],
      })
    }

    signal.addEventListener("abort", handleAbort, { once: true })
  })
}

const createLoadId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const buildVersionDescription = (context: ActiveAdapterConfigContext): string => {
  if (context.kind === "site-pack") {
    const source = context.source ?? "unknown"
    const registry =
      context.registryVersion !== undefined
        ? `; compatible registry v${context.registryVersion}`
        : ""
    return `SitePack ${context.packId ?? context.siteId} v${context.activeVersion ?? "unknown"} (${source}${registry})`
  }

  if (context.baseConfigVersion !== undefined) {
    return `Built-in config v${context.baseConfigVersion}${context.patchVersion ? ` + patch v${context.patchVersion}` : ""}`
  }
  return `Built-in adapter bundled with Ophel ${APP_VERSION}`
}

const truncateIssueField = (value: string, maxLength = 5_000): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`

export function buildAdapterHealthIssueUrl(
  snapshot: HealthCheckSnapshot,
  platformType: "extension" | "userscript",
  language: string,
): string {
  if (!snapshot.context || snapshot.failedSelectors.length === 0) {
    throw new Error("A confirmed adapter health failure is required to build an issue report")
  }

  const isChinese = language === "zh-CN" || language === "zh-TW"
  const context = snapshot.context
  const selectors = snapshot.failedSelectors
    .map((failure) => `- ${failure.key}: ${failure.selectors.join(" | ")}`)
    .join("\n")
  const details = [
    `Site: ${context.siteName} (${context.siteId})`,
    `Origin: ${context.origin || "unknown"}`,
    `Ophel version: ${APP_VERSION}`,
    `Adapter configuration: ${buildVersionDescription(context)}`,
    "Failed selectors:",
    selectors,
  ].join("\n")

  const params = new URLSearchParams({
    template: isChinese ? "bug_report_zh.yml" : "bug_report_en.yml",
    title: `[Selector health]: ${context.siteName}`,
    version: APP_VERSION,
    installation_type: isChinese
      ? platformType === "extension"
        ? "浏览器扩展"
        : "油猴脚本"
      : platformType === "extension"
        ? "Browser Extension"
        : "Userscript",
    ai_platform: isChinese ? "其他" : "Other",
    bug_description: truncateIssueField(
      `${details}\n\n${
        isChinese
          ? "Ophel 连续两次页面加载未能找到上述核心元素。"
          : "Ophel could not find the core elements above on two consecutive page loads."
      }`,
    ),
    steps_to_reproduce: isChinese
      ? "1. 打开上述站点的已有会话。\n2. 等待页面和 Ophel 面板加载。\n3. 观察面板顶部的适配失效提示。"
      : "1. Open an existing conversation on the site above.\n2. Wait for the page and Ophel panel to load.\n3. Observe the adapter health warning at the top of the panel.",
    expected_vs_actual: isChinese
      ? "预期：Ophel 能识别输入框、回复容器和会话内容。\n实际：健康自检未找到上方列出的选择器。"
      : "Expected: Ophel recognizes the editor, response container, and conversation content.\nActual: The health check could not find the selectors listed above.",
  })

  return `https://github.com/urzeye/ophel/issues/new?${params.toString()}`
}

export class HealthCheckManager {
  private readonly adapter: SiteAdapter
  private readonly storage: PlatformStorage
  private readonly checkForUpdatesCallback: () => Promise<RemoteConfigCheckResult>
  private readonly refreshConfig: () => Promise<ActiveAdapterConfigContext>
  private readonly evaluate: () => HealthSelectorEvaluation
  private readonly waitForRecovery: NonNullable<HealthCheckManagerOptions["waitForRecovery"]>
  private readonly now: () => number
  private readonly loadId: string
  private readonly delayMs: number
  private readonly storageRefreshDebounceMs: number
  private readonly listeners = new Set<() => void>()
  private snapshot: HealthCheckSnapshot = IDLE_HEALTH_CHECK_SNAPSHOT
  private operationQueue: Promise<void> = Promise.resolve()
  private initialTimer: ReturnType<typeof setTimeout> | null = null
  private storageRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private documentReadyCleanup: (() => void) | null = null
  private storageCleanups: Array<() => void> = []
  private activeCheckController: AbortController | null = null
  private started = false
  private destroyed = false
  private hasCompletedInitialCheck = false

  constructor(options: HealthCheckManagerOptions) {
    this.adapter = options.adapter
    this.storage = options.storage
    this.checkForUpdatesCallback = options.checkForUpdates
    this.refreshConfig = options.refreshConfig
    const evaluate = options.evaluate ?? (() => evaluateAdapterSelectorHealth(this.adapter))
    this.evaluate = () => (this.adapter.isNewConversation() ? { status: "exempt" } : evaluate())
    this.waitForRecovery =
      options.waitForRecovery ??
      ((evaluate, initial, signal) => waitForAdapterSelectorRecovery(evaluate, initial, signal))
    this.now = options.now ?? Date.now
    this.loadId = options.loadId ?? createLoadId()
    this.delayMs = options.delayMs ?? HEALTH_CHECK_DELAY_MS
    this.storageRefreshDebounceMs =
      options.storageRefreshDebounceMs ?? HEALTH_CHECK_STORAGE_REFRESH_DEBOUNCE_MS
  }

  getSnapshot = (): HealthCheckSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.started || this.destroyed) return
    this.started = true

    this.storageCleanups = [
      this.storage.watch(REMOTE_CONFIG_STORAGE_KEY, () => this.scheduleStorageRefresh()),
      this.storage.watch(INSTALLED_SITE_PACKS_STORAGE_KEY, () => this.scheduleStorageRefresh()),
    ]
    if (typeof window !== "undefined") {
      window.addEventListener(EVENT_PAGE_URL_CHANGE, this.handleRouteChange)
    }

    if (typeof document !== "undefined" && document.readyState === "loading") {
      const handleReady = () => {
        this.documentReadyCleanup?.()
        this.documentReadyCleanup = null
        this.scheduleInitialCheck()
      }
      document.addEventListener("DOMContentLoaded", handleReady, { once: true })
      this.documentReadyCleanup = () =>
        document.removeEventListener("DOMContentLoaded", handleReady)
      return
    }
    this.scheduleInitialCheck()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.initialTimer) clearTimeout(this.initialTimer)
    if (this.storageRefreshTimer) clearTimeout(this.storageRefreshTimer)
    this.documentReadyCleanup?.()
    this.activeCheckController?.abort()
    this.storageCleanups.forEach((cleanup) => cleanup())
    this.storageCleanups = []
    if (typeof window !== "undefined") {
      window.removeEventListener(EVENT_PAGE_URL_CHANGE, this.handleRouteChange)
    }
    this.listeners.clear()
  }

  runCheckNow(): Promise<HealthCheckSnapshot> {
    return this.enqueue(() => this.performHealthCheck())
  }

  checkConfigurationUpdates(): Promise<HealthCheckUpdateResult> {
    return this.enqueue(async () => {
      if (this.snapshot.context && !this.snapshot.context.canCheckUpdates) {
        throw new Error("This adapter configuration is not managed by the registry")
      }

      this.setSnapshot({
        ...this.snapshot,
        isCheckingUpdates: true,
        updateError: null,
      })
      try {
        const remoteResult = await this.checkForUpdatesCallback()
        if (remoteResult.status === "failed") {
          throw new Error(remoteResult.error || "Remote configuration check failed")
        }
        const snapshot = await this.performHealthCheck({ preserveWarning: true })
        this.setSnapshot({ ...snapshot, isCheckingUpdates: false, updateError: null })
        return {
          remoteStatus: remoteResult.status,
          recovered: snapshot.phase === "healthy" || snapshot.phase === "exempt",
          snapshot: this.snapshot,
        }
      } catch (error) {
        const message = getErrorMessage(error)
        this.setSnapshot({
          ...this.snapshot,
          isCheckingUpdates: false,
          updateError: message,
        })
        throw error
      }
    })
  }

  private handleRouteChange = (): void => {
    this.scheduleInitialCheck()
  }

  private scheduleInitialCheck(): void {
    if (this.destroyed) return
    if (this.initialTimer) clearTimeout(this.initialTimer)
    this.activeCheckController?.abort()
    this.hasCompletedInitialCheck = false
    this.setSnapshot({
      ...this.snapshot,
      phase: "scheduled",
      failedSelectors: [],
      consecutiveFailures: 0,
      warningReason: null,
      checkedAt: null,
      error: null,
      updateError: null,
    })
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null
      void this.runCheckNow().catch(() => undefined)
    }, this.delayMs)
  }

  private scheduleStorageRefresh(): void {
    if (this.destroyed) return
    if (this.storageRefreshTimer) clearTimeout(this.storageRefreshTimer)
    this.storageRefreshTimer = setTimeout(() => {
      this.storageRefreshTimer = null
      void this.enqueue(async () => {
        if (this.hasCompletedInitialCheck) {
          await this.performHealthCheck()
          return
        }
        try {
          const context = await this.refreshConfig()
          this.setSnapshot({ ...this.snapshot, context, error: null })
        } catch (error) {
          const message = getErrorMessage(error)
          console.error("[Ophel] Failed to refresh adapter health configuration:", error)
          this.setSnapshot({ ...this.snapshot, error: message })
        }
      }).catch(() => undefined)
    }, this.storageRefreshDebounceMs)
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async performHealthCheck(
    options: { preserveWarning?: boolean } = {},
  ): Promise<HealthCheckSnapshot> {
    if (this.destroyed) return this.snapshot

    this.activeCheckController?.abort()
    const controller = new AbortController()
    this.activeCheckController = controller
    const phase =
      options.preserveWarning && this.snapshot.phase === "warning" ? "warning" : "checking"
    this.setSnapshot({ ...this.snapshot, phase, error: null, updateError: null })

    try {
      const context = await this.refreshConfig()
      let evaluation = this.evaluate()
      if (evaluation.status === "failed") {
        evaluation = await this.waitForRecovery(this.evaluate, evaluation, controller.signal)
      }
      if (controller.signal.aborted || this.destroyed) return this.snapshot

      const checkedAt = this.now()
      this.hasCompletedInitialCheck = true
      if (evaluation.status === "exempt") {
        this.setSnapshot({
          ...this.snapshot,
          phase: "exempt",
          context,
          failedSelectors: [],
          consecutiveFailures: 0,
          warningReason: null,
          checkedAt,
          error: null,
          updateError: null,
        })
        return this.snapshot
      }

      if (evaluation.status === "healthy") {
        await this.clearStoredFailure(context.siteInstanceKey)
        this.setSnapshot({
          ...this.snapshot,
          phase: "healthy",
          context,
          failedSelectors: [],
          consecutiveFailures: 0,
          warningReason: null,
          checkedAt,
          error: null,
          updateError: null,
        })
        return this.snapshot
      }

      const record = await this.recordStoredFailure(context, evaluation.failures, checkedAt)
      const shouldWarn = record.consecutiveFailures >= HEALTH_CHECK_FAILURE_THRESHOLD
      this.setSnapshot({
        ...this.snapshot,
        phase: shouldWarn ? "warning" : "pending",
        context,
        failedSelectors: cloneFailures(record.failedSelectors),
        consecutiveFailures: record.consecutiveFailures,
        warningReason: shouldWarn ? resolveHealthWarningReason(context) : null,
        checkedAt,
        error: null,
        updateError: null,
      })
      return this.snapshot
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return this.snapshot
      const message = getErrorMessage(error)
      console.error("[Ophel] Adapter health check failed:", error)
      this.hasCompletedInitialCheck = true
      this.setSnapshot({ ...this.snapshot, phase: "error", error: message })
      throw error
    } finally {
      if (this.activeCheckController === controller) {
        this.activeCheckController = null
      }
    }
  }

  private async loadStoredState(): Promise<StoredHealthState> {
    return parseStoredState(await this.storage.get<unknown>(SITE_ADAPTER_HEALTH_STORAGE_KEY))
  }

  private async writeStoredState(state: StoredHealthState): Promise<void> {
    if (Object.keys(state.records).length === 0) {
      await this.storage.remove(SITE_ADAPTER_HEALTH_STORAGE_KEY)
      return
    }
    await this.storage.set(SITE_ADAPTER_HEALTH_STORAGE_KEY, {
      ...state,
      records: pruneStoredRecords(state.records),
    })
  }

  private async clearStoredFailure(siteInstanceKey: string): Promise<void> {
    const state = await this.loadStoredState()
    if (!Object.prototype.hasOwnProperty.call(state.records, siteInstanceKey)) return
    const records = { ...state.records }
    delete records[siteInstanceKey]
    await this.writeStoredState({ ...state, records })
  }

  private async recordStoredFailure(
    context: ActiveAdapterConfigContext,
    failures: readonly HealthSelectorFailure[],
    checkedAt: number,
  ): Promise<StoredHealthFailureRecord> {
    const state = await this.loadStoredState()
    const previous = state.records[context.siteInstanceKey]
    const sameSignature = previous?.signature === context.signature
    const sameLoad = sameSignature && previous?.loadId === this.loadId
    const consecutiveFailures = sameLoad
      ? previous.consecutiveFailures
      : sameSignature
        ? previous.consecutiveFailures + 1
        : 1
    const record: StoredHealthFailureRecord = {
      signature: context.signature,
      loadId: this.loadId,
      checkedAt,
      consecutiveFailures,
      failedSelectors: cloneFailures(failures),
    }
    await this.writeStoredState({
      ...state,
      records: {
        ...state.records,
        [context.siteInstanceKey]: record,
      },
    })
    return record
  }

  private setSnapshot(snapshot: HealthCheckSnapshot): void {
    if (this.destroyed) return
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }
}
