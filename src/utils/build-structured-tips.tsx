import React from "react"

import { DEFAULT_KEYBINDINGS, formatShortcut } from "~constants/shortcuts"
import type { ShortcutBinding } from "~constants/shortcuts"
import { t } from "~utils/i18n"

type TipItem = { icon: string; text: React.ReactNode }

function renderTip(transKey: string, placeholderName: string, kbValue: string): React.ReactNode {
  const raw = t(transKey, { [placeholderName]: "___SC___" })
  const parts = raw.split("___SC___")
  if (parts.length === 1) return parts[0]
  return (
    <span style={{ display: "inline" }}>
      {parts[0]}
      <span
        style={{
          fontFamily: "monospace",
          background: "var(--gh-bg-secondary, #f3f4f6)",
          border: "1px solid var(--gh-border, #e5e7eb)",
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "11px",
          fontWeight: 500,
          color: "var(--gh-text, #1f2937)",
          display: "inline-flex",
          alignItems: "center",
          margin: "0 4px",
          verticalAlign: "bottom",
        }}>
        {kbValue}
      </span>
      {parts[1]}
    </span>
  )
}

export function buildStructuredTips(
  keybindings: Record<string, ShortcutBinding | null> | undefined,
  isMac: boolean,
  shortcutNotSetLabel: string,
): TipItem[] {
  const kb = keybindings ?? DEFAULT_KEYBINDINGS
  const fmt = (id: string) => {
    const shortcut = kb[id]
    if (shortcut === undefined) {
      const defaultShortcut = DEFAULT_KEYBINDINGS[id]
      return defaultShortcut ? formatShortcut(defaultShortcut, isMac) : shortcutNotSetLabel
    }
    return shortcut ? formatShortcut(shortcut, isMac) : shortcutNotSetLabel
  }
  // 返回快捷键字符串；若快捷键被用户清除（null）或默认绑定缺失，返回 null
  const fmtOrNull = (id: string): string | null => {
    const shortcut = kb[id]
    if (shortcut === undefined) {
      const defaultShortcut = DEFAULT_KEYBINDINGS[id]
      return defaultShortcut ? formatShortcut(defaultShortcut, isMac) : null
    }
    return shortcut ? formatShortcut(shortcut, isMac) : null
  }

  const panelModeShortcut = fmtOrNull("togglePanelMode")

  return [
    { icon: "👻", text: renderTip("tip1", "modifier", isMac ? "⌘ Cmd" : "Ctrl") },
    {
      icon: "↔️",
      text: panelModeShortcut
        ? renderTip("featureTip-panel-mode-toggle-path", "shortcut", panelModeShortcut)
        : t("featureTip-panel-mode-toggle-path-dblclick"),
    },
    { icon: "🔍", text: renderTip("tip4", "shortcut", fmt("openGlobalSearch")) },
    { icon: "🚀", text: renderTip("tip3", "shortcut", fmt("showShortcuts")) },
    { icon: "📋", text: renderTip("tip5", "shortcut", fmt("copyLatestReply")) },
    {
      icon: "🧭",
      text: renderTip("tip6", "shortcut", fmt("prevHeading") + "/" + fmt("nextHeading")),
    },
  ]
}
