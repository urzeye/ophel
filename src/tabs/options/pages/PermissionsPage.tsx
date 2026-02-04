/**
 * 权限管理页面
 * 显示和管理扩展的权限
 */
import React, { useCallback, useEffect, useState } from "react"

import { PermissionsIcon } from "~components/icons"
import { ConfirmDialog } from "~components/ui"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import {
  MSG_CHECK_PERMISSIONS,
  MSG_REQUEST_PERMISSIONS,
  MSG_REVOKE_PERMISSIONS,
  sendToBackground,
} from "~utils/messaging"
import { showToast } from "~utils/toast"

import { PageTitle, SettingCard, SettingRow } from "../components"

// 必需权限（在 manifest 中声明，无法动态修改）
const REQUIRED_PERMISSIONS = [
  {
    id: "storage",
    name: "存储",
    nameKey: "permissionStorage",
    description: "permissionStorageDesc",
    icon: "💾",
  },
]

// 可选权限（非主机权限）
const OPTIONAL_PERMISSIONS = [
  {
    id: "notifications",
    name: "通知",
    nameKey: "permissionNotifications",
    description: "permissionNotificationsDesc",
    icon: "🔔",
    permissions: ["notifications"],
  },
  {
    id: "cookies",
    name: "Cookie管理",
    nameKey: "permissionCookies",
    description: "permissionCookiesDesc",
    icon: "🍪",
    permissions: ["cookies"],
  },
]

// 可选主机权限
const OPTIONAL_HOST_PERMISSIONS = [
  {
    id: "webdav",
    name: "WebDAV 访问权限",
    nameKey: "permissionWebdavAccess",
    description: "permissionWebdavAccessDesc",
    icon: "☁️",
    origins: ["<all_urls>"],
  },
]

interface PermissionsPageProps {
  siteId: string
}

