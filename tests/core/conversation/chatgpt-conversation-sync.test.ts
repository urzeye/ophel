import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  const globalRef = globalThis as Record<string, unknown>
  globalRef.document ??= { documentElement: {}, body: {} }
  globalRef.HTMLElement ??= class HTMLElement {}
  globalRef.Element ??= class Element {}
})

vi.mock("~stores/chrome-adapter", () => ({
  chromeStorageAdapter: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}))

import { ChatGPTAdapter } from "~adapters/chatgpt"
import { ConversationManager } from "~core/conversation/manager"
import type { Conversation } from "~core/conversation/types"
import { useConversationsStore } from "~stores/conversations-store"

/** 最小 DOM 节点桩，用于在 node 环境中模拟 ChatGPT 真实侧边栏结构 */
class MockNode {
  tagName = "DIV"
  parentElement: MockNode | null = null
  children: MockNode[] = []
  textContent = ""
  private attrs = new Map<string, string>()

  constructor(tagName = "DIV") {
    this.tagName = tagName.toUpperCase()
  }

  setAttribute(name: string, value: string): this {
    this.attrs.set(name, value)
    return this
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }

  append(...children: MockNode[]): this {
    for (const child of children) {
      child.parentElement = this
      this.children.push(child)
    }
    return this
  }

  contains(target: MockNode): boolean {
    if (this === target) return true
    for (const child of this.children) {
      if (child.contains(target)) return true
    }
    return false
  }

  matches(selector: string): boolean {
    const parts = selector.split(",").map((s) => s.trim())
    return parts.some((sel) => {
      if (sel === 'a[data-sidebar-item="true"][href^="/c/"]') {
        return (
          this.tagName === "A" &&
          this.getAttribute("data-sidebar-item") === "true" &&
          (this.getAttribute("href")?.startsWith("/c/") ?? false)
        )
      }
      if (sel === 'a[data-sidebar-item="true"][href*="chatgpt.com/c/"]') {
        return (
          this.tagName === "A" &&
          this.getAttribute("data-sidebar-item") === "true" &&
          (this.getAttribute("href")?.includes("chatgpt.com/c/") ?? false)
        )
      }
      if (sel === "div[data-sidebar-chatgpt-conversation-key]") {
        return (
          this.tagName === "DIV" &&
          Boolean(this.getAttribute("data-sidebar-chatgpt-conversation-key"))
        )
      }
      if (sel === "div[data-pinned-content-tab-drop-key]") {
        return (
          this.tagName === "DIV" && Boolean(this.getAttribute("data-pinned-content-tab-drop-key"))
        )
      }
      if (sel === "#history") {
        return this.getAttribute("id") === "history"
      }
      if (sel === "div[data-app-action-sidebar-scroll]") {
        return Boolean(this.getAttribute("data-app-action-sidebar-scroll"))
      }
      if (sel === ".truncate [dir='auto']") {
        return this.getAttribute("data-role") === "title"
      }
      if (sel === '[data-marquee-content="true"] [dir="auto"]') {
        return this.getAttribute("data-role") === "title"
      }
      if (sel === ".sidebar-item") {
        return (this.getAttribute("class") || "").includes("sidebar-item")
      }
      if (sel === '[data-app-action-sidebar-thread-selected="true"]') {
        return this.getAttribute("data-app-action-sidebar-thread-selected") === "true"
      }
      return false
    })
  }

  querySelector(selector: string): MockNode | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): MockNode[] {
    const results: MockNode[] = []
    const traverse = (node: MockNode) => {
      for (const child of node.children) {
        if (child.matches(selector)) {
          results.push(child)
        }
        traverse(child)
      }
    }
    traverse(this)
    return results
  }
}

