/**
 * 最小化权限请求页面
 * 专用于请求可选权限，尺寸小（400x300），授权后自动关闭
 *
 * URL 参数：
 * - type: allUrls | notifications | cookies | sitePack
 */
import React, { useEffect, useState } from "react"

import { isSiteMatchPatternOriginPattern } from "~adapters/declarative/match-pattern"
import { CheckIcon, ClearIcon, ShieldCheckIcon } from "~components/icons"
import { Button } from "~components/ui"
import { platform } from "~platform"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { SafariWebsiteAccessGuide } from "~tabs/options/components/SafariWebsiteAccessGuide"
import { getPlatformFontFamily } from "~utils/font"
import { initI18n, setLanguage, t } from "~utils/i18n"

import "~styles/settings.css"

// 授权指引展开后允许滚动，避免小窗口截断操作。
const PERM_PAGE_STYLES = `
  html, body {
    overflow-x: hidden;
    margin: 0;
    padding: 0;
    min-height: 100%;
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
  const [checking, setChecking] = useState(false)
  const [checkFailed, setCheckFailed] = useState(false)
  const browserManagedRequest =
    platform.hasCapability("browserManagedHostPermissions") && config.origins.includes("<all_urls>")
  const [_langReady, setLangReady] = useState(false)
  const { settings } = useSettingsStore()
  const isHydrated = useSettingsHydrated()

  // 初始化语言
  useEffect(() => {
    if (isHydrated) {
      let cancelled = false
      // 等语言资源加载完成后再标记就绪，避免非英语用户看到英文闪帧
      void initI18n().then(() => {
        if (cancelled) return
        if (settings?.language) {
          setLanguage(settings.language)
        }
        // 语言设置完成后标记为就绪，触发重渲染
        setLangReady(true)
      })
      return () => {
        cancelled = true
      }
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
    setChecking(true)
    setCheckFailed(false)
    try {
      if (config.origins.length === 0 && config.permissions.length === 0) {
        throw new Error("Permission request contains no valid permissions")
      }
      console.warn("[PermRequest] Requesting permissions:", {
        origins: config.origins,
        permissions: config.permissions,
      })
      const query = {
        origins: config.origins.length > 0 ? config.origins : undefined,
        permissions: config.permissions.length > 0 ? config.permissions : undefined,
      }
      // Safari 的所有网站访问在系统设置中管理；刷新只核验实际状态。
      if (!browserManagedRequest) await chrome.permissions.request(query)
      const granted = await chrome.permissions.contains(query)

      if (browserManagedRequest && !granted) return

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
      if (browserManagedRequest) {
        setCheckFailed(true)
        return
      }
      setStatus("denied")
      setTimeout(() => {
        window.close()
      }, 1000)
    } finally {
      setChecking(false)
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
    <div className="perm-request-page" style={{ fontFamily: getPlatformFontFamily() }}>
      <div className="perm-request-content">
        {status === "pending" && (
          <>
            {/* 图标 */}
            <div className="perm-request-icon" aria-hidden="true">
              <ShieldCheckIcon size={28} />
            </div>

            {/* 标题 */}
            <h1
              style={{
                fontSize: "18px",
                fontWeight: 600,
                marginBottom: "12px",
                color: "var(--gh-text, #1f2937)",
              }}>
              {t(browserManagedRequest ? "safariWebsiteAccess" : config.titleKey)}
            </h1>

            {/* 描述 */}
            <p
              style={{
                fontSize: "14px",
                color: "var(--gh-text-secondary, #6b7280)",
                marginBottom: "24px",
                lineHeight: 1.5,
              }}>
              {t(
                browserManagedRequest ? "safariWebsiteAccessDesc" : config.descKey,
                config.descParams,
              )}
            </p>

            {browserManagedRequest && (
              <>
                <div aria-live="polite" className="settings-perm-request-status">
                  {t(checkFailed ? "permissionCheckFailed" : "safariWebsiteAccessManaged")}
                </div>
                <SafariWebsiteAccessGuide />
              </>
            )}

            {/* 按钮 */}
            <div className="perm-request-actions">
              <Button onClick={handleCancel}>{t("cancel")}</Button>
              <Button variant="primary" onClick={handleRequest} disabled={checking}>
                {t(checking ? "refreshing" : browserManagedRequest ? "refreshStatus" : "allow")}
              </Button>
            </div>
          </>
        )}

        {status === "granted" && (
          <>
            <div className="perm-request-icon is-success" aria-hidden="true">
              <CheckIcon size={28} />
            </div>
            <h1
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--gh-success, #10b981)",
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
            <div className="perm-request-icon is-danger" aria-hidden="true">
              <ClearIcon size={28} />
            </div>
            <h1
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--gh-text-danger, #ef4444)",
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
