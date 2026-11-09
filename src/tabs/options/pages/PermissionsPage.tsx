/**
 * 权限管理内容
 * 作为「数据与权限」页的权限 tab 内容渲染，不再是一级页面
 */
import React, { useCallback, useEffect, useRef, useState } from "react"

import { CloudIcon, CookieIcon, NotificationIcon, SaveIcon } from "~components/icons"
import { ConfirmDialog } from "~components/ui"
import { useSettingsStore } from "~stores/settings-store"
import { platform } from "~platform"
import { t } from "~utils/i18n"
import {
  MSG_CHECK_PERMISSIONS,
  MSG_REQUEST_PERMISSIONS,
  MSG_REVOKE_PERMISSIONS,
  sendToBackground,
} from "~utils/messaging"
import { showToast } from "~utils/toast"

import { SettingCard, SettingRow } from "../components"
import { SafariWebsiteAccessGuide } from "../components/SafariWebsiteAccessGuide"

interface OptionalPermission {
  id: string
  nameKey: string
  description: string
  Icon: typeof CloudIcon
  permissions?: string[]
  origins?: string[]
}

// 必需权限（在 manifest 中声明，无法动态修改）
const REQUIRED_PERMISSIONS = [
  {
    id: "storage",
    nameKey: "permissionStorage",
    description: "permissionStorageDesc",
    Icon: SaveIcon,
  },
]

// 可选权限（非主机权限）
const OPTIONAL_PERMISSIONS: OptionalPermission[] = [
  {
    id: "notifications",
    nameKey: "permissionNotifications",
    description: "permissionNotificationsDesc",
    Icon: NotificationIcon,
    permissions: ["notifications"],
  },
  {
    id: "cookies",
    nameKey: "permissionCookies",
    description: "permissionCookiesDesc",
    Icon: CookieIcon,
    permissions: ["cookies"],
  },
].filter(
  (permission) => permission.id !== "notifications" || platform.hasCapability("notifications"),
)

// 可选主机权限
const OPTIONAL_HOST_PERMISSIONS: OptionalPermission[] = [
  {
    id: "webdav",
    nameKey: "permissionWebdavAccess",
    description: "permissionWebdavAccessDesc",
    Icon: CloudIcon,
    origins: ["<all_urls>"],
  },
]

const ALL_OPTIONAL_PERMISSIONS = [...OPTIONAL_PERMISSIONS, ...OPTIONAL_HOST_PERMISSIONS]

