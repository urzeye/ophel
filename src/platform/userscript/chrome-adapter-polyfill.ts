/**
 * Chrome Storage 适配器 Polyfill for Userscript
 *
 * 在 Userscript 构建时通过 Vite alias 替换 chrome-adapter.ts
 * 提供与原 chromeStorageAdapter 兼容的 API，使用 GM_* 实现
 */

import type { StateStorage } from "zustand/middleware"

// GM API 类型声明
declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: unknown): void
declare function GM_deleteValue(key: string): void

// 确认 polyfill 被加载

/**
 * 油猴脚本存储适配器
 * 用于 Zustand persist 中间件
 */
export const chromeStorageAdapter: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = GM_getValue(name)
    if (value === undefined || value === null) {
      return null
    }
    // GM_getValue 返回的可能是对象或字符串
    const result = typeof value === "string" ? value : JSON.stringify(value)
    return result
  },

  setItem: async (name: string, value: string): Promise<void> => {
    // Zustand persist 传入的是 JSON 字符串，直接存储
    GM_setValue(name, value)
  },

  removeItem: async (name: string): Promise<void> => {
    GM_deleteValue(name)
  },
}
