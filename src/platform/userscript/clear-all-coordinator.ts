import {
  CLEAR_ALL_FLAG_KEY,
  CLEAR_ALL_GENERATION_KEY,
  CLEAR_ALL_PREPARE_KEY,
  CLEAR_ALL_RESUME_KEY,
} from "~utils/storage"

export const USERSCRIPT_RUNTIME_HEARTBEAT_PREFIX = "ophel:clearAllRuntime:"
export const USERSCRIPT_CLEAR_ACK_PREFIX = "ophel:clearAllAck:"

const HEARTBEAT_INTERVAL_MS = 2000
const HEARTBEAT_TTL_MS = 120000
const PREPARE_SIGNAL_TTL_MS = 60000
const ACK_TIMEOUT_MS = 5000
const ACK_POLL_INTERVAL_MS = 25

interface ClearPrepareSignal {
  transactionId: string
  requestedAt: number
}

interface ClearAcknowledgement {
  transactionId: string
  instanceId: string
  success: boolean
  error?: string
}

interface RuntimeHeartbeat {
  updatedAt: number
}

type ValueChangeListener = (
  name: string,
  oldValue: unknown,
  newValue: unknown,
  remote: boolean,
) => void

export interface UserscriptValueApi {
  getValue<T>(key: string): T | undefined
  setValue(key: string, value: unknown): void
  deleteValue(key: string): void
  listValues(): string[]
  addValueChangeListener(key: string, callback: ValueChangeListener): number
  removeValueChangeListener(listenerId: number): void
}

interface UserscriptClearCallbacks {
  prepareCurrentRuntime: () => Promise<void>
  reloadCurrentRuntime: () => void
}

interface UserscriptClearCoordinatorOptions {
  instanceId?: string
  now?: () => number
  sleep?: (delay: number) => Promise<void>
  setInterval?: (callback: () => void, delay: number) => ReturnType<typeof setInterval>
  clearInterval?: (timer: ReturnType<typeof setInterval>) => void
  heartbeatTtlMs?: number
  prepareSignalTtlMs?: number
  ackTimeoutMs?: number
  ackPollIntervalMs?: number
}

const isPrepareSignal = (value: unknown): value is ClearPrepareSignal =>
  typeof value === "object" &&
  value !== null &&
  "transactionId" in value &&
  typeof value.transactionId === "string" &&
  "requestedAt" in value &&
  typeof value.requestedAt === "number"

const isHeartbeat = (value: unknown): value is RuntimeHeartbeat =>
  typeof value === "object" &&
  value !== null &&
  "updatedAt" in value &&
  typeof value.updatedAt === "number"

const isAcknowledgement = (value: unknown): value is ClearAcknowledgement =>
  typeof value === "object" &&
  value !== null &&
  "transactionId" in value &&
  typeof value.transactionId === "string" &&
  "instanceId" in value &&
  typeof value.instanceId === "string" &&
  "success" in value &&
  typeof value.success === "boolean"

export const isUserscriptClearRuntimeKey = (key: string): boolean =>
  key === CLEAR_ALL_PREPARE_KEY ||
  key === CLEAR_ALL_GENERATION_KEY ||
  key.startsWith(USERSCRIPT_RUNTIME_HEARTBEAT_PREFIX) ||
  key.startsWith(USERSCRIPT_CLEAR_ACK_PREFIX)

export class UserscriptClearAllCoordinator {
  readonly instanceId: string

