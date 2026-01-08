/**
 * 页面与内容页面
 * 包含：页面布局 | 内容样式
 */
import React, { useEffect, useState } from "react"

import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { MSG_CHECK_PERMISSIONS, MSG_REQUEST_PERMISSIONS, sendToBackground } from "~utils/messaging"
import { showToast } from "~utils/toast"

import { SettingCard, SettingRow, TabGroup, ToggleRow } from "../components"

interface PageContentPageProps {
  siteId: string
}

const PageContentPage: React.FC<PageContentPageProps> = ({ siteId }) => {
  const [activeTab, setActiveTab] = useState("layout")
  const { settings, setSettings, updateNestedSetting } = useSettingsStore()

  // 获取当前站点的布局配置
  const currentPageWidth =
    settings?.layout?.pageWidth?.[siteId as keyof typeof settings.layout.pageWidth] ||
    settings?.layout?.pageWidth?._default
  const currentUserQueryWidth =
    settings?.layout?.userQueryWidth?.[siteId as keyof typeof settings.layout.userQueryWidth] ||
    settings?.layout?.userQueryWidth?._default

  // 临时宽度值（用于 onBlur 更新）
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
    { id: "content", label: t("contentStyleTab") || "内容样式" },
  ]

  return (
    <div>
      <h1 className="settings-page-title">{t("navPageContent") || "页面与内容"}</h1>
      <p className="settings-page-desc">
        {t("pageContentPageDesc") || "调整页面布局和内容显示样式"}
      </p>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

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

          {/* 滚动设置卡片 */}
          <SettingCard title={t("scrollSettings") || "滚动设置"}>
            <ToggleRow
              label={t("preventAutoScrollLabel") || "防止自动滚动"}
              description={t("preventAutoScrollDesc") || "阻止页面自动滚动到底部"}
              checked={settings.panel?.preventAutoScroll ?? false}
              onChange={() =>
                updateNestedSetting(
                  "panel",
                  "preventAutoScroll",
                  !settings.panel?.preventAutoScroll,
                )
              }
            />
          </SettingCard>
        </>
      )}

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

          {/* 导出设置卡片 */}
          <SettingCard title={t("exportSettings") || "导出设置"}>
            <ToggleRow
              label={t("exportImagesToBase64Label") || "导出时图片转 Base64"}
              description={t("exportImagesToBase64Desc") || "导出会话时将图片转为 Base64 嵌入"}
              checked={settings.content?.exportImagesToBase64 ?? false}
              onChange={() =>
                updateNestedSetting(
                  "content",
                  "exportImagesToBase64",
                  !settings.content?.exportImagesToBase64,
                )
              }
            />
          </SettingCard>
        </>
      )}
    </div>
  )
}

export default PageContentPage
