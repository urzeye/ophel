import { SiteAdapter } from "~adapters/base"
import type { ConversationInfo, ConversationObserverConfig } from "~adapters/base"
import { type Folder } from "~constants"
import { getConversationsStore, useConversationsStore } from "~stores/conversations-store"
import { getFoldersStore, useFoldersStore } from "~stores/folders-store"
import { useSettingsStore } from "~stores/settings-store"
import { getTagsStore, useTagsStore } from "~stores/tags-store"
import { DOMToolkit } from "~utils/dom-toolkit"
import {
  createExportMetadata,
  downloadFile,
  ensureUtf8Bom,
  formatToJSON,
  formatToMarkdown,
  formatToTXT,
  htmlToMarkdown,
} from "~utils/exporter"
import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

import type { Conversation, ConversationData, Tag } from "./types"

export type { Conversation, ConversationData, Folder, Tag }

export class ConversationManager {
  public readonly siteAdapter: SiteAdapter

  // Observer state
  private observerConfig: ConversationObserverConfig | null = null
  private sidebarObserverStop: (() => void) | null = null
  private observerContainer: Node | null = null
  private titleWatcher: any = null // DOMToolkit watcher instance
  private pollInterval: NodeJS.Timeout | null = null

  // Settings
  private syncUnpin: boolean = false

  // 数据变更回调（用于通知 UI 刷新）
  private onChangeCallbacks: Array<() => void> = []

  constructor(adapter: SiteAdapter) {
    this.siteAdapter = adapter
  }

  // ==================== Store 访问器 ====================

  private get folders(): Folder[] {
    return getFoldersStore().folders
  }

  private get conversations(): Record<string, Conversation> {
    return getConversationsStore().conversations
  }

  private get lastUsedFolderId(): string {
    return getConversationsStore().lastUsedFolderId
  }

  private get tags(): Tag[] {
    return getTagsStore().tags
  }

