import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import type { Conversation, Folder } from "~core/conversation-manager"
import { t } from "~utils/i18n"

// ==================== 菜单样式  ====================

const MENU_STYLES = `
  .conversations-folder-menu {
    background: var(--gh-bg, white);
    border: 1px solid var(--gh-border, #e5e7eb);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000000;
    padding: 4px;
    min-width: 120px;
  }
  .conversations-folder-menu button {
    display: block;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: none;
    text-align: left;
    font-size: 13px;
    color: var(--gh-text, #374151);
    cursor: pointer;
    border-radius: 4px;
  }
  .conversations-folder-menu button:hover {
    background: var(--gh-hover, #f3f4f6);
  }
`

// 样式注入状态
let menuStyleInjected = false

const injectMenuStyles = () => {
  if (menuStyleInjected) return
  const style = document.createElement("style")
  style.id = "gh-menu-styles"
  style.textContent = MENU_STYLES
  document.head.appendChild(style)
  menuStyleInjected = true
}

// ==================== 通用菜单容器 ====================

interface MenuProps {
  anchorEl: HTMLElement | null
  onClose: () => void
  children: React.ReactNode
}
/**
 * 上下文菜单 - 使用 Portal 渲染到 document.body
 * 这样避免被 MainPanel 的 transform 影响 fixed 定位
 */
export const ContextMenu: React.FC<MenuProps> = ({ anchorEl, onClose, children }) => {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 注入菜单样式
    injectMenuStyles()

    if (!anchorEl) return

    const handleClickOutside = (e: MouseEvent) => {
      // 使用 composedPath 获取完整的事件路径（穿透 Shadow DOM）
      const path = e.composedPath()
      const clickedInMenu = menuRef.current && path.includes(menuRef.current)
      const clickedOnAnchor = path.includes(anchorEl)

      if (!clickedInMenu && !clickedOnAnchor) {
        onClose()
      }
    }

    // 延迟添加监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClickOutside, true) // 使用捕获阶段
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener("click", handleClickOutside, true)
    }
  }, [anchorEl, onClose])

  if (!anchorEl) return null

  const rect = anchorEl.getBoundingClientRect()

  // 使用 Portal 渲染到 document.body，避免 transform 影响 fixed 定位
  const menuContent = (
    <div
      ref={menuRef}
      className="conversations-folder-menu"
      style={{
        position: "fixed",
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        zIndex: 2147483647, // 最大 z-index 值
        pointerEvents: "auto",
      }}>
      {children}
    </div>
  )

  return createPortal(menuContent, document.body)
}

// ==================== 菜单按钮 ====================

interface MenuButtonProps {
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}

export const MenuButton: React.FC<MenuButtonProps> = ({ onClick, danger, children }) => (
  <button onClick={onClick} style={danger ? { color: "#ef4444" } : undefined}>
    {children}
  </button>
)

// ==================== 文件夹菜单 ====================

interface FolderMenuProps {
  folder: Folder
  anchorEl: HTMLElement | null
  onClose: () => void
  onRename: () => void
  onDelete: () => void
}

export const FolderMenu: React.FC<FolderMenuProps> = ({
  folder,
  anchorEl,
  onClose,
  onRename,
  onDelete,
}) => {
  return (
    <ContextMenu anchorEl={anchorEl} onClose={onClose}>
      <MenuButton
        onClick={() => {
          onClose()
          onRename()
        }}>
        {t("conversationsRename") || "重命名"}
      </MenuButton>
      <MenuButton
        danger
        onClick={() => {
          onClose()
          onDelete()
        }}>
        {t("conversationsDelete") || "删除"}
      </MenuButton>
    </ContextMenu>
  )
}

// ==================== 会话菜单 ====================

interface ConversationMenuProps {
  conversation: Conversation
  anchorEl: HTMLElement | null
  onClose: () => void
  onRename: () => void
  onTogglePin: () => void
  onSetTags: () => void
  onMoveTo: () => void
  onDelete: () => void
}

export const ConversationMenu: React.FC<ConversationMenuProps> = ({
  conversation,
  anchorEl,
  onClose,
  onRename,
  onTogglePin,
  onSetTags,
  onMoveTo,
  onDelete,
}) => {
  const pinText = conversation.pinned
    ? t("conversationsUnpin") || "取消置顶"
    : t("conversationsPin") || "📌 置顶"

  return (
    <ContextMenu anchorEl={anchorEl} onClose={onClose}>
      <MenuButton
        onClick={() => {
          onClose()
          onRename()
        }}>
        {t("conversationsRename") || "重命名"}
      </MenuButton>
      <MenuButton
        onClick={() => {
          onClose()
          onTogglePin()
        }}>
        {pinText}
      </MenuButton>
      <MenuButton
        onClick={() => {
          onClose()
          onSetTags()
        }}>
        {t("conversationsSetTags") || "设置标签"}
      </MenuButton>
      <MenuButton
        onClick={() => {
          onClose()
          onMoveTo()
        }}>
        {t("conversationsMoveTo") || "移动到..."}
      </MenuButton>
      <MenuButton
        danger
        onClick={() => {
          onClose()
          onDelete()
        }}>
        {t("conversationsDelete") || "删除"}
      </MenuButton>
    </ContextMenu>
  )
}

// ==================== 导出菜单 ====================

interface ExportMenuProps {
  anchorEl: HTMLElement | null
  onClose: () => void
  onExportMarkdown: () => void
  onExportJSON: () => void
  onExportTXT: () => void
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  anchorEl,
  onClose,
  onExportMarkdown,
  onExportJSON,
  onExportTXT,
}) => {
  return (
    <ContextMenu anchorEl={anchorEl} onClose={onClose}>
      <MenuButton
        onClick={() => {
          onClose()
          onExportMarkdown()
        }}>
        📝 {t("exportToMarkdown") || "Markdown"}
      </MenuButton>
      <MenuButton
        onClick={() => {
          onClose()
          onExportJSON()
        }}>
        📋 {t("exportToJSON") || "JSON"}
      </MenuButton>
      <MenuButton
        onClick={() => {
          onClose()
          onExportTXT()
        }}>
        📄 {t("exportToTXT") || "TXT"}
      </MenuButton>
    </ContextMenu>
  )
}
