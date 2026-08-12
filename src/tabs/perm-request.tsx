/**
 * 最小化权限请求页面
 * 专用于请求可选权限，尺寸小（400x300），授权后自动关闭
 *
 * URL 参数：
 * - type: allUrls | notifications | cookies | sitePack
 */
import React, { useEffect, useState } from "react"

import { isSiteMatchPatternOriginPattern } from "~adapters/declarative/match-pattern"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { getPlatformFontFamily } from "~utils/font"
import { setLanguage, t } from "~utils/i18n"

import "~styles/settings.css"

// 注入页面级样式，去除滚动条
const PERM_PAGE_STYLES = `
  html, body {
    overflow: hidden !important;
    margin: 0;
    padding: 0;
    height: 100%;
  }
`

// 权限配置
const PERMISSION_CONFIGS = {
  allUrls: {
    titleKey: "permAllUrlsTitle",
    descKey: "permAllUrlsDesc",
    deniedKey: "permissionDenied",
    origins: ["<all_urls>"],
    permissions: [] as string[],
  },
  notifications: {
    titleKey: "permNotifyTitle",
    descKey: "permNotifyDesc",
    deniedKey: "permissionDenied",
    origins: [] as string[],
    permissions: ["notifications"],
  },
  cookies: {
    titleKey: "permCookiesTitle",
    descKey: "permCookiesDesc",
    deniedKey: "permissionDenied",
    origins: [] as string[],
    permissions: ["cookies"],
  },
}

type PermissionType = keyof typeof PERMISSION_CONFIGS

interface PermissionRequestConfig {
  titleKey: string
  descKey: string
  deniedKey: string
  descParams?: Record<string, string>
  origins: string[]
  permissions: string[]
}

const readPermissionRequestConfig = (): PermissionRequestConfig => {
  const params = new URLSearchParams(window.location.search)
  if (params.get("type") === "sitePack") {
    const origins = Array.from(
      new Set(params.getAll("origin").filter(isSiteMatchPatternOriginPattern)),
    ).sort((left, right) => left.localeCompare(right))
    return {
      titleKey: "sitePacksPermissionTitle",
      descKey: "sitePacksPermissionDesc",
      deniedKey: "sitePacksPermissionDenied",
      descParams: {
        name: params.get("name")?.trim() || "SitePack",
        origins: origins.join(", "),
      },
      origins,
      permissions: [],
    }
  }

  const type = params.get("type") as PermissionType
  return PERMISSION_CONFIGS[type && type in PERMISSION_CONFIGS ? type : "allUrls"]
}

const PermissionRequestPage: React.FC = () => {
  const [status, setStatus] = useState<"pending" | "granted" | "denied">("pending")
  const [config] = useState(readPermissionRequestConfig)
  const [_langReady, setLangReady] = useState(false)
  const { settings } = useSettingsStore()
  const isHydrated = useSettingsHydrated()

  // 初始化语言
  useEffect(() => {
    if (isHydrated) {
      if (settings?.language) {
        setLanguage(settings.language)
      }
      // 语言设置完成后标记为就绪，触发重渲染
      setLangReady(true)
    }
  }, [isHydrated, settings?.language])

  // 注入页面级样式（去除滚动条）
  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = PERM_PAGE_STYLES
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
    }
  }, [])

  // 无效请求（如 sitePack 的 origin 参数全部被过滤）直接按失败处理，
  // 不展示一个点击后才会报错的空授权弹窗。
  useEffect(() => {
    if (config.origins.length > 0 || config.permissions.length > 0) return
    console.error("[PermRequest] Permission request contains no valid origins or permissions")
    setStatus("denied")
    const timer = setTimeout(() => {
      window.close()
    }, 1000)
    return () => clearTimeout(timer)
  }, [config])

  // 请求权限
  const handleRequest = async () => {
    try {
      if (config.origins.length === 0 && config.permissions.length === 0) {
        throw new Error("Permission request contains no valid permissions")
      }
      console.warn("[PermRequest] Requesting permissions:", {
        origins: config.origins,
        permissions: config.permissions,
      })
      const granted = await chrome.permissions.request({
        origins: config.origins.length > 0 ? config.origins : undefined,
        permissions: config.permissions.length > 0 ? config.permissions : undefined,
      })

      console.warn("[PermRequest] Permission granted:", granted)
      if (granted) {
        setStatus("granted")
        // 延迟关闭窗口
        setTimeout(() => {
          window.close()
        }, 1500)
      } else {
        setStatus("denied")
        // 被拒绝时也关闭窗口
        setTimeout(() => {
          window.close()
        }, 1000)
      }
    } catch (e) {
      console.error("[PermRequest] Permission request failed:", e)
      setStatus("denied")
      setTimeout(() => {
        window.close()
      }, 1000)
    }
  }

  // 取消
  const handleCancel = () => {
    setStatus("denied")
    setTimeout(() => {
      window.close()
    }, 500)
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--gh-bg, #ffffff)",
        fontFamily: getPlatformFontFamily(),
        padding: "20px",
        overflow: "hidden",
      }}>
      <div
        style={{
          textAlign: "center",
          maxWidth: "320px",
        }}>
        {status === "pending" && (
          <>
            {/* 图标 */}
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔐</div>

            {/* 标题 */}
            <h1
              style={{
                fontSize: "18px",
                fontWeight: 600,
                marginBottom: "12px",
                color: "var(--gh-text, #1f2937)",
              }}>
              {t(config.titleKey)}
            </h1>

            {/* 描述 */}
            <p
              style={{
                fontSize: "14px",
                color: "var(--gh-text-secondary, #6b7280)",
                marginBottom: "24px",
                lineHeight: 1.5,
              }}>
              {t(config.descKey, config.descParams)}
            </p>

            {/* 按钮 */}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                onClick={handleCancel}
                style={{
                  padding: "10px 24px",
                  borderRadius: "8px",
                  border: "1px solid var(--gh-border, #e5e7eb)",
                  background: "transparent",
                  color: "var(--gh-text-secondary, #6b7280)",
                  fontSize: "14px",
                  cursor: "pointer",
                }}>
                {t("cancel")}
              </button>
              <button
                onClick={handleRequest}
                style={{
                  padding: "10px 24px",
                  borderRadius: "8px",
                  border: "none",
                  background: "var(--gh-primary, #4285f4)",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}>
                {t("allow")}
              </button>
            </div>
          </>
        )}

        {status === "granted" && (
          <>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
            <h1
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#10b981",
              }}>
              {t("permissionGranted")}
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--gh-text-secondary, #6b7280)",
                marginTop: "8px",
              }}>
              {t("windowClosing")}
            </p>
          </>
        )}

        {status === "denied" && (
          <>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>❌</div>
            <h1
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#ef4444",
              }}>
              {t(config.deniedKey, config.descParams)}
            </h1>
          </>
        )}
      </div>
    </div>
  )
}

export default PermissionRequestPage
