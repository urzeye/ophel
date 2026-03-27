/**
 * 备份与同步页面
 * 包含：本地备份导出/导入 (支持部分导出) | WebDAV 同步配置与管理
 */
import React, { useEffect, useRef, useState } from "react"

import { GeminiAdapter } from "~adapters/gemini"
import { CloudIcon } from "~components/icons"
import { ConfirmDialog, Tooltip } from "~components/ui"
import { PRESET_EMOJIS, SITE_IDS, type Folder } from "~constants"
import {
  DEFAULT_FOLDERS,
  MULTI_PROP_STORES,
  ZUSTAND_KEYS,
  getDefaultPrompts,
} from "~constants/defaults"
import type { Conversation } from "~core/conversation/types"
import { getWebDAVSyncManager, type BackupFile } from "~core/webdav-sync"
import { platform } from "~platform"
import { useConversationsStore } from "~stores/conversations-store"
import { useFoldersStore } from "~stores/folders-store"
import { usePromptsStore } from "~stores/prompts-store"
import { useReadingHistoryStore } from "~stores/reading-history-store"
import { useSettingsStore } from "~stores/settings-store"
import { useTagsStore } from "~stores/tags-store"
import { validateBackupData } from "~utils/backup-validator"
import { t } from "~utils/i18n"
import { MSG_CLEAR_ALL_DATA, MSG_RESTORE_DATA } from "~utils/messaging"
import { CLEAR_ALL_FLAG_KEY, DEFAULT_SETTINGS, RESTORE_FLAG_KEY } from "~utils/storage"
import { showToast as showDomToast } from "~utils/toast"

import { PageTitle, SettingCard, SettingRow } from "../components"

interface BackupPageProps {
  siteId: string
  onNavigate?: (page: string) => void
}

interface WebDAVFormState {
  url: string
  username: string
  password: string
  remoteDir: string
}

// 辅助函数：格式化文件大小
const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

const formatBackupTypeLabel = (type: unknown): string => {
  if (type === "full") return t("fullBackup") || "完整备份"
  if (type === "prompts") return t("promptsBackup") || "仅提示词"
  if (type === "settings") return t("settingsBackup") || "仅设置"
  return String(type || t("unknown") || "未知")
}

const VOYAGER_FORMAT = "gemini-voyager.folders.v1"
const VOYAGER_FOLDER_ID_PREFIX = "voyager_"
const VOYAGER_PATH_SEPARATOR = " / "
const VOYAGER_ICON_POOL = PRESET_EMOJIS.filter((emoji) =>
  ["📁", "📂", "🗂️", "📋", "💼", "📝", "🔍", "🧠"].includes(emoji),
)

interface VoyagerFolderSource {
  id: string
  name: string
  parentId: string | null
  sortIndex?: number
}

interface PreparedVoyagerFolder {
  folder: Folder
  sourceId: string
}

interface PreparedVoyagerConversation extends Conversation {
  importedFolderId: string
}

interface PreparedVoyagerImport {
  folders: PreparedVoyagerFolder[]
  conversations: PreparedVoyagerConversation[]
  sourceVersion: string
}

interface VoyagerImportPlan {
  nextFolders: Folder[]
  nextConversations: Record<string, Conversation>
  lastUsedFolderId: string
  sourceVersion: string
  stats: {
    folderCount: number
    conversationCount: number
    foldersAdded: number
    conversationsAdded: number
    conversationsMoved: number
    conversationsUpdated: number
    conversationsPreserved: number
    conversationsSkipped: number
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const normalizeVoyagerFolderId = (sourceId: string): string =>
  `${VOYAGER_FOLDER_ID_PREFIX}${sourceId}`

const isVoyagerManagedFolder = (folderId: string | undefined): boolean =>
  typeof folderId === "string" && folderId.startsWith(VOYAGER_FOLDER_ID_PREFIX)

const hashString = (value: string): number => {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

const pickVoyagerFolderIcon = (seed: string): string => {
  if (VOYAGER_ICON_POOL.length === 0) return "📁"
  return VOYAGER_ICON_POOL[hashString(seed) % VOYAGER_ICON_POOL.length]
}

const getCurrentGeminiUserPathPrefix = (): string => {
  const match = window.location.pathname.match(/^\/u\/(\d+)(?:\/|$)/)
  return match ? `/u/${match[1]}` : ""
}

const buildGeminiConversationUrl = (conversationId: string, userPathPrefix: string): string =>
  `https://gemini.google.com${userPathPrefix}/app/${conversationId}`

const getVoyagerTimestamp = (...values: Array<number | undefined>): number => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value
    }
  }
  return Date.now()
}