const PermissionsPage: React.FC<PermissionsPageProps> = () => {
  const { updateNestedSetting } = useSettingsStore()
  // 可选权限状态
  const [optionalPermissionStatus, setOptionalPermissionStatus] = useState<Record<string, boolean>>(
    {},
  )
  const [loading, setLoading] = useState(true)

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
  // 注意：content script 中 chrome.permissions 为 undefined
  const isExtensionPage = typeof chrome.permissions !== "undefined"

  // 检查可选权限状态
  const checkOptionalPermissions = useCallback(async () => {
    setLoading(true)
    const status: Record<string, boolean> = {}

    // 检查可选非主机权限
    for (const perm of OPTIONAL_PERMISSIONS) {
      try {
        let result = false
        if (isExtensionPage) {
          result = await chrome.permissions.contains({
            permissions: perm.permissions || [],
          })
        } else {
          const response = await sendToBackground({
            type: MSG_CHECK_PERMISSIONS,
            permissions: perm.permissions || [],
          })
          if (response && response.success) {
            result = response.hasPermission
          }
        }
        status[perm.id] = result
      } catch (e) {
        console.error(`检查权限 ${perm.id} 失败:`, e)
        status[perm.id] = false
      }
    }

    // 检查可选主机权限
    for (const perm of OPTIONAL_HOST_PERMISSIONS) {
      try {
        let result = false
        if (isExtensionPage) {
          result = await chrome.permissions.contains({
            origins: perm.origins || [],
          })
        } else {
          const response = await sendToBackground({
            type: MSG_CHECK_PERMISSIONS,
            origins: perm.origins || [],
          })
          if (response && response.success) {
            result = response.hasPermission
          }
        }
        status[perm.id] = result
      } catch (e) {
        console.error(`检查权限 ${perm.id} 失败:`, e)
        status[perm.id] = false
      }
    }

    setOptionalPermissionStatus(status)
    setLoading(false)
  }, [isExtensionPage])

  // 请求可选权限（通用函数）
  const requestPermission = useCallback(
    async (perm: { id: string; origins?: string[]; permissions?: string[] }) => {
      try {
        if (isExtensionPage) {
          const granted = await chrome.permissions.request({
            origins: perm.origins?.length ? perm.origins : undefined,
            permissions: perm.permissions?.length ? perm.permissions : undefined,
          })

          if (granted) {
            setOptionalPermissionStatus((prev) => ({ ...prev, [perm.id]: true }))
          }
        } else {
          // Content Script 发送消息请求
          await sendToBackground({
            type: MSG_REQUEST_PERMISSIONS,
            permType: perm.id,
            origins: perm.origins,
            permissions: perm.permissions,
          })
          // 延迟后自动刷新权限状态（给用户操作弹窗的时间）
          setTimeout(() => checkOptionalPermissions(), 2000)
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

    // 检查是否有自动请求参数 (auto_request)
    // 只有在扩展页面环境下才处理
    if (isExtensionPage && typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get("auto_request") === "true") {
        // 给一点延迟，确保页面渲染完成
        setTimeout(() => {
          // 默认请求第一个可选权限（通常是 all_urls）
          // 以后如果有多权限，可能需要传递具体权限 ID
          const perm = OPTIONAL_HOST_PERMISSIONS[0]
          if (perm) {
            requestPermission(perm)
          }
        }, 500)
      }
    }
  }, [checkOptionalPermissions, isExtensionPage, requestPermission])

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
    let confirmMsg =
      t("revokeConfirmDefault") || "确定要撤销此权限吗？撤销后，依赖该权限的功能将会自动关闭。"

    if (perm.id === "notifications") {
      confirmMsg =
        t("revokeConfirmNotifications") ||
        "确定要撤销通知权限吗？\n\n撤销后，【桌面通知】功能将自动关闭。如需再次使用，需重新授权。"
    } else if (perm.id === "webdav") {
      confirmMsg =
        t("revokeConfirmWebdav") ||
        "确定要撤销高级访问权限吗？\n\n撤销后，【水印移除】和【WebDAV 同步】功能将自动关闭。如需再次使用，需重新授权。"
    }

    setConfirmDialog({
      open: true,
      message: <div style={{ whiteSpace: "pre-wrap" }}>{confirmMsg}</div>,
      onConfirm: () => executeRevoke(perm),
    })
  }

  return (
    <div>
      <PageTitle title={t("navPermissions") || "权限管理"} Icon={PermissionsIcon} />
      <p className="settings-page-desc">{t("permissionsPageDesc") || "查看和管理扩展的权限。"}</p>

      {/* 可选权限 */}
      <SettingCard
        title={t("optionalPermissions") || "可选权限"}
        description={t("optionalPermissionsDesc") || "这些权限可以按需授予或撤销"}>
        {/* 同步提示 + 刷新按钮 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            paddingBottom: "12px",
            borderBottom: "1px solid var(--gh-border, #e5e7eb)",
          }}>
          <span style={{ fontSize: "13px", color: "var(--gh-text-secondary, #9ca3af)" }}>
            {t("permissionsSyncHint") || "权限状态与浏览器同步，如在此页面外修改请点击刷新。"}
          </span>
          <button
            className="settings-btn settings-btn-secondary"
            onClick={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              await checkOptionalPermissions()
              showToast(t("permissionsRefreshed") || "权限状态已刷新", 1500)
            }}
            disabled={loading}
            style={{ fontSize: "12px", padding: "4px 12px", flexShrink: 0 }}>
            {loading ? t("refreshing") || "刷新中..." : t("refreshStatus") || "刷新状态"}
          </button>
        </div>

        {[...OPTIONAL_PERMISSIONS, ...OPTIONAL_HOST_PERMISSIONS].map((perm, index, arr) => (
          <SettingRow
            key={perm.id}
            label={
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>{perm.icon}</span>
                <span>{t(perm.nameKey) || perm.name}</span>
              </span>
            }
            description={t(perm.description) || perm.description}
            style={index === arr.length - 1 ? { borderBottom: "none" } : {}}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {optionalPermissionStatus[perm.id] ? (
                <>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      background: "rgba(16, 185, 129, 0.1)",
                      color: "#10b981",
                    }}>
                    {t("granted") || "已授予"}
                  </span>
                  <button
                    className="settings-btn settings-btn-secondary"
                    style={{ padding: "4px 12px", fontSize: "12px" }}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleRevokeClick(perm)
                    }}>
                    {t("revoke") || "撤销"}
                  </button>
                </>
              ) : (
                <>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#ef4444",
                    }}>
                    {t("notGranted") || "未授予"}
                  </span>
                  <button
                    className="settings-btn settings-btn-primary"
                    style={{ padding: "4px 12px", fontSize: "12px" }}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      requestPermission(perm)
                    }}>
                    {t("allowRecommended") || "允许（推荐）"}
                  </button>
                </>
              )}
            </div>
          </SettingRow>
        ))}
      </SettingCard>

      {/* 必需权限（只读展示） */}
      <SettingCard
        title={t("requiredPermissions") || "必需权限"}
        description={t("requiredPermissionsDesc") || "这些权限是扩展正常运行所必需的，无法关闭"}>
        {REQUIRED_PERMISSIONS.map((perm, index) => (
          <SettingRow
            key={perm.id}
            label={
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>{perm.icon}</span>
                <span>{t(perm.nameKey) || perm.name}</span>
              </span>
            }
            description={t(perm.description) || perm.description}
            style={index === REQUIRED_PERMISSIONS.length - 1 ? { borderBottom: "none" } : {}}>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: "4px",
                fontSize: "12px",
                background: "rgba(107, 114, 128, 0.1)",
                color: "var(--gh-text-secondary, #6b7280)",
              }}>
              {t("required") || "必需"}
            </span>
          </SettingRow>
        ))}
      </SettingCard>

      {/* 确认弹窗 */}
      {confirmDialog.open && (
        <ConfirmDialog
          title={t("warning") || "警告"}
          message={confirmDialog.message}
          confirmText={t("confirm") || "确定"}
          cancelText={t("cancel") || "取消"}
          danger={true}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        />
      )}
    </div>
  )
}

export default PermissionsPage
