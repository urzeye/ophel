/**
 * 权限管理页面
 * 显示和管理扩展的权限
 */
import React, { useEffect, useState } from "react"

import { t } from "~utils/i18n"
import {
  MSG_CHECK_PERMISSIONS,
  MSG_REQUEST_PERMISSIONS,
  MSG_REVOKE_PERMISSIONS,
  sendToBackground,
} from "~utils/messaging"

import { SettingCard, SettingRow } from "../components"

// 必需权限（在 manifest 中声明，无法动态修改）
const REQUIRED_PERMISSIONS = [
  {
    id: "storage",
    name: "存储",
    nameKey: "permissionStorage",
    description: "permissionStorageDesc",
    icon: "💾",
  },
  {
    id: "notifications",
    name: "通知",
    nameKey: "permissionNotifications",
    description: "permissionNotificationsDesc",
    icon: "🔔",
  },
  {
    id: "tabs",
    name: "标签页",
    nameKey: "permissionTabs",
    description: "permissionTabsDesc",
    icon: "📑",
  },
  {
    id: "declarativeNetRequest",
    name: "网络请求规则",
    nameKey: "permissionDNR",
    description: "permissionDNRDesc",
    icon: "🌐",
  },
]

// 可选主机权限
const OPTIONAL_HOST_PERMISSIONS = [
  {
    id: "allUrls",
    name: "所有网站访问权限",
    nameKey: "permissionAllUrls",
    description: "permissionAllUrlsDesc",
    icon: "🌍",
    origins: ["<all_urls>"],
  },
]

interface PermissionsPageProps {
  siteId: string
}

const PermissionsPage: React.FC<PermissionsPageProps> = () => {
  // 可选权限状态
  const [optionalPermissionStatus, setOptionalPermissionStatus] = useState<Record<string, boolean>>(
    {},
  )
  const [loading, setLoading] = useState(true)

  // 判断是否在扩展页面上下文（可以直接调用权限 API）
  // 注意：content script 中 chrome.permissions 为 undefined
  const isExtensionPage = typeof chrome.permissions !== "undefined"

  // 检查可选权限状态
  const checkOptionalPermissions = async () => {
    setLoading(true)
    const status: Record<string, boolean> = {}

    for (const perm of OPTIONAL_HOST_PERMISSIONS) {
      try {
        let result = false
        if (isExtensionPage) {
          // 扩展页面直接调用
          result = await chrome.permissions.contains({
            origins: perm.origins || [],
          })
        } else {
          // Content script 发送消息到后台检查
          const response = await sendToBackground({
            type: MSG_CHECK_PERMISSIONS,
            origins: perm.origins || [],
          })
          if (response && response.success) {
            result = response.hasPermission
          } else {
            console.warn(`检查权限 ${perm.id} 消息返回失败:`, response)
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
  }

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
  }, [])

  // 请求可选权限
  const requestPermission = async (perm: (typeof OPTIONAL_HOST_PERMISSIONS)[0]) => {
    try {
      if (isExtensionPage) {
        // 扩展页面直接请求（需要用户手势）
        const granted = await chrome.permissions.request({
          origins: perm.origins || [],
        })

        if (granted) {
          setOptionalPermissionStatus((prev) => ({ ...prev, [perm.id]: true }))
        }
      } else {
        // Content Script 无法请求权限，通知后台打开扩展页面进行请求
        // 这将打开一个新的标签页（Options 页）进行授权
        await sendToBackground({
          type: MSG_REQUEST_PERMISSIONS,
          origins: perm.origins || [],
        })
        // 不立即更新状态，因为是在新页面授权
        // 用户回来后点击刷新即可
      }
    } catch (e) {
      console.error(`请求权限 ${perm.id} 失败:`, e)
    }
  }

  // 撤销可选权限
  const revokePermission = async (perm: (typeof OPTIONAL_HOST_PERMISSIONS)[0]) => {
    try {
      let removed = false
      if (isExtensionPage) {
        // 扩展页面直接撤销
        removed = await chrome.permissions.remove({
          origins: perm.origins || [],
        })
      } else {
        // Content Script 发送消息撤销
        // 撤销权限不要求用户手势，后台可以直接处理
        const response = await sendToBackground({
          type: MSG_REVOKE_PERMISSIONS,
          origins: perm.origins || [],
        })
        if (response && response.success) {
          removed = response.removed
        }
      }

      if (removed) {
        setOptionalPermissionStatus((prev) => ({ ...prev, [perm.id]: false }))
      }
    } catch (e) {
      console.error(`撤销权限 ${perm.id} 失败:`, e)
    }
  }

  return (
    <div>
      <h1 className="settings-page-title">{t("navPermissions") || "权限管理"}</h1>
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
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              checkOptionalPermissions()
            }}
            disabled={loading}
            style={{ fontSize: "12px", padding: "4px 12px", flexShrink: 0 }}>
            {t("refreshStatus") || "刷新状态"}
          </button>
        </div>

        {OPTIONAL_HOST_PERMISSIONS.map((perm, index) => (
          <SettingRow
            key={perm.id}
            label={
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>{perm.icon}</span>
                <span>{t(perm.nameKey) || perm.name}</span>
              </span>
            }
            description={t(perm.description) || perm.description}
            style={index === OPTIONAL_HOST_PERMISSIONS.length - 1 ? { borderBottom: "none" } : {}}>
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
                      revokePermission(perm)
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
    </div>
  )
}

export default PermissionsPage
