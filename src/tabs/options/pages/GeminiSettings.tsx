/**
 * Gemini 专属设置：回复内容处理（Markdown 修复、去水印）
 */
import React from "react"

import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { MSG_CHECK_PERMISSIONS, MSG_REQUEST_PERMISSIONS, sendToBackground } from "~utils/messaging"
import { showToast } from "~utils/toast"

import { SettingCard, ToggleRow } from "../components"

const GeminiSettings: React.FC = () => {
  const { settings, updateNestedSetting } = useSettingsStore()

  if (!settings) return null

  const toggleWatermarkRemoval = async () => {
    if (settings.content?.watermarkRemoval) {
      updateNestedSetting("content", "watermarkRemoval", false)
      return
    }

    // 油猴脚本环境：直接启用（不需要检查权限，GM_xmlhttpRequest 已通过 @grant 声明）
    if (!platform.hasCapability("permissions")) {
      updateNestedSetting("content", "watermarkRemoval", true)
      return
    }

    // Options 页面直接调用 chrome.permissions API（request 已授权时不弹窗直接返回 true）
    if (typeof chrome.permissions !== "undefined") {
      const granted = await chrome.permissions.request({ origins: ["<all_urls>"] })
      if (granted) {
        updateNestedSetting("content", "watermarkRemoval", true)
      }
      return
    }

    // Content Script fallback：通过 background 打开权限请求弹窗
    const response = await sendToBackground({
      type: MSG_CHECK_PERMISSIONS,
      origins: ["<all_urls>"],
    })
    if (response.success && response.hasPermission) {
      updateNestedSetting("content", "watermarkRemoval", true)
      return
    }
    await sendToBackground({ type: MSG_REQUEST_PERMISSIONS, permType: "allUrls" })
    showToast(t("permissionRequestToast"), 3000)
  }

  return (
    <SettingCard settingId="gemini-settings-card">
      <ToggleRow
        label={t("markdownFixLabel")}
        description={t("markdownFixDesc")}
        settingId="gemini-markdown-fix"
        checked={settings.content?.markdownFix ?? false}
        onChange={() =>
          updateNestedSetting("content", "markdownFix", !settings.content?.markdownFix)
        }
      />
      <ToggleRow
        label={t("watermarkRemovalLabel")}
        description={t("watermarkRemovalDesc")}
        settingId="gemini-watermark-removal"
        checked={settings.content?.watermarkRemoval ?? false}
        onChange={toggleWatermarkRemoval}
      />
    </SettingCard>
  )
}

export default GeminiSettings
