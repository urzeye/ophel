import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import {
  CopyIcon,
  ExportIcon,
  JSONFileIcon,
  MarkdownIcon,
  PageContentIcon,
  TXTFileIcon,
} from "~components/icons"
import { DeleteIcon } from "~components/icons/DeleteIcon"
import { FolderMoveIcon } from "~components/icons/FolderMoveIcon"
import { PinIcon } from "~components/icons/PinIcon"
import { RenameIcon } from "~components/icons/RenameIcon"
import { TagIcon } from "~components/icons/TagIcon"
import type { Conversation, Folder } from "~core/conversation-manager"
import { t } from "~utils/i18n"

// ==================== 菜单样式  ====================

const MENU_STYLES = `
  .conversations-folder-menu {
    background: var(--gh-bg, white);
    border: 1px solid var(--gh-border, #e5e7eb);
    border-radius: 6px;
    box-shadow: var(--gh-shadow, 0 4px 12px rgba(0,0,0,0.15));
    z-index: 10000000;
    padding: 3px;
    min-width: 80px;
  }
  .conversations-folder-menu button {
    display: block;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: none;
    text-align: left;
    font-size: 12px;
    color: var(--gh-text, #374151);
    cursor: pointer;
    border-radius: 4px;
    white-space: nowrap;
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
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null)

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

  // 计算菜单位置，确保不超出屏幕边界
  useEffect(() => {
    if (!anchorEl || !menuRef.current) return

    const rect = anchorEl.getBoundingClientRect()
    const menuRect = menuRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const menuWidth = menuRect.width || 150 // 默认菜单宽度
    const menuHeight = menuRect.height || 200 // 默认菜单高度

    let left = rect.left
    let top = rect.bottom + 4

    // 检测是否超出右边界，如果超出则向左展开
    if (left + menuWidth > viewportWidth - 10) {
      left = rect.right - menuWidth
    }

    // 检测是否超出左边界
    if (left < 10) {
      left = 10
    }

    // 检测是否超出下边界，如果超出则向上展开
    if (top + menuHeight > viewportHeight - 10) {
      top = rect.top - menuHeight - 4
    }

    // 检测是否超出上边界
    if (top < 10) {
      top = 10
    }

    setMenuPosition({ left, top })
  }, [anchorEl])

  if (!anchorEl) return null

  // 使用 Portal 渲染到 document.body，避免 transform 影响 fixed 定位
  const menuContent = (
    <div
      ref={menuRef}
      className="conversations-folder-menu"
      style={{
        position: "fixed",
        top: menuPosition ? `${menuPosition.top}px` : "-9999px",
        left: menuPosition ? `${menuPosition.left}px` : "-9999px",
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
  <button
    onClick={onClick}
    style={danger ? { color: "var(--gh-text-danger, #ef4444)" } : undefined}>
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
  folder: _folder,
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
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}>
          <span>{t("conversationsRename") || "重命名"}</span>
          <RenameIcon size={13} />
        </span>
      </MenuButton>
      <MenuButton
        danger
        onClick={() => {
          onClose()
          onDelete()
        }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}>
          <span>{t("conversationsDelete") || "删除"}</span>
          <DeleteIcon size={13} />
        </span>
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
  onExport: () => void
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
  onExport,
  onDelete,
}) => {
  return (
    <ContextMenu anchorEl={anchorEl} onClose={onClose}>
      <MenuButton
        onClick={() => {
          onClose()
          onRename()
        }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}>
          <span>{t("conversationsRename") || "重命名"}</span>
          <RenameIcon size={13} />
        </span>
      </MenuButton>
      <MenuButton
        onClick={() => {
          onClose()
          onTogglePin()
        }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}>
          <span>
            {conversation.pinned
              ? t("conversationsUnpin") || "取消置顶"
              : t("conversationsPin") || "置顶"}
          </span>
          <PinIcon size={13} filled={conversation.pinned} />
        </span>
      </MenuButton>
      <MenuButton
        onClick={() => {
          onClose()
          onSetTags()
        }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}>
          <span>{t("conversationsSetTags") || "设置标签"}</span>
          <TagIcon size={13} />
        </span>
      </MenuButton>
      <MenuButton
        onClick={() => {
          onClose()
          onMoveTo()
        }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}>
          <span>{t("conversationsMoveTo") || "移动到..."}</span>
          <FolderMoveIcon size={13} />
        </span>
      </MenuButton>
      <MenuButton
        onClick={() => {
          onClose()
          onExport()
        }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}>
          <span>{t("export") || "导出"}</span>
          <ExportIcon size={13} />
        </span>
      </MenuButton>
      <MenuButton
        danger
        onClick={() => {
          onClose()
          onDelete()
        }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}>
          <span>{t("conversationsDelete") || "删除"}</span>
          <DeleteIcon size={13} />
        </span>
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
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <MarkdownIcon size={14} />
          <span>{t("exportToMarkdown") || "Markdown"}</span>
        </div>
      </MenuButton>
      <MenuButton
        onClick={() => {
          onClose()
          onExportJSON()
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <JSONFileIcon size={14} />
          <span>{t("exportToJSON") || "JSON"}</span>
        </div>
      </MenuButton>
      <MenuButton
        onClick={() => {
          onClose()
          onExportTXT()
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <TXTFileIcon size={14} />
          <span>{t("exportToTXT") || "TXT"}</span>
        </div>
      </MenuButton>
    </ContextMenu>
  )
}
