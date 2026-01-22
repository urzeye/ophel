/**
 * 跨平台存储适配器
 *
 * 用于 Zustand persist 中间件，根据运行环境自动选择存储后端：
 * - 浏览器扩展：chrome.storage.local
 * - 油猴脚本：GM_getValue / GM_setValue
 */

import type { StateStorage } from "zustand/middleware"

// 构建时注入的平台标识
declare const __PLATFORM__: "extension" | "userscript"

// GM API 类型声明（仅在 userscript 环境使用）
declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: unknown): void
declare function GM_deleteValue(key: string): void

/**
 * 油猴脚本存储适配器
 *
 * 关键设计：GM_* API 是同步的，我们直接返回 string | null（而非 Promise）
 * 让 Zustand persist 执行**同步 hydration**，在 store 创建时立即完成数据加载
 * 这彻底消除了异步 hydration 带来的竞态条件问题
 */
const userscriptStorageAdapter: StateStorage = {
  getItem: (name: string): string | null => {
    const value = GM_getValue(name)
    if (value === undefined || value === null) {
      return null
    }
    // GM_getValue 返回的可能是对象或字符串
    return typeof value === "string" ? value : JSON.stringify(value)
  },

  setItem: (name: string, value: string): void => {
    GM_setValue(name, value)
  },

  removeItem: (name: string): void => {
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
    return new Promise((resolve) => {
      chrome.storage.local.get(name, (result) => {
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
    return new Promise((resolve) => {
      // 存储 JSON 字符串
      chrome.storage.local.set({ [name]: value }, () => {
        resolve()
      })
    })
  },

  removeItem: async (name: string): Promise<void> => {
    return new Promise((resolve) => {
      chrome.storage.local.remove(name, () => {
        resolve()
      })
    })
  },
}

/**
 * 导出的跨平台存储适配器
 * 根据 __PLATFORM__ 在编译时选择正确的实现
 */
export const chromeStorageAdapter: StateStorage =
  typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
    ? userscriptStorageAdapter
    : extensionStorageAdapter
