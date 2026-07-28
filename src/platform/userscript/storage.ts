import type { PlatformStorage } from "../types"

declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: unknown): void
declare function GM_deleteValue(key: string): void
declare function GM_addValueChangeListener(
  key: string,
  callback: (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
): number
declare function GM_removeValueChangeListener(listenerId: number): void

/**
 * 油猴版存储实现
 */
export const userscriptStorage: PlatformStorage = {
  async get<T>(key: string): Promise<T | undefined> {
    const value = GM_getValue(key)
    if (value === undefined || value === null) {
      return undefined
    }
    // GM_getValue 已经处理了 JSON 反序列化
    return value as T
  },

  async set<T>(key: string, value: T): Promise<void> {
    GM_setValue(key, value)
  },

  async remove(key: string): Promise<void> {
    GM_deleteValue(key)
  },

  watch<T>(
    key: string,
    callback: (newValue: T | undefined, oldValue: T | undefined) => void,
  ): () => void {
    const listenerId = GM_addValueChangeListener(key, (_name, oldValue, newValue, _remote) => {
      callback(newValue as T | undefined, oldValue as T | undefined)
    })
    return () => GM_removeValueChangeListener(listenerId)
  },
}
