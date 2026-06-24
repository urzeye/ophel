import { SiteAdapter } from "~adapters/base"
import type {
  ConversationDeleteTarget,
  ConversationInfo,
  ConversationObserverConfig,
  ExportLifecycleContext,
  SiteDeleteConversationResult,
} from "~adapters/base"
import { SITE_IDS, type Folder } from "~constants"
import { getConversationsStore, useConversationsStore } from "~stores/conversations-store"
import { getFoldersStore, useFoldersStore } from "~stores/folders-store"
import { useSettingsStore } from "~stores/settings-store"
import { getTagsStore, useTagsStore } from "~stores/tags-store"
import { stripQuickQuoteMarkers } from "~core/quick-quote-marker"
import { sanitizeConversationTitleCandidate } from "~utils/conversation-title"
import { DOMToolkit } from "~utils/dom-toolkit"
import {
  createExportMetadata,
  downloadExportPackage,
  downloadFile,
  downloadZipFiles,
  type ExportBundle,
  type ExportFormat,
  type ExportMetadata,
  type ExportMessage,
  type ZipFileInput,
  formatToJSON,
  formatToMarkdown,
  formatToTXT,
  htmlToMarkdown,
} from "~utils/exporter"
import { getAllLocalizedTexts, t } from "~utils/i18n"
import { consumeRestoreFlag, type ExportPackaging } from "~utils/storage"
import { showToast } from "~utils/toast"

import type { Conversation, ConversationData, Tag } from "./types"

export type { Conversation, ConversationData, Folder, Tag }

export type ConversationExportStage =
  | "loading-history"
  | "preparing"
  | "extracting"
  | "packaging"
  | "downloading"
  | "copying"
  | "restoring"

export type ConversationExportOperation = "export" | "outline-copy" | "segment-export"

export type ConversationSegmentedExportMode = "zip-markdown" | "merged-markdown" | "clipboard"

export interface ConversationExportSegment {
  id: string
  index: number
  title: string
  exportTitle: string
  preview: string
  messages: ExportMessage[]
  userMessageCount: number
  assistantMessageCount: number
  characterCount: number
}

export interface ConversationSegmentedExportDraft {
  conversationId: string
  title: string
  safeTitle: string
  filenamePrefix: string
  timestampSuffix: string
  metadata: ExportMetadata
  totalMessages: number
  segments: ConversationExportSegment[]
}

export interface ConversationExportProgress {
  conversationId: string
  format: ExportFormat
  stage: ConversationExportStage
  operation: ConversationExportOperation
}

export interface ConversationDeleteResult {
  id: string
  localDeleted: boolean
  remoteEnabled: boolean
  remoteAttempted: boolean
  remoteSuccess: boolean
  remoteMethod: "api" | "ui" | "none"
  reason?: string
}

export interface ConversationBatchDeleteResult {
  total: number
  localDeletedCount: number
  remoteAttemptedCount: number
  remoteSuccessCount: number
  remoteFailedCount: number
  failedIds: string[]
  results: ConversationDeleteResult[]
}

export interface ConversationSyncResult {
  newCount: number
  updatedCount: number
  deletedCount: number
}

interface ConversationSyncOptions {
  syncDeleted?: boolean
}

interface ConversationExportData {
  conv: Conversation
  messages: ExportMessage[]
  exportBundle: ExportBundle | null
  exportPackaging: ExportLifecycleContext["packaging"]
  notifyProgress: (stage: ConversationExportStage) => void
}

interface ConversationExportDataOptions {
  packaging?: ExportPackaging
}

interface AutoFullSyncResult {
  scannedCount: number
  changedCount: number
  loadSucceeded: boolean
}

type GeminiCidMigrationResult = "migrated" | "pending_email" | "noop"

export class ConversationManager {
  public readonly siteAdapter: SiteAdapter

  // Observer state
  private observerConfig: ConversationObserverConfig | null = null
  private sidebarObserverStop: (() => void) | null = null
  private observerContainer: Node | null = null
  private titleWatcher: any = null // DOMToolkit watcher instance
  private pollInterval: ReturnType<typeof setTimeout> | null = null
  private geminiMigrationTimer: ReturnType<typeof setTimeout> | null = null
  private geminiMigrationRetryCount = 0
  private initialAutoFullSyncPromise: Promise<void> | null = null

  // Settings
  private syncUnpin: boolean = false
  private syncDelete: boolean = true

  // 数据变更回调（用于通知 UI 刷新）
  private onChangeCallbacks: Array<() => void> = []
  private onExportProgressCallbacks: Array<(progress: ConversationExportProgress | null) => void> =
    []

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

  onExportProgress(callback: (progress: ConversationExportProgress | null) => void): () => void {
    this.onExportProgressCallbacks.push(callback)
    return () => {
      this.onExportProgressCallbacks = this.onExportProgressCallbacks.filter(
        (cb) => cb !== callback,
      )
    }
  }

  /**
   * 触发数据变更通知
   */
  notifyDataChange() {
    this.onChangeCallbacks.forEach((cb) => cb())
  }

  private notifyExportProgress(progress: ConversationExportProgress | null) {
    this.onExportProgressCallbacks.forEach((cb) => cb(progress))
  }

