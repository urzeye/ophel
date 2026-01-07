/**
 * 备份与同步页面
 * 包含：本地备份 | WebDAV 同步
 */
import React, { useRef, useState } from "react"

import { ConfirmDialog } from "~components/ui"
import { MULTI_PROP_STORES, ZUSTAND_KEYS } from "~constants/defaults"
import { getWebDAVSyncManager, type BackupFile } from "~core/webdav-sync"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { DEFAULT_SETTINGS } from "~utils/storage"
import { showToast as showDomToast } from "~utils/toast"

import { SettingCard, SettingRow, TabGroup } from "../components"

interface BackupPageProps {
  siteId: string
}

// 远程备份列表模态框
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
      title: "恢复备份",
      message: `确定要恢复备份 "${file.name}" 吗？当前数据将被覆盖。`,
      danger: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, show: false }))
        try {
          setLoading(true)
          const manager = getWebDAVSyncManager()
          const result = await manager.download(file.name)
          if (result.success) {
            showDomToast("恢复成功，即将刷新页面...")
            setTimeout(() => {
              onRestore()
            }, 1500)
          } else {
            showDomToast("恢复失败: " + result.messageKey)
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
      title: "删除备份",
      message: `确定要删除云端备份 "${file.name}" 吗？此操作不可逆。`,
      danger: true,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, show: false }))
        try {
          setLoading(true)
          const manager = getWebDAVSyncManager()
          const result = await manager.deleteFile(file.name)
          if (result.success) {
            showDomToast("删除成功")
            await loadBackups()
          } else {
            showDomToast("删除失败: " + result.messageKey)
            setLoading(false)
          }
        } catch (e) {
          showDomToast("删除失败: " + String(e))
          setLoading(false)
        }
      },
    })
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    const k = bytes / 1024
    if (k < 1024) return k.toFixed(1) + " KB"
    return (k / 1024).toFixed(1) + " MB"
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
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
        style={{
          background: "var(--gh-bg, white)",
          borderRadius: "12px",
          width: "500px",
          maxWidth: "90%",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}>
        {/* 头部 */}
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid var(--gh-border, #e5e7eb)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
            {t("webdavBackupList") || "WebDAV 备份列表"}
          </h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={loadBackups}
              className="settings-btn settings-btn-secondary"
              style={{ padding: "6px 12px" }}>
              🔄
            </button>
            <button
              onClick={onClose}
              className="settings-btn settings-btn-secondary"
              style={{ padding: "6px 12px" }}>
              ✕
            </button>
          </div>
        </div>

        {/* 内容 */}
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

const BackupPage: React.FC<BackupPageProps> = ({ siteId }) => {
  const [activeTab, setActiveTab] = useState("local")
  const { settings, setSettings } = useSettingsStore()
  const [showRemoteBackups, setShowRemoteBackups] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  if (!settings) return null

  const tabs = [
    { id: "local", label: t("localBackupTab") || "本地备份" },
    { id: "webdav", label: t("webdavTab") || "WebDAV 同步" },
  ]

  // 导出数据
  const handleExport = async () => {
    try {
      const localData = await new Promise<Record<string, any>>((resolve) =>
        chrome.storage.local.get(null, resolve),
      )

      const hydratedData = Object.fromEntries(
        Object.entries(localData).map(([k, v]) => {
          try {
            let parsed = typeof v === "string" ? JSON.parse(v) : v
            if (ZUSTAND_KEYS.includes(k) && parsed?.state) {
              if (parsed.state[k] !== undefined) {
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

      const exportData = {
        version: 3,
        timestamp: new Date().toISOString(),
        data: hydratedData,
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `ophel-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      showDomToast(t("exportSuccess") || "导出成功！")
    } catch (err) {
      showDomToast(t("exportError") || "导出失败：" + String(err))
    }
  }

  // 导入数据
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.version || !data.data) {
        showDomToast(t("invalidBackupFile") || "无效的格式")
        return
      }

      setConfirmConfig({
        show: true,
        title: t("importBackupFile") || "导入备份",
        message: `${t("importConfirm") || "确定导入？"}\n${t("backupTime") || "备份时间"}: ${data.timestamp}`,
        danger: true,
        onConfirm: async () => {
          setConfirmConfig((prev) => ({ ...prev, show: false }))
          try {
            const dehydratedData = Object.fromEntries(
              Object.entries(data.data).map(([k, v]) => {
                if (v === null || v === undefined) {
                  return [k, v]
                }

                if (ZUSTAND_KEYS.includes(k)) {
                  let state: Record<string, any>
                  if (MULTI_PROP_STORES.includes(k)) {
                    if (
                      typeof v === "object" &&
                      !Array.isArray(v) &&
                      Object.keys(v as object).length > 1
                    ) {
                      state = v as Record<string, any>
                    } else {
                      state = { [k]: v }
                    }
                  } else {
                    state = { [k]: v }
                  }
                  return [k, JSON.stringify({ state, version: 0 })]
                }

                if (typeof v === "object") {
                  return [k, JSON.stringify(v)]
                }
                return [k, v]
              }),
            )

            await new Promise<void>((resolve, reject) =>
              chrome.storage.local.set(dehydratedData, () =>
                chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
              ),
            )
            showDomToast(t("importSuccess") || "导入成功")
            setTimeout(() => window.location.reload(), 1000)
          } catch (err) {
            showDomToast(t("importError") || "导入失败：" + String(err))
          }
        },
      })
    } catch (err) {
      showDomToast(t("importError") || "导入失败：" + String(err))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
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
          showDomToast(t("allDataCleared") || "所有数据已清除，即将刷新页面...")
          setTimeout(() => window.location.reload(), 1000)
        } catch (err) {
          showDomToast(t("clearError") || "清除失败：" + String(err))
        }
      },
    })
  }

  // WebDAV 测试连接
  const testWebDAVConnection = async () => {
    const url = settings.webdav?.url
    if (!url) {
      showDomToast(t("webdavConfigIncomplete") || "请填写完整的 WebDAV 配置")
      return
    }

    try {
      const urlObj = new URL(url)
      const origin = urlObj.origin + "/*"

      const checkResult: any = await chrome.runtime.sendMessage({
        type: "CHECK_PERMISSION",
        origin,
      })

      if (!checkResult.hasPermission) {
        if (
          window.confirm(
            t("webdavPermissionConfirm") ||
              "需要权限访问 WebDAV 服务器。是否打开权限窗口进行授权？",
          )
        ) {
          await chrome.runtime.sendMessage({
            type: "REQUEST_PERMISSIONS",
            origins: [origin],
          })
        }
        return
      }
    } catch (e) {
      console.error("Permission check failed:", e)
    }

    try {
      const manager = getWebDAVSyncManager()
      if (settings.webdav) {
        await manager.saveConfig(settings.webdav)
      }
      const result = await manager.testConnection()
      showDomToast(t(result.messageKey) || result.messageKey)
    } catch (err) {
      showDomToast("Error: " + String(err))
    }
  }

  // WebDAV 备份
  const uploadToWebDAV = async () => {
    const url = settings.webdav?.url
    if (url) {
      try {
        const urlObj = new URL(url)
        const origin = urlObj.origin + "/*"
        const checkResult: any = await chrome.runtime.sendMessage({
          type: "CHECK_PERMISSION",
          origin,
        })
        if (!checkResult.hasPermission) {
          if (
            window.confirm(
              t("webdavPermissionConfirm") ||
                "需要权限访问 WebDAV 服务器。是否打开权限窗口进行授权？",
            )
          ) {
            await chrome.runtime.sendMessage({
              type: "REQUEST_PERMISSIONS",
              origins: [origin],
            })
          }
          return
        }
      } catch (e) {
        console.error("Permission check failed:", e)
      }
    }

    try {
      const zustandFormat = {
        state: { settings },
        version: 0,
      }
      await new Promise<void>((resolve, reject) =>
        chrome.storage.local.set({ settings: JSON.stringify(zustandFormat) }, () =>
          chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
        ),
      )

      const manager = getWebDAVSyncManager()
      if (settings.webdav) {
        await manager.saveConfig(settings.webdav)
      }
      const result = await manager.upload()
      showDomToast(t(result.messageKey) || result.messageKey)
    } catch (err) {
      showDomToast("Error: " + String(err))
    }
  }

  return (
    <div>
      <h1 className="settings-page-title">{t("navBackup") || "备份与同步"}</h1>
      <p className="settings-page-desc">{t("backupPageDesc") || "管理数据备份和云端同步"}</p>

      {confirmConfig.show && (
        <ConfirmDialog
          title={confirmConfig.title}
          message={confirmConfig.message}
          danger={confirmConfig.danger}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig((prev) => ({ ...prev, show: false }))}
        />
      )}

      {showRemoteBackups && (
        <RemoteBackupModal
          onClose={() => setShowRemoteBackups(false)}
          onRestore={() => window.location.reload()}
        />
      )}

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "local" && (
        <>
          <SettingCard
            title={t("localBackup") || "本地备份"}
            description={t("localBackupDesc") || "将数据导出为 JSON 文件保存到本地"}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <button
                className="settings-btn settings-btn-primary"
                onClick={handleExport}
                style={{ width: "100%" }}>
                📥 {t("exportToFile") || "导出为文件"}
              </button>

              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                style={{ display: "none" }}
                onChange={handleImport}
              />
              <button
                className="settings-btn settings-btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                style={{ width: "100%" }}>
                📤 {t("importBackupFile") || "备份文件导入"}
              </button>

              <button
                className="settings-btn settings-btn-danger"
                onClick={handleClearAll}
                style={{ width: "100%" }}>
                ⚠️ {t("clearAllData") || "清除全部数据"}
              </button>
            </div>
          </SettingCard>
        </>
      )}

      {activeTab === "webdav" && (
        <>
          <SettingCard
            title={t("webdavServerSettings") || "WebDAV 服务器设置"}
            description={t("webdavServerDesc") || "配置 WebDAV 服务器用于云端备份"}>
            <SettingRow label={t("webdavUrlLabel") || "服务器地址"}>
              <input
                type="text"
                className="settings-input"
                placeholder="https://dav.jianguoyun.com/dav/"
                value={settings.webdav?.url || ""}
                onChange={(e) =>
                  setSettings({
                    webdav: {
                      ...(settings.webdav ?? DEFAULT_SETTINGS.webdav),
                      url: e.target.value,
                    },
                  })
                }
                style={{ width: "280px" }}
              />
            </SettingRow>

            <SettingRow label={t("webdavUsernameLabel") || "用户名"}>
              <input
                type="text"
                className="settings-input"
                placeholder={t("webdavUsernamePlaceholder") || "账号邮箱"}
                value={settings.webdav?.username || ""}
                onChange={(e) =>
                  setSettings({
                    webdav: {
                      ...(settings.webdav ?? DEFAULT_SETTINGS.webdav),
                      username: e.target.value,
                    },
                  })
                }
                style={{ width: "200px" }}
              />
            </SettingRow>

            <SettingRow label={t("webdavPasswordLabel") || "密码"}>
              <input
                type="password"
                className="settings-input"
                placeholder={t("webdavPasswordPlaceholder") || "应用专用密码"}
                value={settings.webdav?.password || ""}
                onChange={(e) =>
                  setSettings({
                    webdav: {
                      ...(settings.webdav ?? DEFAULT_SETTINGS.webdav),
                      password: e.target.value,
                    },
                  })
                }
                style={{ width: "200px" }}
              />
            </SettingRow>

            <SettingRow label={t("webdavRemoteDirLabel") || "远程路径"}>
              <input
                type="text"
                className="settings-input"
                placeholder="ophel"
                value={settings.webdav?.remoteDir ?? "ophel"}
                onChange={(e) =>
                  setSettings({
                    webdav: {
                      ...(settings.webdav ?? DEFAULT_SETTINGS.webdav),
                      remoteDir: e.target.value,
                    },
                  })
                }
                style={{ width: "200px" }}
              />
            </SettingRow>
          </SettingCard>

          <SettingCard
            title={t("backupManagement") || "备份管理"}
            description={t("backupManagementDesc") || "测试连接、上传备份或从云端恢复"}>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button
                className="settings-btn settings-btn-secondary"
                onClick={testWebDAVConnection}>
                🔗 {t("webdavTestBtn") || "测试连接"}
              </button>
              <button
                className="settings-btn settings-btn-secondary"
                onClick={async () => {
                  const url = settings.webdav?.url
                  if (url) {
                    try {
                      const urlObj = new URL(url)
                      const origin = urlObj.origin + "/*"
                      const checkResult: any = await chrome.runtime.sendMessage({
                        type: "CHECK_PERMISSION",
                        origin,
                      })
                      if (!checkResult.hasPermission) {
                        if (
                          window.confirm(
                            t("webdavPermissionConfirm") ||
                              "需要权限访问 WebDAV 服务器。是否打开权限窗口进行授权？",
                          )
                        ) {
                          await chrome.runtime.sendMessage({
                            type: "REQUEST_PERMISSIONS",
                            origins: [origin],
                          })
                        }
                        return
                      }
                    } catch (e) {
                      console.error("Permission check failed:", e)
                    }
                  }

                  const manager = getWebDAVSyncManager()
                  if (settings.webdav) {
                    await manager.saveConfig(settings.webdav)
                  }
                  setShowRemoteBackups(true)
                }}>
                📂 {t("restore") || "恢复"}
              </button>
              <button className="settings-btn settings-btn-success" onClick={uploadToWebDAV}>
                ☁️ {t("backupNow") || "立即备份"}
              </button>
            </div>
          </SettingCard>
        </>
      )}
    </div>
  )
}

export default BackupPage
