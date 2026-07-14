/**
 * 跨平台存储适配器
 *
 * 用于 Zustand persist 中间件，根据运行环境自动选择存储后端：
 * - 浏览器扩展：chrome.storage.local
 * - 油猴脚本：GM_getValue / GM_setValue
 */

import type { StateStorage } from "zustand/middleware"

import { CLEAR_ALL_GENERATION_KEY, CLEAR_ALL_PREPARE_KEY } from "~utils/storage"

// 构建时注入的平台标识
declare const __PLATFORM__: "extension" | "userscript"

// GM API 类型声明（仅在 userscript 环境使用）
declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: unknown): void
declare function GM_deleteValue(key: string): void

export class PersistenceEpochGuard {
  private warned = false

  constructor(
    private readonly readGeneration: () => unknown,
    private readonly readPrepareSignal: () => unknown,
    private readonly initialGeneration = readGeneration(),
  ) {}

  shouldSuspend(): boolean {
    const prepareSignal = this.readPrepareSignal()
    return (
      (prepareSignal !== undefined && prepareSignal !== null) ||
      !Object.is(this.readGeneration(), this.initialGeneration)
    )
  }

  warnOnce(): void {
    if (this.warned) return
    this.warned = true
    console.warn("[Ophel] Persistence writes suspended by a clear-all transaction")
  }
}

export class PersistenceWriteBarrier {
  private suspended = false
  private pendingWrites = new Set<Promise<unknown>>()

  suspend(): void {
    this.suspended = true
  }

  resume(): void {
    this.suspended = false
  }

  isSuspended(): boolean {
    return this.suspended
  }

  track(write: unknown): unknown {
    if (
      typeof write !== "object" ||
      write === null ||
      !("then" in write) ||
      typeof write.then !== "function"
    ) {
      return write
    }

    const pendingWrite = Promise.resolve(write)
    this.pendingWrites.add(pendingWrite)
    const release = () => this.pendingWrites.delete(pendingWrite)
    void pendingWrite.then(release, release)
    return pendingWrite
  }

  async drain(): Promise<void> {
    const results = await Promise.allSettled([...this.pendingWrites])
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    )
    if (failures.length > 0) {
      throw new AggregateError(failures, "Pending persistence writes failed")
    }
  }
}

export function guardPersistenceWrites(
  storage: StateStorage,
  barrier: PersistenceWriteBarrier,
): StateStorage {
  return {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => {
      if (barrier.isSuspended()) return
      return barrier.track(storage.setItem(name, value))
    },
    removeItem: (name) => {
      if (barrier.isSuspended()) return
      return barrier.track(storage.removeItem(name))
    },
  }
}

const tryParseJSON = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

const isPersistEnvelope = (value: unknown): value is { state: unknown; version?: unknown } =>
  typeof value === "object" && value !== null && "state" in value

const isLegacySettingsPayload = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }

  return ["hasAgreedToTerms", "panel", "content", "theme", "layout"].some((key) => key in value)
}

const normalizeUserscriptPersistValue = (name: string, value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null
  }

  const parsed = typeof value === "string" ? tryParseJSON(value) : value

  // 兼容旧版 userscript 直接把 settings 原始对象存到 GM 存储的格式。
  // Zustand persist 需要 { state, version } 包装，否则会把它视为“无持久化数据”。
  if (
    name === "settings" &&
    parsed !== undefined &&
    !isPersistEnvelope(parsed) &&
    isLegacySettingsPayload(parsed)
  ) {
    return JSON.stringify({
      state: { settings: parsed },
      version: 0,
    })
  }

  return typeof value === "string" ? value : JSON.stringify(value)
}

const isUserscriptBuild = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
const userscriptPersistenceEpoch = isUserscriptBuild
  ? new PersistenceEpochGuard(
      () => GM_getValue(CLEAR_ALL_GENERATION_KEY),
      () => GM_getValue(CLEAR_ALL_PREPARE_KEY),
    )
  : null

/**
 * 油猴脚本存储适配器
 *
 * 关键设计：GM_* API 是同步的，我们直接返回 string | null（而非 Promise）
 * 让 Zustand persist 执行**同步 hydration**，在 store 创建时立即完成数据加载。
 * 这可避免异步 hydration 带来的竞态条件，但也意味着 onRehydrateStorage 回调
 * 会在 create() 返回之前触发，此时 store 变量仍处于 TDZ/未初始化状态。
 * 因此回调内必须避免直接引用 useXxxStore，应改用闭包捕获的 set/api.setState。
 */
const userscriptStorageAdapter: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      const value = GM_getValue(name)
      return normalizeUserscriptPersistValue(name, value)
    } catch (e) {
      console.error(`[ophel] userscriptStorageAdapter.getItem("${name}") THREW:`, e)
      throw e
    }
  },

  setItem: (name: string, value: string): void => {
    if (userscriptPersistenceEpoch?.shouldSuspend()) {
      userscriptPersistenceEpoch.warnOnce()
      return
    }
    GM_setValue(name, value)
  },

  removeItem: (name: string): void => {
    if (userscriptPersistenceEpoch?.shouldSuspend()) {
      userscriptPersistenceEpoch.warnOnce()
      return
    }
    GM_deleteValue(name)
  },
}

/**
 * 浏览器扩展存储适配器
 *
 * Zustand persist 存储格式: { state: { [storeName]: ... }, version: 0 }
 */
const extensionStorageAdapter: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(name, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || `Failed to read ${name}`))
          return
        }
        const value = result[name]
        if (value === undefined) {
          resolve(null)
          return
        }

        // storage 中存储的是 JSON 字符串
        if (typeof value === "string") {
          resolve(value)
        } else {
          // 对象格式（理论上不应出现），转换为字符串
          resolve(JSON.stringify(value))
        }
      })
    })
  },

  setItem: async (name: string, value: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 存储 JSON 字符串
      chrome.storage.local.set({ [name]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || `Failed to write ${name}`))
          return
        }
        resolve()
      })
    })
  },

  removeItem: async (name: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(name, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || `Failed to remove ${name}`))
          return
        }
        resolve()
      })
    })
  },
}

/**
 * 导出的跨平台存储适配器
 * 根据 __PLATFORM__ 在编译时选择正确的实现
 */
const persistenceWriteBarrier = new PersistenceWriteBarrier()
const platformStorageAdapter = isUserscriptBuild
  ? userscriptStorageAdapter
  : extensionStorageAdapter

export const suspendPersistenceWrites = (): void => persistenceWriteBarrier.suspend()
export const drainPersistenceWrites = (): Promise<void> => persistenceWriteBarrier.drain()

export async function runTrackedPersistenceWrite(write: () => Promise<void>): Promise<void> {
  if (persistenceWriteBarrier.isSuspended() || userscriptPersistenceEpoch?.shouldSuspend()) {
    userscriptPersistenceEpoch?.warnOnce()
    throw new Error("Persistence writes are suspended by a clear-all transaction")
  }
  await Promise.resolve(persistenceWriteBarrier.track(write()))
}

export const chromeStorageAdapter: StateStorage = guardPersistenceWrites(
  platformStorageAdapter,
  persistenceWriteBarrier,
)
