import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { Button, Tooltip } from "~components/ui"
import { PRESET_EMOJIS, TAG_COLORS } from "~constants"
import type { Conversation, Folder, Tag } from "~core/conversation-manager"
import { t } from "~utils/i18n"

// ==================== 对话框样式 (从油猴脚本迁移) ====================

const DIALOG_STYLES = `
  .conversations-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--gh-overlay-bg, rgba(0,0,0,0.5));
    z-index: 1000003;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .conversations-dialog {
    background: var(--gh-bg, white);
    border-radius: 12px;
    padding: 20px;
    min-width: 320px;
    max-width: min(480px, calc(100vw - 40px));
    box-shadow: var(--gh-shadow-lg, 0 10px 40px rgba(0,0,0,0.2));
  }
  .conversations-dialog-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--gh-text, #1f2937);
    margin-bottom: 16px;
  }
  .conversations-dialog-message {
    font-size: 14px;
    color: var(--gh-text-secondary, #4b5563);
    margin-bottom: 20px;
    line-height: 1.5;
    white-space: pre-line;
    word-break: break-word;
    overflow-wrap: break-word;
  }
  .conversations-dialog-section {
    margin-bottom: 16px;
  }
  .conversations-dialog-section label {
    display: block;
    font-size: 13px;
    color: var(--gh-text-secondary, #6b7280);
    margin-bottom: 8px;
  }
  .conversations-dialog-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--gh-input-border, #d1d5db);
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
    background: var(--gh-input-bg, #ffffff);
    color: var(--gh-text, #1f2937);
  }
  .conversations-dialog-input:focus {
    outline: none;
    border-color: var(--gh-input-focus-border, #4285f4);
    box-shadow: var(--gh-input-focus-shadow, 0 0 0 2px rgba(66,133,244,0.1));
  }
  .conversations-dialog-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }
  .emoji-grid-hidden-scrollbar::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
  @keyframes gh-highlight-fade {
    0% { background-color: var(--gh-highlight-pulse, rgba(59, 130, 246, 0.3)); }
    100% { background-color: transparent; }
  }
  .conversations-folder-select-highlight {
    animation: gh-highlight-fade 2s ease-out;
  }

  /* Tooltip Styles (Injected globally for Dialogs) */
  .ophel-tooltip {
    background-color: rgba(30, 30, 35, 0.95);
    color: #ffffff;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.5;
    z-index: 2147483647;
    pointer-events: none;
    white-space: pre-wrap;
    word-wrap: break-word;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(4px);
    animation: tooltip-fade-in 0.15s ease-out;
  }

  @keyframes tooltip-fade-in {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`

// 样式注入状态
let dialogStyleInjected = false

const injectDialogStyles = () => {
  if (dialogStyleInjected) return
  const style = document.createElement("style")
  style.id = "gh-dialog-styles"
  style.textContent = DIALOG_STYLES
  document.head.appendChild(style)
  dialogStyleInjected = true
}

// ==================== 通用对话框组件 ====================

interface DialogOverlayProps {
  children: React.ReactNode
  onClose: () => void
}

/**
 * 对话框覆盖层 - 使用 Portal 渲染到 document.body
 * 这样对话框会出现在面板外面，覆盖整个页面
 */
export const DialogOverlay: React.FC<DialogOverlayProps> = ({ children, onClose }) => {
  useEffect(() => {
    // 注入对话框样式
    injectDialogStyles()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // 对话框内容
  const dialogContent = (
    <div className="conversations-dialog-overlay" onClick={onClose}>
      <div className="conversations-dialog" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )

  // 使用 Portal 渲染到 document.body
  return createPortal(dialogContent, document.body)
}

// ==================== 确认对话框 ====================

interface ConfirmDialogProps {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmText,
  cancelText,
  danger,
  onConfirm,
  onCancel,
}) => {
  return (
    <DialogOverlay onClose={onCancel}>
      <div className="conversations-dialog-title">{title}</div>
      <div className="conversations-dialog-message">{message}</div>
      <div className="conversations-dialog-buttons">
        <Button variant="secondary" onClick={onCancel}>
          {cancelText || t("cancel") || "取消"}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmText || t("confirm") || "确定"}
        </Button>
      </div>
    </DialogOverlay>
  )
}