  private readonly heartbeatKey: string
  private readonly now: () => number
  private readonly sleep: (delay: number) => Promise<void>
  private readonly scheduleInterval: UserscriptClearCoordinatorOptions["setInterval"]
  private readonly cancelInterval: UserscriptClearCoordinatorOptions["clearInterval"]
  private readonly heartbeatTtlMs: number
  private readonly prepareSignalTtlMs: number
  private readonly ackTimeoutMs: number
  private readonly ackPollIntervalMs: number
  private listeners: number[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private started = false
  private startupBlocked = false
  private currentTransactionId: string | null = null
  private preparationByTransaction = new Map<string, Promise<void>>()

  constructor(
    private readonly api: UserscriptValueApi,
    private readonly callbacks: UserscriptClearCallbacks,
    options: UserscriptClearCoordinatorOptions = {},
  ) {
    this.instanceId = options.instanceId ?? crypto.randomUUID()
    this.heartbeatKey = `${USERSCRIPT_RUNTIME_HEARTBEAT_PREFIX}${this.instanceId}`
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)))
    this.scheduleInterval = options.setInterval ?? setInterval
    this.cancelInterval = options.clearInterval ?? clearInterval
    this.heartbeatTtlMs = options.heartbeatTtlMs ?? HEARTBEAT_TTL_MS
    this.prepareSignalTtlMs = options.prepareSignalTtlMs ?? PREPARE_SIGNAL_TTL_MS
    this.ackTimeoutMs = options.ackTimeoutMs ?? ACK_TIMEOUT_MS
    this.ackPollIntervalMs = options.ackPollIntervalMs ?? ACK_POLL_INTERVAL_MS
  }

  start(): { clearPending: boolean } {
    if (this.started) {
      return { clearPending: this.getCurrentPrepareSignal() !== null }
    }
    this.started = true

    this.listeners.push(
      this.api.addValueChangeListener(CLEAR_ALL_PREPARE_KEY, (_name, _oldValue, value, remote) => {
        if (!remote) return
        if (isPrepareSignal(value)) {
          void this.prepareAndAcknowledge(value)
        } else if (this.startupBlocked && (value === undefined || value === null)) {
          this.requestReload()
        }
      }),
      this.api.addValueChangeListener(CLEAR_ALL_FLAG_KEY, (_name, _oldValue, value, remote) => {
        if (!remote || value === undefined || value === null) return
        void this.callbacks.prepareCurrentRuntime().finally(() => this.requestReload())
      }),
      this.api.addValueChangeListener(CLEAR_ALL_RESUME_KEY, (_name, _oldValue, value, remote) => {
        if (remote && value !== undefined && value !== null) {
          this.requestReload()
        }
      }),
    )

    this.writeHeartbeat()
    this.heartbeatTimer =
      this.scheduleInterval?.(() => this.writeHeartbeat(), HEARTBEAT_INTERVAL_MS) ?? null

    const pendingSignal = this.getCurrentPrepareSignal()
    if (pendingSignal) {
      this.startupBlocked = true
      void this.prepareAndAcknowledge(pendingSignal)
      return { clearPending: true }
    }
    return { clearPending: false }
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    for (const listenerId of this.listeners) {
      this.api.removeValueChangeListener(listenerId)
    }
    this.listeners = []
    if (this.heartbeatTimer !== null) {
      this.cancelInterval?.(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.api.deleteValue(this.heartbeatKey)
  }

  async prepareRemoteRuntimes(): Promise<void> {
    if (!this.started) throw new Error("Userscript clear coordinator is not initialized")

    const signal: ClearPrepareSignal = {
      transactionId: crypto.randomUUID(),
      requestedAt: this.now(),
    }
    this.currentTransactionId = signal.transactionId
    const expectedInstances = this.getActiveRuntimeIds().filter((id) => id !== this.instanceId)
    this.api.setValue(CLEAR_ALL_PREPARE_KEY, signal)

    const deadline = this.now() + this.ackTimeoutMs
    while (true) {
      const pending: string[] = []
      for (const instanceId of expectedInstances) {
        const acknowledgement = this.api.getValue<unknown>(this.getAckKey(signal, instanceId))
        if (!isAcknowledgement(acknowledgement)) {
          pending.push(instanceId)
          continue
        }
        if (!acknowledgement.success) {
          throw new Error(
            acknowledgement.error || `Userscript runtime ${instanceId} failed to stop`,
          )
        }
      }

      if (pending.length === 0) return
      if (this.now() >= deadline) {
        throw new Error(`Timed out waiting for ${pending.length} userscript runtime(s)`)
      }
      await this.sleep(this.ackPollIntervalMs)
    }
  }

  complete(): void {
    this.cleanupCurrentTransaction()
  }

  abort(): void {
    const transactionId = this.currentTransactionId
    this.cleanupCurrentTransaction()
    this.api.setValue(CLEAR_ALL_RESUME_KEY, {
      transactionId,
      requestedAt: this.now(),
    })
  }

  private writeHeartbeat(): void {
    this.api.setValue(this.heartbeatKey, { updatedAt: this.now() } satisfies RuntimeHeartbeat)
  }

  private requestReload(): void {
    this.startupBlocked = false
    this.callbacks.reloadCurrentRuntime()
  }

  private getCurrentPrepareSignal(): ClearPrepareSignal | null {
    const signal = this.api.getValue<unknown>(CLEAR_ALL_PREPARE_KEY)
    if (!isPrepareSignal(signal)) return null
    if (this.now() - signal.requestedAt <= this.prepareSignalTtlMs) return signal

    this.api.deleteValue(CLEAR_ALL_PREPARE_KEY)
    return null
  }

  private getActiveRuntimeIds(): string[] {
    const cutoff = this.now() - this.heartbeatTtlMs
    return this.api
      .listValues()
      .filter((key) => key.startsWith(USERSCRIPT_RUNTIME_HEARTBEAT_PREFIX))
      .flatMap((key) => {
        const heartbeat = this.api.getValue<unknown>(key)
        return isHeartbeat(heartbeat) && heartbeat.updatedAt >= cutoff
          ? [key.slice(USERSCRIPT_RUNTIME_HEARTBEAT_PREFIX.length)]
          : []
      })
  }

  private getAckKey(signal: ClearPrepareSignal, instanceId: string): string {
    return `${USERSCRIPT_CLEAR_ACK_PREFIX}${signal.transactionId}:${instanceId}`
  }

  private prepareAndAcknowledge(signal: ClearPrepareSignal): Promise<void> {
    const existing = this.preparationByTransaction.get(signal.transactionId)
    if (existing) return existing

    const preparation = this.callbacks.prepareCurrentRuntime().then(
      () => {
        this.api.setValue(this.getAckKey(signal, this.instanceId), {
          transactionId: signal.transactionId,
          instanceId: this.instanceId,
          success: true,
        } satisfies ClearAcknowledgement)
      },
      (error) => {
        this.api.setValue(this.getAckKey(signal, this.instanceId), {
          transactionId: signal.transactionId,
          instanceId: this.instanceId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies ClearAcknowledgement)
      },
    )
    this.preparationByTransaction.set(signal.transactionId, preparation)
    void preparation.finally(() => this.preparationByTransaction.delete(signal.transactionId))
    return preparation
  }

  private cleanupCurrentTransaction(): void {
    const transactionId = this.currentTransactionId
    this.api.deleteValue(CLEAR_ALL_PREPARE_KEY)
    if (transactionId) {
      const ackPrefix = `${USERSCRIPT_CLEAR_ACK_PREFIX}${transactionId}:`
      for (const key of this.api.listValues()) {
        if (key.startsWith(ackPrefix)) this.api.deleteValue(key)
      }
    }
    this.currentTransactionId = null
  }
}

declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: unknown): void
declare function GM_deleteValue(key: string): void
declare function GM_listValues(): string[]
declare function GM_addValueChangeListener(key: string, callback: ValueChangeListener): number
declare function GM_removeValueChangeListener(listenerId: number): void

const gmValueApi: UserscriptValueApi = {
  getValue: (key) => GM_getValue(key),
  setValue: (key, value) => GM_setValue(key, value),
  deleteValue: (key) => GM_deleteValue(key),
  listValues: () => GM_listValues(),
  addValueChangeListener: (key, callback) => GM_addValueChangeListener(key, callback),
  removeValueChangeListener: (listenerId) => GM_removeValueChangeListener(listenerId),
}

let activeCoordinator: UserscriptClearAllCoordinator | null = null

export function initUserscriptClearAllCoordinator(callbacks: UserscriptClearCallbacks): {
  clearPending: boolean
  cleanup: () => void
} {
  if (activeCoordinator) throw new Error("Userscript clear coordinator is already initialized")
  const coordinator = new UserscriptClearAllCoordinator(gmValueApi, callbacks)
  activeCoordinator = coordinator
  const { clearPending } = coordinator.start()
  return {
    clearPending,
    cleanup: () => {
      coordinator.stop()
      if (activeCoordinator === coordinator) activeCoordinator = null
    },
  }
}

const getActiveCoordinator = (): UserscriptClearAllCoordinator => {
  if (!activeCoordinator) throw new Error("Userscript clear coordinator is not initialized")
  return activeCoordinator
}

export const prepareUserscriptClearAll = (): Promise<void> =>
  getActiveCoordinator().prepareRemoteRuntimes()

export const completeUserscriptClearAll = (): void => getActiveCoordinator().complete()

export const abortUserscriptClearAll = (): void => getActiveCoordinator().abort()