  async init() {
    // 等待所有 stores hydration 完成
    await this.waitForHydration()

    // Gemini 老用户升级迁移：将旧版数字 cid 自动迁移为当前账号邮箱 cid
    const migrateResult = this.tryMigrateGeminiLegacyCidToEmail()
    if (migrateResult === "pending_email") {
      this.startGeminiMigrationRetry()
    }

    // 检查是否刚恢复了备份数据，如果是则跳过自动同步以保持备份的干净状态
    const isRestore = await consumeRestoreFlag()

    // 首次安装或当前站点数据为空时，自动加载全部会话
    const currentSiteCount = Object.keys(this.getAllConversations()).length
    const shouldRunInitialAutoFullSync =
      currentSiteCount === 0 && this.siteAdapter.loadAllConversations && !isRestore

    if (shouldRunInitialAutoFullSync) {
      try {
        await this.runInitialAutoFullSync()
      } catch (error) {
        console.warn("[ConversationManager] Initial auto conversation sync failed:", error)
      }
    }

    this.startSidebarObserver()
  }

  // Gemini 老数据迁移：数字 cid(0/1/2...) -> 当前邮箱 cid
  private tryMigrateGeminiLegacyCidToEmail(): GeminiCidMigrationResult {
    if (this.siteAdapter.getSiteId() !== SITE_IDS.GEMINI) return "noop"
    const all = this.conversations
    const geminiEntries = Object.entries(all).filter(([_, conv]) => this.isGeminiConversation(conv))
    if (geminiEntries.length === 0) return "noop"

    const legacyEntries = geminiEntries.filter(([_, conv]) => this.isLegacyGeminiCid(conv.cid))
    if (legacyEntries.length === 0) return "noop"

    const currentCid = this.siteAdapter.getCurrentCid?.()
    if (!this.isEmailCid(currentCid)) return "pending_email"

    // 优先迁移与当前 /u/<n> 对应的旧分桶；若不存在且仅有一个旧分桶，则迁移该分桶（跨浏览器导入场景）
    const currentUserIndex = this.getGeminiUserIndexFromPath()
    const hasCurrentIndexBucket = legacyEntries.some(
      ([_, conv]) => (conv.cid || "0") === currentUserIndex,
    )
    const hasCurrentEmailData = geminiEntries.some(([_, conv]) => conv.cid === currentCid)
    const legacyCidSet = new Set(legacyEntries.map(([_, conv]) => conv.cid || "0"))

    let sourceLegacyCid: string | null = null
    if (hasCurrentIndexBucket) {
      sourceLegacyCid = currentUserIndex
    } else if (!hasCurrentEmailData && legacyCidSet.size === 1) {
      sourceLegacyCid = Array.from(legacyCidSet)[0]
    }
    if (!sourceLegacyCid) return "noop"

    const toMigrate = legacyEntries.filter(([_, conv]) => (conv.cid || "0") === sourceLegacyCid)
    if (toMigrate.length === 0) return "noop"

    const nextConversations: Record<string, Conversation> = { ...all }
    const userPathPrefix = this.getGeminiUserPathPrefix()

    toMigrate.forEach(([id, conv]) => {
      nextConversations[id] = {
        ...conv,
        cid: currentCid,
        url: this.buildGeminiConversationUrl(id, userPathPrefix),
      }
    })

    useConversationsStore.setState({ conversations: nextConversations })
    this.notifyDataChange()
    console.warn(
      `[ConversationManager] Gemini legacy cid migrated: ${sourceLegacyCid} -> ${currentCid}, updated ${toMigrate.length} conversations.`,
    )
    return "migrated"
  }

  private startGeminiMigrationRetry() {
    if (this.siteAdapter.getSiteId() !== SITE_IDS.GEMINI) return
    if (this.geminiMigrationTimer) return

    const maxRetries = 120 // 约 3 分钟，覆盖页面延迟渲染场景
    this.geminiMigrationRetryCount = 0

    this.geminiMigrationTimer = setInterval(() => {
      const result = this.tryMigrateGeminiLegacyCidToEmail()
      this.geminiMigrationRetryCount += 1

      if (result !== "pending_email" || this.geminiMigrationRetryCount >= maxRetries) {
        this.stopGeminiMigrationRetry()
      }
    }, 1500)
  }

  private stopGeminiMigrationRetry() {
    if (this.geminiMigrationTimer) {
      clearInterval(this.geminiMigrationTimer)
      this.geminiMigrationTimer = null
    }
    this.geminiMigrationRetryCount = 0
  }

  private isEmailCid(cid: string | null | undefined): cid is string {
    return typeof cid === "string" && cid.includes("@")
  }

  private isLegacyGeminiCid(cid: string | undefined): boolean {
    if (!cid) return true
    return /^\d+$/.test(cid)
  }

  private getGeminiUserIndexFromPath(): string {
    const match = window.location.pathname.match(/^\/u\/(\d+)(?:\/|$)/)
    return match ? match[1] : "0"
  }

  private getGeminiUserPathPrefix(): string {
    const match = window.location.pathname.match(/^\/u\/(\d+)(?:\/|$)/)
    return match ? `/u/${match[1]}` : ""
  }

  private isGeminiConversation(conv: Conversation): boolean {
    if (conv.siteId === SITE_IDS.GEMINI) return true
    if (conv.siteId && conv.siteId !== SITE_IDS.GEMINI) return false
    return typeof conv.url === "string" && conv.url.includes("gemini.google.com")
  }

