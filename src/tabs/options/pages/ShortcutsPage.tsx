/**
 * 快捷键设置页面
 * 显示和配置所有快捷键
 */
import React, { useCallback, useState } from "react"

import { KeyboardIcon } from "~components/icons"
import { ConfirmDialog, Tooltip } from "~components/ui"
import {
  DEFAULT_KEYBINDINGS,
  formatShortcut,
  isMacOS,
  SHORTCUT_CATEGORIES,
  SHORTCUT_META,
  type ShortcutActionId,
  type ShortcutBinding,
} from "~constants/shortcuts"
import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { MSG_OPEN_URL, sendToBackground } from "~utils/messaging"

import { PageTitle, SettingCard, SettingRow, ToggleRow } from "../components"

interface ShortcutsPageProps {
  siteId: string
}

// 快捷键录入组件
const ShortcutInput: React.FC<{
  binding: ShortcutBinding | null
  onChange: (binding: ShortcutBinding) => void
  onRemove: () => void
  conflictWarning?: string
}> = ({ binding, onChange, onRemove, conflictWarning }) => {
  const [isRecording, setIsRecording] = useState(false)
  const isMac = isMacOS()

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isRecording) return

      e.preventDefault()
      e.stopPropagation()

      // 忽略单独的修饰键
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        return
      }

      const newBinding: ShortcutBinding = {
        key: e.key,
        alt: e.altKey,
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        shift: e.shiftKey,
      }

      // 如果没有任何修饰键，取消录入
      if (!newBinding.alt && !newBinding.ctrl && !newBinding.meta && !newBinding.shift) {
        // 对于功能键允许单独使用
        const allowedSingleKeys = [
          "Escape",
          "F1",
          "F2",
          "F3",
          "F4",
          "F5",
          "F6",
          "F7",
          "F8",
          "F9",
          "F10",
          "F11",
          "F12",
        ]
        if (!allowedSingleKeys.includes(e.key)) {
          return
        }
      }

      // 跨平台兼容：Mac 上将 meta (⌘) 转换为 ctrl，确保同步到 Windows 后可用
      if (isMac && newBinding.meta) {
        newBinding.ctrl = true
        newBinding.meta = false
      }

      onChange(newBinding)
      setIsRecording(false)
    },
    [isRecording, onChange, isMac],
  )

  const handleBlur = () => {
    setIsRecording(false)
  }

  // 如果 binding 为 null，显示"未设置"
  const displayText = isRecording
    ? t("pressAnyKey") || "请按下快捷键..."
    : binding
      ? formatShortcut(binding, isMac)
      : t("shortcutNotSet") || "未设置"

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <button
        className={`shortcut-input ${isRecording ? "recording" : ""} ${!binding ? "not-set" : ""}`}
        onClick={() => setIsRecording(true)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          padding: "6px 12px",
          minWidth: "120px",
          fontSize: "13px",
          fontFamily: "monospace",
          border: isRecording
            ? "2px solid var(--gh-primary)"
            : "1px solid var(--gh-border, #e5e7eb)",
          borderRadius: "6px",
          background: isRecording ? "var(--gh-bg-hover)" : "var(--gh-bg)",
          color: binding ? "var(--gh-text)" : "var(--gh-text-tertiary)",
          cursor: "pointer",
          textAlign: "center",
          transition: "all 0.2s",
          fontStyle: binding ? "normal" : "italic",
        }}>
        {displayText}
      </button>
      {/* 移除按钮 */}
      {binding && (
        <Tooltip content={t("shortcutRemove") || "移除"}>
          <button
            onClick={onRemove}
            style={{
              padding: "4px 8px",
              fontSize: "12px",
              border: "1px solid var(--gh-border)",
              borderRadius: "4px",
              background: "var(--gh-bg)",
              color: "var(--gh-text-secondary)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}>
            ✕
          </button>
        </Tooltip>
      )}
      {conflictWarning && (
        <span style={{ fontSize: "12px", color: "var(--gh-error, #ef4444)" }}>
          {conflictWarning}
        </span>
      )}
    </div>
  )
}