  /**
   * 订阅数据变更事件
   * @returns 取消订阅函数
   */
  onDataChange(callback: () => void): () => void {
    this.onChangeCallbacks.push(callback)
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter((cb) => cb !== callback)
    }
  }

  /**
   * 触发数据变更通知
   */
  notifyDataChange() {
    this.onChangeCallbacks.forEach((cb) => cb())
  }

  async init() {
    // 等待所有 stores hydration 完成
    await this.waitForHydration()

    // 首次安装或当前站点数据为空时，自动加载全部会话
    const currentSiteCount = Object.keys(this.getAllConversations()).length
    if (currentSiteCount === 0 && this.siteAdapter.loadAllConversations) {
      try {
        const sidebarReady = await this.waitForSidebarReady()
        if (sidebarReady) {
          await this.autoFullSync()
        }
      } catch {
        // 静默处理错误
      }
    }

    this.startSidebarObserver()
  }

  private async waitForHydration() {
    const stores = [useFoldersStore, useTagsStore, useConversationsStore]

    await Promise.all(
      stores.map(
        (store) =>
          new Promise<void>((resolve) => {
            if (store.getState()._hasHydrated) {
              resolve()
              return
            }
            const unsubscribe = store.subscribe((state) => {
              if (state._hasHydrated) {
                unsubscribe()
                resolve()
              }
            })
          }),
      ),
    )
  }

  private async waitForSidebarReady(timeoutMs = 10000): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (this.siteAdapter.getSidebarScrollContainer()) return true
      await new Promise((r) => setTimeout(r, 250))
    }
    return false
  }

  private async autoFullSync(): Promise<void> {
    await this.siteAdapter.loadAllConversations()
    await new Promise((r) => setTimeout(r, 400))

    const maxRounds = 10
    const maxStableRounds = 2
    let stableRounds = 0
    let lastListCount = this.siteAdapter.getConversationList().length

    for (let i = 0; i < maxRounds; i++) {
      if (i > 0) {
        const container = this.siteAdapter.getSidebarScrollContainer()
        if (!container) break

        const el = container as HTMLElement
        el.scrollTop = el.scrollHeight
        await new Promise((r) => setTimeout(r, 400))
      }

      const { newCount, updatedCount } = this.syncConversations(null, true)
      if (newCount > 0 || updatedCount > 0) {
        this.notifyDataChange()
      }

      await new Promise((r) => setTimeout(r, 300))

      const currentListCount = this.siteAdapter.getConversationList().length
      const hasProgress = newCount > 0 || currentListCount > lastListCount
      if (hasProgress) {
        lastListCount = Math.max(lastListCount, currentListCount)
        stableRounds = 0
      } else {
        stableRounds++
      }

      if (stableRounds >= maxStableRounds) break
    }
  }

  destroy() {
    this.stopSidebarObserver()
  }

  updateSettings(settings: { syncUnpin: boolean }) {
    this.syncUnpin = settings.syncUnpin
  }

  // ================= Data Loading（已迁移到 Zustand stores）=================

  // 不再需要 loadData / loadTags / saveFolders / saveConversations / saveTags
  // 数据加载由 Zustand persist 自动处理

  // ================= Observer Logic =================

  startSidebarObserver() {
    if (this.sidebarObserverStop) return

    const config = this.siteAdapter.getConversationObserverConfig()
    if (!config) return

    this.observerConfig = config

    const startObserverRetry = (retryCount = 0) => {
      const maxRetries = 5
      const retryDelay = 1000

      const sidebarContainer = this.siteAdapter.getSidebarScrollContainer() || document

      if (config.shadow && retryCount < maxRetries) {
        const foundContainer = this.siteAdapter.getSidebarScrollContainer()
        if (!foundContainer) {
          setTimeout(() => startObserverRetry(retryCount + 1), retryDelay)
          return
        }
      }

      this.observerContainer = sidebarContainer

      // DOMToolkit.each returns a stop function
      this.sidebarObserverStop = DOMToolkit.each(
        config.selector,
        (el, isNew) => {
          this.handleObservedElement(el, isNew, config)
        },
        { parent: sidebarContainer, shadow: config.shadow },
      )
    }

    startObserverRetry()

    if (config.shadow) {
      this.startPolling()
    }
  }

  stopSidebarObserver() {
    if (this.sidebarObserverStop) {
      this.sidebarObserverStop()
      this.sidebarObserverStop = null
    }
    this.observerContainer = null

    if (this.titleWatcher) {
      // DOMToolkit Watcher doesnt explicitly expose stop on the object returned by watchMultiple?
      // Actually `watchMultiple` returns `MutationObserver` wrapper usually?
      // Checking `dom-toolkit.ts`: watchMultiple returns an object with `add` and logic.
      // It doesn't seem to expose simple `stop`.
      // But we can just clear references.
      // Original script called `this.titleWatcher.stop()`.
      // I'll assume I can implement stop or it exists.
      if (typeof this.titleWatcher.stop === "function") {
        this.titleWatcher.stop()
      }
      this.titleWatcher = null
    }
    this.stopPolling()
  }

  private handleObservedElement(el: Element, isNew: boolean, config: ConversationObserverConfig) {
    const tryAdd = (retries = 5) => {
      const info = config.extractInfo(el)

      if (info?.id) {
        this.updateConversationFromObservation(info, isNew)
        this.monitorConversationTitle(el as HTMLElement, info.id)
      } else if (retries > 0) {
        setTimeout(() => tryAdd(retries - 1), 500)
      }
    }
    tryAdd()
  }

  private updateConversationFromObservation(info: ConversationInfo, isNew: boolean) {
    const conversations = this.conversations
    const existing = conversations[info.id]

    if (isNew && !existing) {
      // 新会话
      getConversationsStore().addConversation({
        id: info.id,
        siteId: this.siteAdapter.getSiteId(),
        cid: info.cid,
        title: info.title,
        url: info.url,
        folderId: this.lastUsedFolderId,
        pinned: info.isPinned || false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      this.notifyDataChange()
    } else if (existing) {
      // 更新现有会话
      if (info.isPinned !== undefined && info.isPinned !== existing.pinned) {
        if (info.isPinned) {
          getConversationsStore().updateConversation(info.id, { pinned: true })
          this.notifyDataChange()
        } else if (!info.isPinned && this.syncUnpin) {
          getConversationsStore().updateConversation(info.id, { pinned: false })
          this.notifyDataChange()
        }
      }
    }
  }

  private startPolling() {
    if (this.pollInterval) return
    this.pollInterval = setInterval(() => {
      if (!this.observerConfig) return
      const config = this.observerConfig
      // DOMToolkit.queryAll?
      // Checking dom-toolkit.ts: query returns Element | Element[]
      // Use { all: true }
      const elements = DOMToolkit.query(config.selector, {
        all: true,
        shadow: config.shadow,
      }) as Element[]

      if (Array.isArray(elements)) {
        elements.forEach((el) => {
          const info = config.extractInfo(el)
          if (!info?.id) return

          const existing = this.conversations[info.id]
          if (!existing) {
            // 新会话
            this.updateConversationFromObservation(info, true)
            this.monitorConversationTitle(el as HTMLElement, info.id)
          } else {
            // 检测标题变更
            if (info.title && info.title !== existing.title) {
              getConversationsStore().updateConversation(info.id, { title: info.title })
              this.notifyDataChange()
            }
          }
        })
      }
    }, 3000)
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private monitorConversationTitle(el: HTMLElement, id: string) {
    if (el.dataset.ghTitleObserver) return
    el.dataset.ghTitleObserver = "true"

    if (!this.titleWatcher) {
      const container = this.siteAdapter.getSidebarScrollContainer() || document.body
      this.titleWatcher = DOMToolkit.watchMultiple(container as Node, {
        debounce: 500,
      })
    }

    this.titleWatcher.add(el, () => {
      const config = this.observerConfig
      if (!config) return

      const currentInfo = config.extractInfo(el)
      const currentId = currentInfo?.id

      if (!currentId || currentId !== id) return

      const existing = this.conversations[id]
      if (!existing) return

      let needsUpdate = false
      const updates: Partial<Conversation> = {}

      if (currentInfo.title && currentInfo.title !== existing.title) {
        updates.title = currentInfo.title
        needsUpdate = true
      }

      if (currentInfo.isPinned !== undefined && currentInfo.isPinned !== existing.pinned) {
        if (currentInfo.isPinned) {
          updates.pinned = true
          needsUpdate = true
        } else if (!currentInfo.isPinned && this.syncUnpin) {
          updates.pinned = false
          needsUpdate = true
        }
      }

      if (needsUpdate) {
        getConversationsStore().updateConversation(id, updates)
        this.notifyDataChange()
      }
    })
  }

  // ================= Folder Operations =================

  getFolders() {
    return this.folders
  }

  getConversations(folderId?: string) {
    // 按当前站点和团队过滤
    const currentCid = this.siteAdapter.getCurrentCid?.() || null

    let result = Object.values(this.conversations).filter((c) => this.matchesCid(c, currentCid))

    if (folderId) {
      result = result.filter((c) => c.folderId === folderId)
    }
    return result
  }

  createFolder(name: string, icon: string) {
    return getFoldersStore().addFolder(name, icon)
  }

  updateFolder(id: string, updates: Partial<Folder>) {
    getFoldersStore().updateFolder(id, updates)
  }

  deleteFolder(id: string) {
    if (id === "inbox") return // 禁止删除 inbox

    // 将会话移动到 inbox
    getConversationsStore().moveConversationsToInbox(id)

    getFoldersStore().deleteFolder(id)
  }

  moveFolder(id: string, direction: "up" | "down") {
    getFoldersStore().moveFolder(id, direction)
  }

  // ================= Conversation Operations =================

  deleteConversation(id: string) {
    getConversationsStore().deleteConversation(id)
  }

  moveConversation(id: string, targetFolderId: string) {
    getConversationsStore().moveToFolder(id, targetFolderId)
  }

  setLastUsedFolder(folderId: string) {
    getConversationsStore().setLastUsedFolderId(folderId)
  }

  // ================= Tag Operations =================

  getTags() {
    return this.tags
  }

  createTag(name: string, color: string): Tag | null {
    return getTagsStore().addTag(name, color)
  }

  updateTag(tagId: string, name: string, color: string): Tag | null {
    return getTagsStore().updateTag(tagId, name, color)
  }

  deleteTag(tagId: string) {
    getTagsStore().deleteTag(tagId)
    // 从所有会话中移除该标签引用
    getConversationsStore().removeTagFromAll(tagId)
  }

  setConversationTags(convId: string, tagIds: string[]) {
    getConversationsStore().setConversationTags(convId, tagIds)
  }

  // ================= Conversation Operations Extended =================

  togglePin(convId: string): boolean {
    return getConversationsStore().togglePin(convId)
  }

  renameConversation(convId: string, newTitle: string) {
    if (newTitle) {
      getConversationsStore().updateConversation(convId, { title: newTitle })
    }
  }

  updateConversation(convId: string, updates: Partial<Conversation>) {
    getConversationsStore().updateConversation(convId, updates)
  }

  getConversation(convId: string): Conversation | undefined {
    return this.conversations[convId]
  }

  getLastUsedFolderId(): string {
    return this.lastUsedFolderId
  }

  /**
   * 获取当前站点/团队的所有会话
   */
  getAllConversations(): Record<string, Conversation> {
    const currentCid = this.siteAdapter.getCurrentCid?.() || null
    const result: Record<string, Conversation> = {}

    for (const [id, conv] of Object.entries(this.conversations)) {
      if (this.matchesCid(conv, currentCid)) {
        result[id] = conv
      }
    }
    return result
  }

  /**
   * 从侧边栏同步会话（增量）
   */
  syncConversations(
    targetFolderId: string | null = null,
    _silent = false,
  ): { newCount: number; updatedCount: number } {
    const sidebarItems = this.siteAdapter.getConversationList()

    if (!sidebarItems || sidebarItems.length === 0) {
      return { newCount: 0, updatedCount: 0 }
    }

    const conversations = this.conversations
    let newCount = 0
    let updatedCount = 0
    const now = Date.now()
    const folderId = targetFolderId || this.lastUsedFolderId || "inbox"
    const store = getConversationsStore()

    sidebarItems.forEach((item) => {
      const storageKey = item.id
      const existing = conversations[storageKey]

      if (existing) {
        // 更新已有会话
        const updates: Partial<Conversation> = {}
        let needsUpdate = false

        if (existing.title !== item.title) {
          updates.title = item.title
          needsUpdate = true
          updatedCount++
        }
        if (item.isPinned && !existing.pinned) {
          updates.pinned = true
          needsUpdate = true
          updatedCount++
        } else if (!item.isPinned && existing.pinned && this.syncUnpin) {
          updates.pinned = false
          needsUpdate = true
          updatedCount++
        }
        if (!existing.siteId) updates.siteId = this.siteAdapter.getSiteId()
        if (item.cid && !existing.cid) updates.cid = item.cid

        if (needsUpdate) {
          store.updateConversation(storageKey, updates)
        }
      } else {
        // 新会话
        store.addConversation({
          id: item.id,
          siteId: this.siteAdapter.getSiteId(),
          cid: item.cid,
          title: item.title,
          url: item.url,
          folderId: folderId,
          pinned: item.isPinned || false,
          createdAt: now,
          updatedAt: now,
        })
        newCount++
      }
    })

    // 记住用户选择
    if (targetFolderId) {
      store.setLastUsedFolderId(targetFolderId)
    }

    return { newCount, updatedCount }
  }

  /**
   * 检查会话是否属于当前站点和团队
   */
  matchesCid(conv: Conversation, currentCid: string | null): boolean {
    const currentSiteId = this.siteAdapter.getSiteId()
    if (conv.siteId && conv.siteId !== currentSiteId) {
      return false
    }
    if (!currentCid) return !conv.cid
    if (!conv.cid) return true
    return conv.cid === currentCid
  }

  /**
   * 获取侧边栏会话顺序
   */
  getSidebarConversationOrder(): string[] {
    const config = this.siteAdapter.getConversationObserverConfig?.()
    if (!config) return []

    const elements = DOMToolkit.query(config.selector, {
      all: true,
      shadow: config.shadow,
    }) as Element[]

    return Array.from(elements || [])
      .map((el) => config.extractInfo?.(el)?.id)
      .filter((id): id is string => Boolean(id))
  }

  // ================= Utility Methods =================

  /**
   * 格式化时间显示
   */
  formatTime(timestamp: number): string {
    if (!timestamp) return ""
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return t("justNow")
    if (diff < 3600000) return Math.floor(diff / 60000) + t("minutesAgo")
    if (diff < 86400000) return Math.floor(diff / 3600000) + t("hoursAgo")
    if (diff < 604800000) return Math.floor(diff / 86400000) + t("daysAgo")

    return date.toLocaleDateString()
  }

  // ================= Export Functionality =================

  /**
   * 导出会话
   */
  async exportConversation(
    convId: string,
    format: "markdown" | "json" | "txt" | "clipboard",
  ): Promise<boolean> {
    const conv = this.conversations[convId]
    if (!conv) {
      console.error("[ConversationManager] Conversation not found:", convId)
      return false
    }

    // 检查是否为当前会话
    const currentSessionId = this.siteAdapter.getSessionId()
    if (currentSessionId !== convId) {
      showToast(t("exportNeedOpenFirst"))
      return false
    }

    try {
      // 加载完整历史（滚动到顶部）
      const scrollContainer = this.siteAdapter.getScrollContainer?.()
      if (scrollContainer) {
        let prevHeight = 0
        let retries = 0
        const maxRetries = 50

        while (retries < maxRetries) {
          scrollContainer.scrollTop = 0
          await new Promise((resolve) => setTimeout(resolve, 500))

          const currentHeight = scrollContainer.scrollHeight
          if (currentHeight === prevHeight) {
            retries++
            if (retries >= 3) break
          } else {
            retries = 0
            prevHeight = currentHeight
          }
        }
      }

      // 提取对话内容
      const messages = this.extractConversationMessages()
      if (messages.length === 0) {
        console.error("[ConversationManager] No messages found")
        return false
      }

      // 格式化
      const safeTitle = (conv.title || "conversation")
        .replace(/[<>:"/\\|?*]/g, "_")
        .substring(0, 50)

      const settings = useSettingsStore.getState().settings
      const metadata = createExportMetadata(
        conv.title || "未命名",
        this.siteAdapter.getName(),
        conv.id,
        {
          customUserName: settings.export?.customUserName,
          customModelName: settings.export?.customModelName,
        },
      )

      let content: string
      let filename: string
      let mimeType: string

      let timestampSuffix = ""
      if (settings.export?.exportFilenameTimestamp) {
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, "0")
        const day = String(now.getDate()).padStart(2, "0")
        const hours = String(now.getHours()).padStart(2, "0")
        const minutes = String(now.getMinutes()).padStart(2, "0")
        const seconds = String(now.getSeconds()).padStart(2, "0")
        timestampSuffix = `_${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
      }

      const siteName = this.siteAdapter.getName()
      const safeSiteName = siteName.replace(/[<>:"/\\|?*]/g, "_")
      const filenamePrefix = `${safeSiteName} - `

      if (format === "clipboard") {
        content = formatToMarkdown(metadata, messages)
        await navigator.clipboard.writeText(content)
        showToast(t("copySuccess"))
        return true
      } else if (format === "markdown") {
        content = ensureUtf8Bom(formatToMarkdown(metadata, messages))
        filename = `${filenamePrefix}${safeTitle}${timestampSuffix}.md`
        mimeType = "text/markdown;charset=utf-8"
      } else if (format === "json") {
        content = formatToJSON(metadata, messages)
        filename = `${filenamePrefix}${safeTitle}${timestampSuffix}.json`
        mimeType = "application/json;charset=utf-8"
      } else {
        content = formatToTXT(metadata, messages)
        filename = `${filenamePrefix}${safeTitle}${timestampSuffix}.txt`
        mimeType = "text/plain;charset=utf-8"
      }

      await downloadFile(content, filename, mimeType)
      showToast(t("exportSuccess"))
      return true
    } catch (error) {
      console.error("[ConversationManager] Export failed:", error)
      return false
    }
  }

  /**
   * 提取当前页面的对话消息
   */
  private extractConversationMessages(): Array<{
    role: "user" | "assistant"
    content: string
  }> {
    const messages: Array<{ role: "user" | "assistant"; content: string }> = []

    const config = this.siteAdapter.getExportConfig?.()
    if (!config) {
      console.warn("[ConversationManager] Export config not available")
      return messages
    }

    const { userQuerySelector, assistantResponseSelector, useShadowDOM } = config

    const userMessages =
      (DOMToolkit.query(userQuerySelector, {
        all: true,
        shadow: useShadowDOM,
      }) as Element[]) || []

    const aiMessages =
      (DOMToolkit.query(assistantResponseSelector, {
        all: true,
        shadow: useShadowDOM,
      }) as Element[]) || []

    const maxLen = Math.max(userMessages.length, aiMessages.length)
    for (let i = 0; i < maxLen; i++) {
      if (userMessages[i]) {
        // 使用适配器方法提取文本，保留换行并过滤掉 gh-user-query-markdown 节点
        const userContent = this.siteAdapter.extractUserQueryText(userMessages[i])
        messages.push({ role: "user", content: userContent })
      }
      if (aiMessages[i]) {
        // 优先使用适配器的自定义提取逻辑；未覆盖时回退到 HTML->Markdown
        const adapterExtract = this.siteAdapter.extractAssistantResponseText
        const baseExtract = SiteAdapter.prototype.extractAssistantResponseText
        let aiContent = ""
        if (adapterExtract && adapterExtract !== baseExtract) {
          aiContent = adapterExtract.call(this.siteAdapter, aiMessages[i])
        }
        if (!aiContent) {
          aiContent = htmlToMarkdown(aiMessages[i]) || aiMessages[i].textContent?.trim() || ""
        }

        messages.push({
          role: "assistant",
          content: aiContent,
        })
      }
    }

    return messages
  }
}
