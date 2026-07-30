import { afterEach, describe, expect, it, vi } from "vitest"

import type { Conversation } from "~core/conversation/types"
import { createSiteInstanceKey, createSiteScopedStorageKey } from "~utils/site-identity"

vi.mock("~stores/chrome-adapter", () => ({
  chromeStorageAdapter: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}))

import {
  getConversationsForSiteInstance,
  migrateConversationsStorageState,
  useConversationsStore,
} from "~stores/conversations-store"
import { getReadingHistoryStore, useReadingHistoryStore } from "~stores/reading-history-store"

const PACK_SITE_ID = "pack:shared-chat"
const FIRST_INSTANCE = createSiteInstanceKey(PACK_SITE_ID, "https://one.example")
const SECOND_INSTANCE = createSiteInstanceKey(PACK_SITE_ID, "https://two.example")

const createConversation = (
  overrides: Partial<Conversation> & Pick<Conversation, "id" | "siteId" | "url">,
): Conversation => ({
  title: overrides.id,
  siteInstanceKey: overrides.siteId,
  folderId: "inbox",
  createdAt: 1,
  updatedAt: 1,
  pinned: false,
  ...overrides,
})

afterEach(() => {
  useReadingHistoryStore.setState({
    history: {},
    lastCleanupRun: 0,
    _hasHydrated: true,
  })
  useConversationsStore.setState({
    conversations: {},
    lastUsedFolderId: "inbox",
    _hasHydrated: true,
  })
})

describe("site-scoped reading history", () => {
  it("separates origins and atomically claims legacy positions", () => {
    const firstKey = createSiteScopedStorageKey(FIRST_INSTANCE, "thread-1")
    const secondKey = createSiteScopedStorageKey(SECOND_INSTANCE, "thread-1")
    const legacyKey = `${PACK_SITE_ID}:thread-1`
    const legacy = { top: 120, ts: 10 }
    const second = { top: 420, ts: 20 }

    useReadingHistoryStore.setState({
      history: { [legacyKey]: legacy, [secondKey]: second },
    })

    expect(getReadingHistoryStore().claimPosition(legacyKey, firstKey)).toEqual(legacy)
    expect(getReadingHistoryStore().history).toEqual({
      [firstKey]: legacy,
      [secondKey]: second,
    })

    const current = { top: 260, ts: 30 }
    useReadingHistoryStore.setState({
      history: { [legacyKey]: legacy, [firstKey]: current, [secondKey]: second },
    })

    expect(getReadingHistoryStore().claimPosition(legacyKey, firstKey)).toEqual(current)
    expect(getReadingHistoryStore().history).toEqual({
      [firstKey]: current,
      [secondKey]: second,
    })
  })
})

describe("conversation storage migration", () => {
  it("preserves built-ins and separates equal raw IDs across dynamic origins", () => {
    const builtIn = createConversation({
      id: "same-id",
      siteId: "chatgpt",
      siteInstanceKey: "",
      title: "Built-in",
      url: "https://chatgpt.com/c/same-id",
      updatedAt: 10,
    })
    const first = createConversation({
      id: "same-id",
      siteId: PACK_SITE_ID,
      siteInstanceKey: "",
      title: "First origin",
      url: "https://one.example/chat/same-id",
      updatedAt: 20,
    })
    const second = createConversation({
      id: "same-id",
      siteId: PACK_SITE_ID,
      siteInstanceKey: "",
      title: "Second origin",
      url: "https://two.example/chat/same-id",
      updatedAt: 30,
    })
    const unresolved = createConversation({
      id: "unresolved-id",
      siteId: PACK_SITE_ID,
      siteInstanceKey: "",
      title: "Unresolved",
      url: "not a URL",
      updatedAt: 40,
    })

    const migration = migrateConversationsStorageState({
      conversations: {
        builtIn,
        first,
        second,
        unresolved,
      },
      lastUsedFolderId: "archive",
    })
    const conversations = migration.state.conversations as Record<string, Conversation>
    const builtInKey = createSiteScopedStorageKey("chatgpt", "same-id")
    const firstKey = createSiteScopedStorageKey(FIRST_INSTANCE, "same-id")
    const secondKey = createSiteScopedStorageKey(SECOND_INSTANCE, "same-id")

    expect(Object.keys(conversations)).toEqual(
      expect.arrayContaining([builtInKey, firstKey, secondKey, "unresolved"]),
    )
    expect(Object.keys(conversations)).toHaveLength(4)
    expect(conversations[builtInKey]).toEqual({ ...builtIn, siteInstanceKey: "chatgpt" })
    expect(conversations[firstKey]).toEqual({ ...first, siteInstanceKey: FIRST_INSTANCE })
    expect(conversations[secondKey]).toEqual({ ...second, siteInstanceKey: SECOND_INSTANCE })
    expect(conversations.unresolved).toEqual(unresolved)
    expect(migration.state.lastUsedFolderId).toBe("archive")
    expect(migration.warnings).toEqual(["Preserved unresolved conversation record at unresolved"])
    expect(getConversationsForSiteInstance(conversations, FIRST_INSTANCE)).toEqual({
      "same-id": { ...first, siteInstanceKey: FIRST_INSTANCE },
    })
    expect(getConversationsForSiteInstance(conversations, SECOND_INSTANCE)).toEqual({
      "same-id": { ...second, siteInstanceKey: SECOND_INSTANCE },
    })
  })

  it("keeps the newest duplicate composite record and reports the conflict", () => {
    const current = createConversation({
      id: "duplicate-id",
      siteId: PACK_SITE_ID,
      siteInstanceKey: FIRST_INSTANCE,
      title: "Current",
      url: "https://one.example/chat/duplicate-id",
      updatedAt: 20,
    })
    const stale = { ...current, title: "Stale", updatedAt: 10 }

    const migration = migrateConversationsStorageState({
      conversations: { current, stale },
    })
    const storageKey = createSiteScopedStorageKey(FIRST_INSTANCE, "duplicate-id")

    expect(migration.state.conversations).toEqual({ [storageKey]: current })
    expect(migration.warnings).toEqual([
      `Resolved duplicate conversation storage key ${storageKey}`,
    ])
  })
})
