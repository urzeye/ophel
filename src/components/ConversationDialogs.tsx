import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

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
    background: rgba(0,0,0,0.5);
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
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  }
  .conversations-dialog-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--gh-text, #1f2937);
    margin-bottom: 16px;
  }
  .conversations-dialog-message {
    font-size: 14px;
    color: #4b5563;
    margin-bottom: 20px;
    line-height: 1.5;
    white-space: pre-line;
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
    border-color: #4285f4;
    box-shadow: 0 0 0 2px rgba(66,133,244,0.1);
  }
  .conversations-dialog-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }
  .conversations-dialog-btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .conversations-dialog-btn.cancel {
    border: 1px solid var(--gh-input-border, #d1d5db);
    background: var(--gh-bg, white);
    color: var(--gh-text, #374151);
  }
  .conversations-dialog-btn.cancel:hover {
    background: var(--gh-hover, #f3f4f6);
  }
  .conversations-dialog-btn.confirm {
    border: 1px solid rgba(255,255,255,0.2);
    background: linear-gradient(135deg, #4285f4 0%, #1a73e8 100%);
    color: white;
  }
  .conversations-dialog-btn.confirm:hover {
    opacity: 0.9;
  }
  .emoji-grid-hidden-scrollbar::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
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
      <div style={{ marginBottom: "20px", color: "var(--gh-text-secondary, #6b7280)" }}>
        {message}
      </div>
      <div className="conversations-dialog-buttons">
        <button className="conversations-dialog-btn cancel" onClick={onCancel}>
          {cancelText || t("cancel") || "取消"}
        </button>
        <button
          className="conversations-dialog-btn confirm"
          style={danger ? { background: "#ef4444" } : undefined}
          onClick={onConfirm}>
          {confirmText || t("confirm") || "确定"}
        </button>
      </div>
    </DialogOverlay>
  )
}

// ==================== 创建/编辑文件夹对话框 ====================

// 扩充的预设 Emoji 库 (64个)
const PRESET_EMOJIS = [
  // 📂 基础文件夹
  "📁",
  "📂",
  "📥",
  "🗂️",
  "📊",
  "📈",
  "📉",
  "📋",
  // 💼 办公/工作
  "💼",
  "📅",
  "📌",
  "📎",
  "📝",
  "✒️",
  "🔍",
  "💡",
  // 💻 编程/技术
  "💻",
  "⌨️",
  "🖥️",
  "🖱️",
  "🐛",
  "🔧",
  "🔨",
  "⚙️",
  // 🤖 AI/机器人
  "🤖",
  "👾",
  "🧠",
  "⚡",
  "🔥",
  "✨",
  "🎓",
  "📚",
  // 🎨 创意/艺术
  "🎨",
  "🎭",
  "🎬",
  "🎹",
  "🎵",
  "📷",
  "🖌️",
  "🖍️",
  // 🏠 生活/日常
  "🏠",
  "🛒",
  "✈️",
  "🎮",
  "⚽",
  "🍔",
  "☕",
  "❤️",
  // 🌈 颜色/标记
  "🔴",
  "🟠",
  "🟡",
  "🟢",
  "🔵",
  "🟣",
  "⚫",
  "⚪",
  // ⭐ 其他
  "⭐",
  "🌟",
  "🎉",
  "🔒",
  "🔑",
  "🚫",
  "✅",
  "❓",
]

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
        <button className="conversations-dialog-btn cancel" onClick={onCancel}>
          {t("cancel") || "取消"}
        </button>
        <button className="conversations-dialog-btn confirm" onClick={handleConfirm}>
          {t("confirm") || "确定"}
        </button>
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
        <button className="conversations-dialog-btn cancel" onClick={onCancel}>
          {t("cancel") || "取消"}
        </button>
        <button className="conversations-dialog-btn confirm" onClick={handleConfirm}>
          {t("confirm") || "确定"}
        </button>
      </div>
    </DialogOverlay>
  )
}

// ==================== 文件夹选择对话框 ====================

interface FolderSelectDialogProps {
  folders: Folder[]
  excludeFolderId?: string
  title?: string
  onSelect: (folderId: string) => void
  onCancel: () => void
  onCreateFolder?: () => void
}