// ==================== 创建/编辑文件夹对话框 ====================

interface FolderDialogProps {
  folder?: Folder | null
  onConfirm: (name: string, icon: string) => void
  onCancel: () => void
}

export const FolderDialog: React.FC<FolderDialogProps> = ({ folder, onConfirm, onCancel }) => {
  const initialIcon = folder?.icon || "📁"
  const [name, setName] = useState(folder?.name.replace(folder.icon, "").trim() || "")
  const [customIcon, setCustomIcon] = useState(initialIcon)
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(
    PRESET_EMOJIS.includes(initialIcon) ? initialIcon : null,
  )
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleConfirm = () => {
    const trimmedName = name.trim()
    if (trimmedName) {
      onConfirm(trimmedName, customIcon)
    }
  }

  const handleEmojiClick = (emoji: string) => {
    setSelectedEmoji(emoji)
    setCustomIcon(emoji)
  }

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    // Emoji 校验：只保留 Emoji 字符
    const emojiRegex = /[^\p{Extended_Pictographic}\u200d\ufe0f]/gu
    if (val && emojiRegex.test(val)) {
      val = val.replace(emojiRegex, "")
    }
    setCustomIcon(val)
    // 如果手动输入，取消预设选中
    if (val && !PRESET_EMOJIS.includes(val)) {
      setSelectedEmoji(null)
    } else if (PRESET_EMOJIS.includes(val)) {
      setSelectedEmoji(val)
    }
  }

  return (
    <DialogOverlay onClose={onCancel}>
      <div className="conversations-dialog-title">
        {folder
          ? t("conversationsRename") || "重命名"
          : t("conversationsAddFolder") || "新建文件夹"}
      </div>

      {/* 图标选择器 (先显示) */}
      <div className="conversations-dialog-section">
        <label>{t("conversationsIcon") || "图标"}</label>

        {/* 自定义输入区域 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px",
            background: "var(--gh-bg-secondary, #f9fafb)",
            borderRadius: "4px",
            border: "1px solid var(--gh-border, #e5e7eb)",
            marginBottom: "8px",
          }}>
          <span
            style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)", flexShrink: 0 }}>
            {t("conversationsCustomIcon") || "自定义图标"}
          </span>
          <input
            type="text"
            value={customIcon}
            onChange={handleCustomInputChange}
            maxLength={4}
            placeholder="☺"
            style={{
              width: "60px",
              textAlign: "center",
              border: "1px solid var(--gh-input-border, #d1d5db)",
              borderRadius: "4px",
              padding: "2px",
              fontSize: "16px",
              background: "var(--gh-input-bg, #ffffff)",
              color: "var(--gh-text, #1f2937)",
            }}
          />
        </div>

        {/* 预设 Emoji 网格 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gap: "4px",
            maxHeight: "120px",
            overflowY: "auto",
            padding: "2px",
            scrollbarWidth: "none", // Firefox
            msOverflowStyle: "none", // IE/Edge
          }}
          className="emoji-grid-hidden-scrollbar">
          {PRESET_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleEmojiClick(emoji)}
              style={{
                width: "24px",
                height: "24px",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: selectedEmoji === emoji ? "#dbeafe" : "transparent",
                cursor: "pointer",
                borderRadius: "4px",
                fontSize: "16px",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (selectedEmoji !== emoji) {
                  e.currentTarget.style.background = "var(--gh-hover, #f3f4f6)"
                }
              }}
              onMouseLeave={(e) => {
                if (selectedEmoji !== emoji) {
                  e.currentTarget.style.background = "transparent"
                }
              }}>
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* 名称输入 (后显示) */}
      <div className="conversations-dialog-section">
        <label>{t("conversationsFolderName") || "名称"}</label>
        <input
          ref={inputRef}
          type="text"
          className="conversations-dialog-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("conversationsFolderNamePlaceholder") || "输入文件夹名称"}
          onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
        />
      </div>

      <div className="conversations-dialog-buttons">
        <Button variant="secondary" onClick={onCancel}>
          {t("cancel") || "取消"}
        </Button>
        <Button variant="primary" onClick={handleConfirm}>
          {t("confirm") || "确定"}
        </Button>
      </div>
    </DialogOverlay>
  )
}

