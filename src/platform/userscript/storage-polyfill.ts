/**
 * @plasmohq/storage Polyfill for Userscript
 *
 * 在 Userscript 构建时通过 Vite alias 替换 @plasmohq/storage
 * 提供与 @plasmohq/storage 兼容的 API，使用 GM_* 实现
 */

// GM API 类型声明
declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: unknown): void
declare function GM_deleteValue(key: string): void
declare function GM_addValueChangeListener(
  key: string,
  callback: (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
): number
declare function GM_removeValueChangeListener(listenerId: number): void

/**
 * Storage 类 - 兼容 @plasmohq/storage 的 API
 */
export class Storage {
  private area: string

  constructor(options?: { area?: string }) {
    this.area = options?.area || "local"
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = GM_getValue(key)
    if (value === undefined || value === null) {
      return undefined
    }
    return value as T
  }

  async set<T>(key: string, value: T): Promise<void> {
    GM_setValue(key, value)
  }

  async remove(key: string): Promise<void> {
    GM_deleteValue(key)
  }

  async getAll(): Promise<Record<string, unknown>> {
    // GM API 不支持 getAll，返回空对象
    console.warn("[Storage Polyfill] getAll() is not supported in userscript")
    return {}
  }

  async setMany(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      GM_setValue(key, value)
    }
  }

  watch<T>(
    key: string | { [key: string]: (change: { newValue?: T; oldValue?: T }) => void },
  ): () => void {
    if (typeof key === "string") {
      // 单 key 监听
      const listenerId = GM_addValueChangeListener(key, (_name, _oldValue, _newValue, _remote) => {
        // 简化实现，不完全兼容原 API
      })
      return () => GM_removeValueChangeListener(listenerId)
    } else {
      // 多 key 监听
      const listenerIds: number[] = []
      for (const [k, callback] of Object.entries(key)) {
        const listenerId = GM_addValueChangeListener(k, (_name, oldValue, newValue, _remote) => {
          callback({ newValue: newValue as T, oldValue: oldValue as T })
        })
        listenerIds.push(listenerId)
      }
      return () => listenerIds.forEach((id) => GM_removeValueChangeListener(id))
    }
  }
}
