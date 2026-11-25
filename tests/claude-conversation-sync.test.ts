import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ClaudeAdapter } from "~adapters/claude"

const capture = vi.hoisted(() => ({ callback: null as ((response: unknown) => void) | null }))
vi.mock("~utils/dom-toolkit", () => ({ DOMToolkit: {} }))
vi.mock("~utils/network-response-capture", () => ({
  subscribeNetworkResponses: vi.fn((_rule, callback) => {
    capture.callback = callback
    return () => {
      capture.callback = null
    }
  }),
}))

const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const otherOrgId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const firstId = "11111111-1111-4111-8111-111111111111"
const secondId = "22222222-2222-4222-8222-222222222222"
const entry = (uuid = firstId, name = "First", is_starred = false) => ({ uuid, name, is_starred })
const page = (data = [entry()], has_more = false) =>
  new Response(JSON.stringify({ data, has_more }), { status: 200 })

let adapter: ClaudeAdapter
let storage: Map<string, string>
let fetchMock: ReturnType<typeof vi.fn>
let cookie: string
let unsubscribe: (() => void) | undefined

beforeEach(() => {
  storage = new Map([["ccd-sync-owner", '"account-a"']])
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size
    },
  }
  cookie = `lastActiveOrg=${orgId}`
  vi.stubGlobal("localStorage", localStorage)
  vi.stubGlobal("window", {
    location: new URL("https://claude.ai/new"),
    localStorage,
  })
  vi.stubGlobal("document", {
    get cookie() {
      return cookie
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  })
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  adapter = new ClaudeAdapter()
})