const PermissionsPage: React.FC = () => {
  const { updateNestedSetting } = useSettingsStore()
  // 可选权限状态
  const [optionalPermissionStatus, setOptionalPermissionStatus] = useState<
    Record<string, boolean | null>
  >({})
  const [loading, setLoading] = useState(true)
  const permissionCheckId = useRef(0)
  const browserManagedHostPermissions = platform.hasCapability("browserManagedHostPermissions")

  // 确认弹窗状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    message: React.ReactNode
    onConfirm: () => void
  }>({
    open: false,
    message: "",
    onConfirm: () => {},
  })

  // 判断是否在扩展页面上下文（可以直接调用权限 API）
  const isExtensionPage = typeof chrome !== "undefined" && typeof chrome.permissions !== "undefined"

  // 检查可选权限状态
  const checkOptionalPermissions = useCallback(async () => {
    const checkId = ++permissionCheckId.current
    setLoading(true)
    const status: Record<string, boolean | null> = {}

    for (const perm of ALL_OPTIONAL_PERMISSIONS) {
      try {
        const query = {
          permissions: perm.permissions,
          origins: perm.origins,
        }
        if (isExtensionPage) {
          status[perm.id] = await chrome.permissions.contains(query)
        } else {
          const response = await sendToBackground({
            type: MSG_CHECK_PERMISSIONS,
            ...query,
          })
          if (!response.success || typeof response.hasPermission !== "boolean") {
            throw new Error(response.error || "Permission check returned no result")
          }
          status[perm.id] = response.hasPermission
        }
      } catch (e) {
        console.error(`检查权限 ${perm.id} 失败:`, e)
        status[perm.id] = null
      }
    }

    if (checkId !== permissionCheckId.current) return false
    setOptionalPermissionStatus(status)
    setLoading(false)
    return Object.values(status).every((value) => value !== null)
  }, [isExtensionPage])

  // 请求可选权限（通用函数）
  const requestPermission = useCallback(
    async (perm: { id: string; origins?: string[]; permissions?: string[] }) => {
      try {
        if (isExtensionPage) {
          await chrome.permissions.request({
            origins: perm.origins?.length ? perm.origins : undefined,
            permissions: perm.permissions?.length ? perm.permissions : undefined,
          })

          await checkOptionalPermissions()
        } else {
          // Content Script 发送消息请求
          await sendToBackground({
            type: MSG_REQUEST_PERMISSIONS,
            permType: perm.id,
            origins: perm.origins,
            permissions: perm.permissions,
          })
        }
      } catch (e) {
        console.error(`请求权限 ${perm.id} 失败:`, e)
      }
    },
    [isExtensionPage, checkOptionalPermissions],
  )

  // 初始化时检查权限
  useEffect(() => {
    checkOptionalPermissions()

    if (isExtensionPage && !browserManagedHostPermissions) {
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get("auto_request") === "true") {
        setTimeout(() => {
          const perm = OPTIONAL_HOST_PERMISSIONS[0]
          if (perm) {
            requestPermission(perm)
          }
        }, 500)
      }
    }
  }, [checkOptionalPermissions, isExtensionPage, requestPermission, browserManagedHostPermissions])

  useEffect(() => {
    const refresh = () => void checkOptionalPermissions()
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", onVisible)
    // Safari 的权限事件类型缺少标准 removeListener 声明。
    const permissionEvents = (
      isExtensionPage ? [chrome.permissions.onAdded, chrome.permissions.onRemoved] : []
    ) as Array<typeof chrome.permissions.onAdded & { removeListener(listener: () => void): void }>
    permissionEvents.forEach((event) => event.addListener(refresh))
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", onVisible)
      permissionEvents.forEach((event) => event.removeListener(refresh))
    }
  }, [checkOptionalPermissions, isExtensionPage])

  // 执行撤销逻辑
  const executeRevoke = async (perm: {
    id: string
    origins?: string[]
    permissions?: string[]
  }) => {
    try {
      let removed = false
      if (isExtensionPage) {
        removed = await chrome.permissions.remove({
          origins: perm.origins?.length ? perm.origins : undefined,
          permissions: perm.permissions?.length ? perm.permissions : undefined,
        })
      } else {
        const response = await sendToBackground({
          type: MSG_REVOKE_PERMISSIONS,
          origins: perm.origins,
          permissions: perm.permissions,
        })
        if (response && response.success) {
          removed = response.removed
        }
      }

      if (removed) {
        setOptionalPermissionStatus((prev) => ({ ...prev, [perm.id]: false }))

        // 自动关闭相关设置
        if (perm.id === "notifications") {
          updateNestedSetting("tab", "showNotification", false)
        } else if (perm.id === "webdav") {
          updateNestedSetting("content", "watermarkRemoval", false)
        }
      }
    } catch (e) {
      console.error(`撤销权限 ${perm.id} 失败:`, e)
    } finally {
      setConfirmDialog((prev) => ({ ...prev, open: false }))
    }
  }

  // 点击撤销按钮
  const handleRevokeClick = (perm: { id: string; origins?: string[]; permissions?: string[] }) => {
    let confirmMsg = t("revokeConfirmDefault")

    if (perm.id === "notifications") {
      confirmMsg = t("revokeConfirmNotifications")
    } else if (perm.id === "webdav") {
      confirmMsg = t("revokeConfirmWebdav")
    }

    setConfirmDialog({
      open: true,
      message: <div style={{ whiteSpace: "pre-wrap" }}>{confirmMsg}</div>,
      onConfirm: () => executeRevoke(perm),
    })
  }

  return (
    <div>
      {/* 可选权限 */}
      <SettingCard
        title={t("optionalPermissions")}
        description={t("optionalPermissionsDesc")}
        settingId="permissions-optional-card">
        {/* 同步提示 + 刷新按钮 */}
        <div className="settings-perm-header-row">
          <span className="settings-perm-sync-hint">{t("permissionsSyncHint")}</span>
          <button
            type="button"
            className="settings-btn settings-btn-secondary"
            onClick={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              if (await checkOptionalPermissions()) {
                showToast(t("permissionsRefreshed"), 1500)
              }
            }}
            disabled={loading}>
            {loading ? t("refreshing") : t("refreshStatus")}
          </button>
        </div>

        {ALL_OPTIONAL_PERMISSIONS.map((perm) => {
          const managedByBrowser = browserManagedHostPermissions && !!perm.origins?.length
          const status = optionalPermissionStatus[perm.id]
          return (
            <SettingRow
              key={perm.id}
              label={
                <span className="settings-perm-item-label">
                  <span className="settings-perm-icon">
                    <perm.Icon size={16} color="currentColor" />
                  </span>
                  <span>{t(managedByBrowser ? "safariWebsiteAccess" : perm.nameKey)}</span>
                </span>
              }
              description={
                managedByBrowser ? (
                  <>
                    {t("safariWebsiteAccessDesc")}
                    <SafariWebsiteAccessGuide />
                  </>
                ) : (
                  t(perm.description)
                )
              }
              settingId={`permission-item-${perm.id}`}>
              <div className="settings-perm-actions" aria-live="polite" aria-busy={loading}>
                {loading || status == null ? (
                  <span className="settings-status-badge is-muted">
                    {t(loading ? "refreshing" : "permissionCheckFailed")}
                  </span>
                ) : managedByBrowser ? (
                  <span className={`settings-status-badge ${status ? "is-success" : "is-muted"}`}>
                    {t(status ? "safariAllWebsitesAllowed" : "safariWebsiteAccessManaged")}
                  </span>
                ) : status ? (
                  <>
                    <span className="settings-status-badge is-success">{t("granted")}</span>
                    <button
                      type="button"
                      className="settings-btn settings-btn-secondary"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleRevokeClick(perm)
                      }}>
                      {t("revoke")}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="settings-status-badge is-danger">{t("notGranted")}</span>
                    <button
                      type="button"
                      className="settings-btn settings-btn-primary"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        requestPermission(perm)
                      }}>
                      {t("allowRecommended")}
                    </button>
                  </>
                )}
              </div>
            </SettingRow>
          )
        })}
      </SettingCard>

      {/* 必需权限（只读展示） */}
      <SettingCard
        title={t("requiredPermissions")}
        description={t("requiredPermissionsDesc")}
        settingId="permissions-required-card">
        {REQUIRED_PERMISSIONS.map((perm) => (
          <SettingRow
            key={perm.id}
            label={
              <span className="settings-perm-item-label">
                <span className="settings-perm-icon">
                  <perm.Icon size={16} color="currentColor" />
                </span>
                <span>{t(perm.nameKey)}</span>
              </span>
            }
            description={t(perm.description)}
            settingId={`permission-item-${perm.id}`}>
            <span className="settings-status-badge is-muted">{t("required")}</span>
          </SettingRow>
        ))}
      </SettingCard>

      {/* 确认弹窗 */}
      {confirmDialog.open && (
        <ConfirmDialog
          title={t("revokePermissionTitle")}
          message={confirmDialog.message}
          confirmText={t("revoke")}
          cancelText={t("cancel")}
          danger={true}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        />
      )}
    </div>
  )
}

export default PermissionsPage
