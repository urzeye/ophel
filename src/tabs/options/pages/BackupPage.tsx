/**
 * 数据与权限页面
 * 包含：本地备份导出/导入 (支持部分导出) | WebDAV 同步配置与管理 | 权限管理
 */
import React, { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react"

import {
  ClearIcon,
  CloudIcon,
  CloudUploadIcon,
  DeleteIcon,
  EyeClosedIcon,
  EyeIcon,
  FileRestoreIcon,
  ImportIcon,
  InfoIcon,
  JSONFileIcon,
  LinkIcon,
  RefreshIcon,
  SaveIcon,
  TimeIcon,
} from "~components/icons"
import { ConfirmDialog, SelectDropdown, Tooltip } from "~components/ui"
import { BACKUP_TAB_IDS } from "~constants"
import { DEFAULT_FOLDERS, getDefaultPromptChains, getDefaultPrompts } from "~constants/defaults"
import {
  BackupCodecError,
  BOOKMARKS_STORAGE_KEY,
  createBackupDocument,
  createBackupRestorePlan,
  restoreBackupDocument,
  USAGE_MONITOR_STORAGE_KEY,
  type BackupDocument,
  type BackupType,
} from "~core/backup-codec"
import {
  INSTALLED_SITE_PACKS_STORAGE_KEY,
  SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY,
} from "~core/site-pack-storage-constants"
import {
  WEBDAV_PROVIDER_PRESETS,
  detectProviderFromUrl,
  isValidWebDAVProvider,
  getWebDAVSyncManager,
  type BackupFile,
  type WebDAVProvider,
} from "~core/webdav-sync"
import { platform } from "~platform"
import { useBookmarkStore } from "~stores/bookmarks-store"
import { useClaudeSessionKeysStore } from "~stores/claude-sessionkeys-store"
import { useConversationsStore } from "~stores/conversations-store"
import { useFoldersStore } from "~stores/folders-store"
import { usePromptChainsStore } from "~stores/prompt-chains-store"
import { usePromptsStore } from "~stores/prompts-store"
import { useReadingHistoryStore } from "~stores/reading-history-store"
import { useSettingsStore } from "~stores/settings-store"
import { useTagsStore } from "~stores/tags-store"
import { formatDateTime } from "~utils/format"
import { getCurrentLocale, t } from "~utils/i18n"
import {
  MSG_CHECK_PERMISSION,
  MSG_CLEAR_ALL_DATA,
  MSG_REQUEST_PERMISSIONS,
  MSG_RESTORE_DATA,
  sendToBackground,
} from "~utils/messaging"
import { CLEAR_ALL_FLAG_KEY, DEFAULT_SETTINGS, RESTORE_FLAG_KEY } from "~utils/storage"
import { showToast as showDomToast } from "~utils/toast"

import { PageTitle, SettingCard, SettingRow, TabGroup } from "../components"
import PermissionsPage from "./PermissionsPage"

interface BackupPageProps {
  siteId: string
  initialTab?: string
  onNavigate?: (page: string) => void
}

interface WebDAVFormState {
  url: string
  username: string
  password: string
  remoteDir: string
  provider: WebDAVProvider
}

type WebDAVAction = "test" | "upload" | "restore"

// 导入预览按用户能理解的功能归类展示备份内容；存储键与 backup-codec 的用户数据键一一对应
const BACKUP_CONTENT_GROUPS: ReadonlyArray<{ labelKey: string; storageKeys: readonly string[] }> = [
  { labelKey: "backupContentSettings", storageKeys: ["settings"] },
  { labelKey: "backupContentPrompts", storageKeys: ["prompts", "promptChains"] },
  { labelKey: "backupContentConversations", storageKeys: ["conversations", "folders", "tags"] },
  { labelKey: "backupContentReadingHistory", storageKeys: ["readingHistory"] },
  { labelKey: "backupContentBookmarks", storageKeys: [BOOKMARKS_STORAGE_KEY] },
  { labelKey: "backupContentClaudeKeys", storageKeys: ["claudeSessionKeys"] },
  { labelKey: "backupContentUsage", storageKeys: [USAGE_MONITOR_STORAGE_KEY] },
  {
    labelKey: "backupContentSitePacks",
    storageKeys: [INSTALLED_SITE_PACKS_STORAGE_KEY, SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY],
  },
]

type ImportPreview =
  | { status: "empty" }
  | { status: "invalid"; reasonKey: string }
  | { status: "valid"; document: BackupDocument; contentLabelKeys: string[] }

// 与真正恢复走同一套解析与校验（createBackupRestorePlan），预览里看到的就是将被写入的内容
const getImportPreview = (rawText: string): ImportPreview => {
  const text = rawText.trim()
  if (!text) return { status: "empty" }

  try {
    const { document, restoredKeys } = createBackupRestorePlan(JSON.parse(text))
    const contentLabelKeys = BACKUP_CONTENT_GROUPS.filter((group) =>
      group.storageKeys.some((key) => restoredKeys.includes(key)),
    ).map((group) => group.labelKey)
    return { status: "valid", document, contentLabelKeys }
  } catch (error) {
    const reasonKey =
      error instanceof BackupCodecError && error.errorKeys.length > 0
        ? error.errorKeys[0]
        : "backupValidationInvalidFormat"
    return { status: "invalid", reasonKey }
  }
}

const hasDraggedFiles = (event: React.DragEvent): boolean =>
  Array.from(event.dataTransfer.types).includes("Files")

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
  if (type === "full") return t("fullBackup")
  if (type === "prompts") return t("promptsBackup")
  if (type === "settings") return t("settingsBackup")
  return String(type || t("unknown"))
}