describe("ChatGPT conversation sync and CID normalization", () => {
  const memoryStorage = new Map<string, string>()

  beforeEach(() => {
    memoryStorage.clear()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => memoryStorage.set(key, String(value)),
      removeItem: (key: string) => memoryStorage.delete(key),
      clear: () => memoryStorage.clear(),
    })
    useConversationsStore.setState({ conversations: {}, lastUsedFolderId: "inbox" })
  })

  describe("ChatGPTAdapter.getCurrentCid", () => {
    it("returns null for personal account variants", () => {
      const adapter = new ChatGPTAdapter()

      // 缺失 key
      expect(adapter.getCurrentCid()).toBeNull()

      // JSON 序列化的 "personal"
      localStorage.setItem("_account", JSON.stringify("personal"))
      expect(adapter.getCurrentCid()).toBeNull()

      // 无引号纯文本 personal
      localStorage.setItem("_account", "personal")
      expect(adapter.getCurrentCid()).toBeNull()

      // 空值
      localStorage.setItem("_account", "")
      expect(adapter.getCurrentCid()).toBeNull()
    })

    it("returns team workspace UUID for team accounts", () => {
      const adapter = new ChatGPTAdapter()

      // JSON 序列化的 UUID
      localStorage.setItem("_account", JSON.stringify("c806509f-1234-5678-9abc-def012345678"))
      expect(adapter.getCurrentCid()).toBe("c806509f-1234-5678-9abc-def012345678")

      // 无引号 UUID
      localStorage.setItem("_account", "c806509f-1234-5678-9abc-def012345678")
      expect(adapter.getCurrentCid()).toBe("c806509f-1234-5678-9abc-def012345678")
    })
  })

  describe("ConversationManager.matchesCid", () => {
    const createMockAdapter = (cid: string | null) =>
      ({
        getSiteId: () => "chatgpt",
        getSiteInstanceKey: () => "chatgpt",
        getCurrentCid: () => cid,
        getConversationObserverConfig: () => null,
        getConversationList: () => [],
        getFolders: () => [],
      }) as unknown as ChatGPTAdapter

    const convPersonalWithCid: Conversation = {
      id: "conv-1",
      siteId: "chatgpt",
      siteInstanceKey: "chatgpt",
      cid: "personal",
      title: "Greeting exchange",
      url: "https://chatgpt.com/c/conv-1",
      folderId: "inbox",
      pinned: false,
      createdAt: 1000,
      updatedAt: 1000,
    }

    const convPersonalWithoutCid: Conversation = {
      id: "conv-2",
      siteId: "chatgpt",
      siteInstanceKey: "chatgpt",
      cid: undefined,
      title: "Planning chat",
      url: "https://chatgpt.com/c/conv-2",
      folderId: "inbox",
      pinned: false,
      createdAt: 1000,
      updatedAt: 1000,
    }

    const convTeamA: Conversation = {
      id: "conv-team-a",
      siteId: "chatgpt",
      siteInstanceKey: "chatgpt",
      cid: "team-uuid-a",
      title: "Team Project Chat",
      url: "https://chatgpt.com/c/conv-team-a",
      folderId: "inbox",
      pinned: false,
      createdAt: 1000,
      updatedAt: 1000,
    }

    it("matches personal conversations whether currentCid is null or 'personal'", () => {
      const managerNull = new ConversationManager(createMockAdapter(null))
      expect(managerNull.matchesCid(convPersonalWithCid, null)).toBe(true)
      expect(managerNull.matchesCid(convPersonalWithoutCid, null)).toBe(true)

      const managerPersonal = new ConversationManager(createMockAdapter("personal"))
      expect(managerPersonal.matchesCid(convPersonalWithCid, "personal")).toBe(true)
      expect(managerPersonal.matchesCid(convPersonalWithoutCid, "personal")).toBe(true)
    })

    it("isolates team conversations from personal space and other teams", () => {
      const managerPersonal = new ConversationManager(createMockAdapter(null))
      // 个人空间下不显示团队会话
      expect(managerPersonal.matchesCid(convTeamA, null)).toBe(false)

      const managerTeamA = new ConversationManager(createMockAdapter("team-uuid-a"))
      expect(managerTeamA.matchesCid(convTeamA, "team-uuid-a")).toBe(true)

      const managerTeamB = new ConversationManager(createMockAdapter("team-uuid-b"))
      // 团队 B 不匹配团队 A 会话
      expect(managerTeamB.matchesCid(convTeamA, "team-uuid-b")).toBe(false)
    })
  })

  describe("ConversationManager historical personal cid cleanup", () => {
    it("purges 'personal' cid on init while preserving conversation data", () => {
      const adapter = new ChatGPTAdapter()
      const manager = new ConversationManager(adapter)

      useConversationsStore.setState({
        conversations: {
          "chatgpt:conv-1": {
            id: "conv-1",
            siteId: "chatgpt",
            siteInstanceKey: "chatgpt",
            cid: "personal",
            title: "Test 1",
            url: "https://chatgpt.com/c/conv-1",
            folderId: "inbox",
            pinned: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
          "chatgpt:conv-2": {
            id: "conv-2",
            siteId: "chatgpt",
            siteInstanceKey: "chatgpt",
            cid: "team-uuid",
            title: "Test 2",
            url: "https://chatgpt.com/c/conv-2",
            folderId: "inbox",
            pinned: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      })

      // @ts-expect-error test private method directly
      manager.repairLegacyChatgptPersonalCid()

      const convs = useConversationsStore.getState().conversations
      expect(convs["chatgpt:conv-1"].cid).toBeUndefined()
      expect(convs["chatgpt:conv-2"].cid).toBe("team-uuid")
    })
  })

  describe("Sidebar DOM parsing and conversation sync", () => {
    const buildMockSidebarDOM = () => {
      const root = new MockNode("DIV")

      // Pinned section
      const pinnedSection = new MockNode("DIV")
      const pinnedLink = new MockNode("A")
        .setAttribute("data-sidebar-item", "true")
        .setAttribute("href", "/c/64aa7aa1-d3e8-832d-97b9-3a2f30357517")
      const pinnedTitle = new MockNode("SPAN").setAttribute("data-role", "title")
      pinnedTitle.textContent = "Greeting exchange"
      pinnedLink.append(pinnedTitle)
      pinnedSection.append(pinnedLink)

      // Recents section
      const historyContainer = new MockNode("DIV").setAttribute("id", "history")

      // Item 2
      const item2 = new MockNode("A")
        .setAttribute("data-sidebar-item", "true")
        .setAttribute("href", "/c/6aaf62e3-2760-83ea-877f-921837f0d7da")
      const title2 = new MockNode("SPAN").setAttribute("data-role", "title")
      title2.textContent = "规划补剂用法"
      item2.append(title2)

      // Item 3 (project)
      const item3 = new MockNode("A")
        .setAttribute("data-sidebar-item", "true")
        .setAttribute("href", "/c/6ab0d678-3cbc-83ea-9ba3-80f8d4dc41d3")
      const title3 = new MockNode("SPAN").setAttribute("data-role", "title")
      title3.textContent = "回应打的发"
      item3.append(title3)

      // Item 4
      const item4 = new MockNode("A")
        .setAttribute("data-sidebar-item", "true")
        .setAttribute("href", "/c/6a9fb67e-70a4-83e9-8502-a70ce7660761")
      const title4 = new MockNode("SPAN").setAttribute("data-role", "title")
      title4.textContent = "Design Architecture Blueprint"
      item4.append(title4)

      historyContainer.append(item2, item3, item4)
      root.append(pinnedSection, historyContainer)

      return { root, pinnedLink, item2, item3, item4, historyContainer }
    }

    it("correctly extracts 4 conversations, titles, urls and pinned states", () => {
      const { root } = buildMockSidebarDOM()
      vi.stubGlobal("document", {
        querySelectorAll: (sel: string) => root.querySelectorAll(sel),
        querySelector: (sel: string) => root.querySelector(sel),
        body: root,
      })

      const adapter = new ChatGPTAdapter()
      const list = adapter.getConversationList()

      expect(list).toHaveLength(4)

      // 第一条：置顶会话 "Greeting exchange"
      expect(list[0].id).toBe("64aa7aa1-d3e8-832d-97b9-3a2f30357517")
      expect(list[0].title).toBe("Greeting exchange")
      expect(list[0].isPinned).toBe(true)
      expect(list[0].url).toContain("/c/64aa7aa1-d3e8-832d-97b9-3a2f30357517")

      // 第二条：普通会话 "规划补剂用法"
      expect(list[1].id).toBe("6aaf62e3-2760-83ea-877f-921837f0d7da")
      expect(list[1].title).toBe("规划补剂用法")
      expect(list[1].isPinned).toBe(false)

      // 第三条：项目内会话 "回应打的发"
      expect(list[2].id).toBe("6ab0d678-3cbc-83ea-9ba3-80f8d4dc41d3")
      expect(list[2].title).toBe("回应打的发")
      expect(list[2].isPinned).toBe(false)

      // 第四条：普通会话 "Design Architecture Blueprint"
      expect(list[3].id).toBe("6a9fb67e-70a4-83e9-8502-a70ce7660761")
      expect(list[3].title).toBe("Design Architecture Blueprint")
      expect(list[3].isPinned).toBe(false)
    })

    it("synchronizes conversations and preserves all conversations across tab switches and pin operations", () => {
      const { root } = buildMockSidebarDOM()
      vi.stubGlobal("document", {
        querySelectorAll: (sel: string) => root.querySelectorAll(sel),
        querySelector: (sel: string) => root.querySelector(sel),
        body: root,
      })

      const adapter = new ChatGPTAdapter()
      const manager = new ConversationManager(adapter)

      // 1. 同步侧边栏对话
      const syncResult = manager.syncConversations("inbox", false)
      expect(syncResult.newCount).toBe(4)

      // 2. 模拟 Tab 切换（多次调用 getAllConversations）
      const firstLoad = manager.getAllConversations()
      expect(Object.keys(firstLoad)).toHaveLength(4)

      // 3. 模拟再次切回 Tab，调用 getAllConversations()
      const secondLoad = manager.getAllConversations()
      expect(Object.keys(secondLoad)).toHaveLength(4)

      // 验证置顶对话与未置顶对话完整存在
      const convList = Object.values(secondLoad)
      const pinnedConv = convList.find((c) => c.id === "64aa7aa1-d3e8-832d-97b9-3a2f30357517")
      expect(pinnedConv?.pinned).toBe(true)

      const recentConv = convList.find((c) => c.id === "6aaf62e3-2760-83ea-877f-921837f0d7da")
      expect(recentConv?.pinned).toBe(false)

      // 4. 模拟即使历史数据中包含 'personal' cid，再次读取也绝不归零
      useConversationsStore.setState({
        conversations: {
          ...useConversationsStore.getState().conversations,
          "chatgpt:6aaf62e3-2760-83ea-877f-921837f0d7da": {
            ...recentConv!,
            cid: "personal",
          },
        },
      })
      const thirdLoad = manager.getAllConversations()
      expect(Object.keys(thirdLoad)).toHaveLength(4)
    })
  })

  describe("Sidebar DOM parsing and conversation sync (App-Shell / Codex Architecture)", () => {
    function buildMockAppShellSidebarDOM() {
      const root = new MockNode("NAV")

      const scrollContainer = new MockNode("DIV").setAttribute(
        "data-app-action-sidebar-scroll",
        "true",
      )

      // 1. 置顶对话：div[data-pinned-content-tab-drop-key]
      const pinnedItem = new MockNode("DIV").setAttribute(
        "data-pinned-content-tab-drop-key",
        "chatgpt:conversation:6a238477-c670-83e8-b8fa-d509a3779898",
      )
      const pinnedBtn = new MockNode("DIV")
        .setAttribute("class", "sidebar-item")
        .setAttribute("aria-label", "食管裂孔疝影像组学研究")
        .setAttribute("role", "button")
      pinnedItem.append(pinnedBtn)

      // 2. 普通对话：div[data-sidebar-chatgpt-conversation-key]
      const item2 = new MockNode("DIV").setAttribute(
        "data-sidebar-chatgpt-conversation-key",
        "chatgpt:conversation:6aae3b46-9c40-83e8-bb6e-1a9d4eef6d17",
      )
      const item2Btn = new MockNode("DIV")
        .setAttribute("class", "sidebar-item")
        .setAttribute("aria-label", "期刊投稿注意事项")
        .setAttribute("role", "button")
      item2.append(item2Btn)

      // 3. 激活项对话（带 data-app-action-sidebar-thread-selected="true"）
      const item3 = new MockNode("DIV").setAttribute(
        "data-sidebar-chatgpt-conversation-key",
        "chatgpt:conversation:6a54c7f3-be44-83e8-a6a5-0bb59a0428db",
      )
      const item3Btn = new MockNode("DIV")
        .setAttribute("class", "sidebar-item")
        .setAttribute("data-app-action-sidebar-thread-selected", "true")
      const item3Title = new MockNode("SPAN").setAttribute("data-role", "title")
      item3Title.textContent = "医学英语学习PPT"
      item3Btn.append(item3Title)
      item3.append(item3Btn)

      scrollContainer.append(pinnedItem, item2, item3)
      root.append(scrollContainer)

      return { root, pinnedItem, item2, item3, scrollContainer }
    }

    it("correctly extracts conversations, keys, titles and pinned states from App-Shell div structure", () => {
      const { root } = buildMockAppShellSidebarDOM()
      vi.stubGlobal("document", {
        querySelectorAll: (sel: string) => root.querySelectorAll(sel),
        querySelector: (sel: string) => root.querySelector(sel),
        body: root,
      })

      const adapter = new ChatGPTAdapter()
      const list = adapter.getConversationList()

      expect(list).toHaveLength(3)

      // 第一条：置顶会话 "食管裂孔疝影像组学研究"
      expect(list[0].id).toBe("6a238477-c670-83e8-b8fa-d509a3779898")
      expect(list[0].title).toBe("食管裂孔疝影像组学研究")
      expect(list[0].isPinned).toBe(true)
      expect(list[0].url).toContain("/c/6a238477-c670-83e8-b8fa-d509a3779898")

      // 第二条：普通会话 "期刊投稿注意事项"
      expect(list[1].id).toBe("6aae3b46-9c40-83e8-bb6e-1a9d4eef6d17")
      expect(list[1].title).toBe("期刊投稿注意事项")
      expect(list[1].isPinned).toBe(false)

      // 第三条：当前激活会话 "医学英语学习PPT"
      expect(list[2].id).toBe("6a54c7f3-be44-83e8-a6a5-0bb59a0428db")
      expect(list[2].title).toBe("医学英语学习PPT")
      expect(list[2].isActive).toBe(true)
      expect(list[2].isPinned).toBe(false)
    })

    it("synchronizes App-Shell conversations into ConversationManager store", () => {
      const { root } = buildMockAppShellSidebarDOM()
      vi.stubGlobal("document", {
        querySelectorAll: (sel: string) => root.querySelectorAll(sel),
        querySelector: (sel: string) => root.querySelector(sel),
        body: root,
      })

      const adapter = new ChatGPTAdapter()
      const manager = new ConversationManager(adapter)

      const syncResult = manager.syncConversations("inbox", false)
      expect(syncResult.newCount).toBe(3)

      const all = manager.getAllConversations()
      expect(Object.keys(all)).toHaveLength(3)

      const pinned = Object.values(all).find((c) => c.id === "6a238477-c670-83e8-b8fa-d509a3779898")
      expect(pinned?.pinned).toBe(true)
      expect(pinned?.title).toBe("食管裂孔疝影像组学研究")
    })
  })
})
