/**
 * 站点设置页面
 * 包含：页面布局、模型锁定、内容处理
 * 这些设置与具体站点相关，按站点存储配置
 */
import React, { useCallback, useEffect, useState } from "react"

import { PageContentIcon as LayoutIcon } from "~components/icons"
import { Switch } from "~components/ui"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { MSG_CHECK_PERMISSIONS, MSG_REQUEST_PERMISSIONS, sendToBackground } from "~utils/messaging"
import type { Settings } from "~utils/storage"
import { showToast } from "~utils/toast"

import { PageTitle, SettingCard, SettingRow, TabGroup, ToggleRow } from "../components"

interface SiteSettingsPageProps {
  siteId: string
}

// 模型锁定行组件 - 只在失焦或按回车时保存
const ModelLockRow: React.FC<{
  label: string
  siteKey: string
  settings: Settings
  setSettings: (settings: Partial<Settings>) => void
  placeholder: string
}> = ({ label, siteKey, settings, setSettings, placeholder }) => {
  const currentConfig = settings.modelLock?.[siteKey] || { enabled: false, keyword: "" }
  const [localKeyword, setLocalKeyword] = useState(currentConfig.keyword)

  // 同步外部值变化
  useEffect(() => {
    setLocalKeyword(currentConfig.keyword)
  }, [currentConfig.keyword])

  // 保存关键词
  const saveKeyword = useCallback(() => {
    if (localKeyword !== currentConfig.keyword) {
      setSettings({
        modelLock: {
          ...settings.modelLock,
          [siteKey]: { ...currentConfig, keyword: localKeyword },
        },
      })
    }
  }, [localKeyword, currentConfig, settings.modelLock, siteKey, setSettings])

  // 切换启用状态
  const toggleEnabled = () => {
    setSettings({
      modelLock: {
        ...settings.modelLock,
        [siteKey]: { ...currentConfig, enabled: !currentConfig.enabled },
      },
    })
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "12px",
      }}>
      <span style={{ fontSize: "14px", fontWeight: 500, flex: 1 }}>{label}</span>
      <input
        type="text"
        className="settings-input"
        value={localKeyword}
        onChange={(e) => setLocalKeyword(e.target.value)}
        onBlur={saveKeyword}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            saveKeyword()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        placeholder={placeholder}
        disabled={!currentConfig.enabled}
        style={{
          width: "200px",
          opacity: currentConfig.enabled ? 1 : 0.5,
        }}
      />
      <Switch checked={currentConfig.enabled} onChange={toggleEnabled} />
    </div>
  )
}