// ==================== 重命名会话对话框 ====================

interface RenameDialogProps {
  title: string
  currentValue: string
  placeholder?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export const RenameDialog: React.FC<RenameDialogProps> = ({
  title,
  currentValue,
  placeholder,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(currentValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleConfirm = () => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== currentValue) {
      onConfirm(trimmed)
    } else {
      onCancel()
    }
  }

  return (
    <DialogOverlay onClose={onCancel}>
      <div className="conversations-dialog-title">{title}</div>
      <div className="conversations-dialog-section">
        <input
          ref={inputRef}
          type="text"
          className="conversations-dialog-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
        />
      </div>
      <div className="conversations-dialog-buttons">
        <Button variant="secondary" onClick={onCancel}>
          {t("cancel") || "取消"}
        </Button>
        <Button variant="primary" onClick={handleConfirm}>
          {t("confirm") || "确定"}
        </Button>
      </div>
    </DialogOverlay>
  )
}

// ==================== 文件夹选择对话框 ====================

interface FolderSelectDialogProps {
  folders: Folder[]
  excludeFolderId?: string
  activeFolderId?: string
  title?: string
  onSelect: (folderId: string) => void
  onCancel: () => void
  onCreateFolder?: () => void
}

export const FolderSelectDialog: React.FC<FolderSelectDialogProps> = ({
  folders,
  excludeFolderId,
  activeFolderId,
  title,
  onSelect,
  onCancel,
  onCreateFolder,
}) => {
  const [searchQuery, setSearchQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 自动滚动到激活的文件夹
  useEffect(() => {
    if (activeFolderId) {
      setTimeout(() => {
        const el = document.getElementById(`folder-select-${activeFolderId}`)
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" })
          el.classList.add("conversations-folder-select-highlight")
        }
      }, 150)
    }
  }, [activeFolderId])

  const filteredFolders = folders.filter((f) => {
    if (f.id === excludeFolderId) return false
    if (searchQuery) {
      return f.name.toLowerCase().includes(searchQuery.toLowerCase())
    }
    return true
  })

  return (
    <DialogOverlay onClose={onCancel}>
      <div className="conversations-dialog-title">
        {title || t("conversationsMoveTo") || "移动到..."}
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <input
          ref={inputRef}
          type="text"
          className="conversations-dialog-input"
          style={{ flex: 1 }}
          placeholder={t("conversationsSearchFolder") || "搜索文件夹..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {onCreateFolder && (
          <Button
            variant="primary"
            style={{ padding: "8px 12px" }}
            onClick={() => {
              onCancel()
              onCreateFolder()
            }}
            title={t("conversationsAddFolder") || "新建文件夹"}>
            +
          </Button>
        )}
      </div>

      <div className="conversations-folder-select-list">
        {filteredFolders.map((folder) => (
          <div
            key={folder.id}
            id={`folder-select-${folder.id}`}
            className="conversations-folder-select-item"
            onClick={() => onSelect(folder.id)}>
            {folder.icon} {folder.name.replace(folder.icon, "").trim()}
          </div>
        ))}
        {filteredFolders.length === 0 && (
          <div
            style={{
              padding: "16px",
              textAlign: "center",
              color: "var(--gh-text-tertiary, #9ca3af)",
            }}>
            {t("conversationsNoSearchResult") || "未找到匹配结果"}
          </div>
        )}
      </div>

      <div className="conversations-dialog-buttons">
        <Button variant="secondary" onClick={onCancel}>
          {t("cancel") || "取消"}
        </Button>
      </div>
    </DialogOverlay>
  )
}