const formatBackupTime = (timestamp: string): string =>
  timestamp ? formatDateTime(timestamp, getCurrentLocale()) : "-"

const notifyRestoreContexts = async (): Promise<string[]> => {
  if (platform.type !== "extension" || typeof chrome === "undefined") return []

  await platform.storage.set(RESTORE_FLAG_KEY, Date.now())
  const response = await sendToBackground({ type: MSG_RESTORE_DATA })
  if (!response.success) {
    throw new Error(response.error || "Failed to notify pages after backup restore")
  }
  return response.missingPermissionOrigins ?? []
}

const getRestoreSuccessMessage = (message: string, missingPermissionOrigins: readonly string[]) =>
  missingPermissionOrigins.length > 0
    ? `${message} ${t("sitePacksPermissionReviewTitle")}`
    : message

// ==================== 远程备份列表模态框 ====================
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
      showDomToast(t("loadFailed") + ": " + String(e))
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
      title: t("restore"),
      message: t("backupRestoreConfirmMsg", { name: file.name }),
      danger: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, show: false }))
        try {
          setLoading(true)
          const manager = getWebDAVSyncManager()
          const result = await manager.download(file.name)
          if (result.success) {
            const missingPermissionOrigins = await notifyRestoreContexts()
            showDomToast(getRestoreSuccessMessage(t("restoreSuccess"), missingPermissionOrigins))
            setTimeout(
              () => {
                onRestore()
              },
              missingPermissionOrigins.length > 0 ? 2500 : 1500,
            )
          } else {
            showDomToast(t("restoreError"))
            setLoading(false)
          }
        } catch (e) {
          showDomToast(t("restoreError") + ": " + String(e))
          setLoading(false)
        }
      },
    })
  }

  const handleDeleteClick = (file: BackupFile) => {
    setConfirmConfig({
      show: true,
      title: t("delete"),
      message: t("backupDeleteCloudConfirmMsg", { name: file.name }),
      danger: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, show: false }))
        try {
          setLoading(true)
          const manager = getWebDAVSyncManager()
          const result = await manager.deleteFile(file.name)
          if (result.success) {
            showDomToast(t("deleteSuccess"))
            loadBackups()
          } else {
            showDomToast(t("deleteError"))
            setLoading(false)
          }
        } catch (e) {
          showDomToast(t("deleteError") + ": " + String(e))
          setLoading(false)
        }
      },
    })
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      {confirmConfig.show && (
        <ConfirmDialog
          title={confirmConfig.title}
          message={confirmConfig.message}
          danger={confirmConfig.danger}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig((prev) => ({ ...prev, show: false }))}
        />
      )}

      <div className="settings-backup-remote-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-backup-remote-header">
          <div style={{ fontWeight: 600, fontSize: "16px" }}>{t("webdavBackupList")}</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Tooltip content={t("refresh")}>
              <button
                type="button"
                onClick={loadBackups}
                className="settings-btn settings-btn-secondary settings-icon-only-btn"
                aria-label={t("refresh")}>
                <RefreshIcon size={16} />
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={onClose}
              className="settings-btn settings-btn-secondary settings-icon-only-btn"
              aria-label={t("close")}>
              ✕
            </button>
          </div>
        </div>

        <div className="settings-backup-remote-body">
          {loading ? (
            <div className="settings-empty-state">{t("loading")}</div>
          ) : backups.length === 0 ? (
            <div className="settings-empty-state">{t("noBackupsFound")}</div>
          ) : (
            backups.map((file) => (
              <div key={file.name} className="settings-backup-remote-item">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Tooltip
                    content={file.name}
                    showOnlyWhenTruncated
                    triggerStyle={{ display: "block" }}>
                    <div className="settings-backup-remote-name">{file.name}</div>
                  </Tooltip>
                  <div className="settings-backup-remote-meta">
                    {formatSize(file.size)} • {file.lastModified.toLocaleString()}
                  </div>
                </div>
                <div className="settings-backup-remote-actions">
                  <Tooltip content={t("restore")}>
                    <button
                      onClick={() => handleRestoreClick(file)}
                      aria-label={t("restore")}
                      className="settings-backup-icon-btn primary">
                      <FileRestoreIcon size={16} color="currentColor" />
                    </button>
                  </Tooltip>
                  <Tooltip content={t("delete")}>
                    <button
                      onClick={() => handleDeleteClick(file)}
                      aria-label={t("delete")}
                      className="settings-backup-icon-btn danger">
                      <DeleteIcon size={16} color="currentColor" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ==================== 主页面组件 ====================

// 油猴环境无权限 API：权限 tab 不展示，深链指向它时回退到本地备份
const resolveBackupTab = (tab: string | undefined, permissionsAvailable: boolean): string => {
  if (tab === BACKUP_TAB_IDS.PERMISSIONS && !permissionsAvailable) {
    return BACKUP_TAB_IDS.LOCAL
  }
  return tab || BACKUP_TAB_IDS.LOCAL
}

const BackupPage: React.FC<BackupPageProps> = ({ initialTab, onNavigate: _onNavigate }) => {
  const permissionsAvailable = platform.hasCapability("permissions")
  const [activeTab, setActiveTab] = useState<string>(
    resolveBackupTab(initialTab, permissionsAvailable),
  )
  const { settings, setSettings, resetSettings } = useSettingsStore()

  useEffect(() => {
    if (initialTab) {
      setActiveTab(resolveBackupTab(initialTab, permissionsAvailable))
    }
  }, [initialTab, permissionsAvailable])

  // 状态管理
  const [showRemoteBackups, setShowRemoteBackups] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 导入内容的唯一来源：选择或拖入的文件读成文本后写到这里，「粘贴 JSON」直接编辑它
  const [importText, setImportText] = useState("")
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [isImportDragOver, setIsImportDragOver] = useState(false)
  // 大备份整份解析较重：预览按延后的文本计算，编辑粘贴区时不会逐键卡顿；
  // 预览追上输入之前禁止导入，避免导入的是旧内容
  const deferredImportText = useDeferredValue(importText)
  const importPreview = useMemo(() => getImportPreview(deferredImportText), [deferredImportText])
  const isImportPreviewPending = deferredImportText !== importText

  // WebDAV 本地表单状态（与 Store 解耦，仅点击保存时同步）
  const [webdavForm, setWebdavForm] = useState<WebDAVFormState>({
    url: "",
    username: "",
    password: "",
    remoteDir: "ophel",
    provider: "custom",
  })
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [webdavBusyAction, setWebdavBusyAction] = useState<WebDAVAction | null>(null)
  // 同步锁：按钮禁用状态渲染出来之前的连点也只放行一次
  const webdavBusyRef = useRef(false)
  const webdavFieldId = useId()

  // 初始化表单
  useEffect(() => {
    if (settings?.webdav) {
      const webdav = settings.webdav
      const resolvedProvider: WebDAVProvider = isValidWebDAVProvider(webdav.provider)
        ? webdav.provider
        : webdav.url
          ? detectProviderFromUrl(webdav.url)
          : "custom"
      setWebdavForm((prev) => ({
        ...prev,
        ...webdav,
        provider: resolvedProvider,
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

  const tabs = [
    { id: BACKUP_TAB_IDS.LOCAL, label: t("localBackupTab") },
    { id: BACKUP_TAB_IDS.WEBDAV, label: t("webdavTab") },
    ...(permissionsAvailable
      ? [{ id: BACKUP_TAB_IDS.PERMISSIONS, label: t("navPermissions") }]
      : []),
  ]

  // -------------------- 导出功能 --------------------
  const handleExport = async (type: BackupType) => {
    try {
      const exportData = await createBackupDocument(platform.storage, type)
      const timestamp = exportData.timestamp
      let filename = `ophel-backup-${timestamp.slice(0, 10)}.json`

      if (type === "prompts") {
        filename = `ophel-prompts-${timestamp.slice(0, 10)}.json`
      } else if (type === "settings") {
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
      showDomToast(t("exportSuccess"))
    } catch {
      showDomToast(t("exportError"))
    }
  }

  // -------------------- 导入功能 --------------------
  const loadImportFile = async (file: File) => {
    try {
      const text = await file.text()
      setImportText(text)
      setImportFileName(file.name)
    } catch (error) {
      console.error("[Backup] read import file failed:", error)
      showDomToast(`${t("importError")}${getErrorMessage(error)}`)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) await loadImportFile(file)
  }

  const clearImport = () => {
    setImportText("")
    setImportFileName(null)
  }

  // 拖入文件时拦截默认行为与冒泡：避免浏览器直接打开文件，或宿主页把它当成聊天附件
  const handleImportDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "copy"
    setIsImportDragOver(true)
  }

  const handleImportDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setIsImportDragOver(false)
  }

  const handleImportDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    setIsImportDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file) void loadImportFile(file)
  }

  const handleImportClick = () => {
    if (isImportPreviewPending || importPreview.status !== "valid") return
    const backupDocument = importPreview.document

    setConfirmConfig({
      show: true,
      title: t("importData"),
      message: (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>{t("importConfirm")}</div>
          <div className="settings-backup-confirm-box">
            <div className="settings-backup-confirm-grid">
              <div className="settings-backup-confirm-label">{t("backupTime")}</div>
              <div className="settings-backup-confirm-value">
                {formatBackupTime(backupDocument.timestamp)}
              </div>
              <div className="settings-backup-confirm-label">{t("backupType")}</div>
              <div className="settings-backup-confirm-value">
                {formatBackupTypeLabel(backupDocument.type)}
              </div>
            </div>
          </div>
          <div style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)" }}>
            {t("openAiPagesWillRefresh")}
          </div>
        </div>
      ),
      danger: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, show: false }))
        try {
          await restoreBackupDocument(platform.storage, backupDocument)
          const missingPermissionOrigins = await notifyRestoreContexts()

          showDomToast(getRestoreSuccessMessage(t("importSuccess"), missingPermissionOrigins))
          setTimeout(
            () => window.location.reload(),
            missingPermissionOrigins.length > 0 ? 2500 : 1000,
          )
        } catch (err) {
          console.error("[Backup] import storage write failed:", err)
          showDomToast(`${t("importError")}${getErrorMessage(err)}`)
        }
      },
    })
  }

  const resetLocalStores = () => {
    resetSettings()
    usePromptsStore.getState().setPrompts(getDefaultPrompts())
    usePromptChainsStore.getState().setChains(getDefaultPromptChains())
    useFoldersStore.setState({ folders: DEFAULT_FOLDERS })
    useTagsStore.setState({ tags: [] })
    useConversationsStore.setState({ conversations: {}, lastUsedFolderId: "inbox" })
    useReadingHistoryStore.setState({ history: {}, lastCleanupRun: 0 })
    useBookmarkStore.getState().clearAllBookmarks()
    useClaudeSessionKeysStore.setState({ keys: [], currentKeyId: "" })
  }

  // 清除数据
  const handleClearAll = () => {
    setConfirmConfig({
      show: true,
      title: t("clearAllData"),
      message: t("clearAllDataConfirm"),
      danger: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, show: false }))
        try {
          if (platform.type === "extension" && typeof chrome !== "undefined") {
            const response = await sendToBackground({ type: MSG_CLEAR_ALL_DATA })
            if (!response.success) {
              throw new Error(response.error || "Failed to clean up SitePack runtime data")
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
          await platform.storage.set(CLEAR_ALL_FLAG_KEY, Date.now())
          resetLocalStores()
          showDomToast(t("clearSuccess"))
          setTimeout(() => window.location.reload(), 1500)
        } catch (err) {
          showDomToast(t("error") + ": " + String(err))
        }
      },
    })
  }

  // -------------------- WebDAV 功能 --------------------
  const waitForWebDAVPermission = async (origin: string): Promise<boolean> => {
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      try {
        const checkResult: { success?: boolean; hasPermission?: boolean } =
          await chrome.runtime.sendMessage({
            type: MSG_CHECK_PERMISSION,
            origin,
          })
        if (checkResult.success && checkResult.hasPermission) return true
      } catch {
        // sendMessage may fail transiently; continue polling
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    return false
  }

  // 扩展端未授予目标地址的访问权限时需要先申请；油猴端或地址无法解析时直接执行，由请求本身给出错误
  const needsWebDAVPermissionRequest = async (url: string): Promise<boolean> => {
    if (!platform.hasCapability("permissions")) return false
    try {
      const origin = `${new URL(url).origin}/*`
      const checkResult: { hasPermission?: boolean } = await chrome.runtime.sendMessage({
        type: MSG_CHECK_PERMISSION,
        origin,
      })
      return !checkResult.hasPermission
    } catch (error) {
      console.warn("[Backup] WebDAV permission check skipped:", error)
      return false
    }
  }

  const requestWebDAVPermission = async (): Promise<boolean> => {
    try {
      const requestResult: { success?: boolean; error?: string } = await chrome.runtime.sendMessage(
        {
          type: MSG_REQUEST_PERMISSIONS,
          permType: "allUrls",
        },
      )
      if (!requestResult.success) {
        showDomToast(requestResult.error || t("permissionRequired"))
        return false
      }

      const granted = await waitForWebDAVPermission("<all_urls>")
      if (!granted) showDomToast(t("permissionRequired"))
      return granted
    } catch (error) {
      console.warn("WebDAV permission request failed:", error)
      showDomToast(t("permissionRequired"))
      return false
    }
  }

  // 执行期间锁定测试连接 / 恢复 / 立即备份三个按钮，并在当前按钮上显示进行中状态
  const withWebDAVBusy = async (action: WebDAVAction, run: () => Promise<void>) => {
    if (webdavBusyRef.current) return
    webdavBusyRef.current = true
    setWebdavBusyAction(action)
    try {
      await run()
    } catch (error) {
      console.error(`[Backup] WebDAV ${action} failed:`, error)
      showDomToast(`${t("error")}: ${getErrorMessage(error)}`)
    } finally {
      webdavBusyRef.current = false
      setWebdavBusyAction(null)
    }
  }

  // 三个 WebDAV 操作的共用入口：缺少访问权限时先弹确认，用户确认后申请权限再继续执行
  const runWebDAVAction = (action: WebDAVAction, task: () => Promise<void>) => {
    if (!webdavForm.url) {
      showDomToast(t("webdavConfigIncomplete"))
      return
    }

    void withWebDAVBusy(action, async () => {
      if (!(await needsWebDAVPermissionRequest(webdavForm.url))) {
        await task()
        return
      }

      setPermissionConfirm({
        show: true,
        onConfirm: () => {
          setPermissionConfirm((prev) => ({ ...prev, show: false }))
          void withWebDAVBusy(action, async () => {
            if (await requestWebDAVPermission()) await task()
          })
        },
      })
    })
  }

  const handleSaveConfig = () => {
    const baseWebdav = settings.webdav ?? DEFAULT_SETTINGS.webdav
    setSettings({
      webdav: {
        ...baseWebdav,
        ...webdavForm,
      },
    })
    showDomToast(t("saveSuccess"))
  }

  const handleTestConnection = () =>
    runWebDAVAction("test", async () => {
      const manager = getWebDAVSyncManager()
      await manager.setConfig(webdavForm, false)

      const res = await manager.testConnection()
      showDomToast(t(res.success ? "webdavConnectionSuccess" : "webdavConnectionFailed"))
    })

  const handleUpload = () =>
    runWebDAVAction("upload", async () => {
      const manager = getWebDAVSyncManager()
      await manager.setConfig(webdavForm, false)

      const res = await manager.upload()
      showDomToast(t(res.success ? "webdavUploadSuccess" : "webdavUploadFailed"))
    })

  const handleOpenRestore = () =>
    runWebDAVAction("restore", async () => {
      const manager = getWebDAVSyncManager()
      await manager.setConfig(webdavForm, false)
      setShowRemoteBackups(true)
    })

  const isWebDAVUnsaved = (() => {
    const base = settings.webdav ?? DEFAULT_SETTINGS.webdav
    const normalizedBaseProvider =
      base.provider ?? (base.url ? detectProviderFromUrl(base.url) : "custom")
    return (
      webdavForm.url !== base.url ||
      webdavForm.username !== base.username ||
      webdavForm.password !== base.password ||
      webdavForm.remoteDir !== base.remoteDir ||
      webdavForm.provider !== normalizedBaseProvider
    )
  })()

  const isWebDAVBusy = webdavBusyAction !== null
  const currentProvider = webdavForm.provider || "custom"
  const providerPreset = WEBDAV_PROVIDER_PRESETS.find((preset) => preset.id === currentProvider)
  const providerOptions = WEBDAV_PROVIDER_PRESETS.map((preset) => ({
    value: preset.id,
    label: t(preset.labelKey),
  }))
  const lastSyncTime = settings.webdav?.lastSyncTime

  const handleProviderChange = (value: string) => {
    const provider = value as WebDAVProvider
    const preset = WEBDAV_PROVIDER_PRESETS.find((p) => p.id === provider)
    setWebdavForm((prev) => ({
      ...prev,
      provider,
      ...(preset?.urlTemplate ? { url: preset.urlTemplate } : {}),
    }))
  }

  const renderBusyIcon = (action: WebDAVAction, icon: React.ReactNode) =>
    webdavBusyAction === action ? <RefreshIcon size={16} className="settings-spin" /> : icon

  return (
    <div>
      <PageTitle title={t("navBackup")} Icon={CloudIcon} />
      <p className="settings-page-desc">{t("backupPageDesc")}</p>

      {/* 标签组（粘性吸顶） */}
      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

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
          title={t("permissionRequired")}
          message={t("webdavPermissionDesc")}
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

      {/* 本地备份 Tab */}
      {activeTab === BACKUP_TAB_IDS.LOCAL && (
        <>
          <div className="settings-backup-grid">
            {/* 导出：完整备份是推荐路径，只有它用主按钮 */}
            <SettingCard
              title={t("exportData")}
              description={t("exportDataDesc")}
              settingId="backup-export-card">
              <SettingRow
                label={
                  <span className="settings-row-label-with-badge">
                    <span>{t("fullBackup")}</span>
                    <span className="settings-beta-badge">{t("recommendedBadge")}</span>
                  </span>
                }
                description={t("fullBackupDesc")}>
                <button
                  type="button"
                  onClick={() => handleExport("full")}
                  className="settings-btn settings-btn-primary">
                  {t("export")}
                </button>
              </SettingRow>
              <SettingRow label={t("promptsBackup")} description={t("promptsBackupDesc")}>
                <button
                  type="button"
                  onClick={() => handleExport("prompts")}
                  className="settings-btn settings-btn-secondary">
                  {t("export")}
                </button>
              </SettingRow>
              <SettingRow label={t("settingsBackup")} description={t("settingsBackupDesc")}>
                <button
                  type="button"
                  onClick={() => handleExport("settings")}
                  className="settings-btn settings-btn-secondary">
                  {t("export")}
                </button>
              </SettingRow>
            </SettingCard>

            {/* 导入：先选择或拖入文件，解析出摘要后再导入；粘贴 JSON 作为次要入口 */}
            <SettingCard
              title={t("importData")}
              description={t("importDataDesc")}
              settingId="backup-import-card">
              <div
                className={`settings-backup-import${isImportDragOver ? " is-drag-over" : ""}`}
                onDragEnter={handleImportDragOver}
                onDragOver={handleImportDragOver}
                onDragLeave={handleImportDragLeave}
                onDrop={handleImportDrop}>
                {importPreview.status === "empty" ? (
                  <button
                    type="button"
                    className="settings-backup-dropzone"
                    onClick={() => fileInputRef.current?.click()}>
                    <ImportIcon size={22} />
                    <span className="settings-backup-dropzone-title">
                      {t("backupDropZoneTitle")}
                    </span>
                    <span className="settings-backup-dropzone-hint">{t("backupDropZoneHint")}</span>
                  </button>
                ) : (
                  <div
                    className={`settings-backup-preview${
                      importPreview.status === "invalid" ? " is-invalid" : ""
                    }`}>
                    <div className="settings-backup-preview-head">
                      <JSONFileIcon size={18} />
                      <span className="settings-backup-preview-name">
                        {importFileName ?? t("backupPastedSource")}
                      </span>
                      <Tooltip content={t("clear")}>
                        <button
                          type="button"
                          className="settings-backup-preview-clear"
                          aria-label={t("clear")}
                          onClick={clearImport}>
                          <ClearIcon size={14} />
                        </button>
                      </Tooltip>
                    </div>
                    {importPreview.status === "valid" ? (
                      <dl className="settings-backup-preview-meta">
                        <dt>{t("backupType")}</dt>
                        <dd>{formatBackupTypeLabel(importPreview.document.type)}</dd>
                        <dt>{t("backupTime")}</dt>
                        <dd>{formatBackupTime(importPreview.document.timestamp)}</dd>
                        <dt>{t("backupSummaryContents")}</dt>
                        <dd className="settings-backup-preview-tags">
                          {importPreview.contentLabelKeys.length > 0
                            ? importPreview.contentLabelKeys.map((labelKey) => (
                                <span key={labelKey} className="settings-backup-preview-tag">
                                  {t(labelKey)}
                                </span>
                              ))
                            : "-"}
                        </dd>
                      </dl>
                    ) : (
                      <div className="settings-backup-preview-error" role="alert">
                        <strong>{t("invalidBackupFile")}</strong>
                        <span>{t(importPreview.reasonKey)}</span>
                      </div>
                    )}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={handleFileChange}
                />
              </div>

              <details className="settings-backup-paste">
                <summary>{t("backupPasteJson")}</summary>
                <textarea
                  className="settings-input settings-backup-paste-textarea"
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value)
                    setImportFileName(null)
                  }}
                  placeholder={t("pastePlaceholder")}
                  spellCheck={false}
                />
              </details>

              <div className="settings-backup-import-actions">
                <button
                  type="button"
                  onClick={handleImportClick}
                  className="settings-btn settings-btn-primary"
                  disabled={isImportPreviewPending || importPreview.status !== "valid"}>
                  {t("importBtn")}
                </button>
              </div>
            </SettingCard>
          </div>

          {/* 危险操作区：一句说明 + 描边危险按钮 */}
          <SettingCard
            title={t("dangerZone")}
            className="settings-backup-danger-card"
            settingId="backup-reset-card">
            <div className="settings-backup-danger-row">
              <p className="settings-backup-danger-text">{t("clearAllDataDesc")}</p>
              <button
                type="button"
                className="settings-btn settings-btn-danger"
                onClick={handleClearAll}>
                {t("clearAllData")}
              </button>
            </div>
          </SettingCard>
        </>
      )}

      {/* WebDAV 云同步 Tab */}
      {activeTab === BACKUP_TAB_IDS.WEBDAV && (
        <SettingCard
          title={t("webdavConfig")}
          description={t("webdavConfigDesc")}
          settingId="backup-webdav-card">
          {/* 提示信息 */}
          <div className="settings-backup-tip">
            <div className="settings-backup-tip-title">
              <InfoIcon size={14} color="var(--gh-primary, #4285f4)" /> {t("restoreTip")}
            </div>
            <div className="settings-backup-tip-content">{t("restoreTipContent")}</div>
          </div>

          {/* 上下排列的表单：地址独占一行，用户名与密码并排 */}
          <div className="settings-backup-form">
            <div className="settings-backup-field" data-setting-id="backup-webdav-provider">
              <span className="settings-backup-field-label">{t("webdavProvider")}</span>
              <SelectDropdown
                className="settings-select-dropdown"
                buttonClassName="settings-select"
                options={providerOptions}
                value={currentProvider}
                ariaLabel={t("webdavProvider")}
                onChange={handleProviderChange}
              />
            </div>

            {/* 服务商专属提示 */}
            {providerPreset?.hintKey && (
              <div className="settings-backup-provider-hint">
                <InfoIcon size={14} />
                <div>
                  {t(providerPreset.hintKey)}
                  {providerPreset.helpUrl && (
                    <a href={providerPreset.helpUrl} target="_blank" rel="noreferrer noopener">
                      {t("learnMore")}
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="settings-backup-field is-wide" data-setting-id="backup-webdav-url">
              <label className="settings-backup-field-label" htmlFor={`${webdavFieldId}-url`}>
                {t("webdavAddress")}
              </label>
              <input
                id={`${webdavFieldId}-url`}
                type="text"
                inputMode="url"
                spellCheck={false}
                className="settings-input"
                placeholder={providerPreset?.urlPlaceholder || "https://dav.example.com/dav/"}
                value={webdavForm.url}
                onChange={(e) => setWebdavForm({ ...webdavForm, url: e.target.value })}
              />
            </div>

            <div className="settings-backup-field" data-setting-id="backup-webdav-username">
              <label className="settings-backup-field-label" htmlFor={`${webdavFieldId}-username`}>
                {t("username")}
              </label>
              <input
                id={`${webdavFieldId}-username`}
                type="text"
                spellCheck={false}
                className="settings-input"
                value={webdavForm.username}
                onChange={(e) => setWebdavForm({ ...webdavForm, username: e.target.value })}
              />
            </div>

            <div className="settings-backup-field" data-setting-id="backup-webdav-password">
              <label className="settings-backup-field-label" htmlFor={`${webdavFieldId}-password`}>
                {t("password")}
              </label>
              <div className="settings-backup-password">
                <input
                  id={`${webdavFieldId}-password`}
                  type={isPasswordVisible ? "text" : "password"}
                  className="settings-input"
                  placeholder={
                    providerPreset?.passwordPlaceholderKey
                      ? t(providerPreset.passwordPlaceholderKey)
                      : t("webdavPasswordPlaceholder")
                  }
                  value={webdavForm.password}
                  onChange={(e) => setWebdavForm({ ...webdavForm, password: e.target.value })}
                />
                <Tooltip
                  content={isPasswordVisible ? t("hidePassword") : t("showPassword")}
                  triggerClassName="settings-backup-password-toggle-wrap">
                  <button
                    type="button"
                    className="settings-backup-password-toggle"
                    aria-label={isPasswordVisible ? t("hidePassword") : t("showPassword")}
                    aria-pressed={isPasswordVisible}
                    onClick={() => setIsPasswordVisible((visible) => !visible)}>
                    {isPasswordVisible ? <EyeClosedIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className="settings-backup-field" data-setting-id="backup-webdav-dir">
              <label className="settings-backup-field-label" htmlFor={`${webdavFieldId}-dir`}>
                {t("defaultDir")}
              </label>
              <input
                id={`${webdavFieldId}-dir`}
                type="text"
                spellCheck={false}
                className="settings-input"
                placeholder="ophel"
                value={webdavForm.remoteDir}
                onChange={(e) => setWebdavForm({ ...webdavForm, remoteDir: e.target.value })}
              />
              <span className="settings-backup-field-hint">{t("defaultDirHint")}</span>
            </div>
          </div>

          <div className="settings-backup-sync-status">
            <TimeIcon size={14} />
            <span>
              {lastSyncTime
                ? t("webdavLastSync", { time: formatDateTime(lastSyncTime, getCurrentLocale()) })
                : t("webdavNeverSynced")}
            </span>
          </div>

          {/* 操作按钮行 */}
          <div className="settings-backup-actions-row">
            {/* 左侧：测试连接 + 保存配置 */}
            <div className="settings-backup-actions-group">
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                disabled={isWebDAVBusy}
                onClick={handleTestConnection}>
                {renderBusyIcon("test", <LinkIcon size={16} />)}
                {webdavBusyAction === "test" ? t("webdavTesting") : t("webdavTestBtn")}
              </button>
              <div className="settings-backup-save">
                <button
                  type="button"
                  className={`settings-btn ${isWebDAVUnsaved ? "settings-btn-primary" : "settings-btn-secondary"}`}
                  onClick={handleSaveConfig}>
                  <SaveIcon size={16} /> {t("saveConfig")}
                </button>
                {isWebDAVUnsaved && <span className="settings-backup-unsaved-dot" />}
              </div>
            </div>
            {/* 右侧：恢复 + 立即备份 */}
            <div className="settings-backup-actions-group">
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                disabled={isWebDAVBusy}
                onClick={handleOpenRestore}>
                {renderBusyIcon("restore", <FileRestoreIcon size={16} color="currentColor" />)}
                {t("restore")}
              </button>
              <button
                type="button"
                className={`settings-btn ${!isWebDAVUnsaved ? "settings-btn-primary" : "settings-btn-secondary"}`}
                disabled={isWebDAVBusy}
                onClick={handleUpload}>
                {renderBusyIcon("upload", <CloudUploadIcon size={16} color="currentColor" />)}
                {webdavBusyAction === "upload" ? t("webdavUploading") : t("backupNow")}
              </button>
            </div>
          </div>
        </SettingCard>
      )}

      {/* 权限管理 Tab */}
      {activeTab === BACKUP_TAB_IDS.PERMISSIONS && permissionsAvailable && <PermissionsPage />}
    </div>
  )
}

export default BackupPage