export const FolderSelectDialog: React.FC<FolderSelectDialogProps> = ({
  folders,
  excludeFolderId,
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
          <button
            className="conversations-dialog-btn confirm"
            style={{ padding: "8px 12px" }}
            onClick={() => {
              onCancel()
              onCreateFolder()
            }}
            title={t("conversationsAddFolder") || "新建文件夹"}>
            +
          </button>
        )}
      </div>

      <div className="conversations-folder-select-list">
        {filteredFolders.map((folder) => (
          <div
            key={folder.id}
            className="conversations-folder-select-item"
            onClick={() => onSelect(folder.id)}>
            {folder.icon} {folder.name.replace(folder.icon, "").trim()}
          </div>
        ))}
        {filteredFolders.length === 0 && (
          <div style={{ padding: "16px", textAlign: "center", color: "#9ca3af" }}>
            {t("conversationsNoSearchResult") || "未找到匹配结果"}
          </div>
        )}
      </div>

      <div className="conversations-dialog-buttons">
        <button className="conversations-dialog-btn cancel" onClick={onCancel}>
          {t("cancel") || "取消"}
        </button>
      </div>
    </DialogOverlay>
  )
}

// ==================== 标签管理对话框 ====================

// 30 色预设网格
const TAG_COLORS = [
  // 第一行
  "#FF461F",
  "#FF6B6B",
  "#FA8072",
  "#DC143C",
  "#CD5C5C",
  "#FF4500",
  // 第二行
  "#FFA500",
  "#FFB347",
  "#F0E68C",
  "#DAA520",
  "#FFD700",
  "#9ACD32",
  // 第三行
  "#32CD32",
  "#3CB371",
  "#20B2AA",
  "#00CED1",
  "#5F9EA0",
  "#4682B4",
  // 第四行
  "#6495ED",
  "#4169E1",
  "#0000CD",
  "#8A2BE2",
  "#9370DB",
  "#BA55D3",
  // 第五行
  "#DB7093",
  "#C71585",
  "#8B4513",
  "#A0522D",
  "#708090",
  "#2F4F4F",
]

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

  const nameInputRef = useRef<HTMLInputElement>(null)
  const colorPickerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

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

  // 删除标签
  const handleDelete = async (tagId: string) => {
    if (confirm(t("confirmDelete") || "确定删除?")) {
      await onDeleteTag(tagId)
      onRefresh()
    }
  }

  // 切换会话标签
  const handleToggleConvTag = async (tagId: string, checked: boolean) => {
    if (!conv || !onSetConversationTags) return
    let newTagIds = [...(conv.tagIds || [])]
    if (checked) {
      if (!newTagIds.includes(tagId)) newTagIds.push(tagId)
    } else {
      newTagIds = newTagIds.filter((id) => id !== tagId)
    }
    await onSetConversationTags(conv.id, newTagIds)
    onRefresh()
  }

  return (
    <DialogOverlay onClose={onCancel}>
      {/* 标题栏 */}
      <div
        className="conversations-dialog-title"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{t("conversationsManageTags") || "管理标签"}</span>
        <span
          style={{
            cursor: "pointer",
            padding: "4px",
            fontSize: "20px",
            color: "#9ca3af",
            lineHeight: 1,
            width: "24px",
            height: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "4px",
          }}
          onClick={onCancel}
          title={t("close") || "关闭"}>
          ×
        </span>
      </div>

      {/* === 标签列表区域 === */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          marginBottom: "16px",
          background: "var(--gh-bg-secondary, #fafafa)",
        }}>
        {/* 区域标题 */}
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid #e5e7eb",
            fontSize: "12px",
            color: "#6b7280",
            fontWeight: 500,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
          <span>{conv ? "选择标签" : "已有标签"}</span>
          <span style={{ fontSize: "11px", color: "#9ca3af" }}>{tags.length} 个</span>
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
            <div style={{ padding: "24px 16px", textAlign: "center", color: "#9ca3af" }}>
              {t("conversationsNoTags") || "暂无标签，在下方创建"}
            </div>
          ) : (
            tags.map((tag) => {
              const isSelected = conv?.tagIds?.includes(tag.id) || false
              const isEditing = editingId === tag.id

              return (
                <div
                  key={tag.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderBottom: "1px solid #f3f4f6",
                    cursor: conv ? "pointer" : "default",
                    background: isEditing ? "#fff7ed" : isSelected ? "#f0f9ff" : "transparent",
                    transition: "background 0.15s",
                  }}
                  onClick={() => {
                    if (conv) {
                      handleToggleConvTag(tag.id, !isSelected)
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!isEditing && !isSelected) {
                      e.currentTarget.style.background = "#f9fafb"
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
                        boxShadow: isSelected ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                      }}>
                      {tag.name}
                      {isEditing && <span style={{ fontSize: "10px" }}>✎</span>}
                    </span>
                  </div>

                  {/* 右侧：操作按钮 - 常驻显示 */}
                  <div style={{ display: "flex", gap: "2px" }}>
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
                      }}
                      title={t("edit") || "编辑"}>
                      ✎
                    </button>
                    <button
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#9ca3af",
                        cursor: "pointer",
                        padding: "6px",
                        fontSize: "14px",
                        borderRadius: "4px",
                        transition: "all 0.15s",
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(tag.id)
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#fee2e2"
                        e.currentTarget.style.color = "#dc2626"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent"
                        e.currentTarget.style.color = "#9ca3af"
                      }}
                      title={t("delete") || "删除"}>
                      ×
                    </button>
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
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "12px",
          background: editingId ? "#fffbeb" : "#ffffff",
          transition: "background 0.2s",
        }}>
        {/* 区域标题 */}
        <div
          style={{
            fontSize: "12px",
            color: editingId ? "#b45309" : "#6b7280",
            fontWeight: 500,
            marginBottom: "10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
          <span>{editingId ? "编辑标签" : "新建标签"}</span>
          {editingId && (
            <button
              style={{
                background: "none",
                border: "none",
                color: "#9ca3af",
                cursor: "pointer",
                fontSize: "11px",
                padding: "2px 6px",
              }}
              onClick={() => {
                setEditingId(null)
                setTagName("")
                updateColorSelection(TAG_COLORS[0])
              }}>
              取消编辑
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
        <div style={{ marginBottom: "12px" }}>
          {/* 颜色预览条（默认显示） */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 10px",
              border: "1px solid var(--gh-border, #e5e7eb)",
              borderRadius: colorExpanded ? "8px 8px 0 0" : "8px",
              cursor: "pointer",
              background: "var(--gh-bg-secondary, #fafafa)",
              transition: "border-radius 0.15s",
            }}
            onClick={() => setColorExpanded(!colorExpanded)}>
            {/* 当前选中颜色预览 */}
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "4px",
                backgroundColor: selectedColor,
                border: "1px solid rgba(0,0,0,0.1)",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "12px", color: "#666", flex: 1 }}>
              {colorExpanded ? "收起颜色" : "选择颜色"}
            </span>
            <span
              style={{
                fontSize: "10px",
                color: "#9ca3af",
                transition: "transform 0.2s",
                transform: colorExpanded ? "rotate(180deg)" : "rotate(0deg)",
              }}>
              ▼
            </span>
          </div>

          {/* 展开的颜色网格 */}
          {colorExpanded && (
            <div
              style={{
                border: "1px solid var(--gh-border, #e5e7eb)",
                borderTop: "none",
                borderRadius: "0 0 8px 8px",
                padding: "10px",
                background: "var(--gh-bg, #fff)",
              }}>
              {/* 30 色预设网格 - 紧凑模式 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(10, 1fr)",
                  gap: "4px",
                  marginBottom: "10px",
                }}>
                {TAG_COLORS.map((color) => (
                  <div
                    key={color}
                    style={{
                      width: "100%",
                      height: "24px",
                      borderRadius: "3px",
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
                    title={color}
                  />
                ))}
              </div>

              {/* 自定义颜色行 */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {/* 彩虹按钮 */}
                <div
                  style={{
                    position: "relative",
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    overflow: "hidden",
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
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

                {/* HEX 输入 */}
                <span style={{ fontSize: "11px", color: "#666" }}>HEX:</span>
                <input
                  type="text"
                  className="conversations-dialog-input"
                  value={hexValue}
                  onChange={(e) => handleHexInput(e.target.value)}
                  onBlur={() => {
                    if (hexError) {
                      setHexValue(selectedColor)
                      setHexError(false)
                    }
                  }}
                  placeholder="#RRGGBB"
                  style={{
                    flex: 1,
                    fontFamily: "monospace",
                    textTransform: "uppercase",
                    borderColor: hexError ? "#ef4444" : undefined,
                    padding: "4px 8px",
                    fontSize: "11px",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 提交按钮 */}
        <button
          className="conversations-dialog-btn confirm"
          style={{
            width: "100%",
            background: editingId ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" : undefined,
          }}
          disabled={!tagName.trim() || loading}
          onClick={handleSubmit}>
          {editingId
            ? t("conversationsUpdateTag") || "更新标签"
            : t("conversationsNewTag") || "新建标签"}
        </button>
      </div>
    </DialogOverlay>
  )
}
