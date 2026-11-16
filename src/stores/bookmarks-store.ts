import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { BOOKMARKS_STORAGE_KEY } from "~constants/storage-keys"

import { chromeStorageAdapter } from "./chrome-adapter"
import type { OutlineItem } from "~adapters/base"

export interface Bookmark {
  id: string
  sessionId: string
  siteId: string // 沿用存储字段名，值为站点数据分区键；多 host 站点含 origin。
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
    siteInstanceKey: string,
    cid: string,
    node: OutlineItem,
    signature: string,
    scrollTop: number,
  ) => void
  removeBookmark: (id: string) => void
  toggleBookmark: (
    sessionId: string,
    siteInstanceKey: string,
    cid: string,
    node: OutlineItem,
    signature: string,
    scrollTop: number,
    legacySiteId?: string,
  ) => void
  updateBookmark: (id: string, updates: Partial<Omit<Bookmark, "id">>) => void
  getBookmarksBySession: (
    sessionId: string,
    siteInstanceKey: string,
    legacySiteId?: string,
  ) => Bookmark[]
  getBookmarkId: (
    sessionId: string,
    siteInstanceKey: string,
    signature: string,
    legacySiteId?: string,
  ) => string | null
  clearSessionBookmarks: (sessionId: string, siteInstanceKey: string, legacySiteId?: string) => void
  clearAllBookmarks: () => void
}

/**
 * 仅为能够安全认领旧数据的站点保留裸 siteId 匹配。
 * 多 host 内置站点只匹配完整分区键，不继承旧收藏。
 */
const matchesSiteScope = (
  bookmark: Bookmark,
  siteInstanceKey: string,
  legacySiteId?: string,
): boolean => {
  return (
    bookmark.siteId === siteInstanceKey || Boolean(legacySiteId && bookmark.siteId === legacySiteId)
  )
}

// 扁平化 storage adapter：直接存储 bookmarks 数组到根节点
const flatBookmarkStorage = {
  getItem: async (_name: string) => {
    const data = await chromeStorageAdapter.getItem(BOOKMARKS_STORAGE_KEY)
    if (data) {
      return JSON.stringify({ state: { bookmarks: JSON.parse(data) }, version: 0 })
    }
    return null
  },
  setItem: async (_name: string, value: string) => {
    const parsed = JSON.parse(value)
    const bookmarks = parsed.state?.bookmarks || []
    await chromeStorageAdapter.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks))
  },
  removeItem: async (_name: string) => {
    await chromeStorageAdapter.removeItem(BOOKMARKS_STORAGE_KEY)
  },
}

export const useBookmarkStore = create<BookmarkStore>()(
  persist(
    (set, get) => ({
      bookmarks: [],

      addBookmark: (sessionId, siteInstanceKey, cid, node, signature, scrollTop) => {
        const newBookmark: Bookmark = {
          id: crypto.randomUUID(),
          sessionId,
          siteId: siteInstanceKey,
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

      updateBookmark: (id, updates) => {
        set((state) => ({
          bookmarks: state.bookmarks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        }))
      },

      toggleBookmark: (
        sessionId,
        siteInstanceKey,
        cid,
        node,
        signature,
        scrollTop,
        legacySiteId,
      ) => {
        const state = get()
        const existingId = state.getBookmarkId(sessionId, siteInstanceKey, signature, legacySiteId)

        if (existingId) {
          state.removeBookmark(existingId)
        } else {
          state.addBookmark(sessionId, siteInstanceKey, cid, node, signature, scrollTop)
        }
      },

      getBookmarksBySession: (sessionId, siteInstanceKey, legacySiteId) => {
        return get().bookmarks.filter(
          (b) => b.sessionId === sessionId && matchesSiteScope(b, siteInstanceKey, legacySiteId),
        )
      },

      getBookmarkId: (sessionId, siteInstanceKey, signature, legacySiteId) => {
        const found = get().bookmarks.find(
          (b) =>
            b.sessionId === sessionId &&
            matchesSiteScope(b, siteInstanceKey, legacySiteId) &&
            b.signature === signature,
        )
        return found ? found.id : null
      },

      clearSessionBookmarks: (sessionId, siteInstanceKey, legacySiteId) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter(
            (b) =>
              !(b.sessionId === sessionId && matchesSiteScope(b, siteInstanceKey, legacySiteId)),
          ),
        }))
      },

      clearAllBookmarks: () => {
        set({ bookmarks: [] })
      },
    }),
    {
      name: BOOKMARKS_STORAGE_KEY,
      storage: createJSONStorage(() => flatBookmarkStorage),
    },
  ),
)