const ShortcutsPage: React.FC<ShortcutsPageProps> = ({ siteId: _siteId }) => {
  const { settings, setSettings } = useSettingsStore()
  const shortcuts = settings?.shortcuts

  // 检测快捷键冲突
  const checkConflict = useCallback(
    (actionId: string, binding: ShortcutBinding | null): string | undefined => {
      if (!binding) return undefined // null 绑定没有冲突
      const allBindings = shortcuts?.keybindings || {}
      for (const [id, b] of Object.entries(allBindings)) {
        if (id === actionId) continue
        if (b === null) continue // 跳过已移除的绑定
        // 跳过不在 SHORTCUT_META 中的旧配置
        const meta = SHORTCUT_META[id as ShortcutActionId]
        if (!meta) continue

        if (
          b.key === binding.key &&
          !!b.alt === !!binding.alt &&
          !!b.ctrl === !!binding.ctrl &&
          !!b.meta === !!binding.meta &&
          !!b.shift === !!binding.shift
        ) {
          return `${t("shortcutConflictWith") || "与"} "${t(meta.labelKey) || meta.label}" ${t("shortcutConflict") || "冲突"}`
        }
      }
      return undefined
    },
    [shortcuts?.keybindings],
  )

  // 更新单个快捷键
  const updateKeybinding = useCallback(
    (actionId: string, binding: ShortcutBinding) => {
      setSettings({
        shortcuts: {
          ...shortcuts,
          enabled: shortcuts?.enabled ?? true,
          globalUrl: shortcuts?.globalUrl ?? "https://gemini.google.com",
          keybindings: {
            ...shortcuts?.keybindings,
            [actionId]: binding,
          },
        },
      })
    },
    [shortcuts, setSettings],
  )

  // 移除单个快捷键
  const removeKeybinding = useCallback(
    (actionId: string) => {
      setSettings({
        shortcuts: {
          ...shortcuts,
          enabled: shortcuts?.enabled ?? true,
          globalUrl: shortcuts?.globalUrl ?? "https://gemini.google.com",
          keybindings: {
            ...shortcuts?.keybindings,
            [actionId]: null, // 设置为 null 表示移除
          },
        },
      })
    },
    [shortcuts, setSettings],
  )

  // 恢复默认快捷键确认弹窗状态
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // 恢复默认快捷键
  const resetToDefault = useCallback(() => {
    setSettings({
      shortcuts: {
        ...shortcuts,
        keybindings: { ...DEFAULT_KEYBINDINGS },
      },
    })
    setShowResetConfirm(false)
  }, [shortcuts, setSettings])

  // 按分类分组快捷键
  const groupedActions = Object.entries(SHORTCUT_CATEGORIES).map(([categoryId, categoryMeta]) => {
    const actions = Object.entries(SHORTCUT_META).filter(
      ([, meta]) => meta.category === categoryId,
    ) as [ShortcutActionId, (typeof SHORTCUT_META)[ShortcutActionId]][]
    return { categoryId, categoryMeta, actions }
  })

  if (!settings) return null

  return (
    <div>
      <PageTitle title={t("navShortcuts") || "快捷键"} Icon={KeyboardIcon} />
      <p className="settings-page-desc">
        {t("shortcutsPageDesc") || "配置键盘快捷键以快速执行操作"}
      </p>

      {/* 总开关 */}
      <SettingCard title={t("shortcutsGlobalSettings") || "快捷键设置"}>
        <ToggleRow
          label={t("enableShortcuts") || "启用快捷键"}
          description={t("enableShortcutsDesc") || "启用或禁用所有键盘快捷键"}
          checked={shortcuts?.enabled ?? true}
          onChange={() =>
            setSettings({
              shortcuts: {
                ...shortcuts,
                enabled: !(shortcuts?.enabled ?? true),
                globalUrl: shortcuts?.globalUrl ?? "https://gemini.google.com",
                keybindings: shortcuts?.keybindings ?? DEFAULT_KEYBINDINGS,
              },
            })
          }
        />

        {platform.hasCapability("commands") && (
          <>
            <SettingRow
              label={t("globalShortcutUrl") || "全局快捷键打开的 URL"}
              description={t("globalShortcutUrlDesc") || "按下全局快捷键 Alt+G 时打开的网址"}>
              <input
                type="text"
                className="settings-input"
                value={shortcuts?.globalUrl || "https://gemini.google.com"}
                onChange={(e) =>
                  setSettings({
                    shortcuts: {
                      ...shortcuts,
                      enabled: shortcuts?.enabled ?? true,
                      globalUrl: e.target.value,
                      keybindings: shortcuts?.keybindings ?? DEFAULT_KEYBINDINGS,
                    },
                  })
                }
                style={{ width: "280px" }}
                placeholder="https://gemini.google.com"
              />
            </SettingRow>

            <SettingRow
              label={t("globalShortcutsTitle") || "全局快捷键"}
              description={
                t("globalShortcutsDesc") ||
                "在浏览器任何页面都可使用，需要在浏览器扩展设置页面配置。"
              }>
              {(() => {
                const ua = navigator.userAgent
                const isChrome = ua.includes("Chrome") && !ua.includes("Edg/")
                const isEdge = ua.includes("Edg/")
                const isFirefox = ua.includes("Firefox")

                const isSupported = isChrome || isEdge || isFirefox

                if (!isSupported) {
                  return (
                    <span style={{ fontSize: "13px", color: "var(--gh-text-tertiary)" }}>
                      {t("browserNotSupported") || "当前浏览器不支持自定义扩展快捷键"}
                    </span>
                  )
                }

                let url = "chrome://extensions/shortcuts"
                if (isEdge) url = "edge://extensions/shortcuts"
                else if (isFirefox) url = "about:addons"

                return (
                  <button
                    onClick={() => sendToBackground({ type: MSG_OPEN_URL, url })}
                    style={{
                      padding: "6px 12px",
                      fontSize: "13px",
                      border: "none",
                      borderRadius: "6px",
                      background: "var(--gh-primary)",
                      color: "#fff",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}>
                    {t("openBrowserShortcuts") || "打开浏览器快捷键设置"}
                  </button>
                )
              })()}
            </SettingRow>
          </>
        )}

        {/* 恢复默认按钮 */}
        <div
          style={{
            marginTop: "16px",
            paddingTop: "16px",
            borderTop: "1px solid var(--gh-border)",
          }}>
          <button
            onClick={() => setShowResetConfirm(true)}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              border: "1px solid var(--gh-border)",
              borderRadius: "6px",
              background: "var(--gh-bg)",
              color: "var(--gh-text-secondary)",
              cursor: "pointer",
            }}>
            {t("resetShortcuts") || "恢复默认快捷键"}
          </button>
        </div>
      </SettingCard>

      {/* 各分类的快捷键 */}
      {groupedActions.map(({ categoryId, categoryMeta, actions }) => (
        <SettingCard key={categoryId} title={t(categoryMeta.labelKey) || categoryMeta.label}>
          {actions.map(([actionId, meta]) => {
            // 获取绑定：用户设置 > 默认设置（若用户设置为 null 则为已移除）
            const userBinding = shortcuts?.keybindings?.[actionId]
            const binding =
              userBinding === null ? null : userBinding || DEFAULT_KEYBINDINGS[actionId]
            const conflict = checkConflict(actionId, binding)

            return (
              <SettingRow
                key={actionId}
                label={t(meta.labelKey) || meta.label}
                disabled={!shortcuts?.enabled}>
                <ShortcutInput
                  binding={binding}
                  onChange={(b) => updateKeybinding(actionId, b)}
                  onRemove={() => removeKeybinding(actionId)}
                  conflictWarning={conflict || undefined}
                />
              </SettingRow>
            )
          })}
        </SettingCard>
      ))}

      {/* 恢复默认确认弹窗 */}
      {showResetConfirm && (
        <ConfirmDialog
          title={t("resetShortcuts") || "恢复默认快捷键"}
          message={t("resetShortcutsConfirm") || "确定要恢复所有快捷键为默认值吗？"}
          danger
          onConfirm={resetToDefault}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </div>
  )
}

export default ShortcutsPage
