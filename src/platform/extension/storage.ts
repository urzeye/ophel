import type { PlatformStorage } from "../types"

/**
 * 扩展版存储实现
 */
export const extensionStorage: PlatformStorage = {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await chrome.storage.local.get(key)
    return result[key] as T | undefined
  },

  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value })
  },

  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key)
  },

  watch<T>(
    key: string,
    callback: (newValue: T | undefined, oldValue: T | undefined) => void,
  ): () => void {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (key in changes) {
        callback(changes[key].newValue as T | undefined, changes[key].oldValue as T | undefined)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  },
}