afterEach(() => {
  unsubscribe?.()
  unsubscribe = undefined
  capture.callback = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Claude full conversation sync", () => {
  it("loads every offset page without navigating or scrolling the sidebar", async () => {
    fetchMock.mockResolvedValueOnce(page([entry()], true))
    fetchMock.mockResolvedValueOnce(page([entry(secondId, "Pinned", true)]))
    const onProgress = vi.fn()

    expect(await adapter.loadAllConversations({ onProgress })).toBe(true)
    const urls = fetchMock.mock.calls.map(([url]) => new URL(url))
    expect(urls.map((url) => url.searchParams.get("offset"))).toEqual(["0", "1"])
    expect(urls[0].pathname).toBe(`/api/organizations/${orgId}/chat_conversations_v2`)
    expect(Object.fromEntries(urls[0].searchParams)).toMatchObject({
      limit: "30",
      archived: "false",
      light_settings: "true",
      consistency: "eventual",
    })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" })
    expect(onProgress.mock.calls.map(([items]) => items.length)).toEqual([1, 2])
    expect(adapter.getConversationList()).toEqual([
      expect.objectContaining({ id: firstId, cid: "account-a", isActive: false }),
      expect.objectContaining({
        id: secondId,
        isPinned: true,
        url: `https://claude.ai/chat/${secondId}`,
      }),
    ])
    expect(window.location.pathname).toBe("/new")
  })

  it("replaces the previous full snapshot only after reaching the last page", async () => {
    fetchMock.mockResolvedValueOnce(page())
    await adapter.loadAllConversations()
    fetchMock.mockResolvedValueOnce(page([entry(secondId)], true))
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }))
    await expect(adapter.loadAllConversations()).rejects.toThrow("500")
    expect(adapter.getConversationList().map((item) => item.id)).toEqual([firstId])

    fetchMock.mockResolvedValueOnce(page([entry(secondId)]))
    await adapter.loadAllConversations()
    expect(adapter.getConversationList().map((item) => item.id)).toEqual([secondId])
  })

  it.each([{ data: [] }, { data: [entry()] }])(
    "rejects non-advancing pagination: %j",
    async ({ data }) => {
      fetchMock.mockResolvedValueOnce(page([entry()], true))
      fetchMock.mockResolvedValueOnce(page(data, true))
      await expect(adapter.loadAllConversations()).rejects.toThrow("did not advance")
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it("accepts an empty account as a completed snapshot", async () => {
    fetchMock.mockResolvedValueOnce(page([]))
    expect(await adapter.loadAllConversations()).toBe(true)
    expect(adapter.getConversationList()).toEqual([])
  })

  it("deduplicates overlapping pages", async () => {
    fetchMock.mockResolvedValueOnce(page([entry()], true))
    fetchMock.mockResolvedValueOnce(page([entry(), entry(secondId)]))
    await adapter.loadAllConversations()
    expect(adapter.getConversationList()).toHaveLength(2)
  })

  it("honors cancellation before the request and between pages", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(adapter.loadAllConversations({ signal: controller.signal })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()

    const nextController = new AbortController()
    fetchMock.mockResolvedValueOnce(page([entry()], true))
    await expect(
      adapter.loadAllConversations({
        signal: nextController.signal,
        onProgress: () => nextController.abort(),
      }),
    ).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("passes cancellation to the pending fetch", async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation((_url, options) => {
      controller.abort()
      return Promise.reject(options.signal.reason)
    })
    await expect(adapter.loadAllConversations({ signal: controller.signal })).rejects.toThrow()
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it.each(["account", "organization"])("discards responses after an %s switch", async (kind) => {
    const originalContext = adapter.getConversationSyncContext()
    fetchMock.mockImplementation(async () => {
      if (kind === "account") storage.set("ccd-sync-owner", '"account-b"')
      else cookie = `lastActiveOrg=${otherOrgId}`
      return page()
    })
    const onProgress = vi.fn()
    await expect(adapter.loadAllConversations({ onProgress })).rejects.toThrow("context changed")
    expect(adapter.getConversationSyncContext()).not.toBe(originalContext)
    expect(onProgress).not.toHaveBeenCalled()
    expect(adapter.getConversationList()).toEqual([])
  })

  it("clears cached conversations and requests the new organization after switching", async () => {
    fetchMock.mockResolvedValueOnce(page())
    await adapter.loadAllConversations()
    cookie = `lastActiveOrg=${otherOrgId}`
    expect(adapter.getConversationList()).toEqual([])
    fetchMock.mockResolvedValueOnce(page([entry(secondId)]))
    await adapter.loadAllConversations()
    expect(new URL(fetchMock.mock.calls[1][0]).pathname).toContain(otherOrgId)
  })

  it("fails explicitly when the organization cannot be resolved", async () => {
    cookie = ""
    fetchMock.mockResolvedValueOnce(new Response("[]"))
    await expect(adapter.loadAllConversations()).rejects.toThrow("organization")
  })

  it("removes remotely deleted entries from the API snapshot", async () => {
    fetchMock.mockResolvedValueOnce(page())
    await adapter.loadAllConversations()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect(await adapter.deleteConversationOnSite({ id: firstId })).toMatchObject({ success: true })
    expect(adapter.getConversationList()).toEqual([])
  })
})

describe("Claude conversation response capture", () => {
  const response = (data: unknown, organization = orgId, archived = "false") => ({
    url: `https://claude.ai/api/organizations/${organization}/chat_conversations_v2?archived=${archived}`,
    body: JSON.stringify(data),
  })

  it("merges captured pages without deleting unseen conversations", async () => {
    fetchMock.mockResolvedValueOnce(page())
    await adapter.loadAllConversations()
    const callback = vi.fn()
    unsubscribe = adapter.onConversationListChange(callback)
    capture.callback?.(response({ data: [entry(secondId, "Updated", true)], has_more: false }))
    expect(adapter.getConversationList()).toHaveLength(2)
    expect(callback).toHaveBeenCalled()
    unsubscribe()
    expect(capture.callback).toBeNull()
  })

  it("ignores another organization's results and archived lists", () => {
    unsubscribe = adapter.onConversationListChange(vi.fn())
    capture.callback?.(response({ data: [entry()], has_more: false }, otherOrgId))
    capture.callback?.(response({ data: [entry()], has_more: false }, orgId, "true"))
    expect(adapter.getConversationList()).toEqual([])
    unsubscribe?.()
  })

  it("prefetches the first page and can refresh an existing partial snapshot", async () => {
    fetchMock.mockResolvedValueOnce(page([entry()], true))
    const firstNotification = new Promise<void>((resolve) => {
      unsubscribe = adapter.onConversationListChange(resolve)
    })
    await firstNotification
    expect(adapter.getConversationList().map((item) => item.id)).toEqual([firstId])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    unsubscribe?.()

    fetchMock.mockResolvedValueOnce(page([entry(firstId, "Renamed")], true))
    const nextNotification = new Promise<void>((resolve) => {
      unsubscribe = adapter.onConversationListChange(resolve)
    })
    await nextNotification
    expect(adapter.getConversationList()[0].title).toBe("Renamed")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not notify subscribers during manual sync", async () => {
    const callback = vi.fn()
    unsubscribe = adapter.onConversationListChange(callback)
    fetchMock.mockImplementation(async () => {
      capture.callback?.(response({ data: [entry(secondId)], has_more: false }))
      return page()
    })
    await adapter.loadAllConversations()
    expect(callback).not.toHaveBeenCalled()
    expect(adapter.getConversationList().map((item) => item.id)).toEqual([firstId])
  })
})
