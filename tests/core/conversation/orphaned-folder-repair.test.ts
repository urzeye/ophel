import { afterEach, describe, expect, it, vi } from "vitest"

import type { Conversation } from "~core/conversation/types"
import { createSiteScopedStorageKey } from "~utils/site-identity"

vi.mock("~adapters/base", () => ({
  SiteAdapter: class SiteAdapter {
    extractAssistantResponseText(): string {
      return ""
    }
  },
}))

vi.mock("~constants", () => ({
  SITE_IDS: { GEMINI: "gemini" },
}))

vi.mock("~stores/chrome-adapter", () => ({
  chromeStorageAdapter: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}))

// folders 可配置，便于模拟“文件夹已被删除/从未存在”的老数据
const foldersState: { folders: Array<{ id: string; name?: string }> } = {
  folders: [{ id: "inbox" }, { id: "folder_1" }],
}

vi.mock("~stores/folders-store", () => {
  const useFoldersStore = Object.assign(() => undefined, {
    getState: () => ({ _hasHydrated: true, folders: foldersState.folders }),
    subscribe: () => () => undefined,
  })
  return {
    useFoldersStore,
    getFoldersStore: () => ({ folders: foldersState.folders }),
  }
})

vi.mock("~stores/tags-store", () => {
  const useTagsStore = Object.assign(() => undefined, {
    getState: () => ({ _hasHydrated: true }),
    subscribe: () => () => undefined,
  })
  return {
    useTagsStore,
    getTagsStore: () => ({ tags: [] }),
  }
})

vi.mock("~stores/settings-store", () => ({
  useSettingsStore: {
    getState: () => ({ settings: {} }),
  },
}))

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: { query: vi.fn() },
}))

vi.mock("~utils/exporter", () => ({
  createExportMetadata: vi.fn(),
  downloadExportPackage: vi.fn(),
  downloadFile: vi.fn(),
  downloadZipFiles: vi.fn(),
  formatToJSON: vi.fn(),
  formatToMarkdown: vi.fn(),
  formatToTXT: vi.fn(),
  htmlToMarkdown: vi.fn(),
}))

vi.mock("~utils/i18n", () => ({
  getAllLocalizedTexts: () => [],
  t: (key: string) => key,
}))

vi.mock("~utils/storage", () => ({
  consumeRestoreFlag: async () => false,
}))

vi.mock("~utils/toast", () => ({
  showToast: vi.fn(),
}))

vi.mock("~core/quick-quote-marker", () => ({
  stripQuickQuoteMarkers: (text: string) => text,
}))

vi.mock("~utils/conversation-title", () => ({
  sanitizeConversationTitleCandidate: (title: string) => title,
}))

import { useConversationsStore } from "~stores/conversations-store"

import { ConversationManager } from "~core/conversation/manager"

const SITE_ID = "chatgpt"
const STORAGE_KEY = createSiteScopedStorageKey(SITE_ID, "conv-1")

const createConversation = (folderId: string | undefined): Conversation => ({
  id: "conv-1",
  siteId: SITE_ID,
  siteInstanceKey: SITE_ID,
  title: "Legacy conversation",
  url: "https://chatgpt.com/c/conv-1",
  folderId,
  createdAt: 1,
  updatedAt: 1,
  pinned: false,
})

const createAdapter = () =>
  ({
    getSiteId: () => SITE_ID,
    getSiteInstanceKey: () => SITE_ID,
    getCurrentCid: () => null,
  }) as ConstructorParameters<typeof ConversationManager>[0]

afterEach(() => {
  useConversationsStore.setState({
    conversations: {},
    lastUsedFolderId: "inbox",
    _hasHydrated: true,
  })
  foldersState.folders = [{ id: "inbox" }, { id: "folder_1" }]
  vi.clearAllMocks()
})

describe("ConversationManager orphaned folder repair", () => {
  it("moves conversations with a missing or deleted folder into inbox", () => {
    useConversationsStore.setState({
      conversations: {
        [createSiteScopedStorageKey(SITE_ID, "conv-ghost")]: createConversation("ghost-folder"),
        [createSiteScopedStorageKey(SITE_ID, "conv-missing")]: createConversation(undefined),
        [STORAGE_KEY]: createConversation("folder_1"),
      },
      _hasHydrated: true,
    })

    const manager = new ConversationManager(createAdapter())
    ;(
      manager as unknown as { repairOrphanedConversationFolders(): void }
    ).repairOrphanedConversationFolders()

    const stored = useConversationsStore.getState().conversations
    expect(stored[createSiteScopedStorageKey(SITE_ID, "conv-ghost")].folderId).toBe("inbox")
    expect(stored[createSiteScopedStorageKey(SITE_ID, "conv-missing")].folderId).toBe("inbox")
    // 已指向有效文件夹的会话保持不变
    expect(stored[STORAGE_KEY].folderId).toBe("folder_1")
  })

  it("keeps conversations untouched when all folder ids are valid", () => {
    useConversationsStore.setState({
      conversations: {
        [STORAGE_KEY]: createConversation("folder_1"),
      },
      _hasHydrated: true,
    })

    const manager = new ConversationManager(createAdapter())
    ;(
      manager as unknown as { repairOrphanedConversationFolders(): void }
    ).repairOrphanedConversationFolders()

    const stored = useConversationsStore.getState().conversations
    expect(stored[STORAGE_KEY]).toMatchObject({
      folderId: "folder_1",
      updatedAt: 1,
    })
  })
})
