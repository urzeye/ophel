import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("~stores/chrome-adapter", () => ({
  chromeStorageAdapter: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}))
vi.mock("~adapters/base", () => ({ SiteAdapter: class {} }))
vi.mock("~stores/settings-store", () => ({
  useSettingsStore: { getState: () => ({ settings: {} }) },
}))
vi.mock("~utils/exporter", () => ({ HTML_FILE_EXT: ".html" }))
vi.mock("~utils/dom-toolkit", () => ({ DOMToolkit: {} }))
vi.mock("~utils/storage", () => ({ consumeRestoreFlag: async () => false }))
vi.mock("~utils/toast", () => ({ showToast: vi.fn() }))
vi.mock("~core/conversation/open-for-export", () => ({}))

import type { ConversationInfo, ConversationLoadOptions, SiteAdapter } from "~adapters/base"
import { ConversationManager } from "~core/conversation/manager"
import type { Conversation } from "~core/conversation/types"
import { useConversationsStore } from "~stores/conversations-store"
import { useFoldersStore } from "~stores/folders-store"
import { useTagsStore } from "~stores/tags-store"
import { createSiteScopedStorageKey } from "~utils/site-identity"
import { resources } from "~locales/resources"

const siteInstanceKey = "builtin:chatgpt"
const key = (id: string) => createSiteScopedStorageKey(siteInstanceKey, id)
const record = (id: string, overrides: Partial<Conversation> = {}): Conversation => ({
  id,
  siteId: "chatgpt",
  siteInstanceKey,
  title: id,
  url: `https://chatgpt.com/c/${id}`,
  folderId: "research",
  tagIds: ["important"],
  pinned: true,
  createdAt: 10,
  updatedAt: 20,
  ...overrides,
})

function setup() {
  let cid: string | null = null
  let items: ConversationInfo[] = [record("visible")]
  let complete = true
  let failure = false
  const deleteConversationsOnSite = vi.fn()
  const loadAllConversations = vi.fn(async (options: ConversationLoadOptions) => {
    options.signal?.throwIfAborted()
    options.onProgress?.(items)
    if (failure) throw new Error("network failed")
    return complete
  })
  const adapter = {
    getSiteId: () => "chatgpt",
    getSiteInstanceKey: () => siteInstanceKey,
    getCurrentCid: () => cid,
    getConversationSyncContext: () => JSON.stringify([siteInstanceKey, cid ?? ""]),
    getSidebarScrollContainer: () => null,
    getConversationList: () => items,
    loadAllConversations,
    deleteConversationsOnSite,
  } as unknown as SiteAdapter
  const manager = new ConversationManager(adapter)
  useConversationsStore.setState({
    conversations: Object.fromEntries(
      [record("visible"), record("project"), record("archived")].map((conv) => [
        key(conv.id),
        conv,
      ]),
    ),
    initialSyncStates: {},
  })
  return {
    manager,
    deleteConversationsOnSite,
    setItems: (next: ConversationInfo[]) => {
      items = next
    },
    setComplete: (next: boolean) => {
      complete = next
    },
    setFailure: () => {
      failure = true
    },
    setCid: (next: string) => {
      cid = next
    },
  }
}

beforeEach(() => {
  const windowTarget = new EventTarget()
  Object.assign(windowTarget, {
    location: { href: "https://chatgpt.com/", origin: "https://chatgpt.com" },
  })
  vi.stubGlobal("window", windowTarget)
  vi.stubGlobal("document", new EventTarget())
  useFoldersStore.setState({
    folders: [
      { id: "inbox", name: "Inbox", icon: "", isDefault: true },
      { id: "research", name: "Research", icon: "" },
    ],
  })
  useTagsStore.setState({ tags: [{ id: "important", name: "Important", color: "#123456" }] })
})