const prepareVoyagerImport = (
  jsonString: string,
  currentCid: string,
  userPathPrefix: string,
): PreparedVoyagerImport => {
  const parsed = JSON.parse(jsonString) as Record<string, unknown>

  if (!isPlainObject(parsed) || parsed.format !== VOYAGER_FORMAT) {
    throw new Error(t("voyagerImportInvalidFormat") || "不是 Gemini Voyager 文件夹导出格式")
  }

  const data = parsed.data
  if (!isPlainObject(data)) {
    throw new Error(t("voyagerImportInvalidData") || "缺少有效的 data 字段")
  }

  const folderList = data.folders
  const folderContents = data.folderContents

  if (!Array.isArray(folderList) || !isPlainObject(folderContents)) {
    throw new Error(t("voyagerImportInvalidData") || "缺少有效的文件夹或内容数据")
  }

  const sourceFolders = folderList
    .map((folder, index): (VoyagerFolderSource & { originalIndex: number }) | null => {
      if (!isPlainObject(folder) || typeof folder.id !== "string") {
        return null
      }

      const rawName = typeof folder.name === "string" ? folder.name.trim() : ""
      const normalizedName = rawName || `${t("untitled") || "未命名"} ${index + 1}`
      const parentId =
        typeof folder.parentId === "string" && folder.parentId.trim() ? folder.parentId : null
      const sortIndex = typeof folder.sortIndex === "number" ? folder.sortIndex : undefined

      return {
        id: folder.id,
        name: normalizedName,
        parentId,
        sortIndex,
        originalIndex: index,
      }
    })
    .filter((folder): folder is VoyagerFolderSource & { originalIndex: number } => Boolean(folder))

  if (sourceFolders.length === 0) {
    throw new Error(t("voyagerImportEmpty") || "导入文件中没有可用的文件夹")
  }

  const folderMap = new Map(sourceFolders.map((folder) => [folder.id, folder]))
  const childrenMap = new Map<
    string | null,
    Array<VoyagerFolderSource & { originalIndex: number }>
  >()

  sourceFolders.forEach((folder) => {
    const parentId = folder.parentId && folderMap.has(folder.parentId) ? folder.parentId : null
    const siblings = childrenMap.get(parentId) || []
    siblings.push(folder)
    childrenMap.set(parentId, siblings)
  })

  childrenMap.forEach((siblings) => {
    siblings.sort((a, b) => {
      const sortA = typeof a.sortIndex === "number" ? a.sortIndex : Number.MAX_SAFE_INTEGER
      const sortB = typeof b.sortIndex === "number" ? b.sortIndex : Number.MAX_SAFE_INTEGER
      if (sortA !== sortB) return sortA - sortB
      return a.originalIndex - b.originalIndex
    })
  })

  const preparedFolders: PreparedVoyagerFolder[] = []

  const visitFolder = (
    folder: VoyagerFolderSource & { originalIndex: number },
    ancestors: string[],
  ) => {
    const pathParts = [...ancestors, folder.name]
    const pathName = pathParts.join(VOYAGER_PATH_SEPARATOR)
    preparedFolders.push({
      sourceId: folder.id,
      folder: {
        id: normalizeVoyagerFolderId(folder.id),
        name: pathName,
        icon: pickVoyagerFolderIcon(pathName),
      },
    })

    const children = childrenMap.get(folder.id) || []
    children.forEach((child) => walkFolder(child, pathParts))
  }

  const visitedFolderIds = new Set<string>()
  const roots = childrenMap.get(null) || []

  const walkFolder = (
    folder: VoyagerFolderSource & { originalIndex: number },
    ancestors: string[],
  ) => {
    if (visitedFolderIds.has(folder.id)) return
    visitedFolderIds.add(folder.id)
    visitFolder(folder, ancestors)
  }

  roots.forEach((folder) => walkFolder(folder, []))
  sourceFolders.forEach((folder) => walkFolder(folder, []))

  const seenConversationIds = new Set<string>()
  const preparedConversations: PreparedVoyagerConversation[] = []

  preparedFolders.forEach(({ sourceId, folder }) => {
    const items = folderContents[sourceId]
    if (!Array.isArray(items)) return

    const sortedItems = [...items].sort((a, b) => {
      const itemA = isPlainObject(a) ? a : {}
      const itemB = isPlainObject(b) ? b : {}
      const sortA = typeof itemA.sortIndex === "number" ? itemA.sortIndex : Number.MAX_SAFE_INTEGER
      const sortB = typeof itemB.sortIndex === "number" ? itemB.sortIndex : Number.MAX_SAFE_INTEGER
      if (sortA !== sortB) return sortA - sortB
      return 0
    })

    sortedItems.forEach((item) => {
      if (!isPlainObject(item) || typeof item.conversationId !== "string") {
        return
      }

      if (seenConversationIds.has(item.conversationId)) {
        return
      }

      seenConversationIds.add(item.conversationId)

      const createdAt = getVoyagerTimestamp(
        typeof item.addedAt === "number" ? item.addedAt : undefined,
        typeof item.updatedAt === "number" ? item.updatedAt : undefined,
        typeof item.lastOpenedAt === "number" ? item.lastOpenedAt : undefined,
      )
      const updatedAt = getVoyagerTimestamp(
        typeof item.updatedAt === "number" ? item.updatedAt : undefined,
        typeof item.lastOpenedAt === "number" ? item.lastOpenedAt : undefined,
        typeof item.addedAt === "number" ? item.addedAt : undefined,
      )
      const title =
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim()
          : item.conversationId

      preparedConversations.push({
        id: item.conversationId,
        siteId: SITE_IDS.GEMINI,
        cid: currentCid,
        title,
        url: buildGeminiConversationUrl(item.conversationId, userPathPrefix),
        folderId: folder.id,
        importedFolderId: folder.id,
        pinned: Boolean(item.starred),
        createdAt,
        updatedAt,
      })
    })
  })

  return {
    folders: preparedFolders,
    conversations: preparedConversations,
    sourceVersion: String(parsed.version || "-"),
  }
}

const planVoyagerImport = (
  prepared: PreparedVoyagerImport,
  existingFolders: Folder[],
  existingConversations: Record<string, Conversation>,
  lastUsedFolderId: string,
): VoyagerImportPlan => {
  const nextFolders = [...existingFolders]
  const nextConversations = { ...existingConversations }
  const existingFolderIds = new Set(existingFolders.map((folder) => folder.id))

  let foldersAdded = 0
  let conversationsAdded = 0
  let conversationsMoved = 0
  let conversationsUpdated = 0
  let conversationsPreserved = 0
  let conversationsSkipped = 0

  prepared.folders.forEach(({ folder }) => {
    if (existingFolderIds.has(folder.id)) {
      return
    }
    nextFolders.push(folder)
    existingFolderIds.add(folder.id)
    foldersAdded++
  })

  prepared.conversations.forEach((conversation) => {
    const existing = nextConversations[conversation.id]

    if (existing && existing.siteId && existing.siteId !== SITE_IDS.GEMINI) {
      conversationsSkipped++
      return
    }

    if (!existing) {
      nextConversations[conversation.id] = {
        ...conversation,
      }
      conversationsAdded++
      return
    }

    const nextConversation: Conversation = { ...existing }
    let changed = false
    let moved = false

    if (!nextConversation.siteId) {
      nextConversation.siteId = SITE_IDS.GEMINI
      changed = true
    }

    if (nextConversation.cid !== conversation.cid) {
      nextConversation.cid = conversation.cid
      changed = true
    }

    if (!nextConversation.url || nextConversation.url !== conversation.url) {
      nextConversation.url = conversation.url
      changed = true
    }

    if (!nextConversation.title) {
      nextConversation.title = conversation.title
      changed = true
    }

    if (!nextConversation.pinned && conversation.pinned) {
      nextConversation.pinned = true
      changed = true
    }

    if (
      nextConversation.folderId === "inbox" ||
      isVoyagerManagedFolder(nextConversation.folderId) ||
      !nextConversation.folderId
    ) {
      if (nextConversation.folderId !== conversation.importedFolderId) {
        nextConversation.folderId = conversation.importedFolderId
        changed = true
        moved = true
      }
    } else {
      conversationsPreserved++
    }

    if (changed) {
      nextConversation.createdAt =
        nextConversation.createdAt || conversation.createdAt || Date.now()
      nextConversation.updatedAt = Math.max(
        nextConversation.updatedAt || 0,
        conversation.updatedAt || 0,
        nextConversation.createdAt || 0,
      )
      nextConversations[conversation.id] = nextConversation
      conversationsUpdated++
      if (moved) {
        conversationsMoved++
      }
    }
  })

  const normalizedLastUsedFolderId =
    lastUsedFolderId && existingFolderIds.has(lastUsedFolderId) ? lastUsedFolderId : "inbox"

  return {
    nextFolders,
    nextConversations,
    lastUsedFolderId: normalizedLastUsedFolderId,
    sourceVersion: prepared.sourceVersion,
    stats: {
      folderCount: prepared.folders.length,
      conversationCount: prepared.conversations.length,
      foldersAdded,
      conversationsAdded,
      conversationsMoved,
      conversationsUpdated,
      conversationsPreserved,
      conversationsSkipped,
    },
  }
}

