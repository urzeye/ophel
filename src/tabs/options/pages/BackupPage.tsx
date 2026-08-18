/**
 * 备份与同步页面
 * 包含：本地备份导出/导入 (支持部分导出) | WebDAV 同步配置与管理
 */
import React, { useEffect, useRef, useState } from "react"

import {
  CloudIcon,
  SaveIcon,
  LinkIcon,
  CloudUploadIcon,
  FileRestoreIcon,
  DeleteIcon,
  RefreshIcon,
  InfoIcon,
} from "~components/icons"
import { ConfirmDialog, Tooltip } from "~components/ui"
import { BACKUP_TAB_IDS } from "~constants"
import { DEFAULT_FOLDERS, getDefaultPromptChains, getDefaultPrompts } from "~constants/defaults"
import {
  createBackupDocument,
  normalizeBackupDocument,
  restoreBackupDocument,
  type BackupType,
} from "~core/backup-codec"
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
import { validateBackupData } from "~utils/backup-validator"
import { t } from "~utils/i18n"
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
                  <div className="settings-backup-remote-name" title={file.name}>
                    {file.name}
                  </div>
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
const BackupPage: React.FC<BackupPageProps> = ({ initialTab, onNavigate: _onNavigate }) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab || BACKUP_TAB_IDS.LOCAL)
  const { settings, setSettings, resetSettings } = useSettingsStore()

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  // 状态管理
  const [showRemoteBackups, setShowRemoteBackups] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pasteContent, setPasteContent] = useState("")

  // WebDAV 本地表单状态（与 Store 解耦，仅点击保存时同步）
  const [webdavForm, setWebdavForm] = useState<WebDAVFormState>({
    url: "",
    username: "",
    password: "",
    remoteDir: "ophel",
    provider: "custom",
  })

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
  const processImport = async (jsonString: string) => {
    try {
      const parsedData = JSON.parse(jsonString)

      // 数据格式验证
      const validation = validateBackupData(parsedData)
      if (!validation.valid) {
        console.error("Backup validation failed:", validation.errorKeys)
        showDomToast(t("invalidBackupFile"))
        return
      }
      const data = normalizeBackupDocument(parsedData)

      setConfirmConfig({
        show: true,
        title: t("importData"),
        message: (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>{t("importConfirm")}</div>
            <div className="settings-backup-confirm-box">
              <div className="settings-backup-confirm-grid">
                <div className="settings-backup-confirm-label">{t("backupTime")}</div>
                <div className="settings-backup-confirm-value">{String(data.timestamp || "-")}</div>
                <div className="settings-backup-confirm-label">{t("backupType")}</div>
                <div className="settings-backup-confirm-value">
                  {formatBackupTypeLabel(data.type)}
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
            await restoreBackupDocument(platform.storage, data)
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
    } catch (e) {
      console.error("[Backup] import parse failed:", e)
      showDomToast(`${t("importError")}${getErrorMessage(e)}`)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setPasteContent(text)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleImportClick = () => {
    if (!pasteContent.trim()) {
      showDomToast(t("selectFileOrPasteFirst"))
      return
    }
    processImport(pasteContent)
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

  const checkAndRequestWebDAVPermission = async (
    onGranted: () => void | Promise<void>,
  ): Promise<boolean> => {
    const url = webdavForm.url
    if (!url) {
      showDomToast(t("webdavConfigIncomplete"))
      return false
    }

    if (!platform.hasCapability("permissions")) {
      await onGranted()
      return true
    }

    try {
      const urlObj = new URL(url)
      const origin = urlObj.origin + "/*"
      const checkResult: { hasPermission?: boolean } = await chrome.runtime.sendMessage({
        type: MSG_CHECK_PERMISSION,
        origin,
      })
      if (!checkResult.hasPermission) {
        setPermissionConfirm({
          show: true,
          onConfirm: async () => {
            setPermissionConfirm((prev) => ({ ...prev, show: false }))
            try {
              const requestResult: { success?: boolean; error?: string } =
                await chrome.runtime.sendMessage({
                  type: MSG_REQUEST_PERMISSIONS,
                  permType: "allUrls",
                })
              if (!requestResult.success) {
                showDomToast(requestResult.error || t("permissionRequired"))
                return
              }

              const granted = await waitForWebDAVPermission("<all_urls>")
              if (!granted) {
                showDomToast(t("permissionRequired"))
                return
              }

              await onGranted()
            } catch (error) {
              console.warn("WebDAV permission request failed:", error)
              showDomToast(t("permissionRequired"))
            }
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
    const baseWebdav = settings.webdav ?? DEFAULT_SETTINGS.webdav
    setSettings({
      webdav: {
        ...baseWebdav,
        ...webdavForm,
      },
    })
    showDomToast(t("saveSuccess"))
  }

  const testWebDAVConnection = async () => {
    await checkAndRequestWebDAVPermission(async () => {
      const manager = getWebDAVSyncManager()
      await manager.setConfig(webdavForm, false)

      const res = await manager.testConnection()
      if (res.success) showDomToast(t("webdavConnectionSuccess"))
      else showDomToast(t("webdavConnectionFailed"))
    })
  }

  const uploadToWebDAV = async () => {
    await checkAndRequestWebDAVPermission(async () => {
      const manager = getWebDAVSyncManager()
      await manager.setConfig(webdavForm, false)

      const res = await manager.upload()
      if (res.success) showDomToast(t("webdavUploadSuccess"))
      else showDomToast(t("webdavUploadFailed"))
    })
  }

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
            {/* 导出 */}
            <SettingCard title={t("exportData")} description={t("exportDataDesc")}>
              <div className="settings-backup-export-list">
                {/* 完整备份 */}
                <div className="settings-backup-export-item">
                  <div className="settings-backup-export-info">
                    <div className="settings-backup-export-title">{t("fullBackup")}</div>
                    <div className="settings-backup-export-desc">{t("fullBackupDesc")}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport("full")}
                    className="settings-btn settings-btn-success">
                    {t("export")}
                  </button>
                </div>

                {/* 提示词备份 */}
                <div className="settings-backup-export-item">
                  <div className="settings-backup-export-info">
                    <div className="settings-backup-export-title">{t("promptsBackup")}</div>
                    <div className="settings-backup-export-desc">{t("promptsBackupDesc")}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport("prompts")}
                    className="settings-btn settings-btn-primary">
                    {t("export")}
                  </button>
                </div>

                {/* 设置备份 */}
                <div className="settings-backup-export-item">
                  <div className="settings-backup-export-info">
                    <div className="settings-backup-export-title">{t("settingsBackup")}</div>
                    <div className="settings-backup-export-desc">{t("settingsBackupDesc")}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport("settings")}
                    className="settings-btn settings-btn-secondary">
                    {t("export")}
                  </button>
                </div>
              </div>
            </SettingCard>

            {/* 导入 */}
            <SettingCard title={t("importData")} description={t("importDataDesc")}>
              <div className="settings-backup-import-box">
                {/* 文件选择 */}
                <div className="settings-backup-file-row">
                  <div className="settings-backup-file-label">{t("selectFile")}</div>
                  <button
                    type="button"
                    className="settings-btn settings-btn-secondary"
                    onClick={() => fileInputRef.current?.click()}>
                    {t("browse")}
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
                <div className="settings-backup-preview-container">
                  <div className="settings-backup-preview-label">{t("dataPreview")}</div>
                  <textarea
                    className="settings-input settings-backup-preview-textarea"
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder={t("pastePlaceholder")}
                  />
                </div>

                {/* 导入按钮 */}
                <button
                  type="button"
                  onClick={handleImportClick}
                  className="settings-btn settings-btn-primary settings-backup-import-btn"
                  disabled={!pasteContent.trim()}>
                  {t("importBtn")}
                </button>
              </div>
            </SettingCard>
          </div>

          {/* 危险操作区 */}
          <SettingCard
            title={t("dangerZone")}
            description={t("dangerZoneDesc")}
            className="settings-backup-danger-card">
            <div className="settings-backup-danger-row">
              <div>
                <div className="settings-backup-danger-title">{t("clearAllData")}</div>
                <div className="settings-backup-danger-desc">{t("clearAllDataDesc")}</div>
              </div>
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
        <SettingCard title={t("webdavConfig")} description={t("webdavConfigDesc")}>
          {/* 提示信息 */}
          <div className="settings-backup-tip">
            <div className="settings-backup-tip-title">
              <InfoIcon size={14} color="var(--gh-primary, #4285f4)" /> {t("restoreTip")}
            </div>
            <div className="settings-backup-tip-content">{t("restoreTipContent")}</div>
          </div>

          <SettingRow label={t("webdavProvider")}>
            <select
              className="settings-input settings-select"
              value={webdavForm.provider || "custom"}
              onChange={(e) => {
                const provider = e.target.value as WebDAVProvider
                const preset = WEBDAV_PROVIDER_PRESETS.find((p) => p.id === provider)
                setWebdavForm((prev) => ({
                  ...prev,
                  provider,
                  ...(preset?.urlTemplate ? { url: preset.urlTemplate } : {}),
                }))
              }}
              style={{ width: "280px" }}>
              {WEBDAV_PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.labelKey)}
                </option>
              ))}
            </select>
          </SettingRow>

          {/* 服务商专属提示 */}
          {(() => {
            const preset = WEBDAV_PROVIDER_PRESETS.find(
              (p) => p.id === (webdavForm.provider || "custom"),
            )
            if (!preset?.hintKey) return null
            return (
              <div className="settings-backup-provider-hint">
                <InfoIcon
                  size={14}
                  color="var(--gh-primary, #4285f4)"
                  style={{ flexShrink: 0, marginTop: "1px" }}
                />
                <div>
                  {t(preset.hintKey)}
                  {preset.helpUrl && (
                    <a href={preset.helpUrl} target="_blank" rel="noreferrer noopener">
                      {t("learnMore")}
                    </a>
                  )}
                </div>
              </div>
            )
          })()}

          <SettingRow label={t("webdavAddress")}>
            {(() => {
              const preset = WEBDAV_PROVIDER_PRESETS.find(
                (p) => p.id === (webdavForm.provider || "custom"),
              )
              const placeholder = preset?.urlPlaceholder || "https://dav.example.com/dav/"
              return (
                <input
                  type="text"
                  className="settings-input"
                  placeholder={placeholder}
                  value={webdavForm.url}
                  onChange={(e) => setWebdavForm({ ...webdavForm, url: e.target.value })}
                  style={{ width: "280px" }}
                />
              )
            })()}
          </SettingRow>

          <SettingRow label={t("username")}>
            <input
              type="text"
              className="settings-input"
              value={webdavForm.username}
              onChange={(e) => setWebdavForm({ ...webdavForm, username: e.target.value })}
              style={{ width: "280px" }}
            />
          </SettingRow>

          <SettingRow label={t("password")}>
            {(() => {
              const preset = WEBDAV_PROVIDER_PRESETS.find(
                (p) => p.id === (webdavForm.provider || "custom"),
              )
              const pwdPlaceholder = preset?.passwordPlaceholderKey
                ? t(preset.passwordPlaceholderKey)
                : t("webdavPasswordPlaceholder")
              return (
                <input
                  type="password"
                  className="settings-input"
                  placeholder={pwdPlaceholder}
                  value={webdavForm.password}
                  onChange={(e) => setWebdavForm({ ...webdavForm, password: e.target.value })}
                  style={{ width: "280px" }}
                />
              )
            })()}
          </SettingRow>

          <SettingRow label={t("defaultDir")} description={t("defaultDirHint")}>
            <input
              type="text"
              className="settings-input"
              placeholder="ophel"
              value={webdavForm.remoteDir}
              onChange={(e) => setWebdavForm({ ...webdavForm, remoteDir: e.target.value })}
              style={{ width: "280px" }}
            />
          </SettingRow>

          {/* 操作按钮行 */}
          <div className="settings-backup-actions-row">
            {/* 左侧：测试连接 + 保存配置 */}
            <div className="settings-backup-actions-group">
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={testWebDAVConnection}>
                <LinkIcon size={16} /> {t("webdavTestBtn")}
              </button>
              <div style={{ position: "relative" }}>
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
                onClick={async () => {
                  await checkAndRequestWebDAVPermission(async () => {
                    const manager = getWebDAVSyncManager()
                    await manager.setConfig(webdavForm, false)
                    setShowRemoteBackups(true)
                  })
                }}>
                <FileRestoreIcon size={16} color="currentColor" /> {t("restore")}
              </button>
              <button
                type="button"
                className={`settings-btn ${!isWebDAVUnsaved ? "settings-btn-primary" : "settings-btn-secondary"}`}
                onClick={uploadToWebDAV}>
                <CloudUploadIcon size={16} color="currentColor" /> {t("backupNow")}
              </button>
            </div>
          </div>
        </SettingCard>
      )}
    </div>
  )
}

export default BackupPage
