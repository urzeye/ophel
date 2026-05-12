/**
 * 最小化权限请求页面
 * 专用于请求可选权限，尺寸小（400x300），授权后自动关闭
 *
 * URL 参数：
 * - type: webdav | tabs | notifications | watermark
 */
import React, { useEffect, useState } from "react"

import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { INTER_CJK_FONT_FAMILY } from "~utils/font"
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
    origins: ["<all_urls>"],
    permissions: [] as string[],
  },
  notifications: {
    titleKey: "permNotifyTitle",
    descKey: "permNotifyDesc",
    origins: [] as string[],
    permissions: ["notifications"],
  },
  cookies: {
    titleKey: "permCookiesTitle",
    descKey: "permCookiesDesc",
    origins: [] as string[],
    permissions: ["cookies"],
  },
}

type PermissionType = keyof typeof PERMISSION_CONFIGS

const PermissionRequestPage: React.FC = () => {
  const [status, setStatus] = useState<"pending" | "granted" | "denied">("pending")
  // 优先从 URL 参数获取权限类型
  const [permType, setPermType] = useState<PermissionType>(() => {
    const params = new URLSearchParams(window.location.search)
    const type = params.get("type") as PermissionType
    return type && type in PERMISSION_CONFIGS ? type : "allUrls"
  })
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

  // 解析 URL 参数
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const type = params.get("type") as PermissionType
    if (type && PERMISSION_CONFIGS[type]) {
      setPermType(type)
    }
  }, [])

  const config = PERMISSION_CONFIGS[permType]

  // 请求权限
  const handleRequest = async () => {
    try {
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
        fontFamily: INTER_CJK_FONT_FAMILY,
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
              {t(config.titleKey) || "需要授权"}
            </h1>

            {/* 描述 */}
            <p
              style={{
                fontSize: "14px",
                color: "var(--gh-text-secondary, #6b7280)",
                marginBottom: "24px",
                lineHeight: 1.5,
              }}>
              {t(config.descKey) || "此功能需要额外权限才能正常工作。"}
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
                {t("cancel") || "取消"}
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
                {t("allow") || "允许"}
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
              {t("permissionGranted") || "授权成功"}
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--gh-text-secondary, #6b7280)",
                marginTop: "8px",
              }}>
              {t("windowClosing") || "窗口即将关闭..."}
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
              {t("permissionDenied") || "授权已取消"}
            </h1>
          </>
        )}
      </div>
    </div>
  )
}

export default PermissionRequestPage
