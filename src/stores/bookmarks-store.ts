import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { chromeStorageAdapter } from "./chrome-adapter"
import type { OutlineItem } from "~adapters/base"

export interface Bookmark {
  id: string
  sessionId: string
  siteId: string // 站点标识 (chatgpt/claude/gemini...)
  cid: string // 账号/团队 ID
  title: string
  level: number
  signature: string // 模糊匹配签名: title + nextSiblingText
  scrollTop: number // 回退位置
  timestamp: number
}

interface BookmarkStore {
  bookmarks: Bookmark[]

  // Actions
  addBookmark: (
    sessionId: string,
    siteId: string,
    cid: string,
    node: OutlineItem,
    signature: string,
    scrollTop: number,
  ) => void
  removeBookmark: (id: string) => void
  toggleBookmark: (
    sessionId: string,
    siteId: string,
    cid: string,
    node: OutlineItem,
    signature: string,
    scrollTop: number,
  ) => void
  getBookmarksBySession: (sessionId: string) => Bookmark[]
  getBookmarkId: (sessionId: string, signature: string) => string | null
  clearSessionBookmarks: (sessionId: string) => void
  clearAllBookmarks: () => void
}

// 扁平化 storage adapter：直接存储 bookmarks 数组到根节点
const flatBookmarkStorage = {
  getItem: async (name: string) => {
    const data = await chromeStorageAdapter.getItem("bookmarks")
    if (data) {
      return JSON.stringify({ state: { bookmarks: JSON.parse(data) }, version: 0 })
    }
    return null
  },
  setItem: async (name: string, value: string) => {
    const parsed = JSON.parse(value)
    const bookmarks = parsed.state?.bookmarks || []
    await chromeStorageAdapter.setItem("bookmarks", JSON.stringify(bookmarks))
  },
  removeItem: async (name: string) => {
    await chromeStorageAdapter.removeItem("bookmarks")
  },
}

export const useBookmarkStore = create<BookmarkStore>()(
  persist(
    (set, get) => ({
      bookmarks: [],

      addBookmark: (sessionId, siteId, cid, node, signature, scrollTop) => {
        const newBookmark: Bookmark = {
          id: crypto.randomUUID(),
          sessionId,
          siteId,
          cid,
          title: node.text,
          level: node.level,
          signature,
          scrollTop,
          timestamp: Date.now(),
        }

        set((state) => ({
          bookmarks: [...state.bookmarks, newBookmark],
        }))
      },

      removeBookmark: (id) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
        }))
      },

      toggleBookmark: (sessionId, siteId, cid, node, signature, scrollTop) => {
        const state = get()
        const existingId = state.getBookmarkId(sessionId, signature)

        if (existingId) {
          state.removeBookmark(existingId)
        } else {
          state.addBookmark(sessionId, siteId, cid, node, signature, scrollTop)
        }
      },

      getBookmarksBySession: (sessionId) => {
        return get().bookmarks.filter((b) => b.sessionId === sessionId)
      },

      getBookmarkId: (sessionId, signature) => {
        const found = get().bookmarks.find(
          (b) => b.sessionId === sessionId && b.signature === signature,
        )
        return found ? found.id : null
      },

      clearSessionBookmarks: (sessionId) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.sessionId !== sessionId),
        }))
      },

      clearAllBookmarks: () => {
        set({ bookmarks: [] })
      },
    }),
    {
      name: "bookmarks", // 存储键名
      storage: createJSONStorage(() => flatBookmarkStorage),
    },
  ),
)
