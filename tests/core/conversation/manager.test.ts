import { afterEach, describe, expect, it, vi } from "vitest"

import type { Conversation } from "~core/conversation/types"
import { createSiteInstanceKey, createSiteScopedStorageKey } from "~utils/site-identity"

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

vi.mock("~stores/folders-store", () => {
  const useFoldersStore = Object.assign(() => undefined, {
    getState: () => ({ _hasHydrated: true }),
    subscribe: () => () => undefined,
  })
  return {
    useFoldersStore,
    getFoldersStore: () => ({ folders: [] }),
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

import { useConversationsStore } from "~stores/conversations-store"

import { ConversationManager } from "~core/conversation/manager"

const PACK_SITE_ID = "pack:shared-chat"
const FIRST_INSTANCE = createSiteInstanceKey(PACK_SITE_ID, "https://one.example")
const SECOND_INSTANCE = createSiteInstanceKey(PACK_SITE_ID, "https://two.example")
const RAW_ID = "same-id"

const createConversation = (siteInstanceKey: string, title: string): Conversation => ({
  id: RAW_ID,
  siteId: PACK_SITE_ID,
  siteInstanceKey,
  title,
  url: `${siteInstanceKey.endsWith("one.example") ? "https://one.example" : "https://two.example"}/chat/${RAW_ID}`,
  folderId: "inbox",
  createdAt: 1,
  updatedAt: 1,
  pinned: false,
})

const createAdapter = (siteInstanceKey: string) =>
  ({
    getSiteId: () => PACK_SITE_ID,
    getSiteInstanceKey: () => siteInstanceKey,
    getCurrentCid: () => null,
  }) as ConstructorParameters<typeof ConversationManager>[0]

afterEach(() => {
  useConversationsStore.setState({
    conversations: {},
    lastUsedFolderId: "inbox",
    _hasHydrated: true,
  })
  vi.clearAllMocks()
})

describe("ConversationManager site instance isolation", () => {
  it("keeps raw-ID reads and mutations scoped to the current origin", async () => {
    const firstStorageKey = createSiteScopedStorageKey(FIRST_INSTANCE, RAW_ID)
    const secondStorageKey = createSiteScopedStorageKey(SECOND_INSTANCE, RAW_ID)
    const firstConversation = createConversation(FIRST_INSTANCE, "First origin")
    const secondConversation = createConversation(SECOND_INSTANCE, "Second origin")
    useConversationsStore.setState({
      conversations: {
        [firstStorageKey]: firstConversation,
        [secondStorageKey]: secondConversation,
      },
      _hasHydrated: true,
    })

    const firstManager = new ConversationManager(createAdapter(FIRST_INSTANCE))
    const secondManager = new ConversationManager(createAdapter(SECOND_INSTANCE))

    expect(firstManager.getAllConversations()).toEqual({ [RAW_ID]: firstConversation })
    expect(secondManager.getAllConversations()).toEqual({ [RAW_ID]: secondConversation })

    firstManager.renameConversation(RAW_ID, "Renamed first")
    expect(firstManager.togglePin(RAW_ID)).toBe(true)
    firstManager.moveConversation(RAW_ID, "first-folder")

    let stored = useConversationsStore.getState().conversations
    expect(stored[firstStorageKey]).toMatchObject({
      title: "Renamed first",
      pinned: true,
      folderId: "first-folder",
    })
    expect(stored[secondStorageKey]).toEqual(secondConversation)
    expect(secondManager.getConversation(RAW_ID)).toEqual(secondConversation)

    firstManager.updateSettings({ syncUnpin: false, syncDelete: false })
    const deletion = await firstManager.deleteConversation(RAW_ID)

    expect(deletion).toMatchObject({
      id: RAW_ID,
      localDeleted: true,
      remoteEnabled: false,
      remoteAttempted: false,
    })
    stored = useConversationsStore.getState().conversations
    expect(stored[firstStorageKey]).toBeUndefined()
    expect(stored[secondStorageKey]).toEqual(secondConversation)
    expect(secondManager.getConversation(RAW_ID)).toEqual(secondConversation)
  })
})