// ==================== 远程备份列表模态框 (保持原有逻辑) ====================
const RemoteBackupModal: React.FC<{
  onClose: () => void
  onRestore: () => void
}> = ({ onClose, onRestore }) => {
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmConfig, setConfirmConfig] = useState<{
    show: boolean
    title: string
    message: string
    danger?: boolean
    onConfirm: () => void
  }>({
    show: false,
    title: "",
    message: "",
    onConfirm: () => {},
  })

  const loadBackups = async () => {
    setLoading(true)
    try {
      const manager = getWebDAVSyncManager()
      const files = await manager.getBackupList()
      setBackups(files)
    } catch (e) {
      showDomToast("加载失败: " + String(e))
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    loadBackups()
  }, [])

  const handleRestoreClick = (file: BackupFile) => {
    setConfirmConfig({
      show: true,
      title: t("restore") || "恢复",
      message: `确定要恢复备份 "${file.name}" 吗？当前数据将被覆盖，${t("openAiPagesWillRefresh") || "已打开的 AI 页面将被刷新。"}`,
      danger: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, show: false }))
        try {
          setLoading(true)
          const manager = getWebDAVSyncManager()
          const result = await manager.download(file.name)
          if (result.success) {
            try {
              if (platform.type === "extension" && typeof chrome !== "undefined") {
                await new Promise<void>((resolve, reject) =>
                  chrome.storage.local.set({ [RESTORE_FLAG_KEY]: Date.now() }, () =>
                    chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
                  ),
                )
                await chrome.runtime.sendMessage({ type: MSG_RESTORE_DATA })
              }
            } catch {
              // ignore
            }
            showDomToast(t("restoreSuccess") || "恢复成功，即将刷新页面...")
            setTimeout(() => {
              onRestore()
            }, 1500)
          } else {
            showDomToast(t("restoreError") || "恢复失败: " + result.messageKey)
            setLoading(false)
          }
        } catch (e) {
          showDomToast("恢复失败: " + String(e))
          setLoading(false)
        }
      },
    })
  }

  const handleDeleteClick = (file: BackupFile) => {
    setConfirmConfig({
      show: true,
      title: t("delete") || "删除",
      message: `确定要删除云端备份 "${file.name}" 吗？此操作不可逆。`,
      danger: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, show: false }))
        try {
          setLoading(true)
          const manager = getWebDAVSyncManager()
          const result = await manager.deleteFile(file.name)
          if (result.success) {
            showDomToast(t("deleteSuccess") || "删除成功")
            loadBackups()
          } else {
            showDomToast(t("deleteError") || "删除失败")
            setLoading(false)
          }
        } catch (e) {
          showDomToast("删除失败: " + String(e))
          setLoading(false)
        }
      },
    })
  }

  return (
    <div
      className="settings-modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
      {confirmConfig.show && (
        <ConfirmDialog
          title={confirmConfig.title}
          message={confirmConfig.message}
          danger={confirmConfig.danger}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig((prev) => ({ ...prev, show: false }))}
        />
      )}

      <div
        className="settings-modal"
        style={{
          width: "500px",
          height: "600px",
          background: "var(--gh-card-bg, #ffffff)",
          borderRadius: "12px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--gh-border, #e5e7eb)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
          <div style={{ fontWeight: 600, fontSize: "16px" }}>
            {t("webdavBackupList") || "WebDAV 备份列表"}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Tooltip content={t("refresh") || "刷新"}>
              <button
                onClick={loadBackups}
                className="settings-btn settings-btn-secondary"
                style={{ padding: "6px" }}>
                🔄
              </button>
            </Tooltip>
            <button
              onClick={onClose}
              className="settings-btn settings-btn-secondary"
              style={{ padding: "6px 12px" }}>
              ✕
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "16px", flex: 1 }}>
          {loading ? (
            <div
              style={{ textAlign: "center", padding: "20px", color: "var(--gh-text-secondary)" }}>
              {t("loading") || "加载中..."}
            </div>
          ) : backups.length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "20px", color: "var(--gh-text-secondary)" }}>
              {t("noBackupsFound") || "未找到备份文件"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {backups.map((file) => (
                <div
                  key={file.name}
                  style={{
                    padding: "12px",
                    background: "var(--gh-bg-secondary, #f9fafb)",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500 }}>{file.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--gh-text-secondary)" }}>
                      {formatSize(file.size)} • {file.lastModified.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => handleRestoreClick(file)}
                      className="settings-btn settings-btn-primary"
                      style={{ padding: "6px 12px", fontSize: "12px" }}>
                      {t("restore") || "恢复"}
                    </button>
                    <button
                      onClick={() => handleDeleteClick(file)}
                      className="settings-btn settings-btn-danger"
                      style={{ padding: "6px 12px", fontSize: "12px" }}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ==================== 主页面组件 ====================
const BackupPage: React.FC<BackupPageProps> = ({ siteId, onNavigate: _onNavigate }) => {
  const { settings, setSettings, resetSettings } = useSettingsStore()
  const isGeminiPage = siteId === SITE_IDS.GEMINI

  // 状态管理
  const [showRemoteBackups, setShowRemoteBackups] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pasteContent, setPasteContent] = useState("")
  const voyagerFileInputRef = useRef<HTMLInputElement>(null)
  const [voyagerPasteContent, setVoyagerPasteContent] = useState("")

  // WebDAV 本地表单状态（与 Store 解耦，仅点击保存时同步）
  const [webdavForm, setWebdavForm] = useState<WebDAVFormState>({
    url: "",
    username: "",
    password: "",
    remoteDir: "ophel",
  })

  // 初始化表单
  useEffect(() => {
    if (settings?.webdav) {
      setWebdavForm((prev) => ({
        ...prev,
        ...settings.webdav,
      }))
    }
  }, [settings?.webdav])

  // 弹窗状态
  const [confirmConfig, setConfirmConfig] = useState<{
    show: boolean
    title: string
    message: React.ReactNode
    danger?: boolean
    onConfirm: () => void
  }>({
    show: false,
    title: "",
    message: "",
    onConfirm: () => {},
  })

  // 权限弹窗状态
  const [permissionConfirm, setPermissionConfirm] = useState<{
    show: boolean
    onConfirm: () => void
  }>({
    show: false,
    onConfirm: () => {},
  })

  if (!settings) return null

  const writeStorageUpdates = async (updates: Record<string, unknown>) => {
    await new Promise<void>((resolve, reject) =>
      chrome.storage.local.set(updates, () =>
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
      ),
    )
  }

  const notifyPagesToReload = async () => {
    try {
      if (platform.type === "extension" && typeof chrome !== "undefined") {
        await writeStorageUpdates({ [RESTORE_FLAG_KEY]: Date.now() })
        await chrome.runtime.sendMessage({ type: MSG_RESTORE_DATA })
      }
    } catch {
      // ignore
    }
  }

  // -------------------- 导出功能 --------------------

  const handleExport = async (type: "full" | "prompts" | "settings") => {
    try {
      let exportData: Record<string, unknown> = {}
      const timestamp = new Date().toISOString()
      let filename = `ophel-backup-${timestamp.slice(0, 10)}.json`

      if (type === "full") {
        // 1. 完整导出
        const localData = await new Promise<Record<string, unknown>>((resolve) =>
          chrome.storage.local.get(null, resolve),
        )
        // 过滤和处理数据
        const hydratedData = Object.fromEntries(
          Object.entries(localData).map(([k, v]) => {
            try {
              let parsed = typeof v === "string" ? JSON.parse(v) : v
              if (ZUSTAND_KEYS.includes(k) && parsed?.state) {
                if (MULTI_PROP_STORES.includes(k)) {
                  // 多属性 store：保留整个 state（含 lastUsedFolderId 等辅助属性）
                  parsed = parsed.state
                } else if (parsed.state[k] !== undefined) {
                  // 单属性 store：直接提取主数据
                  parsed = parsed.state[k]
                } else {
                  parsed = parsed.state
                }
              }
              return [k, parsed]
            } catch {
              return [k, v]
            }
          }),
        )
        exportData = {
          version: 3,
          timestamp,
          type: "full",
          data: hydratedData,
        }
      } else if (type === "prompts") {
        // 2. 仅提示词导出 (KEY: prompts)
        // 注意：不包含 folders 和 tags，按需求
        const raw = await new Promise<Record<string, unknown>>((resolve) =>
          chrome.storage.local.get("prompts", resolve),
        )
        // 解析 Zustand 结构
        let promptsData = []
        try {
          const parsed = typeof raw.prompts === "string" ? JSON.parse(raw.prompts) : raw.prompts
          if (parsed?.state?.prompts) {
            promptsData = parsed.state.prompts
          }
        } catch (e) {
          console.error(e)
        }

        exportData = {
          version: 3,
          timestamp,
          type: "prompts",
          data: { prompts: promptsData },
        }
        filename = `ophel-prompts-${timestamp.slice(0, 10)}.json`
      } else if (type === "settings") {
        // 3. 仅设置导出 (KEY: settings)
        const raw = await new Promise<Record<string, unknown>>((resolve) =>
          chrome.storage.local.get("settings", resolve),
        )
        let settingsData = {}
        try {
          const parsed = typeof raw.settings === "string" ? JSON.parse(raw.settings) : raw.settings
          if (parsed?.state?.settings) {
            settingsData = parsed.state.settings
          } else if (parsed?.state) {
            settingsData = parsed.state
          }
        } catch (e) {
          console.error(e)
        }

        exportData = {
          version: 3,
          timestamp,
          type: "settings",
          data: { settings: settingsData }, // 此处 settings 对应 settings store key
        }
        filename = `ophel-settings-${timestamp.slice(0, 10)}.json`
      }

      // 下载
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      showDomToast(t("exportSuccess") || "导出成功！")
    } catch (err) {
      showDomToast(t("exportError") || "导出失败：" + String(err))
    }
  }

  // -------------------- 导入功能 --------------------

  const processImport = async (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString)

      // 数据格式验证
      const validation = validateBackupData(data)
      if (!validation.valid) {
        const errorMsgs = validation.errorKeys.map((key) => t(key) || key).join(", ")
        console.error("Backup validation failed:", validation.errorKeys)
        showDomToast(t("invalidBackupFile") || "无效的格式: " + errorMsgs)
        return
      }

      setConfirmConfig({
        show: true,
        title: t("importData") || "导入数据",
        message: (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>{t("importConfirm") || "确定导入？"}</div>
            <div
              style={{
                border: "1px solid var(--gh-border, #e5e7eb)",
                background: "var(--gh-hover, #f8fafc)",
                borderRadius: "8px",
                padding: "10px 12px",
              }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr",
                  rowGap: "6px",
                  columnGap: "10px",
                  alignItems: "start",
                }}>
                <div style={{ color: "var(--gh-text-secondary, #6b7280)" }}>
                  {t("backupTime") || "备份时间"}
                </div>
                <div style={{ color: "var(--gh-text, #111827)", fontWeight: 500 }}>
                  {String(data.timestamp || "-")}
                </div>
                <div style={{ color: "var(--gh-text-secondary, #6b7280)" }}>
                  {t("backupType") || "类型"}
                </div>
                <div style={{ color: "var(--gh-text, #111827)", fontWeight: 500 }}>
                  {formatBackupTypeLabel(data.type)}
                </div>
              </div>
            </div>
            <div style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)" }}>
              {t("openAiPagesWillRefresh") || "已打开的 AI 页面将被刷新。"}
            </div>
          </div>
        ),
        danger: true,
        onConfirm: async () => {
          setConfirmConfig((prev) => ({ ...prev, show: false }))
          try {
            // 数据回填逻辑 (Rehydration)
            const updates: Record<string, unknown> = {}

            Object.entries(data.data).forEach(([k, v]) => {
              if (v === null || v === undefined) return

              // 只导入存在的 key，避免污染
              // 如果是 prompts 导出，data.data 只包含 prompts

              if (ZUSTAND_KEYS.includes(k)) {
                // 构建 Zustand persist 结构
                let stateContent = v
                // 针对 multi-prop stores 的特殊处理 (如 conversations)
                if (MULTI_PROP_STORES.includes(k)) {
                  // 通过检查 v 中是否包含与 store 同名的属性来区分格式
                  if (typeof v === "object" && !Array.isArray(v)) {
                    const obj = v as Record<string, unknown>
                    if (k === "conversations" && obj.conversations !== undefined) {
                      // 已包装格式：{ conversations: {...}, lastUsedFolderId: "..." }
                      stateContent = v
                    } else if (
                      k === "readingHistory" &&
                      (obj.history !== undefined || obj.lastCleanupRun !== undefined)
                    ) {
                      // 已包装格式：{ history: {...}, lastCleanupRun: number }
                      stateContent = v
                    } else {
                      // 扁平化格式（旧版本导出）
                      stateContent = k === "readingHistory" ? { history: v } : { [k]: v }
                    }
                  } else {
                    // 扁平化格式（旧版本导出）：v 直接是主数据
                    stateContent = k === "readingHistory" ? { history: v } : { [k]: v }
                  }
                } else {
                  // prompts, settings 等通常 state key = store name
                  // 但旧版本可能不同，这里统一假设 state = { [key]: value } 是安全的默认值
                  // 实际上 store 定义是 { prompts: [...] }
                  // 导出的 v 就是 [...] (array) 或者 object
                  // 如果 v 是 array (prompts list)，这里需要包装成 { prompts: v }
                  if (k === "prompts" && Array.isArray(v)) {
                    stateContent = { prompts: v }
                  } else if (k === "settings" && !v["settings"]) {
                    // settings store 结构是 { settings: {...}, ...actions }
                    // 导出的 v 是 settings 对象本身
                    stateContent = { settings: v }
                  } else {
                    // 兜底
                    stateContent = { [k]: v }
                  }
                }

                updates[k] = JSON.stringify({ state: stateContent, version: 0 })
              } else {
                // 普通数据
                if (typeof v === "object") {
                  updates[k] = JSON.stringify(v)
                } else {
                  updates[k] = v
                }
              }
            })

            await writeStorageUpdates(updates)
            await notifyPagesToReload()

            showDomToast(t("importSuccess") || "导入成功")
            setTimeout(() => window.location.reload(), 1000)
          } catch (err) {
            console.error("[Backup] import storage write failed:", err)
            showDomToast(`${t("importError") || "导入失败："}${getErrorMessage(err)}`)
          }
        },
      })
    } catch (e) {
      console.error("[Backup] import parse failed:", e)
      showDomToast(`${t("importError") || "导入失败："}${getErrorMessage(e)}`)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setPasteContent(text) // 预览
    // processImport(text) // 暂时不自动导入，让用户点击按钮
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleImportClick = () => {
    if (!pasteContent.trim()) {
      showDomToast("请先选择文件或粘贴内容")
      return
    }
    processImport(pasteContent)
  }

  const handleVoyagerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setVoyagerPasteContent(text)
    if (voyagerFileInputRef.current) voyagerFileInputRef.current.value = ""
  }

  const handleVoyagerImportClick = () => {
    if (!voyagerPasteContent.trim()) {
      showDomToast(t("voyagerImportPasteRequired") || "请先选择 Voyager 文件或粘贴 JSON 内容")
      return
    }

    if (!isGeminiPage) {
      showDomToast(
        t("voyagerImportGeminiOnly") || "请在 Gemini 页面打开数据管理后再执行 Voyager 导入",
      )
      return
    }

    try {
      const adapter = new GeminiAdapter()
      const currentCid = adapter.getCurrentCid()
      const userPathPrefix = getCurrentGeminiUserPathPrefix()
      const prepared = prepareVoyagerImport(voyagerPasteContent, currentCid, userPathPrefix)
      const conversationsState = useConversationsStore.getState()
      const plan = planVoyagerImport(
        prepared,
        useFoldersStore.getState().folders,
        conversationsState.conversations,
        conversationsState.lastUsedFolderId,
      )

      setConfirmConfig({
        show: true,
        title: t("voyagerImportTitle") || "从 Gemini Voyager 导入",
        message: (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              {t("voyagerImportConfirm") || "确认将 Voyager 文件夹结构增量导入到当前 Gemini 账号？"}
            </div>
            <div
              style={{
                border: "1px solid var(--gh-border, #e5e7eb)",
                background: "var(--gh-hover, #f8fafc)",
                borderRadius: "8px",
                padding: "10px 12px",
              }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  rowGap: "6px",
                  columnGap: "10px",
                  alignItems: "start",
                }}>
                <div style={{ color: "var(--gh-text-secondary, #6b7280)" }}>
                  {t("voyagerImportVersion") || "Voyager 版本"}
                </div>
                <div style={{ color: "var(--gh-text, #111827)", fontWeight: 500 }}>
                  {plan.sourceVersion}
                </div>
                <div style={{ color: "var(--gh-text-secondary, #6b7280)" }}>
                  {t("voyagerImportFolderCount") || "文件夹"}
                </div>
                <div style={{ color: "var(--gh-text, #111827)", fontWeight: 500 }}>
                  {plan.stats.folderCount}
                </div>
                <div style={{ color: "var(--gh-text-secondary, #6b7280)" }}>
                  {t("voyagerImportConversationCount") || "会话"}
                </div>
                <div style={{ color: "var(--gh-text, #111827)", fontWeight: 500 }}>
                  {plan.stats.conversationCount}
                </div>
                <div style={{ color: "var(--gh-text-secondary, #6b7280)" }}>
                  {t("voyagerImportNewFolders") || "新增文件夹"}
                </div>
                <div style={{ color: "var(--gh-text, #111827)", fontWeight: 500 }}>
                  {plan.stats.foldersAdded}
                </div>
                <div style={{ color: "var(--gh-text-secondary, #6b7280)" }}>
                  {t("voyagerImportNewConversations") || "新增会话"}
                </div>
                <div style={{ color: "var(--gh-text, #111827)", fontWeight: 500 }}>
                  {plan.stats.conversationsAdded}
                </div>
                <div style={{ color: "var(--gh-text-secondary, #6b7280)" }}>
                  {t("voyagerImportMovedConversations") || "移动会话"}
                </div>
                <div style={{ color: "var(--gh-text, #111827)", fontWeight: 500 }}>
                  {plan.stats.conversationsMoved}
                </div>
                <div style={{ color: "var(--gh-text-secondary, #6b7280)" }}>
                  {t("voyagerImportPreservedConversations") || "保留原文件夹"}
                </div>
                <div style={{ color: "var(--gh-text, #111827)", fontWeight: 500 }}>
                  {plan.stats.conversationsPreserved}
                </div>
              </div>
            </div>
            <div style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)" }}>
              {t("voyagerImportFlattenNotice") || "层级文件夹会压平成路径名称，例如“父级 / 子级”。"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)" }}>
              {t("voyagerImportMergeNotice") ||
                "为避免覆盖现有整理结果，已在其他 Ophel 文件夹中的会话会保留原位；仅收件箱和已导入的 Voyager 文件夹会被重新归类。"}
            </div>
          </div>
        ),
        onConfirm: async () => {
          setConfirmConfig((prev) => ({ ...prev, show: false }))
          try {
            await writeStorageUpdates({
              folders: JSON.stringify({ state: { folders: plan.nextFolders }, version: 0 }),
              conversations: JSON.stringify({
                state: {
                  conversations: plan.nextConversations,
                  lastUsedFolderId: plan.lastUsedFolderId,
                },
                version: 0,
              }),
            })
            await notifyPagesToReload()

            showDomToast(
              (
                t("voyagerImportSuccess") ||
                "Voyager 导入完成：新增 {folders} 个文件夹，新增 {conversations} 个会话，移动 {moved} 个会话。"
              )
                .replace("{folders}", String(plan.stats.foldersAdded))
                .replace("{conversations}", String(plan.stats.conversationsAdded))
                .replace("{moved}", String(plan.stats.conversationsMoved)),
            )
            setTimeout(() => window.location.reload(), 1000)
          } catch (err) {
            console.error("[Backup] voyager import write failed:", err)
            showDomToast(`${t("importError") || "导入失败："}${getErrorMessage(err)}`)
          }
        },
      })
    } catch (err) {
      console.error("[Backup] voyager import parse failed:", err)
      showDomToast(`${t("importError") || "导入失败："}${getErrorMessage(err)}`)
    }
  }

  const resetLocalStores = () => {
    resetSettings()
    usePromptsStore.getState().setPrompts(getDefaultPrompts())
    useFoldersStore.setState({ folders: DEFAULT_FOLDERS })
    useTagsStore.setState({ tags: [] })
    useConversationsStore.setState({ conversations: {}, lastUsedFolderId: "inbox" })
    useReadingHistoryStore.setState({ history: {}, lastCleanupRun: 0 })
  }

  // 清除数据
  const handleClearAll = () => {
    setConfirmConfig({
      show: true,
      title: t("clearAllData") || "清除全部数据",
      message:
        t("clearAllDataConfirm") ||
        "确定要清除所有数据吗？此操作不可逆，所有设置、提示词、会话等数据都将被删除！",
      danger: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, show: false }))
        try {
          if (platform.type === "extension" && typeof chrome !== "undefined") {
            try {
              await chrome.runtime.sendMessage({ type: MSG_CLEAR_ALL_DATA })
            } catch {
              // 忽略消息发送失败
            }
          }

          await Promise.all([
            new Promise<void>((resolve, reject) =>
              chrome.storage.local.clear(() =>
                chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
              ),
            ),
            new Promise<void>((resolve, reject) =>
              chrome.storage.sync.clear(() =>
                chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
              ),
            ),
          ])
          await new Promise<void>((resolve, reject) =>
            chrome.storage.local.set({ [CLEAR_ALL_FLAG_KEY]: Date.now() }, () =>
              chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
            ),
          )
          resetLocalStores()
          showDomToast(t("clearSuccess") || "数据已清除，即将刷新...")
          setTimeout(() => window.location.reload(), 1500)
        } catch (err) {
          showDomToast(t("error") + ": " + String(err))
        }
      },
    })
  }

  // -------------------- WebDAV 功能 --------------------

  const checkAndRequestWebDAVPermission = async (onGranted: () => void): Promise<boolean> => {
    const url = webdavForm.url // 使用表单值检查权限
    if (!url) {
      showDomToast(t("webdavConfigIncomplete") || "请填写完整的 WebDAV 配置")
      return false
    }

    // 油猴脚本环境：直接执行，无需权限检查（GM_xmlhttpRequest 已通过 @grant 声明）
    if (!platform.hasCapability("permissions")) {
      await onGranted()
      return true
    }

    try {
      const urlObj = new URL(url)
      const origin = urlObj.origin + "/*"
      const checkResult: { hasPermission?: boolean } = await chrome.runtime.sendMessage({
        type: "CHECK_PERMISSION",
        origin,
      })
      if (!checkResult.hasPermission) {
        setPermissionConfirm({
          show: true,
          onConfirm: async () => {
            setPermissionConfirm((prev) => ({ ...prev, show: false }))
            await chrome.runtime.sendMessage({
              type: "REQUEST_PERMISSIONS",
              permType: "allUrls",
            })
          },
        })
        return false
      }
      await onGranted()
      return true
    } catch (e) {
      console.warn("Perm check logic skipped:", e)
      await onGranted()
      return true
    }
  }

  const handleSaveConfig = () => {
    // 保存配置到 Store（持久化）
    const baseWebdav = settings.webdav ?? DEFAULT_SETTINGS.webdav
    setSettings({
      webdav: {
        ...baseWebdav,
        ...webdavForm,
      },
    })
    showDomToast(t("saveSuccess") || "配置已保存")
  }

  const testWebDAVConnection = async () => {
    await checkAndRequestWebDAVPermission(async () => {
      const manager = getWebDAVSyncManager()
      // 临时应用配置（不持久化）
      await manager.setConfig(webdavForm, false)

      const res = await manager.testConnection()
      if (res.success) showDomToast(t("webdavConnectionSuccess") || "连接成功")
      else showDomToast(t("webdavConnectionFailed") || "连接失败: " + res.messageKey)
    })
  }

  const uploadToWebDAV = async () => {
    await checkAndRequestWebDAVPermission(async () => {
      const manager = getWebDAVSyncManager()
      // 临时应用配置（不持久化）
      await manager.setConfig(webdavForm, false)

      const res = await manager.upload()
      if (res.success) showDomToast(t("webdavUploadSuccess") || "备份上传成功")
      else showDomToast(t("webdavUploadFailed") || "上传失败: " + res.messageKey)
    })
  }

  return (
    <div className="settings-content">
      <PageTitle title={t("navBackup") || "备份与同步"} Icon={CloudIcon} />

      {/* 确认弹窗 */}
      {confirmConfig.show && (
        <ConfirmDialog
          title={confirmConfig.title}
          message={confirmConfig.message}
          danger={confirmConfig.danger}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig((prev) => ({ ...prev, show: false }))}
        />
      )}

      {/* 权限确认弹窗 */}
      {permissionConfirm.show && (
        <ConfirmDialog
          title={t("permissionRequired") || "需要权限"}
          message={t("webdavPermissionDesc") || "需要访问该域名的权限才能进行 WebDAV 备份。"}
          onConfirm={permissionConfirm.onConfirm}
          onCancel={() => setPermissionConfirm((prev) => ({ ...prev, show: false }))}
        />
      )}

      {/* 远程列表弹窗 */}
      {showRemoteBackups && (
        <RemoteBackupModal
          onClose={() => setShowRemoteBackups(false)}
          onRestore={() => window.location.reload()}
        />
      )}

      {/* 主布局：两列 */}
      <div
        className="backup-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "20px",
          marginBottom: "24px",
        }}>
        {/* 左侧：导出 */}
        <SettingCard
          title={t("exportData") || "导出数据"}
          description={t("exportDataDesc") || "将数据导出为 JSON 文件进行备份"}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* 完整备份 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                background: "var(--gh-bg-secondary)",
                borderRadius: "8px",
              }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: "14px" }}>
                  {t("fullBackup") || "完整备份"}
                </div>
                <div style={{ fontSize: "12px", color: "var(--gh-text-secondary)" }}>
                  {t("fullBackupDesc") || "推荐用于完整迁移"}
                </div>
              </div>
              <button
                onClick={() => handleExport("full")}
                className="settings-btn settings-btn-success"
                style={{ padding: "6px 16px" }}>
                {t("export") || "导出"}
              </button>
            </div>

            {/* 提示词备份 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                background: "var(--gh-bg-secondary)",
                borderRadius: "8px",
              }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: "14px" }}>
                  {t("promptsBackup") || "仅提示词"}
                </div>
                <div style={{ fontSize: "12px", color: "var(--gh-text-secondary)" }}>
                  {t("promptsBackupDesc") || "仅导出提示词数据"}
                </div>
              </div>
              <button
                onClick={() => handleExport("prompts")}
                className="settings-btn settings-btn-primary"
                style={{ padding: "6px 16px" }}>
                {t("export") || "导出"}
              </button>
            </div>

            {/* 设置备份 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                background: "var(--gh-bg-secondary)",
                borderRadius: "8px",
              }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: "14px" }}>
                  {t("settingsBackup") || "仅设置"}
                </div>
                <div style={{ fontSize: "12px", color: "var(--gh-text-secondary)" }}>
                  {t("settingsBackupDesc") || "仅导出配置项"}
                </div>
              </div>
              <button
                onClick={() => handleExport("settings")}
                className="settings-btn settings-btn-secondary"
                style={{ padding: "6px 16px" }}>
                {t("export") || "导出"}
              </button>
            </div>
          </div>
        </SettingCard>

        {/* 右侧：导入 */}
        <SettingCard
          title={t("importData") || "导入数据"}
          description={t("importDataDesc") || "从备份文件恢复数据"}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* 文件选择 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "14px", fontWeight: 500 }}>
                {t("selectFile") || "选择文件"}
              </div>
              <button
                className="settings-btn settings-btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: "6px 12px" }}>
                {t("browse") || "浏览..."}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
              </button>
            </div>

            {/* 预览区域 */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--gh-text-secondary)",
                  marginBottom: "4px",
                }}>
                {t("dataPreview") || "数据预览 (可直接粘贴)"}
              </div>
              <textarea
                className="settings-input"
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder={t("pastePlaceholder") || "粘贴 JSON 数据..."}
                style={{
                  width: "100%",
                  height: "120px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  resize: "vertical",
                }}
              />
            </div>

            {/* 导入按钮 */}
            <button
              onClick={handleImportClick}
              className="settings-btn settings-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "8px" }}
              disabled={!pasteContent.trim()}>
              {t("importBtn") || "确认导入"}
            </button>
          </div>
        </SettingCard>
      </div>

      <SettingCard
        title={t("voyagerImportTitle") || "从 Gemini Voyager 导入"}
        description={t("voyagerImportDesc") || "导入文件夹整理结果，并增量合并到当前账号"}
        style={{ marginBottom: "24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "20px",
            alignItems: "start",
          }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div
              style={{
                fontSize: "12px",
                lineHeight: 1.6,
                color: "var(--gh-text-secondary)",
                padding: "10px 12px",
                borderRadius: "8px",
                background: "var(--gh-bg-secondary)",
                border: "1px solid var(--gh-border, #e5e7eb)",
              }}>
              {isGeminiPage
                ? t("voyagerImportGeminiHint") ||
                  "仅支持 Gemini Voyager 的 `gemini-voyager.folders.v1` JSON。导入内容会自动归入当前打开的 Gemini 账号。"
                : t("voyagerImportGeminiOnly") ||
                  "请在 Gemini 页面打开数据管理后再执行 Voyager 导入。"}
            </div>

            <div
              style={{
                fontSize: "12px",
                lineHeight: 1.6,
                color: "var(--gh-text-secondary)",
                padding: "10px 12px",
                borderRadius: "8px",
                background: "var(--gh-bg-secondary)",
                border: "1px solid var(--gh-border, #e5e7eb)",
              }}>
              {t("voyagerImportMergeNotice") ||
                "为避免覆盖现有整理结果，已在其他 Ophel 文件夹中的会话会保留原位；仅收件箱和已导入的 Voyager 文件夹会被重新归类。"}
            </div>

            <div
              style={{
                fontSize: "12px",
                lineHeight: 1.6,
                color: "var(--gh-text-secondary)",
                padding: "10px 12px",
                borderRadius: "8px",
                background: "var(--gh-bg-secondary)",
                border: "1px solid var(--gh-border, #e5e7eb)",
              }}>
              {t("voyagerImportFlattenNotice") || "层级文件夹会压平成路径名称，例如“父级 / 子级”。"}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "14px", fontWeight: 500 }}>
                {t("selectFile") || "选择文件"}
              </div>
              <button
                className="settings-btn settings-btn-secondary"
                onClick={() => voyagerFileInputRef.current?.click()}
                style={{ padding: "6px 12px" }}
                disabled={!isGeminiPage}>
                {t("browse") || "浏览..."}
                <input
                  ref={voyagerFileInputRef}
                  type="file"
                  accept=".json"
                  style={{ display: "none" }}
                  onChange={handleVoyagerFileChange}
                />
              </button>
            </div>

            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--gh-text-secondary)",
                  marginBottom: "4px",
                }}>
                {t("dataPreview") || "数据预览 (可直接粘贴)"}
              </div>
              <textarea
                className="settings-input"
                value={voyagerPasteContent}
                onChange={(e) => setVoyagerPasteContent(e.target.value)}
                placeholder={
                  t("voyagerImportPlaceholder") ||
                  "粘贴 Gemini Voyager 导出的 JSON 内容，例如 gemini-voyager.folders.v1 ..."
                }
                style={{
                  width: "100%",
                  height: "140px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  resize: "vertical",
                }}
                disabled={!isGeminiPage}
              />
            </div>

            <button
              onClick={handleVoyagerImportClick}
              className="settings-btn settings-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "8px" }}
              disabled={!isGeminiPage || !voyagerPasteContent.trim()}>
              {t("voyagerImportAction") || "开始导入"}
            </button>
          </div>
        </div>
      </SettingCard>

      {/* WebDAV 设置与操作 */}
      <SettingCard
        title={t("webdavConfig") || "WebDAV 备份与同步"}
        description={t("webdavConfigDesc") || "配置 WebDAV 服务器以启用云端同步"}>
        {/* 提示信息 */}
        <div
          style={{
            background: "var(--gh-primary-light-bg, rgba(66, 133, 244, 0.05))",
            border: "1px solid var(--gh-primary-border, rgba(66, 133, 244, 0.2))",
            borderRadius: "8px",
            padding: "12px",
            marginBottom: "20px",
            fontSize: "13px",
            color: "var(--gh-primary, #4285f4)",
          }}>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>
            ℹ️ {t("restoreTip") || "恢复提示"}
          </div>
          <div style={{ lineHeight: 1.5, opacity: 0.9 }}>{t("restoreTipContent")}</div>
        </div>

        <SettingRow label={t("webdavAddress") || "服务器地址"}>
          <input
            type="text"
            className="settings-input"
            placeholder="https://dav.example.com/dav/"
            value={webdavForm.url}
            onChange={(e) => setWebdavForm({ ...webdavForm, url: e.target.value })}
            style={{ width: "280px" }}
          />
        </SettingRow>

        <SettingRow label={t("username") || "用户名"}>
          <input
            type="text"
            className="settings-input"
            value={webdavForm.username}
            onChange={(e) => setWebdavForm({ ...webdavForm, username: e.target.value })}
            style={{ width: "280px" }}
          />
        </SettingRow>

        <SettingRow label={t("password") || "密码"}>
          <input
            type="password"
            className="settings-input"
            value={webdavForm.password}
            onChange={(e) => setWebdavForm({ ...webdavForm, password: e.target.value })}
            style={{ width: "280px" }}
          />
        </SettingRow>

        <SettingRow label={t("defaultDir") || "默认目录"}>
          <input
            type="text"
            className="settings-input"
            placeholder="ophel"
            value={webdavForm.remoteDir}
            onChange={(e) => setWebdavForm({ ...webdavForm, remoteDir: e.target.value })}
            style={{ width: "280px" }}
          />
        </SettingRow>

        <div
          style={{
            marginTop: "16px",
            paddingTop: "16px",
            borderTop: "1px solid var(--gh-border)",
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center",
          }}>
          <button
            className="settings-btn settings-btn-primary"
            onClick={handleSaveConfig}
            style={{ padding: "6px 20px" }}>
            💾 {t("saveConfig") || "保存配置"}
          </button>
          <div
            style={{
              width: "1px",
              height: "20px",
              background: "var(--gh-border)",
              margin: "0 8px",
            }}></div>
          <button className="settings-btn settings-btn-secondary" onClick={testWebDAVConnection}>
            🔗 {t("webdavTestBtn") || "测试连接"}
          </button>
          <button
            className="settings-btn settings-btn-secondary"
            onClick={async () => {
              await checkAndRequestWebDAVPermission(async () => {
                // 临时应用配置
                const manager = getWebDAVSyncManager()
                await manager.setConfig(webdavForm, false)
                setShowRemoteBackups(true)
              })
            }}>
            📂 {t("restore") || "恢复/下载"}
          </button>
          <button
            className="settings-btn settings-btn-success"
            onClick={uploadToWebDAV}
            style={{ marginLeft: "auto" }}>
            ☁️ {t("backupNow") || "立即上传备份"}
          </button>
        </div>
      </SettingCard>

      {/* 危险操作区 */}
      <SettingCard
        title={t("dangerZone") || "危险区域"}
        description={t("dangerZoneDesc") || "破坏性操作（不可恢复）"}
        className="danger-zone-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--gh-danger, #ef4444)",
              }}>
              {t("clearAllData") || "清除全部数据"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--gh-text-secondary)" }}>
              {t("clearAllDataDesc") || "慎重操作：这将清除本地所有设置、提示词和会话数据"}
            </div>
          </div>
          <button
            className="settings-btn settings-btn-danger"
            onClick={handleClearAll}
            style={{ padding: "8px 16px", fontSize: "13px" }}>
            {t("clearAllData") || "清除全部数据"}
          </button>
        </div>
      </SettingCard>
    </div>
  )
}

export default BackupPage