const SiteSettingsPage: React.FC<SiteSettingsPageProps> = ({ siteId }) => {
  const [activeTab, setActiveTab] = useState("layout")
  const { settings, setSettings, updateNestedSetting } = useSettingsStore()

  // 宽度布局相关状态
  const currentPageWidth =
    settings?.layout?.pageWidth?.[siteId as keyof typeof settings.layout.pageWidth] ||
    settings?.layout?.pageWidth?._default
  const currentUserQueryWidth =
    settings?.layout?.userQueryWidth?.[siteId as keyof typeof settings.layout.userQueryWidth] ||
    settings?.layout?.userQueryWidth?._default

  const [tempWidth, setTempWidth] = useState(currentPageWidth?.value || "81")
  const [tempUserQueryWidth, setTempUserQueryWidth] = useState(
    currentUserQueryWidth?.value || "600",
  )

  useEffect(() => {
    if (currentPageWidth?.value) {
      setTempWidth(currentPageWidth.value)
    }
  }, [currentPageWidth?.value])

  useEffect(() => {
    if (currentUserQueryWidth?.value) {
      setTempUserQueryWidth(currentUserQueryWidth.value)
    }
  }, [currentUserQueryWidth?.value])

  // 页面宽度更新
  const handleWidthBlur = () => {
    let val = parseInt(tempWidth)
    const unit = currentPageWidth?.unit || "%"

    if (isNaN(val)) {
      val = unit === "%" ? 81 : 1280
    }

    if (unit === "%") {
      if (val < 40) val = 40
      if (val > 100) val = 100
    } else {
      if (val <= 0) val = 1200
    }

    const finalVal = val.toString()
    setTempWidth(finalVal)
    if (finalVal !== currentPageWidth?.value && settings) {
      const current = currentPageWidth || { enabled: true, value: finalVal, unit: "%" }
      setSettings({
        layout: {
          ...settings.layout,
          pageWidth: {
            ...settings.layout?.pageWidth,
            [siteId]: { ...current, value: finalVal },
          },
        },
      })
    }
  }

  const handleUnitChange = (newUnit: string) => {
    const newValue = newUnit === "px" ? "1280" : "81"
    setTempWidth(newValue)

    if (settings) {
      const newPageWidth = {
        ...currentPageWidth,
        unit: newUnit,
        value: newValue,
        enabled: currentPageWidth?.enabled ?? false,
      }
      setSettings({
        layout: {
          ...settings.layout,
          pageWidth: {
            ...settings.layout?.pageWidth,
            [siteId]: newPageWidth,
          },
        },
      })
    }
  }

  // 用户问题宽度更新
  const handleUserQueryWidthBlur = () => {
    let val = parseInt(tempUserQueryWidth)
    const unit = currentUserQueryWidth?.unit || "px"

    if (isNaN(val)) {
      val = unit === "%" ? 81 : 600
    }

    if (unit === "%") {
      if (val < 40) val = 40
      if (val > 100) val = 100
    } else {
      if (val <= 0) val = 600
    }

    const finalVal = val.toString()
    setTempUserQueryWidth(finalVal)
    if (finalVal !== currentUserQueryWidth?.value && settings) {
      const current = currentUserQueryWidth || { enabled: true, value: finalVal, unit: "px" }
      setSettings({
        layout: {
          ...settings.layout,
          userQueryWidth: {
            ...settings.layout?.userQueryWidth,
            [siteId]: { ...current, value: finalVal },
          },
        },
      })
    }
  }

  const handleUserQueryUnitChange = (newUnit: string) => {
    const newValue = newUnit === "px" ? "600" : "81"
    setTempUserQueryWidth(newValue)
    if (settings) {
      const current = currentUserQueryWidth || { enabled: false, value: newValue, unit: newUnit }
      setSettings({
        layout: {
          ...settings.layout,
          userQueryWidth: {
            ...settings.layout?.userQueryWidth,
            [siteId]: { ...current, unit: newUnit, value: newValue },
          },
        },
      })
    }
  }

  if (!settings) return null

  const tabs = [
    { id: "layout", label: t("layoutTab") || "页面布局" },
    { id: "modelLock", label: t("modelLockTitle") || "模型锁定" },
    { id: "content", label: t("contentStyleTab") || "内容处理" },
  ]

  return (
    <div>
      <PageTitle title={t("navSiteSettings") || "站点设置"} Icon={LayoutIcon} />
      <p className="settings-page-desc">
        {t("siteSettingsPageDesc") || "配置站点相关的页面布局和内容处理"}
      </p>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ========== 页面布局 Tab ========== */}
      {activeTab === "layout" && (
        <>
          {/* 页面宽度卡片 */}
          <SettingCard title={t("pageWidthSettings") || "页面宽度"}>
            <ToggleRow
              label={t("enablePageWidth") || "启用页面宽度"}
              description={t("enablePageWidthDesc") || "调整聊天页面的最大宽度"}
              checked={currentPageWidth?.enabled ?? false}
              onChange={() => {
                const current = currentPageWidth || { enabled: false, value: "81", unit: "%" }
                setSettings({
                  layout: {
                    ...settings?.layout,
                    pageWidth: {
                      ...settings?.layout?.pageWidth,
                      [siteId]: { ...current, enabled: !current.enabled },
                    },
                  },
                })
              }}
            />

            <SettingRow
              label={t("pageWidthValueLabel") || "宽度值"}
              disabled={!currentPageWidth?.enabled}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="settings-input"
                  value={tempWidth}
                  onChange={(e) => setTempWidth(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={handleWidthBlur}
                  disabled={!currentPageWidth?.enabled}
                  style={{ width: "80px" }}
                />
                <select
                  className="settings-select"
                  value={currentPageWidth?.unit || "%"}
                  onChange={(e) => handleUnitChange(e.target.value)}
                  disabled={!currentPageWidth?.enabled}>
                  <option value="%">%</option>
                  <option value="px">px</option>
                </select>
              </div>
            </SettingRow>
          </SettingCard>

          {/* 用户问题宽度卡片 */}
          <SettingCard title={t("userQueryWidthSettings") || "用户问题宽度"}>
            <ToggleRow
              label={t("enableUserQueryWidth") || "启用用户问题加宽"}
              description={t("enableUserQueryWidthDesc") || "调整用户问题气泡的最大宽度"}
              checked={currentUserQueryWidth?.enabled ?? false}
              onChange={() => {
                const current = currentUserQueryWidth || {
                  enabled: false,
                  value: "600",
                  unit: "px",
                }
                setSettings({
                  layout: {
                    ...settings?.layout,
                    userQueryWidth: {
                      ...settings?.layout?.userQueryWidth,
                      [siteId]: { ...current, enabled: !current.enabled },
                    },
                  },
                })
              }}
            />

            <SettingRow
              label={t("userQueryWidthValueLabel") || "问题宽度"}
              disabled={!currentUserQueryWidth?.enabled}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="settings-input"
                  value={tempUserQueryWidth}
                  onChange={(e) => setTempUserQueryWidth(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={handleUserQueryWidthBlur}
                  disabled={!currentUserQueryWidth?.enabled}
                  style={{ width: "80px" }}
                />
                <select
                  className="settings-select"
                  value={currentUserQueryWidth?.unit || "px"}
                  onChange={(e) => handleUserQueryUnitChange(e.target.value)}
                  disabled={!currentUserQueryWidth?.enabled}>
                  <option value="px">px</option>
                  <option value="%">%</option>
                </select>
              </div>
            </SettingRow>
          </SettingCard>
        </>
      )}

      {/* ========== 模型锁定 Tab ========== */}
      {activeTab === "modelLock" && (
        <SettingCard
          title={t("modelLockTitle") || "模型锁定"}
          description={t("modelLockDesc") || "进入页面后自动切换到指定模型"}>
          {/* Gemini */}
          <ModelLockRow
            label="Gemini"
            siteKey="gemini"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
          />

          {/* Gemini Enterprise */}
          <ModelLockRow
            label="Gemini Enterprise"
            siteKey="gemini-enterprise"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
          />

          {/* ChatGPT */}
          <ModelLockRow
            label="ChatGPT"
            siteKey="chatgpt"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
          />

          {/* Grok */}
          <ModelLockRow
            label="Grok"
            siteKey="grok"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
          />
        </SettingCard>
      )}

      {/* ========== 内容处理 Tab ========== */}
      {activeTab === "content" && (
        <>
          {/* 内容处理卡片 */}
          <SettingCard
            title={t("contentProcessing") || "内容处理"}
            description={t("contentProcessingDesc") || "配置 AI 回复内容的处理方式"}>
            <ToggleRow
              label={t("markdownFixLabel") || "Markdown 加粗修复"}
              description={t("markdownFixDesc") || "修复 Gemini 响应中未渲染的加粗文本"}
              checked={settings.content?.markdownFix ?? true}
              onChange={() =>
                updateNestedSetting("content", "markdownFix", !settings.content?.markdownFix)
              }
            />

            <ToggleRow
              label={t("userQueryMarkdownLabel") || "用户问题 Markdown 渲染"}
              description={t("userQueryMarkdownDesc") || "将用户输入的 Markdown 渲染为富文本"}
              checked={settings.content?.userQueryMarkdown ?? false}
              onChange={() =>
                updateNestedSetting(
                  "content",
                  "userQueryMarkdown",
                  !settings.content?.userQueryMarkdown,
                )
              }
            />

            <ToggleRow
              label={t("watermarkRemovalLabel") || "图片水印移除"}
              description={t("watermarkRemovalDesc") || "自动移除 AI 生成图片的水印"}
              checked={settings.content?.watermarkRemoval ?? false}
              onChange={async () => {
                const checked = settings.content?.watermarkRemoval
                if (!checked) {
                  // 1. 检查是否已有权限
                  const response = await sendToBackground({
                    type: MSG_CHECK_PERMISSIONS,
                    origins: ["<all_urls>"],
                  })

                  if (response.success && response.hasPermission) {
                    updateNestedSetting("content", "watermarkRemoval", true)
                  } else {
                    // 2. 请求权限 (打开独立窗口)
                    await sendToBackground({
                      type: MSG_REQUEST_PERMISSIONS,
                      permType: "allUrls",
                    })
                    showToast(t("permissionRequestToast") || "请在弹出的窗口中授予权限", 3000)
                  }
                } else {
                  updateNestedSetting("content", "watermarkRemoval", false)
                }
              }}
            />
          </SettingCard>

          {/* 交互增强卡片 */}
          <SettingCard
            title={t("interactionEnhance") || "交互增强"}
            description={t("interactionEnhanceDesc") || "增强公式和表格的交互功能"}>
            <ToggleRow
              label={t("formulaCopyLabel") || "双击复制公式"}
              description={t("formulaCopyDesc") || "双击数学公式即可复制其 LaTeX 源码"}
              checked={settings.content?.formulaCopy ?? true}
              onChange={() =>
                updateNestedSetting("content", "formulaCopy", !settings.content?.formulaCopy)
              }
            />

            <ToggleRow
              label={t("formulaDelimiterLabel") || "公式分隔符转换"}
              description={t("formulaDelimiterDesc") || "复制时将括号分隔符转为美元符号"}
              checked={settings.content?.formulaDelimiter ?? true}
              disabled={!settings.content?.formulaCopy}
              onChange={() =>
                updateNestedSetting(
                  "content",
                  "formulaDelimiter",
                  !settings.content?.formulaDelimiter,
                )
              }
            />

            <ToggleRow
              label={t("tableCopyLabel") || "表格复制 Markdown"}
              description={t("tableCopyDesc") || "表格右上角添加复制按钮"}
              checked={settings.content?.tableCopy ?? true}
              onChange={() =>
                updateNestedSetting("content", "tableCopy", !settings.content?.tableCopy)
              }
            />
          </SettingCard>
        </>
      )}
    </div>
  )
}

export default SiteSettingsPage