describe("safe conversation sync review", () => {
  it("keeps missing metadata and offers review even when site-delete is enabled", async () => {
    const { manager, deleteConversationsOnSite } = setup()
    manager.updateSettings({ syncUnpin: false, syncDelete: true })
    const result = await manager.syncAllConversations()
    expect(result.status).toBe("complete")
    expect(manager.getSyncReview()?.missingIds).toEqual(["project", "archived"])
    expect(useConversationsStore.getState().conversations[key("project")]).toEqual(
      record("project"),
    )
    expect(deleteConversationsOnSite).not.toHaveBeenCalled()
  })

  it.each(["partial", "failed", "empty", "initial", "cancelled"])(
    "does not infer missing records after %s sync",
    async (mode) => {
      const fixture = setup()
      if (mode === "partial") fixture.setComplete(false)
      if (mode === "failed") fixture.setFailure()
      if (mode === "empty") fixture.setItems([])
      const sync = fixture.manager.syncAllConversations({ initial: mode === "initial" })
      if (mode === "cancelled") fixture.manager.cancelSync()
      await sync
      expect(fixture.manager.getSyncReview()).toBeNull()
      expect(Object.keys(useConversationsStore.getState().conversations)).toHaveLength(3)
    },
  )

  it("removes only checked candidates locally and undo restores all metadata", async () => {
    const { manager, deleteConversationsOnSite } = setup()
    await manager.syncAllConversations()
    const context = manager.getSyncReview()!.context
    expect(
      manager.removeMissingConversations(["project", "visible", "project", "unknown"], context),
    ).toBe(1)
    expect(manager.getSyncReview()?.missingIds).toEqual(["archived"])
    expect(useConversationsStore.getState().conversations[key("project")]).toBeUndefined()
    expect(useConversationsStore.getState().conversations[key("archived")]).toEqual(
      record("archived"),
    )
    expect(deleteConversationsOnSite).not.toHaveBeenCalled()
    expect(manager.undoMissingConversationCleanup()).toBe(1)
    expect(useConversationsStore.getState().conversations[key("project")]).toMatchObject(
      record("project", { updatedAt: expect.any(Number) }),
    )
    expect(manager.getSyncReview()?.undoCount).toBe(0)
  })

  it("merges multiple cleanup batches so no earlier metadata loses its undo", async () => {
    const { manager } = setup()
    await manager.syncAllConversations()
    const context = manager.getSyncReview()!.context
    manager.removeMissingConversations(["project"], context)
    manager.removeMissingConversations(["archived"], context)
    expect(manager.getSyncReview()?.undoCount).toBe(2)
    expect(manager.undoMissingConversationCleanup()).toBe(2)
    expect(Object.keys(useConversationsStore.getState().conversations)).toHaveLength(3)
  })

  it("expires only undo metadata without changing the remaining conversations", async () => {
    const { manager } = setup()
    await manager.syncAllConversations()
    const context = manager.getSyncReview()!.context
    manager.removeMissingConversations(["project"], context)
    const revision = manager.getSyncReview()!.undoRevision
    const records = useConversationsStore.getState().conversations
    manager.expireCleanupUndo(context, revision)
    expect(manager.getSyncReview()?.undoCount).toBe(0)
    expect(manager.undoMissingConversationCleanup()).toBe(0)
    expect(useConversationsStore.getState().conversations).toBe(records)
    manager.removeMissingConversations(["archived"], context)
    expect(manager.getSyncReview()?.undoCount).toBe(1)
    expect(manager.undoMissingConversationCleanup()).toBe(1)
    expect(useConversationsStore.getState().conversations[key("project")]).toBeUndefined()
  })

  it("ignores an expired notice callback after a newer cleanup batch", async () => {
    const { manager } = setup()
    await manager.syncAllConversations()
    const context = manager.getSyncReview()!.context
    manager.removeMissingConversations(["project"], context)
    const previousRevision = manager.getSyncReview()!.undoRevision
    manager.removeMissingConversations(["archived"], context)
    expect(manager.getSyncReview()!.undoRevision).not.toBe(previousRevision)
    manager.expireCleanupUndo(context, previousRevision)
    expect(manager.getSyncReview()?.undoCount).toBe(2)
    expect(manager.undoMissingConversationCleanup()).toBe(2)
  })

  it("assigns a fresh revision even when the next cleanup has the same count", async () => {
    const { manager } = setup()
    await manager.syncAllConversations()
    const context = manager.getSyncReview()!.context
    manager.removeMissingConversations(["project"], context)
    const previousRevision = manager.getSyncReview()!.undoRevision
    manager.undoMissingConversationCleanup()
    manager.removeMissingConversations(["archived"], context)
    expect(manager.getSyncReview()?.undoCount).toBe(1)
    expect(manager.getSyncReview()!.undoRevision).toBeGreaterThan(previousRevision)
    manager.expireCleanupUndo(context, previousRevision)
    expect(manager.getSyncReview()?.undoCount).toBe(1)
  })

  it("rechecks the current list immediately before cleanup", async () => {
    const { manager, setItems } = setup()
    await manager.syncAllConversations()
    const context = manager.getSyncReview()!.context
    setItems([record("visible"), record("project")])
    expect(manager.removeMissingConversations(["project"], context)).toBe(0)
    expect(manager.getSyncReview()?.missingIds).toEqual(["archived"])
    expect(useConversationsStore.getState().conversations[key("project")]).toEqual(
      record("project"),
    )
  })

  it("removes positively observed records from review", async () => {
    const { manager } = setup()
    await manager.syncAllConversations()
    manager.syncConversations(null, true, { items: [record("project")] })
    expect(manager.getSyncReview()?.missingIds).toEqual(["archived"])
    expect(useConversationsStore.getState().conversations[key("project")].tagIds).toEqual([
      "important",
    ])
  })

  it("rejects stale review and undo after an account/context change", async () => {
    const { manager, setCid } = setup()
    await manager.syncAllConversations()
    const context = manager.getSyncReview()!.context
    manager.removeMissingConversations(["project"], context)
    setCid("another-account")
    expect(manager.getSyncReview()).toBeNull()
    expect(manager.removeMissingConversations(["archived"], context)).toBe(0)
    expect(manager.undoMissingConversationCleanup()).toBe(0)
    expect(useConversationsStore.getState().conversations[key("archived")]).toEqual(
      record("archived"),
    )
  })

  it("disables cleanup while sync is running", async () => {
    const { manager } = setup()
    await manager.syncAllConversations()
    const context = manager.getSyncReview()!.context
    const sync = manager.syncAllConversations()
    expect(manager.removeMissingConversations(["project"], context)).toBe(0)
    await sync
  })

  it("keeps a dismissed notice quiet until new missing records appear", async () => {
    const { manager, setItems } = setup()
    await manager.syncAllConversations()
    manager.dismissSyncReview()
    await manager.syncAllConversations()
    expect(manager.getSyncReview()?.dismissed).toBe(true)
    manager.syncConversations(null, true, { items: [record("new-chat")] })
    setItems([record("visible")])
    await manager.syncAllConversations()
    expect(manager.getSyncReview()?.dismissed).toBe(false)
    expect(manager.getSyncReview()?.missingIds).toContain("new-chat")
  })

  it("never includes a known different workspace in the review", async () => {
    const { manager } = setup()
    const other = record("other", { cid: "workspace-b" })
    useConversationsStore.getState().addConversation(other)
    await manager.syncAllConversations()
    expect(manager.getSyncReview()?.missingIds).not.toContain("other")
    expect(useConversationsStore.getState().conversations[key("other")]).toEqual(other)
  })

  it("invalidates review and undo on context events, even if the user returns", async () => {
    const { manager, setCid } = setup()
    const unsubscribe = manager.subscribeSyncReview(vi.fn())
    await manager.syncAllConversations()
    const context = manager.getSyncReview()!.context
    manager.removeMissingConversations(["project"], context)
    setCid("another-account")
    window.dispatchEvent(new Event("popstate"))
    setCid("")
    expect(manager.getSyncReview()).toBeNull()
    expect(manager.undoMissingConversationCleanup()).toBe(0)
    unsubscribe()
  })

  it("restores safely when the original folder or tags no longer exist", async () => {
    const { manager } = setup()
    await manager.syncAllConversations()
    manager.removeMissingConversations(["project"], manager.getSyncReview()!.context)
    useFoldersStore.setState({
      folders: [{ id: "inbox", name: "Inbox", icon: "", isDefault: true }],
    })
    useTagsStore.setState({ tags: [] })
    expect(manager.undoMissingConversationCleanup()).toBe(1)
    expect(useConversationsStore.getState().conversations[key("project")]).toMatchObject({
      folderId: "inbox",
      tagIds: [],
      pinned: true,
      createdAt: 10,
    })
  })

  it("does not replace a valid review with a partial snapshot", async () => {
    const { manager, setComplete } = setup()
    await manager.syncAllConversations()
    const missingIds = manager.getSyncReview()!.missingIds
    setComplete(false)
    await manager.syncAllConversations()
    expect(manager.getSyncReview()?.missingIds).toEqual(missingIds)
  })
})

describe("sync review translations", () => {
  const reviewKeys = Object.keys(resources.en).filter((key) =>
    /^conversations(Missing|Cleanup|SyncNoData)/.test(key),
  )
  const placeholders = (value: string) =>
    [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  it.each(Object.entries(resources))(
    "includes every review message and placeholder in %s",
    (_locale, messages) => {
      expect(reviewKeys).toHaveLength(20)
      for (const key of reviewKeys) {
        const source = resources.en[key as keyof typeof resources.en]
        const translated = messages[key as keyof typeof messages]
        expect(translated, key).toBeTruthy()
        expect(placeholders(translated), key).toEqual(placeholders(source))
      }
    },
  )
})
