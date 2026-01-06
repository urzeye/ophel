import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { Button, ConfirmDialog, InputDialog } from "~components/ui"
import type { PromptManager } from "~core/prompt-manager"
import { t } from "~utils/i18n"
import type { Prompt } from "~utils/storage"
import { showToast } from "~utils/toast"

interface PromptsTabProps {
  manager: PromptManager
  onPromptSelect?: (prompt: Prompt | null) => void
  selectedPromptId?: string | null
}

// 确认对话框状态类型
interface ConfirmState {
  show: boolean
  title: string
  message: string
  onConfirm: () => void
}

// 输入对话框状态类型
interface PromptInputState {
  show: boolean
  title: string
  defaultValue: string
  onConfirm: (value: string) => void
}

export const PromptsTab: React.FC<PromptsTabProps> = ({
  manager,
  onPromptSelect,
  selectedPromptId,
}) => {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // 模态弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<Partial<Prompt> | null>(null)

  // 分类管理弹窗状态
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)

  // 确认对话框状态
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    show: false,
    title: "",
    message: "",
    onConfirm: () => {},
  })

  // 输入对话框状态
  const [promptInputState, setPromptInputState] = useState<PromptInputState>({
    show: false,
    title: "",
    defaultValue: "",
    onConfirm: () => {},
  })
  const [inputValue, setInputValue] = useState("")

  // 拖拽状态
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const allPrompts = manager.getPrompts()
    const allCategories = manager.getCategories()
    setPrompts(allPrompts)
    setCategories(allCategories)

    // ⭐ 分类有效性检查：如果当前选中的分类不再存在或变空，回退到「全部」
    setSelectedCategory((prev) => {
      if (prev === "all") return prev
      // 检查分类是否还存在
      if (!allCategories.includes(prev)) return "all"
      // 检查分类下是否还有提示词
      const hasPrompts = allPrompts.some((p) => p.category === prev)
      if (!hasPrompts) return "all"
      return prev
    })
  }

  const getFilteredPrompts = () => {
    return manager.filterPrompts(searchQuery, selectedCategory)
  }

  // 显示确认对话框
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmState({ show: true, title, message, onConfirm })
  }

  // 显示输入对话框
  const showPromptInput = (
    title: string,
    defaultValue: string,
    onConfirm: (value: string) => void,
  ) => {
    setInputValue(defaultValue)
    setPromptInputState({ show: true, title, defaultValue, onConfirm })
  }

  // 选中提示词并插入
  const handleSelect = async (prompt: Prompt) => {
    const success = await manager.insertPrompt(prompt.content)
    if (success) {
      onPromptSelect?.(prompt)
      showToast(`${t("inserted") || "已插入"}: ${prompt.title}`)
    } else {
      showToast(t("insertFailed") || "未找到输入框，请点击输入框后重试")
    }
  }

  // 保存提示词（新增/编辑）
  const handleSave = async () => {
    if (!editingPrompt?.title || !editingPrompt?.content) {
      showToast(t("fillTitleContent") || "请填写标题和内容")
      return
    }

    const newCategory = editingPrompt.category || t("uncategorized") || "未分类"
    let shouldSwitchToNewCategory = false

    if (editingPrompt.id) {
      // ⭐ 编辑时检查是否需要切换分类
      const oldPrompt = prompts.find((p) => p.id === editingPrompt.id)
      const oldCategory = oldPrompt?.category

      // 如果分类发生变更，且当前选中的就是原分类
      if (oldCategory && oldCategory !== newCategory && selectedCategory === oldCategory) {
        // 检查编辑后原分类是否会变空
        const otherPromptsInOldCategory = prompts.filter(
          (p) => p.category === oldCategory && p.id !== editingPrompt.id,
        )
        if (otherPromptsInOldCategory.length === 0) {
          shouldSwitchToNewCategory = true
        }
      }

      await manager.updatePrompt(editingPrompt.id, {
        title: editingPrompt.title,
        content: editingPrompt.content,
        category: newCategory,
      })
      showToast(t("promptUpdated") || "提示词已更新")

      // ⭐ 切换到新分类
      if (shouldSwitchToNewCategory) {
        setSelectedCategory(newCategory)
      }
    } else {
      await manager.addPrompt({
        title: editingPrompt.title!,
        content: editingPrompt.content!,
        category: newCategory,
      })
      showToast(t("promptAdded") || "提示词已添加")
    }
    setIsModalOpen(false)
    setEditingPrompt(null)
    loadData()
  }

  // 删除提示词
  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    showConfirm(t("confirmDelete") || "确认删除", "确定删除该提示词？", async () => {
      await manager.deletePrompt(id)
      showToast(t("deleted") || "已删除")
      loadData()
    })
  }

  // 复制提示词内容
  const handleCopy = async (content: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(content)
      showToast(t("copied") || "已复制")
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      showToast(t("copied") || "已复制")
    }
  }

  // 打开编辑/新增弹窗
  const openEditModal = (prompt?: Prompt) => {
    if (prompt) {
      setEditingPrompt({ ...prompt })
    } else {
      // ⭐ 新建时：如果当前选中了某个分类，默认使用该分类；否则使用「未分类」
      const defaultCategory =
        selectedCategory !== "all" ? selectedCategory : t("uncategorized") || "未分类"
      setEditingPrompt({ title: "", content: "", category: defaultCategory })
    }
    setIsModalOpen(true)
  }

  // === 分类管理 ===
  const handleRenameCategory = (oldName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    showPromptInput(
      t("newCategoryName") || "请输入新分类名称",
      oldName,
      async (newName: string) => {
        if (newName && newName.trim() && newName !== oldName) {
          await manager.renameCategory(oldName, newName.trim())
          showToast(
            (t("categoryRenamedTo") || "分类已重命名为「{name}」").replace(
              "{name}",
              newName.trim(),
            ),
          )
          // ⭐ 如果当前选中的分类被重命名，同步更新选中状态
          if (selectedCategory === oldName) {
            setSelectedCategory(newName.trim())
          }
          loadData()
        }
      },
    )
  }

  const handleDeleteCategory = (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    showConfirm(
      t("confirmDeleteCategory") || "确认删除分类",
      (
        t("confirmDeleteCategoryMsg") || "确定删除分类「{name}」？关联的提示词将移至「未分类」"
      ).replace("{name}", name),
      async () => {
        await manager.deleteCategory(name)
        showToast((t("categoryDeletedMsg") || "分类「{name}」已删除").replace("{name}", name))
        if (selectedCategory === name) {
          setSelectedCategory("all")
        }
        loadData()
      },
    )
  }

  // === 拖拽排序 ===
  const handleDragStart = (e: React.DragEvent, id: string, node: HTMLDivElement) => {
    setDraggedId(id)
    dragNodeRef.current = node
    e.dataTransfer.effectAllowed = "move"
    node.classList.add("dragging")
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"

    if (!draggedId || draggedId === targetId) return

    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2

    document.querySelectorAll(".drop-above, .drop-below").forEach((el) => {
      el.classList.remove("drop-above", "drop-below")
    })

    if (e.clientY < midpoint) {
      target.classList.add("drop-above")
    } else {
      target.classList.add("drop-below")
    }
  }

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.classList.remove("dragging")
    }
    document.querySelectorAll(".drop-above, .drop-below").forEach((el) => {
      el.classList.remove("drop-above", "drop-below")
    })
    setDraggedId(null)
    dragNodeRef.current = null
  }

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()

    if (!draggedId || draggedId === targetId) {
      handleDragEnd()
      return
    }

    const allPrompts = manager.getPrompts()
    const draggedIndex = allPrompts.findIndex((p) => p.id === draggedId)
    const targetIndex = allPrompts.findIndex((p) => p.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) {
      handleDragEnd()
      return
    }

    const newOrder = [...allPrompts]
    const [removed] = newOrder.splice(draggedIndex, 1)

    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const insertBefore = e.clientY < rect.top + rect.height / 2

    let insertIndex = allPrompts.findIndex((p) => p.id === targetId)
    if (draggedIndex < insertIndex) {
      insertIndex--
    }
    if (!insertBefore) {
      insertIndex++
    }

    newOrder.splice(insertIndex, 0, removed)

    await manager.updateOrder(newOrder.map((p) => p.id))
    showToast(t("orderUpdated") || "顺序已更新")
    loadData()
    handleDragEnd()
  }

  const filtered = getFilteredPrompts()

  // 编辑/新增弹窗
  const renderEditModal = () => {
    if (!isModalOpen) return null

    return createPortal(
      <div
        className="prompt-modal gh-interactive"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsModalOpen(false)
            setEditingPrompt(null)
          }
        }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--gh-overlay-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2147483646,
          animation: "fadeIn 0.2s",
        }}>
        <div
          className="prompt-modal-content"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--gh-bg, white)",
            borderRadius: "12px",
            width: "90%",
            maxWidth: "500px",
            padding: "24px",
            animation: "slideUp 0.3s",
            boxShadow: "var(--gh-shadow, 0 20px 50px rgba(0,0,0,0.3))",
          }}>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "20px",
              color: "var(--gh-text, #1f2937)",
            }}>
            {editingPrompt?.id ? t("editPrompt") : t("addNewPrompt")}
          </div>

          {/* 标题 */}
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--gh-text, #374151)",
                marginBottom: "6px",
              }}>
              {t("title")}
            </label>
            <input
              type="text"
              value={editingPrompt?.title || ""}
              onChange={(e) => setEditingPrompt({ ...editingPrompt, title: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--gh-border, #d1d5db)",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
                background: "var(--gh-bg, #ffffff)",
                color: "var(--gh-text, #1f2937)",
              }}
            />
          </div>

          {/* 分类 */}
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--gh-text, #374151)",
                marginBottom: "6px",
              }}>
              {t("category")}
            </label>
            <input
              type="text"
              value={editingPrompt?.category || ""}
              onChange={(e) => setEditingPrompt({ ...editingPrompt, category: e.target.value })}
              placeholder={t("categoryPlaceholder") || "输入或选择分类"}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--gh-border, #d1d5db)",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
                background: "var(--gh-bg, #ffffff)",
                color: "var(--gh-text, #1f2937)",
              }}
            />
            {categories.length > 0 && (
              <div
                style={{
                  marginTop: "6px",
                  display: "flex",
                  gap: "4px",
                  flexWrap: "wrap",
                  userSelect: "none",
                }}>
                {categories.map((cat) => (
                  <span
                    key={cat}
                    onClick={() => setEditingPrompt({ ...editingPrompt, category: cat })}
                    style={{
                      padding: "2px 8px",
                      fontSize: "11px",
                      background:
                        editingPrompt?.category === cat
                          ? "var(--gh-primary, #4285f4)"
                          : "var(--gh-hover, #f3f4f6)",
                      color:
                        editingPrompt?.category === cat
                          ? "var(--gh-text-on-primary, white)"
                          : "var(--gh-text-secondary, #6b7280)",
                      borderRadius: "10px",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}>
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 内容 */}
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--gh-text, #374151)",
                marginBottom: "6px",
              }}>
              {t("content")}
            </label>
            <textarea
              value={editingPrompt?.content || ""}
              onChange={(e) => setEditingPrompt({ ...editingPrompt, content: e.target.value })}
              style={{
                width: "100%",
                minHeight: "120px",
                padding: "8px 12px",
                border: "1px solid var(--gh-border, #d1d5db)",
                borderRadius: "6px",
                fontSize: "14px",
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
                background: "var(--gh-bg, #ffffff)",
                color: "var(--gh-text, #1f2937)",
              }}
            />
          </div>

          {/* 按钮 */}
          <div
            style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
            <Button
              variant="ghost"
              onClick={() => {
                setIsModalOpen(false)
                setEditingPrompt(null)
              }}
              style={{ background: "var(--gh-hover, #f3f4f6)" }}>
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={handleSave}>
              {editingPrompt?.id ? t("save") : t("add")}
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  // 分类管理弹窗
  const renderCategoryModal = () => {
    if (!isCategoryModalOpen) return null

    return createPortal(
      <div
        className="prompt-modal gh-interactive"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsCategoryModalOpen(false)
          }
        }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--gh-overlay-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2147483646,
          animation: "fadeIn 0.2s",
        }}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--gh-bg, white)",
            borderRadius: "12px",
            width: "90%",
            maxWidth: "400px",
            padding: "24px",
            animation: "slideUp 0.3s",
            boxShadow: "var(--gh-shadow-lg, 0 20px 50px rgba(0,0,0,0.3))",
          }}>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "20px",
              color: "var(--gh-text, #1f2937)",
            }}>
            {t("categoryManage") || "分类管理"}
          </div>

          <div style={{ maxHeight: "300px", overflowY: "auto" }}>
            {categories.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--gh-text-tertiary, #9ca3af)",
                  padding: "20px",
                }}>
                {t("categoryEmpty") || "暂无分类"}
              </div>
            ) : (
              categories.map((cat) => {
                const count = prompts.filter((p) => p.category === cat).length
                return (
                  <div
                    key={cat}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--gh-border, #e5e7eb)",
                    }}>
                    <div>
                      <div style={{ fontWeight: 500, color: "var(--gh-text, #374151)" }}>{cat}</div>
                      <div style={{ fontSize: "12px", color: "var(--gh-text-tertiary, #9ca3af)" }}>
                        {count} {t("promptCountSuffix") || " 个提示词"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Button
                        size="sm"
                        onClick={(e) => handleRenameCategory(cat, e)}
                        style={{ color: "var(--gh-primary, #4285f4)" }}>
                        {t("rename") || "重命名"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={(e) => handleDeleteCategory(cat, e)}
                        style={{
                          border: "1px solid var(--gh-border-danger, #fecaca)",
                          background: "var(--gh-bg-danger, #fef2f2)",
                          color: "var(--gh-text-danger, #ef4444)",
                        }}>
                        {t("delete") || "删除"}
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="ghost"
              onClick={() => setIsCategoryModalOpen(false)}
              style={{ background: "var(--gh-hover, #f3f4f6)" }}>
              {t("close") || "关闭"}
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  return (
    <div
      className="gh-prompts-tab"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 搜索栏 */}
      <div
        style={{
          padding: "12px",
          borderBottom: "1px solid var(--gh-border, #e5e7eb)",
          background: "var(--gh-bg-secondary, #f9fafb)",
        }}>
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid var(--gh-border, #d1d5db)",
            borderRadius: "8px",
            fontSize: "14px",
            boxSizing: "border-box",
            background: "var(--gh-bg, #ffffff)",
            color: "var(--gh-text, #1f2937)",
          }}
        />
      </div>

      {/* 分类标签栏 */}
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          gap: "6px",
          flexWrap: "wrap",
          background: "var(--gh-bg, white)",
          borderBottom: "1px solid var(--gh-border, #e5e7eb)",
          userSelect: "none", // ⭐ 禁止文字选中
        }}>
        <span
          onClick={() => setSelectedCategory("all")}
          style={{
            padding: "4px 10px",
            background:
              selectedCategory === "all"
                ? "var(--gh-primary, #4285f4)"
                : "var(--gh-hover, #f3f4f6)",
            borderRadius: "12px",
            fontSize: "12px",
            color: selectedCategory === "all" ? "white" : "#4b5563",
            cursor: "pointer",
            border:
              selectedCategory === "all"
                ? "1px solid var(--gh-primary, #4285f4)"
                : "1px solid transparent",
          }}>
          {t("allCategory")}
        </span>

        {categories.map((cat) => (
          <span
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              padding: "4px 10px",
              background:
                selectedCategory === cat
                  ? "var(--gh-primary, #4285f4)"
                  : "var(--gh-hover, #f3f4f6)",
              borderRadius: "12px",
              fontSize: "12px",
              color: selectedCategory === cat ? "white" : "#4b5563",
              cursor: "pointer",
              border:
                selectedCategory === cat
                  ? "1px solid var(--gh-primary, #4285f4)"
                  : "1px solid transparent",
              maxWidth: "80px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={cat}>
            {cat}
          </span>
        ))}

        {categories.length > 0 && (
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            style={{
              padding: "4px 8px",
              background: "transparent",
              border: "1px dashed var(--gh-border, #d1d5db)",
              borderRadius: "12px",
              fontSize: "11px",
              color: "var(--gh-text-secondary, #9ca3af)",
              cursor: "pointer",
            }}>
            {t("manageCategory") || "管理"}
          </button>
        )}
      </div>

      {/* 提示词列表 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px", scrollbarWidth: "none" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "var(--gh-text-tertiary, #9ca3af)",
              fontSize: "14px",
            }}>
            暂无提示词
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className={`prompt-item ${selectedPromptId === p.id ? "selected" : ""} ${draggedId === p.id ? "dragging" : ""}`}
              onClick={() => handleSelect(p)}
              draggable={false}
              onDragStart={(e) => handleDragStart(e, p.id, e.currentTarget as HTMLDivElement)}
              onDragOver={(e) => handleDragOver(e, p.id)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, p.id)}
              style={{
                background:
                  selectedPromptId === p.id
                    ? "linear-gradient(135deg, #e8f0fe 0%, #f1f8e9 100%)"
                    : "var(--gh-bg, white)",
                border:
                  selectedPromptId === p.id
                    ? "1px solid var(--gh-primary, #4285f4)"
                    : "1px solid var(--gh-border, #e5e7eb)",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
                position: "relative",
                userSelect: "none",
              }}>
              {/* 头部 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "8px",
                }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "14px",
                    color: "var(--gh-text, #1f2937)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    paddingRight: "8px",
                  }}>
                  {p.title}
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "2px 6px",
                    background: "var(--gh-hover, #f3f4f6)",
                    borderRadius: "4px",
                    color: "var(--gh-text-secondary, #6b7280)",
                    flexShrink: 0,
                  }}>
                  {p.category || t("uncategorized") || "未分类"}
                </span>
              </div>

              {/* 内容预览 */}
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--gh-text-secondary, #6b7280)",
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                {p.content}
              </div>

              {/* 悬浮操作按钮 */}
              <div
                className="prompt-item-actions"
                style={{ position: "absolute", top: "8px", right: "8px", gap: "4px" }}>
                <button
                  title="拖动排序"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    const item = e.currentTarget.closest(".prompt-item") as HTMLDivElement
                    if (item) item.draggable = true
                  }}
                  onMouseUp={(e) => {
                    const item = e.currentTarget.closest(".prompt-item") as HTMLDivElement
                    if (item) item.draggable = false
                  }}
                  style={{
                    width: "24px",
                    height: "24px",
                    border: "1px solid var(--gh-border, #e5e7eb)",
                    background: "var(--gh-bg, white)",
                    borderRadius: "4px",
                    cursor: "grab",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "var(--gh-shadow-sm, 0 1px 3px rgba(0,0,0,0.1))",
                    fontSize: "12px",
                  }}>
                  ☰
                </button>
                <button
                  title={t("copy")}
                  onClick={(e) => handleCopy(p.content, e)}
                  style={{
                    width: "24px",
                    height: "24px",
                    border: "1px solid var(--gh-border, #e5e7eb)",
                    background: "var(--gh-bg, white)",
                    borderRadius: "4px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "var(--gh-shadow-sm, 0 1px 3px rgba(0,0,0,0.1))",
                    fontSize: "12px",
                  }}>
                  📋
                </button>
                <button
                  title={t("edit")}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    openEditModal(p)
                  }}
                  style={{
                    width: "24px",
                    height: "24px",
                    border: "1px solid var(--gh-border, #e5e7eb)",
                    background: "var(--gh-bg, white)",
                    borderRadius: "4px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "var(--gh-shadow-sm, 0 1px 3px rgba(0,0,0,0.1))",
                    fontSize: "12px",
                  }}>
                  ✏
                </button>
                <button
                  title={t("delete")}
                  onClick={(e) => handleDelete(p.id, e)}
                  style={{
                    width: "24px",
                    height: "24px",
                    border: "1px solid var(--gh-border, #e5e7eb)",
                    background: "var(--gh-bg, white)",
                    borderRadius: "4px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "var(--gh-shadow-sm, 0 1px 3px rgba(0,0,0,0.1))",
                    fontSize: "12px",
                    color: "var(--gh-text-danger, #ef4444)",
                  }}>
                  🗑
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 添加按钮 */}
      <div style={{ padding: "12px" }}>
        <button
          onClick={() => openEditModal()}
          style={{
            width: "100%",
            padding: "10px",
            background:
              "var(--gh-brand-gradient, linear-gradient(135deg, #4285f4 0%, #34a853 100%))",
            color: "white",
            border: "1px solid var(--gh-brand-border, transparent)",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}>
          <span>+</span>
          <span>{t("addPrompt")}</span>
        </button>
      </div>

      {/* 弹窗 */}
      {renderEditModal()}
      {renderCategoryModal()}

      {/* 公共对话框组件 */}
      {confirmState.show && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          danger
          onConfirm={() => {
            setConfirmState({ ...confirmState, show: false })
            confirmState.onConfirm()
          }}
          onCancel={() => setConfirmState({ ...confirmState, show: false })}
        />
      )}
      {promptInputState.show && (
        <InputDialog
          title={promptInputState.title}
          defaultValue={promptInputState.defaultValue}
          onConfirm={(value) => {
            setPromptInputState({ ...promptInputState, show: false })
            promptInputState.onConfirm(value)
          }}
          onCancel={() => setPromptInputState({ ...promptInputState, show: false })}
        />
      )}

      {/* 样式 */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  )
}