// ==================== 标签管理对话框 ====================

interface TagManagerDialogProps {
  tags: Tag[]
  conv?: Conversation | null // 可选的会话上下文
  onCancel: () => void
  onCreateTag: (name: string, color: string) => Promise<Tag | null>
  onUpdateTag: (tagId: string, name: string, color: string) => Promise<Tag | null>
  onDeleteTag: (tagId: string) => Promise<void>
  onSetConversationTags?: (convId: string, tagIds: string[]) => Promise<void>
  onRefresh: () => void
}

export const TagManagerDialog: React.FC<TagManagerDialogProps> = ({
  tags,
  conv,
  onCancel,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  onSetConversationTags,
  onRefresh,
}) => {
  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tagName, setTagName] = useState("")
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0])
  const [hexValue, setHexValue] = useState(TAG_COLORS[0])
  const [hexError, setHexError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [colorExpanded, setColorExpanded] = useState(false) // 颜色选择器折叠状态
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null) // 待删除的标签 ID
  // 本地状态跟踪当前会话已选标签，确保 UI 反映最新状态
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set(conv?.tagIds || []))

  const nameInputRef = useRef<HTMLInputElement>(null)
  const colorPickerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  // 当 conv 变化时同步本地状态
  useEffect(() => {
    setSelectedTagIds(new Set(conv?.tagIds || []))
  }, [conv?.id, conv?.tagIds])

  // 更新颜色选择
  const updateColorSelection = (color: string, source: "click" | "input" | "picker" = "click") => {
    let normalizedColor = color.startsWith("#") ? color : `#${color}`
    setSelectedColor(normalizedColor)
    if (source !== "input") {
      setHexValue(normalizedColor)
      setHexError(false)
    }
  }

  // HEX 输入处理
  const handleHexInput = (val: string) => {
    setHexValue(val)
    const hexRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/
    if (hexRegex.test(val)) {
      setHexError(false)
      // 3位扩展为6位
      let expandVal = val
      if (val.length === 4) {
        expandVal = `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}`
      }
      updateColorSelection(expandVal, "input")
    } else {
      setHexError(true)
    }
  }

  // 提交标签
  const handleSubmit = async () => {
    const name = tagName.trim()
    if (!name) return
    setLoading(true)

    let result: Tag | null = null
    if (editingId) {
      result = await onUpdateTag(editingId, name, selectedColor)
      if (result) {
        setEditingId(null)
        setTagName("")
      }
    } else {
      result = await onCreateTag(name, selectedColor)
      if (result) {
        setTagName("")
      }
    }
    setLoading(false)
    onRefresh()
  }

  // 编辑标签
  const handleEdit = (tag: Tag) => {
    setEditingId(tag.id)
    setTagName(tag.name)
    updateColorSelection(tag.color)
    nameInputRef.current?.focus()
  }

  // 删除标签（打开确认弹窗）
  const handleDeleteClick = (tagId: string) => {
    setDeletingTagId(tagId)
  }

  // 确认删除
  const confirmDelete = async () => {
    if (!deletingTagId) return
    await onDeleteTag(deletingTagId)
    setDeletingTagId(null)
    onRefresh()
  }

  // 切换会话标签
  const handleToggleConvTag = async (tagId: string, checked: boolean) => {
    if (!conv || !onSetConversationTags) return

    // 更新本地状态（立即反映在 UI）
    const newTagIds = new Set(selectedTagIds)
    if (checked) {
      newTagIds.add(tagId)
    } else {
      newTagIds.delete(tagId)
    }
    setSelectedTagIds(newTagIds)

    // 同步到存储
    await onSetConversationTags(conv.id, Array.from(newTagIds))
    onRefresh()
  }

  return (
    <DialogOverlay onClose={onCancel}>
      {/* 标题栏 */}
      <div
        className="conversations-dialog-title"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{t("conversationsManageTags") || "管理标签"}</span>
        <Tooltip content={t("close") || "关闭"}>
          <span
            style={{
              cursor: "pointer",
              padding: "4px",
              fontSize: "20px",
              color: "var(--gh-text-secondary, #9ca3af)",
              lineHeight: 1,
              width: "24px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
            }}
            onClick={onCancel}>
            ×
          </span>
        </Tooltip>
      </div>

      {/* === 标签列表区域 === */}
      <div
        style={{
          border: "1px solid var(--gh-border, #e5e7eb)",
          borderRadius: "8px",
          marginBottom: "16px",
          background: "var(--gh-bg-secondary, #fafafa)",
        }}>
        {/* 区域标题 */}
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--gh-border, #e5e7eb)",
            fontSize: "12px",
            color: "var(--gh-text-secondary, #6b7280)",
            fontWeight: 500,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
          <span>{conv ? t("conversationsSelectTag") : t("conversationsExistingTags")}</span>
          <span style={{ fontSize: "11px", color: "var(--gh-text-secondary, #9ca3af)" }}>
            {tags.length} 个
          </span>
        </div>

        {/* 标签列表 */}
        <div
          style={{
            maxHeight: "320px",
            overflowY: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}>
          {tags.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                color: "var(--gh-text-secondary, #9ca3af)",
              }}>
              {t("conversationsNoTags") || "暂无标签，在下方创建"}
            </div>
          ) : (
            tags.map((tag) => {
              const isSelected = selectedTagIds.has(tag.id)
              const isEditing = editingId === tag.id

              return (
                <div
                  key={tag.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--gh-border, #f3f4f6)",
                    cursor: conv ? "pointer" : "default",
                    background: isEditing
                      ? "var(--gh-bg-warning-light, #fffbeb)"
                      : isSelected
                        ? "var(--gh-folder-bg-default)" // 使用主题色变体
                        : "transparent",
                    transition: "background 0.15s",
                  }}
                  onClick={() => {
                    if (conv) {
                      handleToggleConvTag(tag.id, !isSelected)
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!isEditing && !isSelected) {
                      e.currentTarget.style.background = "var(--gh-hover, #f9fafb)"
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isEditing && !isSelected) {
                      e.currentTarget.style.background = "transparent"
                    }
                  }}>
                  {/* 左侧：复选框 + 标签预览 */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {conv && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          cursor: "pointer",
                          width: "16px",
                          height: "16px",
                          accentColor: tag.color,
                        }}
                      />
                    )}
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "4px",
                        fontSize: "13px",
                        color: "white",
                        backgroundColor: tag.color,
                        fontWeight: isSelected ? 500 : 400,
                        boxShadow: isSelected
                          ? "var(--gh-shadow-sm, 0 1px 3px rgba(0,0,0,0.2))"
                          : "none",
                      }}>
                      {tag.name}
                      {isEditing && <span style={{ fontSize: "10px" }}>✎</span>}
                    </span>
                  </div>

                  {/* 右侧：操作按钮 - 常驻显示 */}
                  <div style={{ display: "flex", gap: "2px" }}>
                    <Tooltip content={t("edit") || "编辑"}>
                      <button
                        style={{
                          background: isEditing ? "#fed7aa" : "transparent",
                          border: "none",
                          color: isEditing ? "#ea580c" : "#9ca3af",
                          cursor: "pointer",
                          padding: "6px",
                          fontSize: "14px",
                          borderRadius: "4px",
                          transition: "all 0.15s",
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEdit(tag)
                        }}
                        onMouseEnter={(e) => {
                          if (!isEditing) {
                            e.currentTarget.style.background = "#e0f2fe"
                            e.currentTarget.style.color = "#0284c7"
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isEditing) {
                            e.currentTarget.style.background = "transparent"
                            e.currentTarget.style.color = "#9ca3af"
                          }
                        }}>
                        ✎
                      </button>
                    </Tooltip>
                    <Tooltip content={t("delete") || "删除"}>
                      <button
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--gh-text-tertiary, #9ca3af)",
                          cursor: "pointer",
                          padding: "6px",
                          fontSize: "14px",
                          borderRadius: "4px",
                          transition: "all 0.15s",
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteClick(tag.id)
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#fee2e2"
                          e.currentTarget.style.color = "#dc2626"
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent"
                          e.currentTarget.style.color = "#9ca3af"
                        }}>
                        ×
                      </button>
                    </Tooltip>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* === 新建/编辑区域 === */}
      <div
        style={{
          border: "1px solid var(--gh-border, #e5e7eb)",
          borderRadius: "8px",
          padding: "12px",
          background: editingId ? "var(--gh-bg-warning-light, #fffbeb)" : "var(--gh-bg, #ffffff)",
          transition: "background 0.2s",
        }}>
        {/* 区域标题 */}
        <div
          style={{
            fontSize: "12px",
            color: editingId
              ? "var(--gh-text-warning, #b45309)"
              : "var(--gh-text-secondary, #6b7280)",
            fontWeight: 500,
            marginBottom: "10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
          <span>
            {editingId
              ? t("conversationsEditTag") || "编辑标签"
              : t("conversationsNewTag") || "新建标签"}
          </span>
          {editingId && (
            <button
              style={{
                background: "none",
                border: "none",
                color: "var(--gh-text-tertiary, #9ca3af)",
                cursor: "pointer",
                fontSize: "11px",
                padding: "2px 6px",
              }}
              onClick={() => {
                setEditingId(null)
                setTagName("")
                updateColorSelection(TAG_COLORS[0])
              }}>
              {t("conversationsCancelEdit") || "取消编辑"}
            </button>
          )}
        </div>

        {/* 标签名称输入 */}
        <input
          ref={nameInputRef}
          type="text"
          className="conversations-dialog-input"
          placeholder={t("conversationsTagName") || "标签名称"}
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          style={{
            marginBottom: "12px",
            borderColor: editingId ? "#fbbf24" : undefined,
          }}
        />

        {/* 颜色选择 - 可折叠 */}
        <div style={{ marginBottom: "12px", position: "relative" }}>
          {/* 颜色预览条（默认显示） */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 10px",
              border: "1px solid var(--gh-border, #e5e7eb)",
              borderRadius: "8px",
              cursor: "pointer",
              background: "var(--gh-bg-secondary, #fafafa)",
              transition: "border-radius 0.15s, background-color 0.2s",
              userSelect: "none",
            }}
            onClick={() => setColorExpanded(!colorExpanded)}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--gh-hover, #f3f4f6)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--gh-bg-secondary, #fafafa)")
            }>
            {/* 当前选中颜色预览 */}
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "4px",
                backgroundColor: selectedColor,
                border: "1px solid var(--gh-border, rgba(0,0,0,0.1))",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "12px", color: "var(--gh-text-secondary, #666)", flex: 1 }}>
              {colorExpanded
                ? t("conversationsCollapseColor") || "收起颜色"
                : t("conversationsSelectColor") || "选择颜色"}
            </span>
            {/* SVG 箭头图标 */}
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              stroke="#9ca3af"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transition: "transform 0.2s",
                transform: colorExpanded ? "rotate(180deg)" : "rotate(0deg)",
              }}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>

          {/* 展开的颜色网格 - 绝对定位悬浮 */}
          {colorExpanded && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: "4px",
                border: "1px solid var(--gh-border, #e5e7eb)",
                borderRadius: "8px",
                padding: "10px",
                background: "var(--gh-bg, #ffffff)",
                zIndex: 10,
                boxShadow: "var(--gh-shadow, 0 4px 12px rgba(0,0,0,0.15))",
              }}>
              {/* 30 色预设网格 - 紧凑模式 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(10, 1fr)",
                  gap: "6px",
                  marginBottom: "12px",
                }}>
                {TAG_COLORS.map((color) => (
                  <Tooltip key={color} content={color}>
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "1",
                        borderRadius: "4px",
                        backgroundColor: color,
                        cursor: "pointer",
                        border:
                          selectedColor.toLowerCase() === color.toLowerCase()
                            ? "2px solid #333"
                            : "1px solid rgba(0,0,0,0.05)",
                        transition: "transform 0.1s",
                        boxSizing: "border-box",
                      }}
                      onClick={() => {
                        updateColorSelection(color)
                        setColorExpanded(false) // 选择后收起
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                    />
                  </Tooltip>
                ))}
              </div>

              {/* 自定义颜色行 */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {/* 彩虹按钮 */}
                <div
                  style={{
                    position: "relative",
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    overflow: "hidden",
                    cursor: "pointer",
                    boxShadow: "var(--gh-shadow-sm, 0 1px 3px rgba(0,0,0,0.1))",
                    border: !TAG_COLORS.includes(selectedColor.toUpperCase())
                      ? "2px solid #666"
                      : "2px solid transparent",
                    flexShrink: 0,
                  }}>
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: TAG_COLORS.includes(selectedColor.toUpperCase())
                        ? "conic-gradient(from 180deg, red, yellow, lime, aqua, blue, magenta, red)"
                        : selectedColor,
                    }}
                  />
                  <input
                    ref={colorPickerRef}
                    type="color"
                    value={selectedColor}
                    onChange={(e) => {
                      updateColorSelection(e.target.value, "picker")
                      setColorExpanded(false) // 选择后收起
                    }}
                    style={{
                      position: "absolute",
                      left: "-50%",
                      top: "-50%",
                      width: "200%",
                      height: "200%",
                      opacity: 0,
                      cursor: "pointer",
                    }}
                  />
                </div>

                {/* HEX 输入 - 紧凑样式 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flex: 1,
                    background: "var(--gh-bg-secondary, #f3f4f6)",
                    border: `1px solid ${hexError ? "#ef4444" : "var(--gh-border, #e5e7eb)"}`,
                    borderRadius: "6px",
                    padding: "4px 8px",
                    height: "30px",
                    boxSizing: "border-box",
                  }}>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--gh-text-secondary, #6b7280)",
                      marginRight: "6px",
                      fontFamily: "monospace",
                      fontWeight: 600,
                    }}>
                    HEX
                  </span>
                  <input
                    type="text"
                    value={hexValue}
                    onChange={(e) => handleHexInput(e.target.value)}
                    onBlur={() => {
                      if (hexError) {
                        setHexValue(selectedColor)
                        setHexError(false)
                      }
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      outline: "none",
                      fontSize: "13px",
                      fontFamily: "monospace",
                      width: "100%",
                      color: "var(--gh-text, #374151)",
                      textTransform: "uppercase",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 提交按钮 */}
        <Button
          variant="primary"
          style={{
            width: "100%",
            ...(editingId && {
              background:
                "var(--gh-warning-gradient, linear-gradient(135deg, #f59e0b 0%, #d97706 100%))",
            }),
          }}
          disabled={!tagName.trim() || loading}
          onClick={handleSubmit}>
          {editingId
            ? t("conversationsUpdateTag") || "更新标签"
            : t("conversationsNewTag") || "新建标签"}
        </Button>
      </div>

      {/* 删除确认弹窗 */}
      {deletingTagId && (
        <ConfirmDialog
          title={t("conversationsDeleteTag") || "删除标签"}
          message={t("confirmDelete") || "确定删除这个标签吗？此操作不可撤销。"}
          confirmText={t("delete") || "删除"}
          cancelText={t("cancel") || "取消"}
          danger={true}
          onConfirm={confirmDelete}
          onCancel={() => setDeletingTagId(null)}
        />
      )}
    </DialogOverlay>
  )
}
