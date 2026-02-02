/**
 * 功能模块页面
 * 包含：标签页、内容处理、大纲、会话、模型锁定、阅读历史
 * 使用顶部 Tab 切换
 */
import React, { useState } from "react"

import { FeaturesIcon } from "~components/icons"
import { NumberInput } from "~components/ui"
import { FEATURES_TAB_IDS } from "~constants"
import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { MSG_CHECK_PERMISSIONS, MSG_REQUEST_PERMISSIONS, sendToBackground } from "~utils/messaging"
import { showToast } from "~utils/toast"

import { PageTitle, SettingCard, SettingRow, TabGroup, ToggleRow } from "../components"

interface FeaturesPageProps {
  siteId: string
}

const FeaturesPage: React.FC<FeaturesPageProps> = () => {
  const tabs = [
    { id: FEATURES_TAB_IDS.OUTLINE, label: t("tabOutline") || "大纲" },
    { id: FEATURES_TAB_IDS.CONVERSATIONS, label: t("tabConversations") || "会话" },
    { id: FEATURES_TAB_IDS.TAB_SETTINGS, label: t("tabSettingsTab") || "标签页" },
    { id: FEATURES_TAB_IDS.CONTENT, label: t("navContent") || "内容交互" },
    { id: FEATURES_TAB_IDS.READING_HISTORY, label: t("readingHistoryTitle") || "阅读历史" },
  ]

  const [activeTab, setActiveTab] = useState<string>(tabs[0].id)
  const { settings, updateDeepSetting, updateNestedSetting } = useSettingsStore()

  if (!settings) return null

  return (
    <div>
      <PageTitle title={t("navFeatures") || "功能模块"} Icon={FeaturesIcon} />
      <p className="settings-page-desc">{t("featuresPageDesc") || "配置扩展的各项功能模块"}</p>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ========== 标签页 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.TAB_SETTINGS && (
        <>
          {/* 标签页行为卡片 */}
          <SettingCard title={t("tabBehaviorTitle") || "标签页行为"}>
            <ToggleRow
              label={t("openNewTabLabel") || "新标签页打开"}
              description={t("openNewTabDesc") || "在新标签页中打开新对话"}
              checked={settings.tab?.openInNewTab ?? true}
              onChange={() =>
                updateNestedSetting("tab", "openInNewTab", !settings.tab?.openInNewTab)
              }
            />

            <ToggleRow
              label={t("autoRenameTabLabel") || "自动重命名"}
              description={t("autoRenameTabDesc") || "根据对话内容自动更新标签页标题"}
              checked={settings.tab?.autoRename ?? false}
              onChange={() => updateNestedSetting("tab", "autoRename", !settings.tab?.autoRename)}
            />

            <SettingRow
              label={t("renameIntervalLabel") || "检测频率"}
              disabled={!settings.tab?.autoRename}>
              <select
                className="settings-select"
                value={settings.tab?.renameInterval || 3}
                onChange={(e) =>
                  updateNestedSetting("tab", "renameInterval", parseInt(e.target.value))
                }
                disabled={!settings.tab?.autoRename}>
                {[1, 3, 5, 10, 30, 60].map((v) => (
                  <option key={v} value={v}>
                    {v} 秒
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              label={t("titleFormatLabel") || "标题格式"}
              description={t("titleFormatDesc") || "支持占位符：{status}、{title}、{model}"}
              disabled={!settings.tab?.autoRename}>
              <input
                type="text"
                className="settings-input"
                value={settings.tab?.titleFormat || "{status}{title}"}
                onChange={(e) => updateNestedSetting("tab", "titleFormat", e.target.value)}
                placeholder="{status}{title}"
                disabled={!settings.tab?.autoRename}
                style={{ width: "180px" }}
              />
            </SettingRow>

            <ToggleRow
              label={t("showStatusLabel") || "显示生成状态"}
              description={t("showStatusDesc") || "在标签页标题中显示生成状态"}
              checked={settings.tab?.showStatus ?? true}
              onChange={() => updateNestedSetting("tab", "showStatus", !settings.tab?.showStatus)}
            />
          </SettingCard>

          {/* 完成提醒卡片 */}
          <SettingCard title={t("notificationSettings") || "完成提醒"}>
            <ToggleRow
              label={t("showNotificationLabel") || "桌面通知"}
              description={t("showNotificationDesc") || "生成完成时发送桌面通知"}
              checked={settings.tab?.showNotification ?? false}
              onChange={async () => {
                const checked = settings.tab?.showNotification
                if (!checked) {
                  // 油猴脚本环境：直接启用（不需要检查权限，GM_notification 已通过 @grant 声明）
                  if (!platform.hasCapability("permissions")) {
                    updateNestedSetting("tab", "showNotification", true)
                    return
                  }
                  // 1. 检查是否已有权限
                  const response = await sendToBackground({
                    type: MSG_CHECK_PERMISSIONS,
                    permissions: ["notifications"],
                  })

                  if (response.success && response.hasPermission) {
                    updateNestedSetting("tab", "showNotification", true)
                  } else {
                    // 2. 请求权限 (打开独立窗口)
                    await sendToBackground({
                      type: MSG_REQUEST_PERMISSIONS,
                      permType: "notifications",
                    })
                    showToast(t("permissionRequestToast") || "请在弹出的窗口中授予权限", 3000)
                  }
                } else {
                  updateNestedSetting("tab", "showNotification", false)
                }
              }}
            />

            <ToggleRow
              label={t("notificationSoundLabel") || "通知声音"}
              description={t("notificationSoundDesc") || "生成完成时播放提示音"}
              checked={settings.tab?.notificationSound ?? false}
              disabled={!settings.tab?.showNotification}
              onChange={() =>
                updateNestedSetting("tab", "notificationSound", !settings.tab?.notificationSound)
              }
            />

            <SettingRow
              label={t("notificationVolumeLabel") || "声音音量"}
              disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={settings.tab?.notificationVolume || 0.5}
                  onChange={(e) =>
                    updateNestedSetting("tab", "notificationVolume", parseFloat(e.target.value))
                  }
                  disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}
                  style={{ width: "100px" }}
                />
                <span style={{ fontSize: "12px", minWidth: "36px" }}>
                  {Math.round((settings.tab?.notificationVolume || 0.5) * 100)}%
                </span>
              </div>
            </SettingRow>

            <ToggleRow
              label={t("notifyWhenFocusedLabel") || "前台时也通知"}
              description={t("notifyWhenFocusedDesc") || "窗口在前台时也发送通知"}
              checked={settings.tab?.notifyWhenFocused ?? false}
              disabled={!settings.tab?.showNotification}
              onChange={() =>
                updateNestedSetting("tab", "notifyWhenFocused", !settings.tab?.notifyWhenFocused)
              }
            />

            <ToggleRow
              label={t("autoFocusLabel") || "自动窗口置顶"}
              description={t("autoFocusDesc") || "生成完成后自动激活窗口"}
              checked={settings.tab?.autoFocus ?? false}
              disabled={!settings.tab?.showNotification}
              onChange={() => updateNestedSetting("tab", "autoFocus", !settings.tab?.autoFocus)}
            />
          </SettingCard>

          {/* 隐私模式卡片 */}
          <SettingCard title={t("privacyModeTitle") || "隐私模式"}>
            <ToggleRow
              label={t("privacyModeLabel") || "启用隐私模式"}
              description={t("privacyModeDesc") || "使用伪装标题隐藏真实内容"}
              checked={settings.tab?.privacyMode ?? false}
              onChange={() => updateNestedSetting("tab", "privacyMode", !settings.tab?.privacyMode)}
            />

            <SettingRow
              label={t("privacyTitleLabel") || "伪装标题"}
              disabled={!settings.tab?.privacyMode}>
              <input
                type="text"
                className="settings-input"
                value={settings.tab?.privacyTitle || "Google"}
                onChange={(e) => updateNestedSetting("tab", "privacyTitle", e.target.value)}
                placeholder="Google"
                disabled={!settings.tab?.privacyMode}
                style={{ width: "180px" }}
              />
            </SettingRow>
          </SettingCard>
        </>
      )}

      {/* ========== 大纲 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.OUTLINE && (
        <>
          <SettingCard
            title={t("outlineSettings") || "大纲设置"}
            description={t("outlineSettingsDesc") || "配置大纲生成和跟随行为"}>
            <ToggleRow
              label={t("outlineAutoUpdateLabel") || "自动更新"}
              description={t("outlineAutoUpdateDesc") || "在对话进行时自动刷新大纲"}
              checked={settings.features?.outline?.autoUpdate ?? true}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "outline",
                  "autoUpdate",
                  !settings.features?.outline?.autoUpdate,
                )
              }
            />

            <SettingRow
              label={t("outlineUpdateIntervalLabel") || "更新检测间隔"}
              description={t("outlineUpdateIntervalDesc") || "大纲自动更新的时间间隔（秒）"}>
              <NumberInput
                value={settings.features?.outline?.updateInterval ?? 2}
                onChange={(val) => updateDeepSetting("features", "outline", "updateInterval", val)}
                min={1}
                max={60}
                defaultValue={2}
                style={{ width: "80px" }}
              />
            </SettingRow>

            <SettingRow
              label={t("outlineFollowModeLabel") || "大纲跟随模式"}
              description={
                settings.features?.outline?.followMode === "current"
                  ? t("outlineFollowCurrentDesc") || "滚动页面时自动定位高亮大纲项"
                  : settings.features?.outline?.followMode === "latest"
                    ? t("outlineFollowLatestDesc") || "大纲始终自动滚动到底部"
                    : t("outlineFollowManualDesc") || "不自动滚动大纲"
              }>
              <select
                className="settings-select"
                value={settings.features?.outline?.followMode || "current"}
                onChange={(e) =>
                  updateDeepSetting(
                    "features",
                    "outline",
                    "followMode",
                    e.target.value as "current" | "latest" | "manual",
                  )
                }>
                <option value="current">{t("outlineFollowCurrent") || "跟随当前位置"}</option>
                <option value="latest">{t("outlineFollowLatest") || "跟随最新消息"}</option>
                <option value="manual">{t("outlineFollowManual") || "手动控制"}</option>
              </select>
            </SettingRow>

            <ToggleRow
              label={t("outlineShowWordCountLabel") || "悬浮显示字数"}
              description={t("outlineShowWordCountDesc") || "在大纲悬浮提示中显示该章节的字数"}
              checked={settings.features?.outline?.showWordCount ?? false}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "outline",
                  "showWordCount",
                  !settings.features?.outline?.showWordCount,
                )
              }
            />
          </SettingCard>

          {/* 收藏图标设置卡片 */}
          <SettingCard
            title={t("bookmarkSettings") || "收藏"}
            description={t("bookmarkSettingsDesc") || "配置页内收藏功能"}>
            <SettingRow
              label={t("inlineBookmarkModeLabel") || "页内收藏图标"}
              description={t("inlineBookmarkModeDesc") || "控制页面标题旁的收藏图标显示方式"}>
              <select
                className="settings-select"
                value={settings.features?.outline?.inlineBookmarkMode || "always"}
                onChange={(e) =>
                  updateDeepSetting(
                    "features",
                    "outline",
                    "inlineBookmarkMode",
                    e.target.value as "always" | "hover" | "hidden",
                  )
                }>
                <option value="always">{t("inlineBookmarkModeAlways") || "固定显示"}</option>
                <option value="hover">{t("inlineBookmarkModeHover") || "悬浮显示"}</option>
                <option value="hidden">{t("inlineBookmarkModeHidden") || "隐藏"}</option>
              </select>
            </SettingRow>

            <SettingRow
              label={t("panelBookmarkModeLabel") || "面板收藏图标"}
              description={t("panelBookmarkModeDesc") || "控制大纲面板中的收藏图标显示方式"}>
              <select
                className="settings-select"
                value={settings.features?.outline?.panelBookmarkMode || "always"}
                onChange={(e) =>
                  updateDeepSetting(
                    "features",
                    "outline",
                    "panelBookmarkMode",
                    e.target.value as "always" | "hover" | "hidden",
                  )
                }>
                <option value="always">{t("inlineBookmarkModeAlways") || "固定显示"}</option>
                <option value="hover">{t("inlineBookmarkModeHover") || "悬浮显示"}</option>
                <option value="hidden">{t("inlineBookmarkModeHidden") || "隐藏"}</option>
              </select>
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

      {/* ========== 会话 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.CONVERSATIONS && (
        <>
          <SettingCard
            title={t("conversationsSettingsTitle") || "会话管理"}
            description={t("conversationsSettingsDesc") || "配置会话同步和显示行为"}>
            <ToggleRow
              label={t("folderRainbowLabel") || "文件夹彩虹色"}
              description={t("folderRainbowDesc") || "为不同文件夹使用不同颜色"}
              checked={settings.features?.conversations?.folderRainbow ?? true}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "conversations",
                  "folderRainbow",
                  !settings.features?.conversations?.folderRainbow,
                )
              }
            />

            <ToggleRow
              label={t("conversationsSyncUnpinLabel") || "同步时取消置顶"}
              description={t("conversationsSyncUnpinDesc") || "同步会话时自动取消置顶"}
              checked={settings.features?.conversations?.syncUnpin ?? false}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "conversations",
                  "syncUnpin",
                  !settings.features?.conversations?.syncUnpin,
                )
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

            <SettingRow
              label={t("exportCustomUserName") || "自定义用户名称"}
              description={
                t("exportCustomUserNameDesc") || "导出时使用的用户显示名称 (默认: User)"
              }>
              <input
                type="text"
                className="settings-input"
                value={settings.export?.customUserName || ""}
                onChange={(e) => updateNestedSetting("export", "customUserName", e.target.value)}
                placeholder="User"
                style={{ width: "180px" }}
              />
            </SettingRow>

            <SettingRow
              label={t("exportCustomModelName") || "自定义 AI 名称"}
              description={
                t("exportCustomModelNameDesc") || "导出时使用的 AI 显示名称 (默认: 站点名称)"
              }>
              <input
                type="text"
                className="settings-input"
                value={settings.export?.customModelName || ""}
                onChange={(e) => updateNestedSetting("export", "customModelName", e.target.value)}
                placeholder="Site Name"
                style={{ width: "180px" }}
              />
            </SettingRow>
          </SettingCard>
        </>
      )}

      {/* ========== 阅读历史 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.READING_HISTORY && (
        <SettingCard
          title={t("readingHistoryTitle") || "阅读历史"}
          description={t("readingHistoryDesc") || "记录和恢复会话阅读位置"}>
          <ToggleRow
            label={t("readingHistoryPersistenceLabel") || "启用阅读历史"}
            description={t("readingHistoryPersistenceDesc") || "记录每个会话的阅读位置"}
            checked={settings.readingHistory?.persistence ?? true}
            onChange={() =>
              updateNestedSetting(
                "readingHistory",
                "persistence",
                !settings.readingHistory?.persistence,
              )
            }
          />

          <ToggleRow
            label={t("readingHistoryAutoRestoreLabel") || "自动恢复位置"}
            description={t("readingHistoryAutoRestoreDesc") || "打开会话时自动跳转到上次阅读位置"}
            checked={settings.readingHistory?.autoRestore ?? true}
            disabled={!settings.readingHistory?.persistence}
            onChange={() =>
              updateNestedSetting(
                "readingHistory",
                "autoRestore",
                !settings.readingHistory?.autoRestore,
              )
            }
          />

          <SettingRow
            label={t("readingHistoryCleanup") || "历史保留时间"}
            disabled={!settings.readingHistory?.persistence}>
            <select
              className="settings-select"
              value={settings.readingHistory?.cleanupDays || 30}
              onChange={(e) =>
                updateNestedSetting("readingHistory", "cleanupDays", parseInt(e.target.value))
              }
              disabled={!settings.readingHistory?.persistence}>
              <option value={1}>1 {t("day") || "天"}</option>
              <option value={3}>3 {t("days") || "天"}</option>
              <option value={7}>7 {t("days") || "天"}</option>
              <option value={30}>30 {t("days") || "天"}</option>
              <option value={90}>90 {t("days") || "天"}</option>
              <option value={-1}>{t("forever") || "永久"}</option>
            </select>
          </SettingRow>
        </SettingCard>
      )}

      {/* ========== 内容交互 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.CONTENT && (
        <SettingCard
          title={t("interactionEnhance") || "交互增强"}
          description={t("interactionEnhanceDesc") || "增强公式和表格的交互功能"}>
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
      )}
    </div>
  )
}

export default FeaturesPage