  private buildGeminiConversationUrl(id: string, userPathPrefix: string): string {
    return `https://gemini.google.com${userPathPrefix}/app/${id}`
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
      await this.delay(250)
    }
    return false
  }

  private async runInitialAutoFullSync(): Promise<void> {
    if (this.initialAutoFullSyncPromise) {
      return this.initialAutoFullSyncPromise
    }

    this.initialAutoFullSyncPromise = this.autoFullSyncWithRetry().finally(() => {
      this.initialAutoFullSyncPromise = null
    })

    return this.initialAutoFullSyncPromise
  }

  private async autoFullSyncWithRetry(): Promise<void> {
    const maxAttempts = 4
    const retryDelayMs = 2500
    const requiredStableAttempts = 2
    let bestScannedCount = 0
    let stableAttempts = 0

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const sidebarReady = await this.waitForSidebarReady(attempt === 0 ? 10000 : 5000)
      if (!sidebarReady) {
        if (attempt < maxAttempts - 1) {
          await this.delay(retryDelayMs)
        }
        continue
      }

      const result = await this.autoFullSync()
      const hasGrowth = result.scannedCount > bestScannedCount

      if (hasGrowth) {
        bestScannedCount = result.scannedCount
        stableAttempts = 0
      } else if (result.loadSucceeded && result.scannedCount > 0 && result.changedCount === 0) {
        stableAttempts++
      }

      if (
        result.loadSucceeded &&
        result.scannedCount > 0 &&
        stableAttempts >= requiredStableAttempts
      ) {
        break
      }

      if (attempt < maxAttempts - 1) {
        await this.delay(retryDelayMs)
      }
    }
  }

  private async autoFullSync(): Promise<AutoFullSyncResult> {
    const loadResult = await this.siteAdapter.loadAllConversations()
    await this.delay(400)

    if (loadResult === false) {
      const { newCount, updatedCount } = this.syncConversations(null, true)
      const changedCount = newCount + updatedCount

      if (changedCount > 0) {
        this.notifyDataChange()
      }

      return {
        scannedCount: this.siteAdapter.getConversationList().length,
        changedCount,
        loadSucceeded: false,
      }
    }

    const maxRounds = 10
    const maxStableRounds = 2
    let stableRounds = 0
    let lastListCount = this.siteAdapter.getConversationList().length
    let totalNewCount = 0
    let totalUpdatedCount = 0

    for (let i = 0; i < maxRounds; i++) {
      if (i > 0) {
        const container = this.siteAdapter.getSidebarScrollContainer()
        if (!container) break

        const el = container as HTMLElement
        el.scrollTop = el.scrollHeight
        el.dispatchEvent(new Event("scroll", { bubbles: true }))
        await this.delay(400)
      }

      const { newCount, updatedCount } = this.syncConversations(null, true)
      totalNewCount += newCount
      totalUpdatedCount += updatedCount

      if (newCount > 0 || updatedCount > 0) {
        this.notifyDataChange()
      }

      await this.delay(300)

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

    return {
      scannedCount: this.siteAdapter.getConversationList().length,
      changedCount: totalNewCount + totalUpdatedCount,
      loadSucceeded: true,
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  destroy() {
    this.stopGeminiMigrationRetry()
    this.stopSidebarObserver()
  }

  updateSettings(settings: { syncUnpin: boolean; syncDelete?: boolean }) {
    this.syncUnpin = settings.syncUnpin
    if (typeof settings.syncDelete === "boolean") {
      this.syncDelete = settings.syncDelete
    }
  }

  // ================= Data Loading（已迁移到 Zustand stores）=================

  // 不再需要 loadData / loadTags / saveFolders / saveConversations / saveTags
  // 数据加载由 Zustand persist 自动处理

  // ================= Observer Logic =================

  startSidebarObserver() {
    if (this.sidebarObserverStop) return

    const config = this.siteAdapter.getConversationObserverConfig()
    if (!config) {
      return
    }

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
      let needsUpdate = false
      const updates: Partial<Conversation> = {}

      if (info.title && info.title !== existing.title) {
        updates.title = info.title
        needsUpdate = true
      }

      if (info.url && info.url !== existing.url) {
        updates.url = info.url
        needsUpdate = true
      }

      if (info.cid !== undefined && info.cid !== existing.cid) {
        updates.cid = info.cid
        needsUpdate = true
      }

      if (info.isPinned !== undefined && info.isPinned !== existing.pinned) {
        if (info.isPinned) {
          updates.pinned = true
          needsUpdate = true
        } else if (!info.isPinned && this.syncUnpin) {
          updates.pinned = false
          needsUpdate = true
        }
      }

      if (needsUpdate) {
        getConversationsStore().updateConversation(info.id, updates)
        this.notifyDataChange()
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

  reorderFolders(orderedIds: string[]) {
    getFoldersStore().reorderFolders(orderedIds)
  }

  // ================= Conversation Operations =================

  async deleteConversation(id: string): Promise<ConversationDeleteResult> {
    const result = await this.deleteConversations([id])
    if (result.results.length > 0) {
      return result.results[0]
    }
    return {
      id,
      localDeleted: false,
      remoteEnabled: this.syncDelete,
      remoteAttempted: false,
      remoteSuccess: false,
      remoteMethod: "none",
      reason: "not_found",
    }
  }

  async deleteConversations(ids: string[]): Promise<ConversationBatchDeleteResult> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
    if (uniqueIds.length === 0) {
      return {
        total: 0,
        localDeletedCount: 0,
        remoteAttemptedCount: 0,
        remoteSuccessCount: 0,
        remoteFailedCount: 0,
        failedIds: [],
        results: [],
      }
    }

    const targets = uniqueIds
      .map((id): ConversationDeleteTarget | null => {
        const conv = this.conversations[id]
        if (!conv) return null
        if (conv.siteId && conv.siteId !== this.siteAdapter.getSiteId()) return null
        return {
          id: conv.id,
          title: conv.title,
          url: conv.url,
        }
      })
      .filter((target): target is ConversationDeleteTarget => Boolean(target))

    const remoteResultMap = new Map<string, SiteDeleteConversationResult>()

    if (this.syncDelete && targets.length > 0) {
      try {
        const remoteResults = await this.siteAdapter.deleteConversationsOnSite(targets)
        remoteResults.forEach((item) => {
          remoteResultMap.set(item.id, item)
        })
      } catch (error) {
        console.error(
          `[ConversationManager] deleteConversationsOnSite failed on ${this.siteAdapter.getName()}:`,
          error,
        )
        const reason =
          error instanceof Error ? error.message || "remote_delete_failed" : "remote_delete_failed"
        targets.forEach((target) => {
          remoteResultMap.set(target.id, {
            id: target.id,
            success: false,
            method: "api",
            reason,
          })
        })
      }
    }

    let localDeletedCount = 0
    let remoteAttemptedCount = 0
    let remoteSuccessCount = 0
    let remoteFailedCount = 0
    const results: ConversationDeleteResult[] = []

    uniqueIds.forEach((id) => {
      const exists = Boolean(this.conversations[id])
      const remoteEnabled = this.syncDelete
      const remoteItem = remoteResultMap.get(id)
      const remoteMethod = remoteItem?.method || "none"
      const remoteAttempted = remoteEnabled && remoteResultMap.has(id) && remoteMethod !== "none"
      const remoteSuccess = remoteAttempted && (remoteItem?.success || false)

      if (remoteAttempted) {
        remoteAttemptedCount++
        if (remoteSuccess) {
          remoteSuccessCount++
        } else {
          remoteFailedCount++
        }
      }

      if (exists) {
        getConversationsStore().deleteConversation(id)
        localDeletedCount++
      }

      results.push({
        id,
        localDeleted: exists,
        remoteEnabled,
        remoteAttempted,
        remoteSuccess,
        remoteMethod,
        reason: remoteItem?.reason || (exists ? undefined : "not_found"),
      })
    })

    if (localDeletedCount > 0) {
      this.notifyDataChange()
    }

    return {
      total: uniqueIds.length,
      localDeletedCount,
      remoteAttemptedCount,
      remoteSuccessCount,
      remoteFailedCount,
      failedIds: results.filter((item) => !item.localDeleted).map((item) => item.id),
      results,
    }
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
    options: ConversationSyncOptions = {},
  ): ConversationSyncResult {
    const sidebarItems = this.siteAdapter.getConversationList()

    if (!sidebarItems || sidebarItems.length === 0) {
      return { newCount: 0, updatedCount: 0, deletedCount: 0 }
    }

    const conversations = this.conversations
    let newCount = 0
    let updatedCount = 0
    let deletedCount = 0
    const now = Date.now()
    const folderId = targetFolderId || this.lastUsedFolderId || "inbox"
    const store = getConversationsStore()
    const sidebarIds = new Set(sidebarItems.map((item) => item.id))
    const upserts: Conversation[] = []
    const updateEntries: Array<{ id: string; updates: Partial<Conversation> }> = []
    const deleteIds: string[] = []

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
        }
        if (item.isPinned && !existing.pinned) {
          updates.pinned = true
          needsUpdate = true
        } else if (!item.isPinned && existing.pinned && this.syncUnpin) {
          updates.pinned = false
          needsUpdate = true
        }
        if (!existing.siteId) {
          updates.siteId = this.siteAdapter.getSiteId()
          needsUpdate = true
        }
        if (item.cid && !existing.cid) {
          updates.cid = item.cid
          needsUpdate = true
        }

        if (needsUpdate) {
          updateEntries.push({ id: storageKey, updates })
          updatedCount++
        }
      } else {
        // 新会话
        upserts.push({
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

    if (options.syncDeleted) {
      const currentSiteId = this.siteAdapter.getSiteId()
      const currentCid = this.siteAdapter.getCurrentCid?.() || null

      Object.entries(conversations).forEach(([id, conv]) => {
        if (conv.siteId !== currentSiteId) return
        if (!this.matchesCid(conv, currentCid)) return
        if (sidebarIds.has(id)) return

        deleteIds.push(id)
        deletedCount++
      })
    }

    store.applyConversationChanges({
      upserts,
      updates: updateEntries,
      deleteIds,
      lastUsedFolderId: targetFolderId || undefined,
    })

    return { newCount, updatedCount, deletedCount }
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

  private sanitizeConversationTitleForUse(
    title?: string | null,
    options: { dropLocalizedFallback?: boolean; managedTitleReference?: string | null } = {},
  ): string | null {
    const settings = useSettingsStore.getState().settings
    const sanitizeOptions = {
      privacyTitle: settings.tab?.privacyTitle || "Google",
      siteName: this.siteAdapter.getName(),
      titleFormat: settings.tab?.titleFormat,
    }
    let sanitized = sanitizeConversationTitleCandidate(title, sanitizeOptions)
    const referenceTitle = sanitizeConversationTitleCandidate(
      options.managedTitleReference,
      sanitizeOptions,
    )

    if (referenceTitle) {
      const managedSanitized = sanitizeConversationTitleCandidate(title, {
        ...sanitizeOptions,
        hasManagedTitleSignal: true,
      })
      if (
        managedSanitized &&
        managedSanitized !== sanitized &&
        managedSanitized === referenceTitle
      ) {
        sanitized = managedSanitized
      }
    }

    if (options.dropLocalizedFallback && this.isLocalizedFallbackConversationTitle(sanitized)) {
      return null
    }
    return sanitized
  }

  private isLocalizedFallbackConversationTitle(title?: string | null): boolean {
    const normalized = title?.replace(/\s+/g, " ").trim()
    if (!normalized) return false

    const fallbackTitles = getAllLocalizedTexts("untitledConversation").map((value) =>
      value.replace(/\s+/g, " ").trim(),
    )

    return fallbackTitles.includes(normalized)
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

  private sanitizeExportFilename(value: string, fallback: string): string {
    const sanitized = value
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
    return sanitized || fallback
  }

  private buildExportTimestampSuffix(enabled: boolean | undefined): string {
    if (!enabled) return ""

    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    const hours = String(now.getHours()).padStart(2, "0")
    const minutes = String(now.getMinutes()).padStart(2, "0")
    const seconds = String(now.getSeconds()).padStart(2, "0")
    return `_${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
  }

  private createExportMetadataForConversation(
    conv: Conversation,
  ): Pick<
    ConversationSegmentedExportDraft,
    "title" | "safeTitle" | "filenamePrefix" | "timestampSuffix" | "metadata"
  > {
    const settings = useSettingsStore.getState().settings
    const localizedUntitledConversation = t("untitledConversation")
    const exportTitle =
      this.sanitizeConversationTitleForUse(conv.title) || localizedUntitledConversation
    const siteName = this.siteAdapter.getName()

    return {
      title: exportTitle,
      safeTitle: this.sanitizeExportFilename(exportTitle, localizedUntitledConversation).substring(
        0,
        50,
      ),
      filenamePrefix: `${this.sanitizeExportFilename(siteName, siteName)} - `,
      timestampSuffix: this.buildExportTimestampSuffix(settings.export?.exportFilenameTimestamp),
      metadata: createExportMetadata(exportTitle, siteName, conv.id, {
        customUserName: settings.export?.customUserName,
        customModelName: settings.export?.customModelName,
      }),
    }
  }

  private normalizeExportSegmentText(content: string, maxLength?: number): string {
    const normalized = content
      .replace(/\r\n?/g, "\n")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/~~~[\s\S]*?~~~/g, " ")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/(^|\n)\s*>+\s?/g, "$1")
      .replace(/[`*_~]/g, "")
      .replace(/\s+/g, " ")
      .trim()

    if (!maxLength || normalized.length <= maxLength) return normalized
    return `${normalized.slice(0, maxLength).trim()}...`
  }

  private normalizeExportSegmentTitle(content: string): string {
    return content
      .replace(/\r\n?/g, "\n")
      .replace(/```[^\n]*\n?([\s\S]*?)```/g, " $1 ")
      .replace(/~~~[^\n]*\n?([\s\S]*?)~~~/g, " $1 ")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/(^|\n)\s*>+\s?/g, "$1")
      .replace(/[`*_~]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  private countExportSegmentCharacters(messages: ExportMessage[]): number {
    return messages.reduce((total, message) => {
      return total + this.normalizeExportSegmentText(message.content).length
    }, 0)
  }

  private createFallbackSegmentTitle(index: number, hasUserMessage: boolean): string {
    if (!hasUserMessage && index === 1) {
      return t("segmentedExportOpeningSegment")
    }

    return t("segmentedExportUntitledSegment").replace("{index}", String(index))
  }

  private createConversationExportSegments(messages: ExportMessage[]): ConversationExportSegment[] {
    const segments: ConversationExportSegment[] = []
    let currentMessages: ExportMessage[] = []

    const flushSegment = () => {
      if (currentMessages.length === 0) return

      const index = segments.length + 1
      const userMessages = currentMessages.filter(
        (message) => message.role.toLowerCase() === "user",
      )
      const assistantMessages = currentMessages.filter(
        (message) => message.role.toLowerCase() !== "user",
      )
      const titleSource = userMessages[0]?.content || currentMessages[0]?.content || ""
      const title =
        this.normalizeExportSegmentText(titleSource, 80) ||
        this.createFallbackSegmentTitle(index, userMessages.length > 0)
      const exportTitle =
        this.normalizeExportSegmentTitle(titleSource) ||
        this.createFallbackSegmentTitle(index, userMessages.length > 0)
      const preview =
        this.normalizeExportSegmentText(
          currentMessages.map((message) => message.content).join(" "),
          180,
        ) || title

      segments.push({
        id: `segment-${index}`,
        index,
        title,
        exportTitle,
        preview,
        messages: currentMessages,
        userMessageCount: userMessages.length,
        assistantMessageCount: assistantMessages.length,
        characterCount: this.countExportSegmentCharacters(currentMessages),
      })

      currentMessages = []
    }

    messages.forEach((message) => {
      if (message.role.toLowerCase() === "user") {
        flushSegment()
      }
      currentMessages.push(message)
    })
    flushSegment()

    return segments
  }

  private getSelectedExportSegments(
    draft: ConversationSegmentedExportDraft,
    selectedSegmentIds: string[],
  ): ConversationExportSegment[] {
    const selectedIds = new Set(selectedSegmentIds)
    return draft.segments.filter((segment) => selectedIds.has(segment.id))
  }

  private createSegmentMetadata(
    draft: ConversationSegmentedExportDraft,
    segment: ConversationExportSegment,
  ): ExportMetadata {
    return {
      ...draft.metadata,
      title: `${draft.title} - ${segment.index}. ${segment.exportTitle}`,
    }
  }

  private getSegmentReplyMessages(segment: ConversationExportSegment): ExportMessage[] {
    const replyMessages = segment.messages.filter(
      (message) => message.role.toLowerCase() !== "user",
    )
    if (replyMessages.length > 0) return replyMessages

    return segment.messages
  }

  private formatSegmentBody(segment: ConversationExportSegment): string {
    return this.getSegmentReplyMessages(segment)
      .map((message) => message.content.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim()
  }

  private formatSingleSegmentMarkdown(
    draft: ConversationSegmentedExportDraft,
    segment: ConversationExportSegment,
  ): string {
    const lines = [
      formatToMarkdown(this.createSegmentMetadata(draft, segment), []).trimEnd(),
      "",
      `## ${segment.index}. ${segment.exportTitle}`,
    ]
    const body = this.formatSegmentBody(segment)

    if (body) {
      lines.push("", body)
    }

    return `${lines.join("\n").trimEnd()}\n`
  }

  private formatSegmentedMarkdown(
    draft: ConversationSegmentedExportDraft,
    segments: ConversationExportSegment[],
  ): string {
    const lines = [formatToMarkdown(draft.metadata, []).trimEnd()]

    segments.forEach((segment) => {
      lines.push("", `## ${segment.index}. ${segment.exportTitle}`)
      const body = this.formatSegmentBody(segment)

      if (body) {
        lines.push("", body)
      }
    })

    return `${lines.join("\n").trimEnd()}\n`
  }

  private createSegmentFilename(segment: ConversationExportSegment): string {
    const index = String(segment.index).padStart(3, "0")
    const title = this.sanitizeExportFilename(segment.title, `segment-${index}`).substring(0, 70)
    return `${index} - ${title}.md`
  }

  private resolveConversationForExport(convId: string): Conversation | null {
    const existing = this.conversations[convId]
    const currentInfo = this.siteAdapter.getCurrentConversationInfo()

    if (!currentInfo || currentInfo.id !== convId) {
      return existing || null
    }

    // 导出时优先保留已同步到会话库中的原始标题，但本次导出要清理历史污染标题。
    const title =
      this.sanitizeConversationTitleForUse(existing?.title, {
        dropLocalizedFallback: true,
        managedTitleReference: currentInfo.title,
      }) ||
      this.sanitizeConversationTitleForUse(currentInfo.title) ||
      t("untitledConversation")
    const url = currentInfo.url || existing?.url || window.location.href
    const cid = currentInfo.cid ?? existing?.cid
    const pinned = currentInfo.isPinned ?? existing?.pinned ?? false

    if (existing) {
      const updates: Partial<Conversation> = {}
      let needsUpdate = false

      if (!existing.title?.trim() && title !== existing.title) {
        updates.title = title
        needsUpdate = true
      }

      if (url !== existing.url) {
        updates.url = url
        needsUpdate = true
      }

      if (cid !== undefined && cid !== existing.cid) {
        updates.cid = cid
        needsUpdate = true
      }

      if (pinned !== existing.pinned) {
        updates.pinned = pinned
        needsUpdate = true
      }

      if (needsUpdate) {
        getConversationsStore().updateConversation(convId, updates)
        this.notifyDataChange()
        const updatedConversation = {
          ...existing,
          ...updates,
          updatedAt: Date.now(),
        }
        return updatedConversation.title === title
          ? updatedConversation
          : { ...updatedConversation, title }
      }

      return existing.title === title ? existing : { ...existing, title }
    }

    const now = Date.now()
    const fallbackConversation: Conversation = {
      id: convId,
      siteId: this.siteAdapter.getSiteId(),
      cid,
      title,
      url,
      folderId: this.lastUsedFolderId || "inbox",
      pinned,
      createdAt: now,
      updatedAt: now,
    }

    if (this.siteAdapter.isSharePage()) {
      return fallbackConversation
    }

    getConversationsStore().addConversation(fallbackConversation)
    this.notifyDataChange()
    return fallbackConversation
  }

  // ================= Export Functionality =================

  private async withConversationExportData<T>(
    convId: string,
    format: ExportFormat,
    handleExportData: (data: ConversationExportData) => Promise<T> | T,
    operation: ConversationExportOperation = "export",
    options: ConversationExportDataOptions = {},
  ): Promise<T | null> {
    const currentSessionId = this.siteAdapter.getSessionId()
    if (currentSessionId !== convId) {
      showToast(t("exportNeedOpenFirst"))
      return null
    }

    const conv = this.resolveConversationForExport(convId)
    if (!conv) {
      console.error("[ConversationManager] Conversation not found:", convId)
      return null
    }

    const scrollContainer = this.siteAdapter.getScrollContainer?.() || null
    const initialScrollTop = scrollContainer?.scrollTop ?? null
    const initialWindowScrollY = window.scrollY
    const settings = useSettingsStore.getState().settings
    const exportPackaging =
      options.packaging ?? (settings.export?.packaging === "zip" ? "zip" : "markdown")

    const exportContext: ExportLifecycleContext = {
      conversationId: convId,
      format,
      includeThoughts: settings.export?.includeThoughts ?? true,
      packaging: exportPackaging,
    }

    let exportLifecycleEnabled = false
    let exportLifecycleState: unknown = null
    const notifyProgress = (stage: ConversationExportStage) => {
      this.notifyExportProgress({
        conversationId: convId,
        format,
        stage,
        operation,
      })
    }

    try {
      notifyProgress("loading-history")

      // 加载完整历史（滚动到顶部）
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

      // 导出前钩子（站点可选实现）
      notifyProgress("preparing")
      exportLifecycleEnabled = true
      exportLifecycleState = await this.siteAdapter.prepareConversationExport(exportContext)

      // 只有 ZIP 模式才收集附件资产；Markdown 模式保持单文件导出路径。
      notifyProgress("extracting")
      const shouldPackageAssets = format === "markdown" && exportPackaging === "zip"
      const exportBundle = shouldPackageAssets
        ? await this.siteAdapter.extractExportBundle(exportContext)
        : null
      const rawMessages =
        exportBundle?.messages || (await this.extractConversationMessages(exportContext))
      const messages = this.stripQuickQuoteMarkersFromExportMessages(rawMessages)
      if (messages.length === 0) {
        console.error("[ConversationManager] No messages found")
        return null
      }

      return await handleExportData({
        conv,
        messages,
        exportBundle,
        exportPackaging,
        notifyProgress,
      })
    } catch (error) {
      console.error("[ConversationManager] Export failed:", error)
      return null
    } finally {
      notifyProgress("restoring")

      if (exportLifecycleEnabled) {
        try {
          await this.siteAdapter.restoreConversationAfterExport(exportContext, exportLifecycleState)
        } catch (restoreErr) {
          console.warn("[ConversationManager] Export state restore failed:", restoreErr)
        }
      }

      // 无论导出成功与否，尽量恢复用户原始阅读位置
      if (scrollContainer && initialScrollTop !== null) {
        scrollContainer.scrollTop = initialScrollTop
      } else {
        window.scrollTo({ top: initialWindowScrollY, behavior: "auto" })
      }

      this.notifyExportProgress(null)
    }
  }

  async collectCurrentConversationExportMessages(
    format: ExportFormat = "clipboard",
  ): Promise<ExportMessage[] | null> {
    const currentSessionId = this.siteAdapter.getSessionId()
    if (!currentSessionId) {
      showToast(t("exportNeedOpenFirst"))
      return null
    }

    return this.withConversationExportData(
      currentSessionId,
      format,
      ({ messages }) => messages,
      "outline-copy",
    )
  }

  async prepareSegmentedConversationExport(
    convId: string,
  ): Promise<ConversationSegmentedExportDraft | null> {
    return this.withConversationExportData(
      convId,
      "markdown",
      ({ conv, messages }) => {
        const segments = this.createConversationExportSegments(messages)
        if (segments.length === 0) return null

        const exportInfo = this.createExportMetadataForConversation(conv)
        return {
          conversationId: conv.id,
          ...exportInfo,
          totalMessages: messages.length,
          segments,
        }
      },
      "segment-export",
      { packaging: "markdown" },
    )
  }

  async exportSegmentedConversation(
    draft: ConversationSegmentedExportDraft,
    selectedSegmentIds: string[],
    mode: ConversationSegmentedExportMode,
  ): Promise<boolean> {
    const segments = this.getSelectedExportSegments(draft, selectedSegmentIds)
    if (segments.length === 0) {
      showToast(t("segmentedExportNoSelection"))
      return false
    }

    try {
      if (mode === "clipboard") {
        const content = this.formatSegmentedMarkdown(draft, segments)
        await navigator.clipboard.writeText(content)
        showToast(t("copySuccess"))
        return true
      }

      if (mode === "merged-markdown") {
        const filename = `${draft.filenamePrefix}${draft.safeTitle}${draft.timestampSuffix} - segments.md`
        const downloaded = await downloadFile(
          this.formatSegmentedMarkdown(draft, segments),
          filename,
          "text/markdown;charset=utf-8",
        )
        if (downloaded) showToast(t("exportSuccess"))
        return downloaded
      }

      const files: ZipFileInput[] = segments.map((segment) => ({
        path: this.createSegmentFilename(segment),
        data: this.formatSingleSegmentMarkdown(draft, segment),
        mimeType: "text/markdown;charset=utf-8",
      }))

      files.push({
        path: "manifest.json",
        data: JSON.stringify(
          {
            version: 1,
            metadata: {
              title: draft.metadata.title,
              id: draft.metadata.id,
              url: draft.metadata.url,
              exportTime: draft.metadata.exportTime,
              source: draft.metadata.source,
            },
            totalMessages: draft.totalMessages,
            segments: segments.map((segment) => ({
              id: segment.id,
              index: segment.index,
              title: segment.title,
              file: this.createSegmentFilename(segment),
              userMessageCount: segment.userMessageCount,
              assistantMessageCount: segment.assistantMessageCount,
              characterCount: segment.characterCount,
            })),
          },
          null,
          2,
        ),
        mimeType: "application/json;charset=utf-8",
      })

      const packageFilename = `${draft.filenamePrefix}${draft.safeTitle}${draft.timestampSuffix} - segments.zip`
      const downloaded = await downloadZipFiles(files, packageFilename)
      if (downloaded) showToast(t("exportSuccess"))
      return downloaded
    } catch (error) {
      console.error("[ConversationManager] Segmented export failed:", error)
      showToast(t("exportFailed"))
      return false
    }
  }

  /**
   * 导出会话
   */
  async exportConversation(convId: string, format: ExportFormat): Promise<boolean> {
    const result = await this.withConversationExportData(
      convId,
      format,
      async ({ conv, messages, exportBundle, exportPackaging, notifyProgress }) => {
        const settings = useSettingsStore.getState().settings

        // 格式化
        const localizedUntitledConversation = t("untitledConversation")
        const exportTitle =
          this.sanitizeConversationTitleForUse(conv.title) || localizedUntitledConversation
        const safeTitle = exportTitle.replace(/[<>:"/\\|?*]/g, "_").substring(0, 50)

        const metadata = createExportMetadata(exportTitle, this.siteAdapter.getName(), conv.id, {
          customUserName: settings.export?.customUserName,
          customModelName: settings.export?.customModelName,
        })

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
          notifyProgress("copying")
          content = formatToMarkdown(metadata, messages)
          await navigator.clipboard.writeText(content)
          showToast(t("copySuccess"))
          return true
        } else if (format === "markdown") {
          content = formatToMarkdown(metadata, messages)
          filename = `${filenamePrefix}${safeTitle}${timestampSuffix}.md`
          mimeType = "text/markdown;charset=utf-8"

          const shouldPackageAssets = exportPackaging === "zip"
          if (shouldPackageAssets) {
            notifyProgress("packaging")
            const downloaded = await downloadExportPackage({
              markdownFilename: filename,
              markdownContent: content,
              assets: this.normalizeExportAssets(exportBundle),
              packageFilename: `${filenamePrefix}${safeTitle}${timestampSuffix}.zip`,
              metadata,
            })
            if (!downloaded) return false
            showToast(t("exportSuccess"))
            return true
          }
        } else if (format === "json") {
          content = formatToJSON(metadata, messages)
          filename = `${filenamePrefix}${safeTitle}${timestampSuffix}.json`
          mimeType = "application/json;charset=utf-8"
        } else {
          content = formatToTXT(metadata, messages)
          filename = `${filenamePrefix}${safeTitle}${timestampSuffix}.txt`
          mimeType = "text/plain;charset=utf-8"
        }

        notifyProgress("downloading")
        const downloaded = await downloadFile(content, filename, mimeType)
        if (!downloaded) return false
        showToast(t("exportSuccess"))
        return true
      },
    )

    return result === true
  }

  /**
   * 提取当前页面的对话消息
   */
  private async extractConversationMessages(
    context: ExportLifecycleContext,
  ): Promise<ExportMessage[]> {
    const adapterMessages = await this.siteAdapter.extractExportMessages(context)
    if (adapterMessages !== null) {
      return adapterMessages
    }

    const messages: ExportMessage[] = []

    const config = this.siteAdapter.getExportConfig?.()
    if (!config) {
      console.warn("[ConversationManager] Export config not available")
      return messages
    }

    const { userQuerySelector, assistantResponseSelector, turnSelector, useShadowDOM } = config

    if (turnSelector) {
      const turns =
        (DOMToolkit.query(turnSelector, {
          all: true,
          shadow: useShadowDOM,
        }) as Element[]) || []

      if (turns.length > 0) {
        const collectTurnMatches = (turn: Element, selector: string): Element[] => {
          const matches: Element[] = []

          if (turn.matches?.(selector)) {
            matches.push(turn)
          }

          const descendants =
            (DOMToolkit.query(selector, {
              parent: turn as Node,
              all: true,
              shadow: useShadowDOM,
            }) as Element[]) || []

          descendants.forEach((element) => {
            if (!matches.includes(element)) {
              matches.push(element)
            }
          })

          return matches
        }

        const compareDomOrder = (left: Element, right: Element): number => {
          if (left === right) return 0
          const position = left.compareDocumentPosition(right)
          if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
          if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
          return 0
        }

        const pushMessage = (role: "user" | "assistant", element: Element) => {
          if (role === "user") {
            const userContent = this.siteAdapter.extractUserQueryExportContent(element)
            messages.push({ role, content: userContent })
            return
          }

          const adapterExtract = this.siteAdapter.extractAssistantResponseText
          const baseExtract = SiteAdapter.prototype.extractAssistantResponseText
          let aiContent = ""
          if (adapterExtract && adapterExtract !== baseExtract) {
            aiContent = adapterExtract.call(this.siteAdapter, element)
          }
          if (!aiContent) {
            aiContent = htmlToMarkdown(element) || element.textContent?.trim() || ""
          }

          messages.push({ role, content: aiContent })
        }

        turns.forEach((turn) => {
          const orderedMessages = [
            ...collectTurnMatches(turn, userQuerySelector).map((element) => ({
              role: "user" as const,
              element,
            })),
            ...collectTurnMatches(turn, assistantResponseSelector).map((element) => ({
              role: "assistant" as const,
              element,
            })),
          ].sort((left, right) => compareDomOrder(left.element, right.element))

          orderedMessages.forEach(({ role, element }) => {
            pushMessage(role, element)
          })
        })

        return messages
      }
    }

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
        // 导出时优先使用站点适配器提供的 Markdown 语义提取
        const userContent = this.siteAdapter.extractUserQueryExportContent(userMessages[i])
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

  private stripQuickQuoteMarkersFromExportMessages(messages: ExportMessage[]): ExportMessage[] {
    return messages.map((message) => ({
      ...message,
      content: stripQuickQuoteMarkers(message.content),
    }))
  }

  private normalizeExportAssets(bundle: ExportBundle | null): NonNullable<ExportBundle["assets"]> {
    if (!bundle?.assets) return []

    return bundle.assets.filter((asset) => {
      if (!asset.name?.trim()) return false
      return asset.content !== undefined || Boolean(asset.sourceUrl)
    })
  }
}
