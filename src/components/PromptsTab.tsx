import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import type { SiteAdapter } from "~adapters/base"
import {
  AddToQueueIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ClearIcon,
  CopyIcon,
  DeleteIcon,
  EditIcon,
  ExportIcon,
  EyeIcon,
  ImportIcon,
  MoreHorizontalIcon,
  PinIcon,
  SearchIcon,
  SplitLinesToQueueIcon,
  SettingsIcon,
  TimeIcon,
} from "~components/icons"
import { ContextMenu, MenuButton } from "~components/ConversationMenus"
import { Button, ConfirmDialog, InputDialog, SafeSvgMarkup, Tooltip } from "~components/ui"
import { useOverlayPortalTarget } from "~components/ui/OverlayPortal"
import {
  extractVariables,
  type ParsedVariable,
  replaceVariables,
  VariableInputDialog,
} from "~components/VariableInputDialog"
import { ChainIconPicker } from "~components/ChainIconPicker"
import { ImportDialog } from "~components/prompts/ImportDialog"
import { PromptEditorDialog } from "~components/prompts/PromptEditorDialog"
import { PromptPreviewModal } from "~components/prompts/PromptPreviewModal"
import { CHAIN_EDITOR_PORTAL_STYLES } from "~components/prompts/chain-editor-styles"
import { usePromptDragSort } from "~components/prompts/usePromptDragSort"
import { VIRTUAL_CATEGORY } from "~constants"
import { CHAIN_ICON_PRESETS } from "~constants/chain-icons"
import type { PromptChain, PromptChainStep } from "~core/prompt-action-types"
import { enqueuePrompt, sendOrQueuePrompt } from "~core/prompt-actions"
import type { PromptManager } from "~core/prompt-manager"
import { usePromptChainsStore } from "~stores/prompt-chains-store"
import { useSettingsStore } from "~stores/settings-store"
import { APP_NAME } from "~utils/config"
import { t } from "~utils/i18n"
import { initCopyButtons } from "~utils/icons"
import { renderMarkdown } from "~utils/markdown"
import { OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS } from "~utils/dom-toolkit"
import type { Prompt } from "~utils/storage"
import { showToast } from "~utils/toast"
import { createSafeHTML } from "~utils/trusted-types"

interface PromptsTabProps {
  manager: PromptManager
  adapter?: SiteAdapter | null
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

type PromptLibraryView = "prompts" | "chains"

type ChainDraft = Omit<PromptChain, "id" | "createdAt" | "updatedAt"> & {
  id?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isPromptLike = (value: unknown): value is Prompt => {
  if (!isRecord(value)) return false

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.content === "string" &&
    typeof value.category === "string" &&
    (value.pinned === undefined || typeof value.pinned === "boolean") &&
    (value.lastUsedAt === undefined || typeof value.lastUsedAt === "number")
  )
}

const parseImportedPrompts = (value: unknown): Prompt[] | null => {
  const promptList = (() => {
    if (Array.isArray(value)) return value

    if (!isRecord(value)) return null

    if (Array.isArray(value.prompts)) return value.prompts

    if (isRecord(value.data) && Array.isArray(value.data.prompts)) {
      return value.data.prompts
    }

    if (isRecord(value.state) && Array.isArray(value.state.prompts)) {
      return value.state.prompts
    }

    return null
  })()

  if (!promptList || !promptList.every(isPromptLike)) return null

  return promptList
}
// 根据分类名称哈希自动分配颜色索引 1-7
const getCategoryColorIndex = (categoryName: string): number => {
  let hash = 0
  for (let i = 0; i < categoryName.length; i++) {
    hash = categoryName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return (Math.abs(hash) % 7) + 1
}

const CATEGORY_COLOR_FALLBACKS: Record<number, string> = {
  1: "#fecaca",
  2: "#fed7aa",
  3: "#fef08a",
  4: "#bbf7d0",
  5: "#a5f3fc",
  6: "#c7d2fe",
  7: "#f5d0fe",
}

const getResolvedCategoryColor = (colorIndex: number): string => {
  const variableName = `--gh-category-${colorIndex}`

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const targets: HTMLElement[] = []
    const hosts = document.querySelectorAll<HTMLElement>("plasmo-csui, #ophel-userscript-root")

    hosts.forEach((host) => {
      targets.push(host)

      const root = host.shadowRoot?.querySelector<HTMLElement>(".gh-root")
      if (root) {
        targets.push(root)
      }
    })

    targets.push(document.documentElement)

    for (const target of targets) {
      const color = window.getComputedStyle(target).getPropertyValue(variableName).trim()
      if (color) {
        return color
      }
    }
  }

  return CATEGORY_COLOR_FALLBACKS[colorIndex] || "var(--gh-hover, #f3f4f6)"
}

export const PromptsTab: React.FC<PromptsTabProps> = ({
  manager,
  adapter,
  onPromptSelect,
  selectedPromptId,
}) => {
  const DOUBLE_CLICK_DELAY_MS = 340
  const overlayPortalTarget = useOverlayPortalTarget()

  const doubleClickToSend = useSettingsStore(
    (state) => state.settings.features?.prompts?.doubleClickToSend ?? false,
  )
  const submitShortcut = useSettingsStore(
    (state) => state.settings.features?.prompts?.submitShortcut ?? "enter",
  )
  const promptQueueEnabled = useSettingsStore(
    (state) => state.settings.features?.prompts?.promptQueue ?? false,
  )
  const quickQuoteEnabled = useSettingsStore(
    (state) => state.settings.features?.prompts?.quickQuoteEnabled ?? true,
  )
  const updatePromptQueueSetting = useSettingsStore((state) => state.updateDeepSetting)

  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>(VIRTUAL_CATEGORY.ALL)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeLibraryView, setActiveLibraryView] = useState<PromptLibraryView>("prompts")
  const chains = usePromptChainsStore((state) => state.chains)
  const addChain = usePromptChainsStore((state) => state.addChain)
  const updateChain = usePromptChainsStore((state) => state.updateChain)
  const deleteChain = usePromptChainsStore((state) => state.deleteChain)
  const duplicateChain = usePromptChainsStore((state) => state.duplicateChain)
  const updateChainOrder = usePromptChainsStore((state) => state.updateOrder)

  // 模态弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<Partial<Prompt> | null>(null)
  const [chainEditorState, setChainEditorState] = useState<{
    show: boolean
    draft: ChainDraft | null
    showExecutionPreview: boolean
    draggedStepId: string | null
  }>({ show: false, draft: null, showExecutionPreview: false, draggedStepId: null })

  // 图标选择器弹窗状态
  const [showChainIconPicker, setShowChainIconPicker] = useState(false)

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
  // 变量输入弹窗状态
  const [variableDialogState, setVariableDialogState] = useState<{
    show: boolean
    prompt: Prompt | null
    variables: ParsedVariable[]
    submitAfterInsert: boolean
    enqueueAfterResolve: boolean
    enqueueSplitByLine: boolean
  }>({
    show: false,
    prompt: null,
    variables: [],
    submitAfterInsert: false,
    enqueueAfterResolve: false,
    enqueueSplitByLine: false,
  })

  // 导入确认弹窗状态
  const [importDialogState, setImportDialogState] = useState<{
    show: boolean
    prompts: Prompt[]
  }>({ show: false, prompts: [] })

  // 导入导出菜单状态
  const [importExportMenuOpen, setImportExportMenuOpen] = useState(false)
  const importExportButtonRef = useRef<HTMLButtonElement>(null)

  // Markdown 预览开关
  const [showPreview, setShowPreview] = useState(false)

  // 快捷预览弹窗状态
  const [previewModal, setPreviewModal] = useState<{
    show: boolean
    prompt: Prompt | null
  }>({ show: false, prompt: null })

  const clickTimerRef = useRef<number | null>(null)
  const locateHighlightTimerRef = useRef<number | null>(null)
  const promptListRef = useRef<HTMLDivElement | null>(null)
  const [locatedPromptId, setLocatedPromptId] = useState<string | null>(null)
  const [promptActionMenu, setPromptActionMenu] = useState<{
    prompt: Prompt
    anchorEl: HTMLElement
  } | null>(null)

  // 预览容器 refs（用于初始化 SVG 图标）
  const editPreviewRef = useRef<HTMLDivElement>(null)
  const modalPreviewRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback(() => {
    const allPrompts = manager.getPrompts()
    const allCategories = manager.getCategories()
    setPrompts(allPrompts)
    setCategories(allCategories)

    // 分类有效性检查：如果当前选中的分类不再存在或变空，回退到「全部」
    setSelectedCategory((prev) => {
      if (prev === VIRTUAL_CATEGORY.ALL) return prev
      // 检查分类是否还存在
      if (!allCategories.includes(prev)) return VIRTUAL_CATEGORY.ALL
      // 检查分类下是否还有提示词
      const hasPrompts = allPrompts.some((p) => p.category === prev)
      if (!hasPrompts) return VIRTUAL_CATEGORY.ALL
      return prev
    })
  }, [manager])

  const {
    draggedId,
    draggedChainId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
    handleChainDragStart,
    handleChainDragOver,
    handleChainDragEnd,
    handleChainDrop,
  } = usePromptDragSort({
    manager,
    loadData,
    chains,
    updateChainOrder,
    onOrderUpdated: () => showToast(t("orderUpdated")),
  })

  const openVariableDialogByPromptId = useCallback(
    (promptId: string, submitAfterInsert = false) => {
      const targetPrompt = manager.getPrompts().find((prompt) => prompt.id === promptId)
      if (!targetPrompt) {
        return false
      }

      const variables = extractVariables(targetPrompt.content)
      if (variables.length === 0) {
        return false
      }

      setVariableDialogState({
        show: true,
        prompt: targetPrompt,
        variables,
        submitAfterInsert,
        enqueueAfterResolve: false,
        enqueueSplitByLine: false,
      })
      return true
    },
    [manager],
  )

  const locatePromptById = useCallback(
    (promptId: string) => {
      const targetPrompt = manager.getPrompts().find((prompt) => prompt.id === promptId)
      if (!targetPrompt) {
        return false
      }

      setActiveLibraryView("prompts")
      setSelectedCategory(VIRTUAL_CATEGORY.ALL)
      setSearchQuery("")
      onPromptSelect?.(null)
      setLocatedPromptId(targetPrompt.id)
      return true
    },
    [manager, onPromptSelect],
  )

  useEffect(() => {
    const handleOpenPromptVariableDialog = (event: Event) => {
      const detail = (event as CustomEvent<OphelPendingPromptVariableDialogDetail>).detail
      const promptId = detail?.promptId
      if (!promptId) {
        return
      }

      const opened = openVariableDialogByPromptId(promptId, Boolean(detail?.submitAfterInsert))
      if (opened) {
        onPromptSelect?.(null)
        window.__ophelPendingPromptVariableDialog = null
      }
    }

    window.addEventListener("ophel:openPromptVariableDialog", handleOpenPromptVariableDialog)

    const pending = window.__ophelPendingPromptVariableDialog
    if (pending?.promptId) {
      const opened = openVariableDialogByPromptId(
        pending.promptId,
        Boolean(pending.submitAfterInsert),
      )
      if (opened) {
        onPromptSelect?.(null)
        window.__ophelPendingPromptVariableDialog = null
      }
    }

    return () => {
      window.removeEventListener("ophel:openPromptVariableDialog", handleOpenPromptVariableDialog)
    }
  }, [onPromptSelect, openVariableDialogByPromptId])

  useEffect(() => {
    const handleLocatePrompt = (event: Event) => {
      const detail = (event as CustomEvent<OphelPendingLocatePromptDetail>).detail
      const promptId = detail?.promptId
      if (!promptId) {
        return
      }

      const located = locatePromptById(promptId)
      if (located) {
        window.__ophelPendingLocatePrompt = null
      }
    }

    window.addEventListener("ophel:locatePrompt", handleLocatePrompt)

    const pending = window.__ophelPendingLocatePrompt
    if (pending?.promptId) {
      const located = locatePromptById(pending.promptId)
      if (located) {
        window.__ophelPendingLocatePrompt = null
      }
    }

    return () => {
      window.removeEventListener("ophel:locatePrompt", handleLocatePrompt)
    }
  }, [locatePromptById])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current)
      }
      if (locateHighlightTimerRef.current !== null) {
        window.clearTimeout(locateHighlightTimerRef.current)
      }
    }
  }, [])

  // 编辑模态框预览渲染后初始化复制按钮
  useEffect(() => {
    if (showPreview && editPreviewRef.current) {
      initCopyButtons(editPreviewRef.current, { size: 14, color: "#6b7280" })
    }
  }, [showPreview, editingPrompt?.content])

  // 快捷预览模态框渲染后初始化复制按钮
  useEffect(() => {
    if (previewModal.show && modalPreviewRef.current) {
      initCopyButtons(modalPreviewRef.current, { size: 14, color: "#6b7280" })
    }
  }, [previewModal.show, previewModal.prompt])

  const getFilteredPrompts = () => {
    let filtered: Prompt[]

    // 最近使用筛选：显示有 lastUsedAt 的，按时间倒序
    if (selectedCategory === VIRTUAL_CATEGORY.RECENT) {
      filtered = manager
        .getPrompts()
        .filter((p) => p.lastUsedAt)
        .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
        .slice(0, 10) // 只显示最近 10 个

      // 搜索过滤
      if (searchQuery) {
        const lower = searchQuery.toLowerCase()
        filtered = filtered.filter(
          (p) => p.title.toLowerCase().includes(lower) || p.content.toLowerCase().includes(lower),
        )
      }
    } else {
      filtered = manager.filterPrompts(searchQuery, selectedCategory)
    }

    // 置顶的提示词优先显示（最近使用模式下不重排）
    if (selectedCategory !== VIRTUAL_CATEGORY.RECENT) {
      filtered = filtered.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return 0
      })
    }

    return filtered
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
    setPromptInputState({ show: true, title, defaultValue, onConfirm })
  }

  const createDefaultChainStep = (): PromptChainStep => ({
    id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    mode: "prompt",
    promptId: prompts[0]?.id || "",
    inlineContent: "",
    runMode: "enqueue",
    splitMode: "none",
  })

  const createDefaultChainDraft = (): ChainDraft => ({
    title: "",
    description: "",
    iconSvg: CHAIN_ICON_PRESETS[0]?.svg || "",
    showInSelectionPopover: true,
    steps: prompts[0] ? [createDefaultChainStep()] : [],
    lastUsedAt: undefined,
  })

  const openChainEditor = (chain?: PromptChain) => {
    setChainEditorState({
      show: true,
      draft: chain
        ? { ...chain, steps: chain.steps.map((step) => ({ ...step })) }
        : createDefaultChainDraft(),
      showExecutionPreview: false,
      draggedStepId: null,
    })
  }

  const closeChainEditor = useCallback(() => {
    setChainEditorState({
      show: false,
      draft: null,
      showExecutionPreview: false,
      draggedStepId: null,
    })
  }, [])

  const updateChainDraft = (updates: Partial<ChainDraft>) => {
    setChainEditorState((state) =>
      state.draft ? { ...state, draft: { ...state.draft, ...updates } } : state,
    )
  }

  const enablePromptQueue = useCallback(() => {
    updatePromptQueueSetting("features", "prompts", "promptQueue", true)
    showToast(t("chainQueueEnabledToast"), 1800)
  }, [updatePromptQueueSetting])

  const enableQuickQuote = useCallback(() => {
    updatePromptQueueSetting("features", "prompts", "quickQuoteEnabled", true)
    showToast(t("chainQuickQuoteEnabledToast"), 1800)
  }, [updatePromptQueueSetting])

  const openPromptQueueSettings = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("ophel:navigateSettingsPage", {
        detail: { settingId: "prompt-queue" },
      }),
    )
  }, [])

  const openQuickQuoteSettings = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("ophel:navigateSettingsPage", {
        detail: { settingId: "prompt-quick-quote-enabled" },
      }),
    )
  }, [])

  const enablePromptQueueAndCreateChain = () => {
    updatePromptQueueSetting("features", "prompts", "promptQueue", true)
    showToast(t("chainQueueEnabledToast"), 1800)
    openChainEditor()
  }

  const updateChainStep = (stepId: string, updates: Partial<PromptChainStep>) => {
    setChainEditorState((state) => {
      if (!state.draft) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          steps: state.draft.steps.map((step) =>
            step.id === stepId ? { ...step, ...updates } : step,
          ),
        },
      }
    })
  }

  const addChainStep = () => {
    setChainEditorState((state) => {
      if (!state.draft) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          steps: [...state.draft.steps, createDefaultChainStep()],
        },
      }
    })
  }

  const removeChainStep = (stepId: string) => {
    setChainEditorState((state) => {
      if (!state.draft) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          steps: state.draft.steps.filter((step) => step.id !== stepId),
        },
      }
    })
  }

  const handleStepDragStart = (stepId: string) => {
    setChainEditorState((state) => ({ ...state, draggedStepId: stepId }))
  }

  const handleStepDragOver = (e: React.DragEvent, targetStepId: string) => {
    e.preventDefault()
    const draggedId = chainEditorState.draggedStepId
    if (!draggedId || draggedId === targetStepId) return

    setChainEditorState((state) => {
      if (!state.draft) return state
      const steps = [...state.draft.steps]
      const draggedIndex = steps.findIndex((s) => s.id === draggedId)
      const targetIndex = steps.findIndex((s) => s.id === targetStepId)
      if (draggedIndex === -1 || targetIndex === -1) return state

      const [draggedStep] = steps.splice(draggedIndex, 1)
      steps.splice(targetIndex, 0, draggedStep)
      return { ...state, draft: { ...state.draft, steps } }
    })
  }

  const handleStepDragEnd = () => {
    setChainEditorState((state) => ({ ...state, draggedStepId: null }))
  }

  const saveChainDraft = () => {
    const draft = chainEditorState.draft
    if (!draft) return

    const title = draft.title.trim()
    // 验证步骤：prompt 模式需要 promptId，inline 模式需要 inlineContent
    const steps = draft.steps
      .map((step): PromptChainStep | null => {
        if (step.mode === "inline") {
          return step.inlineContent?.trim()
            ? {
                ...step,
                promptId: "",
                inlineContent: step.inlineContent,
              }
            : null
        }

        return step.promptId
          ? {
              ...step,
              mode: "prompt",
              inlineContent: "",
            }
          : null
      })
      .filter((step): step is PromptChainStep => step !== null)
    if (!title) {
      showToast(t("chainTitleRequired"), 2200)
      return
    }
    if (steps.length === 0) {
      showToast(t("chainStepRequired"), 2200)
      return
    }

    const payload = {
      title,
      description: draft.description?.trim() || "",
      iconSvg: draft.iconSvg?.trim() || "",
      showInSelectionPopover: draft.showInSelectionPopover !== false,
      steps,
      lastUsedAt: draft.lastUsedAt,
    }

    if (draft.id) {
      updateChain(draft.id, payload)
      showToast(t("chainUpdated"), 1800)
    } else {
      addChain(payload)
      showToast(t("chainAdded"), 1800)
    }
    closeChainEditor()
  }

  const getPromptTitle = (promptId: string) =>
    prompts.find((prompt) => prompt.id === promptId)?.title || t("chainMissingPrompt")

  const getChainStepSearchText = (step: PromptChainStep) => {
    if (step.mode === "inline") return step.inlineContent || ""
    return getPromptTitle(step.promptId)
  }

  const filteredChains = chains.filter((chain) => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    const stepText = chain.steps.map(getChainStepSearchText).join(" ")
    return `${chain.title} ${chain.description || ""} ${stepText}`.toLowerCase().includes(query)
  })

  // 选中提示词并插入
  const handleSelect = async (prompt: Prompt, submitAfterInsert = false) => {
    // Extract variables from the selected prompt
    const variables = extractVariables(prompt.content)

    if (variables.length > 0) {
      // Prompt includes variables; open the variable dialog first
      setVariableDialogState({
        show: true,
        prompt,
        variables,
        submitAfterInsert,
        enqueueAfterResolve: false,
        enqueueSplitByLine: false,
      })
    } else {
      // No variables; insert or send directly.
      if (submitAfterInsert) {
        await doSend(prompt, prompt.content)
        return
      }

      await doInsert(prompt, prompt.content)
    }
  }

  const doInsert = async (prompt: Prompt, content: string) => {
    const success = await manager.insertPrompt(content)
    if (success) {
      manager.updateLastUsed(prompt.id)
      onPromptSelect?.(prompt)
      showToast(`${t("inserted")}: ${prompt.title}`)
    } else {
      showToast(t("insertFailed"))
    }
  }

  const doSend = async (prompt: Prompt, content: string) => {
    const result = await sendOrQueuePrompt({
      adapter,
      manager,
      content,
      submitShortcut,
      context: {
        source: "prompt-library",
        prompt,
      },
    })

    if (result.status === "insert-failed") {
      showToast(t("insertFailed"))
      return
    }

    manager.updateLastUsed(prompt.id)

    if (result.status === "send-failed") {
      showToast(t("promptSendFailed"))
      onPromptSelect?.(prompt)
      return
    }

    onPromptSelect?.(null)

    if (result.status === "queued") {
      showToast(t("promptQueued", { count: String(result.count) }), 2500)
      return
    }

    showToast(`${t("promptSent")}: ${prompt.title}`)
  }

  const enqueueResolvedPrompt = (prompt: Prompt, content: string, splitByLine = false) => {
    const result = enqueuePrompt({
      content,
      splitByLine,
      context: {
        source: "prompt-library",
        prompt,
      },
    })

    if (result.status === "disabled") {
      showToast(t("promptQueueEnableHint"), 3000)
      return
    }

    if (result.status === "empty") {
      showToast(t("promptEnqueueEmpty"), 2500)
      return
    }

    manager.updateLastUsed(prompt.id)
    showToast(t("promptQueued", { count: String(result.count) }), 2500)
  }

  const doEnqueuePrompt = (prompt: Prompt, splitByLine = false) => {
    if (!promptQueueEnabled) {
      showToast(t("promptQueueEnableHint"), 3000)
      return
    }

    const variables = extractVariables(prompt.content)
    if (variables.length > 0) {
      setVariableDialogState({
        show: true,
        prompt,
        variables,
        submitAfterInsert: false,
        enqueueAfterResolve: true,
        enqueueSplitByLine: splitByLine,
      })
      return
    }

    enqueueResolvedPrompt(prompt, prompt.content, splitByLine)
  }

  const handleVariableConfirm = async (values: Record<string, string>) => {
    const { prompt, submitAfterInsert, enqueueAfterResolve, enqueueSplitByLine } =
      variableDialogState
    if (!prompt) return

    const replacedContent = replaceVariables(prompt.content, values)
    setVariableDialogState({
      show: false,
      prompt: null,
      variables: [],
      submitAfterInsert: false,
      enqueueAfterResolve: false,
      enqueueSplitByLine: false,
    })

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    if (submitAfterInsert) {
      await doSend(prompt, replacedContent)
      return
    }

    if (enqueueAfterResolve) {
      enqueueResolvedPrompt(prompt, replacedContent, enqueueSplitByLine)
      return
    }

    await doInsert(prompt, replacedContent)
  }

  const handlePromptClick = (prompt: Prompt) => {
    setLocatedPromptId(null)

    if (!doubleClickToSend) {
      void handleSelect(prompt)
      return
    }

    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }

    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null
      void handleSelect(prompt)
    }, DOUBLE_CLICK_DELAY_MS)
  }

  const handlePromptDoubleClick = (prompt: Prompt) => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }

    if (doubleClickToSend) {
      void handleSelect(prompt, true)
    }
  }

  // Toggle pin state
  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    manager.togglePin(id)
    loadData()
  }

  const movePromptRelativeToVisibleNeighbor = (
    promptId: string,
    neighborId: string,
    placement: "before" | "after",
  ) => {
    const allPrompts = manager.getPrompts()
    const fromIndex = allPrompts.findIndex((prompt) => prompt.id === promptId)
    const neighborIndex = allPrompts.findIndex((prompt) => prompt.id === neighborId)

    if (fromIndex === -1 || neighborIndex === -1) {
      return
    }

    const nextOrder = [...allPrompts]
    const [movedPrompt] = nextOrder.splice(fromIndex, 1)
    let insertIndex = nextOrder.findIndex((prompt) => prompt.id === neighborId)

    if (insertIndex === -1) {
      return
    }

    if (placement === "after") {
      insertIndex += 1
    }

    nextOrder.splice(insertIndex, 0, movedPrompt)
    manager.updateOrder(nextOrder.map((prompt) => prompt.id))
    showToast(t("orderUpdated"))
    loadData()
  }

  // 导出提示词为 JSON 文件
  const handleExport = () => {
    const allPrompts = manager.getPrompts()
    const json = JSON.stringify(allPrompts, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${APP_NAME}-prompts-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(t("promptExportSuccess"))
  }

  // 导入提示词
  const handleImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const imported = parseImportedPrompts(JSON.parse(text))

        if (!imported) {
          console.error("[Ophel] prompt import failed: unsupported prompt file format")
          showToast(t("promptImportFailed"))
          return
        }

        // 显示导入确认弹窗（支持覆盖/合并/取消）
        setImportDialogState({ show: true, prompts: imported })
      } catch (error) {
        console.error("[Ophel] prompt import failed:", error)
        showToast(t("promptImportFailed"))
      }
    }
    input.click()
  }

  // 处理覆盖导入
  const handleImportOverwrite = () => {
    const imported = importDialogState.prompts
    manager.setPrompts(imported)
    loadData()
    setImportDialogState({ show: false, prompts: [] })
    showToast(t("promptImportSuccess").replace("{count}", imported.length.toString()))
  }

  // 处理合并导入（按 ID 合并）
  const handleImportMerge = () => {
    const imported = importDialogState.prompts
    const existing = manager.getPrompts()
    const existingIds = new Set(existing.map((p) => p.id))

    // 分离：已存在的（更新）和 新的（追加）
    const toUpdate = imported.filter((p) => existingIds.has(p.id))
    const toAdd = imported.filter((p) => !existingIds.has(p.id))

    // 更新已存在的
    toUpdate.forEach((p) => {
      manager.updatePrompt(p.id, {
        title: p.title,
        content: p.content,
        category: p.category,
        pinned: p.pinned,
      })
    })

    // 追加新的
    toAdd.forEach((p) => {
      manager.addPrompt({
        title: p.title,
        content: p.content,
        category: p.category,
        pinned: p.pinned,
      })
    })

    loadData()
    setImportDialogState({ show: false, prompts: [] })
    const msg = `已合并：更新 ${toUpdate.length} 个，新增 ${toAdd.length} 个`
    showToast(
      t("promptMergeSuccess")
        ?.replace("{updated}", toUpdate.length.toString())
        .replace("{added}", toAdd.length.toString()) || msg,
    )
  }

  // 保存提示词（新增/编辑）
  const handleSave = async () => {
    if (!editingPrompt?.title || !editingPrompt?.content) {
      showToast(t("fillTitleContent"))
      return
    }

    const newCategory = editingPrompt.category || t("uncategorized")
    let shouldSwitchToNewCategory = false

    if (editingPrompt.id) {
      // 编辑时检查是否需要切换分类
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
      showToast(t("promptUpdated"))

      // 切换到新分类
      if (shouldSwitchToNewCategory) {
        setSelectedCategory(newCategory)
      }
    } else {
      await manager.addPrompt({
        title: editingPrompt.title!,
        content: editingPrompt.content!,
        category: newCategory,
      })
      showToast(t("promptAdded"))
    }
    closeEditModal()
    loadData()
  }

  const closeEditModal = useCallback(() => {
    setIsModalOpen(false)
    setEditingPrompt(null)
  }, [])

  const closeCategoryModal = useCallback(() => {
    setIsCategoryModalOpen(false)
  }, [])

  const closeConfirmDialog = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, show: false }))
  }, [])

  const closePromptInputDialog = useCallback(() => {
    setPromptInputState((prev) => ({ ...prev, show: false }))
  }, [])

  const closePreviewModal = useCallback(() => {
    setPreviewModal({ show: false, prompt: null })
  }, [])

  const closeImportDialog = useCallback(() => {
    setImportDialogState({ show: false, prompts: [] })
  }, [])

  const closeVariableDialog = useCallback(() => {
    setVariableDialogState({
      show: false,
      prompt: null,
      variables: [],
      submitAfterInsert: false,
      enqueueAfterResolve: false,
      enqueueSplitByLine: false,
    })
  }, [])

  const closePromptActionMenu = useCallback(() => {
    setPromptActionMenu(null)
  }, [])

  // 删除提示词
  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    showConfirm(t("delete"), t("confirmDelete"), async () => {
      await manager.deletePrompt(id)
      showToast(t("deleted"))
      loadData()
    })
  }

  // 复制提示词内容
  const handleCopy = async (content: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(content)
      showToast(t("copied"))
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      showToast(t("copied"))
    }
  }

  // 打开编辑/新增弹窗
  const openEditModal = (prompt?: Prompt) => {
    if (prompt) {
      setEditingPrompt({ ...prompt })
    } else {
      // 新建时：如果当前选中了真实分类，使用该分类；否则使用第一个真实分类或「未分类」
      const isVirtualCategory =
        selectedCategory === VIRTUAL_CATEGORY.ALL || selectedCategory === VIRTUAL_CATEGORY.RECENT
      const defaultCategory = isVirtualCategory
        ? categories[0] || t("uncategorized")
        : selectedCategory
      setEditingPrompt({ title: "", content: "", category: defaultCategory })
    }
    setIsModalOpen(true)
  }

  // === 分类管理 ===
  const handleRenameCategory = (oldName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    showPromptInput(t("newCategoryName"), oldName, async (newName: string) => {
      if (newName && newName.trim() && newName !== oldName) {
        await manager.renameCategory(oldName, newName.trim())
        showToast(t("categoryRenamedTo").replace("{name}", newName.trim()))
        // 如果当前选中的分类被重命名，同步更新选中状态
        if (selectedCategory === oldName) {
          setSelectedCategory(newName.trim())
        }
        loadData()
      }
    })
  }

  const handleDeleteCategory = (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    showConfirm(
      t("confirmDeleteCategory"),
      t("confirmDeleteCategoryMsg").replace("{name}", name),
      async () => {
        await manager.deleteCategory(name)
        showToast(t("categoryDeletedMsg").replace("{name}", name))
        if (selectedCategory === name) {
          setSelectedCategory(VIRTUAL_CATEGORY.ALL)
        }
        loadData()
      },
    )
  }

  const filtered = getFilteredPrompts()

  const getPromptMoveTargets = (promptId: string) => {
    if (
      activeLibraryView !== "prompts" ||
      selectedCategory === VIRTUAL_CATEGORY.RECENT ||
      searchQuery.trim()
    ) {
      return { previous: null, next: null }
    }

    const currentIndex = filtered.findIndex((prompt) => prompt.id === promptId)
    const currentPrompt = currentIndex >= 0 ? filtered[currentIndex] : null

    if (!currentPrompt) {
      return { previous: null, next: null }
    }

    const previous = filtered[currentIndex - 1]
    const next = filtered[currentIndex + 1]

    return {
      previous: previous?.pinned === currentPrompt.pinned ? previous : null,
      next: next?.pinned === currentPrompt.pinned ? next : null,
    }
  }

  const promptMoveTargets = promptActionMenu
    ? getPromptMoveTargets(promptActionMenu.prompt.id)
    : { previous: null, next: null }

  useEffect(() => {
    const hasPromptDialogs =
      promptInputState.show ||
      confirmState.show ||
      isCategoryModalOpen ||
      chainEditorState.show ||
      variableDialogState.show

    if (!hasPromptDialogs) {
      return
    }

    const handleEscapeForPromptDialogs = (e: KeyboardEvent) => {
      if (e.key !== "Escape") {
        return
      }

      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation?.()

      if (promptInputState.show) {
        closePromptInputDialog()
        return
      }

      if (confirmState.show) {
        closeConfirmDialog()
        return
      }

      if (variableDialogState.show) {
        closeVariableDialog()
        return
      }

      if (isCategoryModalOpen) {
        closeCategoryModal()
        return
      }

      if (chainEditorState.show) {
        closeChainEditor()
      }
    }

    document.addEventListener("keydown", handleEscapeForPromptDialogs, true)
    return () => {
      document.removeEventListener("keydown", handleEscapeForPromptDialogs, true)
    }
  }, [
    closeCategoryModal,
    closeConfirmDialog,
    closeChainEditor,
    closePromptInputDialog,
    closeVariableDialog,
    chainEditorState.show,
    confirmState.show,
    isCategoryModalOpen,
    promptInputState.show,
    variableDialogState.show,
  ])

  useEffect(() => {
    if (!locatedPromptId) {
      return
    }

    const container = promptListRef.current
    if (!container) {
      return
    }

    const escapedPromptId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(locatedPromptId)
        : locatedPromptId.replace(/["\\]/g, "\\$&")

    const target = container.querySelector<HTMLElement>(
      `.prompt-item[data-prompt-id="${escapedPromptId}"]`,
    )
    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" })

    if (locateHighlightTimerRef.current !== null) {
      window.clearTimeout(locateHighlightTimerRef.current)
    }

    locateHighlightTimerRef.current = window.setTimeout(() => {
      setLocatedPromptId((current) => (current === locatedPromptId ? null : current))
      locateHighlightTimerRef.current = null
    }, 2200)
  }, [activeLibraryView, locatedPromptId, prompts, searchQuery, selectedCategory])

  const renderChainIcon = (iconSvg?: string) => {
    return (
      <SafeSvgMarkup
        className="gh-chain-icon-svg"
        svg={iconSvg}
        fallback={<span className="gh-chain-icon-fallback">C</span>}
      />
    )
  }

  const getChainVariables = (draft: ChainDraft | PromptChain): ParsedVariable[] => {
    const seen = new Set<string>()
    const variables: ParsedVariable[] = []

    draft.steps.forEach((step) => {
      let content = ""

      if (step.mode === "inline" && step.inlineContent) {
        // 内联模式：从 inlineContent 提取变量
        content = step.inlineContent
      } else {
        // Prompt 模式：从已有 prompt 提取变量
        const prompt = prompts.find((item) => item.id === step.promptId)
        if (!prompt) return
        content = prompt.content
      }

      extractVariables(content).forEach((variable) => {
        if (variable.raw === "selection" || variable.raw === "quote" || seen.has(variable.raw)) {
          return
        }
        seen.add(variable.raw)
        variables.push(variable)
      })
    })

    return variables
  }

  const getChainStepTitles = (chain: PromptChain | ChainDraft): string[] =>
    chain.steps.map((step) => {
      if (step.mode === "inline" && step.inlineContent) {
        // 内联模式：截取前 30 个字符作为标题
        const text = step.inlineContent.trim().replace(/\s+/g, " ")
        return text.length > 30 ? `${text.slice(0, 30)}...` : text
      }
      return getPromptTitle(step.promptId)
    })

  const getChainExecutionPreview = (draft: ChainDraft | PromptChain): string[] => {
    const exampleSelection = "Selected text from conversation"
    const exampleQuote = "> Selected text from conversation"
    const exampleValues: Record<string, string> = {
      selection: exampleSelection,
      quote: exampleQuote,
    }

    // 添加自定义变量的示例值
    const variables = getChainVariables(draft)
    variables.forEach((variable) => {
      exampleValues[variable.raw] = `{{${variable.raw}}}`
    })

    return draft.steps.map((step) => {
      let template = ""

      if (step.mode === "inline" && step.inlineContent) {
        template = step.inlineContent
      } else {
        const prompt = prompts.find((item) => item.id === step.promptId)
        template = prompt?.content || ""
      }

      if (!template) return ""

      // 替换变量
      return replaceVariables(template, exampleValues).trim()
    })
  }

  const renderChainQueueGate = (
    placement: "list" | "editor",
    primaryAction: "enable" | "enableAndCreate" = "enable",
  ) => {
    if (promptQueueEnabled) return null

    const shouldCreateAfterEnable = primaryAction === "enableAndCreate"

    return (
      <div className={`gh-chain-queue-gate ${placement}`}>
        <div className="gh-chain-queue-gate-copy">
          <div className="gh-chain-queue-gate-title">{t("chainQueueRequiredTitle")}</div>
          <div className="gh-chain-queue-gate-description">
            {t("chainQueueRequiredDescription")}
          </div>
        </div>
        <div className="gh-chain-queue-gate-actions">
          <Button
            variant="primary"
            size="sm"
            onClick={shouldCreateAfterEnable ? enablePromptQueueAndCreateChain : enablePromptQueue}>
            {shouldCreateAfterEnable ? t("chainQueueEnableAndCreate") : t("chainQueueEnable")}
          </Button>
          <Button variant="ghost" size="sm" onClick={openPromptQueueSettings}>
            {t("chainQueueViewSettings")}
          </Button>
        </div>
      </div>
    )
  }

  const renderChainQuickQuoteGate = (placement: "list" | "editor") => {
    if (quickQuoteEnabled) return null

    return (
      <div className={`gh-chain-queue-gate ${placement}`}>
        <div className="gh-chain-queue-gate-copy">
          <div className="gh-chain-queue-gate-title">{t("chainQuickQuoteRequiredTitle")}</div>
          <div className="gh-chain-queue-gate-description">
            {t("chainQuickQuoteRequiredDescription")}
          </div>
        </div>
        <div className="gh-chain-queue-gate-actions">
          <Button variant="primary" size="sm" onClick={enableQuickQuote}>
            {t("chainQuickQuoteEnable")}
          </Button>
          <Button variant="ghost" size="sm" onClick={openQuickQuoteSettings}>
            {t("chainQuickQuoteViewSettings")}
          </Button>
        </div>
      </div>
    )
  }

  const renderChainsView = () => {
    if (prompts.length === 0) {
      return (
        <div className="gh-chain-empty">
          <div className="gh-chain-empty-title">{t("chainNoPrompts")}</div>
          <div className="gh-chain-empty-description">{t("chainNoPromptsDescription")}</div>
        </div>
      )
    }

    if (filteredChains.length === 0) {
      return (
        <>
          {renderChainQueueGate("list", chains.length === 0 ? "enableAndCreate" : "enable")}
          <div className="gh-chain-empty">
            <div className="gh-chain-empty-title">{t("chainEmpty")}</div>
            <div className="gh-chain-empty-description">{t("chainEmptyDescription")}</div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => openChainEditor()}
              style={{ marginTop: "14px" }}>
              + {t("chainAdd")}
            </Button>
          </div>
        </>
      )
    }

    return (
      <>
        {renderChainQueueGate("list")}
        {renderChainQuickQuoteGate("list")}
        {filteredChains.map((chain) => {
          const showInSelectionPopover = chain.showInSelectionPopover !== false
          const stepTitles = getChainStepTitles(chain)
          const flowText = stepTitles.length > 0 ? stepTitles.join(" → ") : t("chainNoSteps")

          return (
            <div
              key={chain.id}
              className={`gh-chain-card${draggedChainId === chain.id ? " dragging" : ""}`}
              data-disabled={!showInSelectionPopover}
              onClick={() => openChainEditor(chain)}
              draggable
              onDragStart={(e) =>
                handleChainDragStart(e, chain.id, e.currentTarget as HTMLDivElement)
              }
              onDragOver={(e) => handleChainDragOver(e, chain.id)}
              onDragEnd={handleChainDragEnd}
              onDrop={(e) => handleChainDrop(e, chain.id)}>
              <div className="gh-chain-card-main">
                <div className="gh-chain-icon" data-enabled={showInSelectionPopover}>
                  {renderChainIcon(chain.iconSvg)}
                  <span
                    className="gh-chain-icon-status-dot"
                    data-enabled={showInSelectionPopover}
                  />
                </div>
                <div className="gh-chain-body">
                  <div className="gh-chain-title-row">
                    <span className="gh-chain-title">{chain.title}</span>
                  </div>
                  <Tooltip content={flowText}>
                    <div className="gh-chain-flow">
                      <span className="gh-chain-meta-badge">{chain.steps.length}</span>
                      <span className="gh-chain-flow-text">{flowText}</span>
                    </div>
                  </Tooltip>
                </div>
              </div>

              <div className="gh-chain-card-actions">
                <Tooltip
                  content={
                    showInSelectionPopover ? t("chainShownInPopover") : t("chainHiddenInPopover")
                  }>
                  <button
                    className={`prompt-action-btn${showInSelectionPopover ? " active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateChain(chain.id, {
                        showInSelectionPopover: !showInSelectionPopover,
                      })
                    }}>
                    <CheckIcon size={15} />
                  </button>
                </Tooltip>
                <Tooltip content={t("copy")}>
                  <button
                    className="prompt-action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      const copy = duplicateChain(chain.id)
                      if (copy) showToast(t("chainDuplicated"), 1800)
                    }}>
                    <CopyIcon size={15} />
                  </button>
                </Tooltip>
                <Tooltip content={t("delete")}>
                  <button
                    className="prompt-action-btn danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      showConfirm(t("confirmDelete"), t("chainDeleteConfirm"), () => {
                        deleteChain(chain.id)
                        showToast(t("deleted"), 1800)
                      })
                    }}>
                    <DeleteIcon size={15} />
                  </button>
                </Tooltip>
              </div>
            </div>
          )
        })}
      </>
    )
  }

  const renderChainEditorModal = () => {
    if (!chainEditorState.show || !chainEditorState.draft || !overlayPortalTarget) return null

    const draft = chainEditorState.draft
    const variables = getChainVariables(draft)

    return createPortal(
      <>
        <style>{CHAIN_EDITOR_PORTAL_STYLES}</style>
        <div
          className="prompt-modal gh-interactive"
          {...OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--gh-overlay-bg, rgba(0, 0, 0, 0.5))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2147483646,
            animation: "fadeIn 0.2s",
          }}>
          <div
            className="prompt-modal-content gh-chain-editor"
            onClick={(e) => e.stopPropagation()}>
            <div className="gh-chain-editor-header">
              <div>
                <div className="gh-chain-editor-title">
                  {draft.id ? t("chainEditorEditTitle") : t("chainEditorNewTitle")}
                </div>
                <div className="gh-chain-editor-subtitle">{t("chainEditorSubtitle")}</div>
              </div>
              <button className="gh-chain-editor-close" onClick={closeChainEditor}>
                <ClearIcon size={18} />
              </button>
            </div>

            <div className="gh-chain-editor-scroll">
              {renderChainQueueGate("editor")}
              {renderChainQuickQuoteGate("editor")}

              <div className="gh-chain-form-grid">
                <label className="gh-chain-field">
                  <span>{t("chainName")}</span>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => updateChainDraft({ title: e.target.value })}
                    placeholder={t("chainNamePlaceholder")}
                  />
                </label>

                <label className="gh-chain-field">
                  <span>{t("chainDescription")}</span>
                  <input
                    type="text"
                    value={draft.description || ""}
                    onChange={(e) => updateChainDraft({ description: e.target.value })}
                    placeholder={t("chainDescriptionPlaceholder")}
                  />
                </label>
              </div>

              <div className="gh-chain-field">
                <div className="gh-chain-icon-header">
                  <span>{t("chainIconSvg")}</span>
                  <label className="gh-chain-visibility-toggle">
                    <input
                      type="checkbox"
                      checked={draft.showInSelectionPopover !== false}
                      onChange={(e) =>
                        updateChainDraft({ showInSelectionPopover: e.target.checked })
                      }
                    />
                    <span className="gh-chain-visibility-switch" aria-hidden="true" />
                    <span className="gh-chain-visibility-toggle-text">
                      {t("chainShowInPopover")}
                    </span>
                  </label>
                </div>
                <div className="gh-chain-icon-control-row">
                  {/* 当前选中的图标预览 */}
                  {draft.iconSvg ? (
                    <div className="gh-chain-icon-preview">
                      <SafeSvgMarkup className="gh-chain-icon-preview-svg" svg={draft.iconSvg} />
                      <span>{t("chainIconSelected")}</span>
                    </div>
                  ) : (
                    <div className="gh-chain-icon-preview empty">{t("chainIconNotSelected")}</div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowChainIconPicker(true)}
                    className="gh-chain-icon-select-btn">
                    {t("chainIconSelect")}
                  </button>
                </div>
              </div>

              <div className="gh-chain-editor-section">
                <div className="gh-chain-section-header">
                  <div>
                    <div className="gh-chain-section-title">{t("chainSteps")}</div>
                    <div className="gh-chain-section-subtitle">{t("chainStepsHelp")}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={addChainStep}>
                    {t("chainAddStep")}
                  </Button>
                </div>

                <div className="gh-chain-step-list">
                  {draft.steps.length === 0 ? (
                    <div className="gh-chain-step-empty">{t("chainNoSteps")}</div>
                  ) : (
                    draft.steps.map((step, index) => (
                      <div
                        key={step.id}
                        className={`gh-chain-step-row${chainEditorState.draggedStepId === step.id ? " dragging" : ""}`}
                        draggable
                        onDragStart={() => handleStepDragStart(step.id)}
                        onDragOver={(e) => handleStepDragOver(e, step.id)}
                        onDragEnd={handleStepDragEnd}>
                        <div className="gh-chain-step-header-row">
                          <div className="gh-chain-step-drag-handle" title={t("drag")}>
                            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                              <circle cx="6" cy="4" r="1.2" />
                              <circle cx="10" cy="4" r="1.2" />
                              <circle cx="6" cy="8" r="1.2" />
                              <circle cx="10" cy="8" r="1.2" />
                              <circle cx="6" cy="12" r="1.2" />
                              <circle cx="10" cy="12" r="1.2" />
                            </svg>
                          </div>
                          <div className="gh-chain-step-index">{index + 1}</div>
                          <div className="gh-chain-step-mode-switch">
                            <button
                              type="button"
                              className={`gh-chain-step-mode-btn${step.mode !== "inline" ? " active" : ""}`}
                              onClick={() =>
                                updateChainStep(step.id, { mode: "prompt", inlineContent: "" })
                              }>
                              {t("chainStepModePrompt")}
                            </button>
                            <button
                              type="button"
                              className={`gh-chain-step-mode-btn${step.mode === "inline" ? " active" : ""}`}
                              onClick={() =>
                                updateChainStep(step.id, { mode: "inline", promptId: "" })
                              }>
                              {t("chainStepModeInline")}
                            </button>
                          </div>
                          <Tooltip content={t("delete")}>
                            <button
                              className="gh-chain-step-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeChainStep(step.id)
                              }}>
                              <DeleteIcon size={14} />
                            </button>
                          </Tooltip>
                        </div>
                        <div className="gh-chain-step-input-row">
                          {step.mode === "inline" ? (
                            <textarea
                              className="gh-chain-step-inline-input"
                              value={step.inlineContent || ""}
                              onChange={(e) =>
                                updateChainStep(step.id, { inlineContent: e.target.value })
                              }
                              placeholder={t("chainStepInlinePlaceholder")}
                              rows={4}
                            />
                          ) : (
                            <select
                              className="gh-chain-step-prompt-select"
                              value={step.promptId}
                              onChange={(e) =>
                                updateChainStep(step.id, { promptId: e.target.value })
                              }>
                              <option value="">{t("chainSelectPrompt")}</option>
                              {prompts.map((prompt) => (
                                <option key={prompt.id} value={prompt.id}>
                                  {prompt.title}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="gh-chain-editor-section">
                <div className="gh-chain-section-title">{t("chainVariablesPreview")}</div>
                <div className="gh-chain-variable-preview">
                  <span className="gh-chain-variable-chip">{`{{selection}}`}</span>
                  <span className="gh-chain-variable-chip">{`{{quote}}`}</span>
                  {variables.length === 0 ? (
                    <span className="gh-chain-variable-muted">{t("chainVariablesNone")}</span>
                  ) : (
                    variables.map((variable) => (
                      <span key={variable.raw} className="gh-chain-variable-chip custom">
                        {`{{${variable.raw}}}`}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {draft.steps.length > 0 && (
                <div className="gh-chain-editor-section gh-chain-preview-section">
                  <div className="gh-chain-section-header" style={{ marginBottom: 0 }}>
                    <div className="gh-chain-section-title">{t("chainExecutionPreview")}</div>
                    <button
                      type="button"
                      className="gh-chain-preview-toggle"
                      onClick={() =>
                        setChainEditorState((state) => ({
                          ...state,
                          showExecutionPreview: !state.showExecutionPreview,
                        }))
                      }>
                      {chainEditorState.showExecutionPreview ? t("collapse") : t("expand")}
                    </button>
                  </div>
                  {chainEditorState.showExecutionPreview && (
                    <>
                      <div className="gh-chain-preview-nav-float">
                        <span className="gh-chain-preview-nav-label">{t("chainSteps")}</span>
                        {draft.steps.map((step, idx) => {
                          const title = getChainStepTitles(draft)[idx] || `Step ${idx + 1}`
                          return (
                            <Tooltip key={step.id} content={title}>
                              <button
                                type="button"
                                className="gh-chain-preview-nav-btn"
                                onClick={() => {
                                  document
                                    .getElementById(`chain-preview-step-${idx}`)
                                    ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
                                }}>
                                <span className="nav-btn-num">{idx + 1}</span>
                                <span className="nav-btn-title">{title}</span>
                              </button>
                            </Tooltip>
                          )
                        })}
                      </div>
                      <div className="gh-chain-preview-content">
                        {getChainExecutionPreview(draft).map((content, index) => (
                          <div
                            key={index}
                            id={`chain-preview-step-${index}`}
                            className="gh-chain-preview-step">
                            <div className="gh-chain-preview-step-header">
                              <span className="gh-chain-preview-step-number">{index + 1}</span>
                              <span className="gh-chain-preview-step-title">
                                {getChainStepTitles(draft)[index] || t("chainStep")}
                              </span>
                            </div>
                            <div
                              className="gh-chain-preview-step-body"
                              dangerouslySetInnerHTML={{
                                __html: content
                                  ? createSafeHTML(renderMarkdown(content))
                                  : createSafeHTML(
                                      `<span class="gh-chain-preview-empty">${t("chainStepContentEmpty")}</span>`,
                                    ),
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="gh-chain-editor-footer">
              <Button
                variant="ghost"
                onClick={closeChainEditor}
                style={{ background: "var(--gh-hover, #f3f4f6)" }}>
                {t("cancel")}
              </Button>
              <Button variant="primary" onClick={saveChainDraft}>
                {draft.id ? t("save") : t("add")}
              </Button>
            </div>
          </div>
        </div>
      </>,
      overlayPortalTarget,
    )
  }

  // 编辑/新增弹窗
  const renderEditModal = () => (
    <PromptEditorDialog
      isOpen={isModalOpen}
      editingPrompt={editingPrompt}
      setEditingPrompt={setEditingPrompt}
      categories={categories}
      showPreview={showPreview}
      setShowPreview={setShowPreview}
      editPreviewRef={editPreviewRef}
      onClose={closeEditModal}
      onSave={handleSave}
    />
  )

  // 分类管理弹窗
  const renderCategoryModal = () => {
    if (!isCategoryModalOpen || !overlayPortalTarget) return null

    return createPortal(
      <div
        className="prompt-modal gh-interactive"
        {...OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS}
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
            {t("categoryManage")}
          </div>

          <div style={{ maxHeight: "300px", overflowY: "auto" }}>
            {categories.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--gh-text-tertiary, #9ca3af)",
                  padding: "20px",
                }}>
                {t("categoryEmpty")}
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
                        {count} {t("promptCountSuffix")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Tooltip content={t("rename")}>
                        <Button
                          size="sm"
                          onClick={(e) => handleRenameCategory(cat, e)}
                          style={{ color: "var(--gh-primary, #4285f4)" }}>
                          {t("rename")}
                        </Button>
                      </Tooltip>
                      <Tooltip content={t("delete")}>
                        <Button
                          size="sm"
                          onClick={(e) => handleDeleteCategory(cat, e)}
                          style={{
                            border: "1px solid var(--gh-border-danger, #fecaca)",
                            background: "var(--gh-bg-danger, #fef2f2)",
                            color: "var(--gh-text-danger, #ef4444)",
                          }}>
                          {t("delete")}
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="ghost"
              onClick={closeCategoryModal}
              style={{ background: "var(--gh-hover, #f3f4f6)" }}>
              {t("close")}
            </Button>
          </div>
        </div>
      </div>,
      overlayPortalTarget,
    )
  }

  // 预览弹窗渲染
  const renderPreviewModal = () => (
    <PromptPreviewModal
      isOpen={previewModal.show}
      prompt={previewModal.prompt}
      previewRef={modalPreviewRef}
      onClose={closePreviewModal}
      getCategoryColorIndex={getCategoryColorIndex}
      getResolvedCategoryColor={getResolvedCategoryColor}
    />
  )

  // 导入确认弹窗渲染
  const renderImportDialog = () => (
    <ImportDialog
      isOpen={importDialogState.show}
      promptCount={importDialogState.prompts.length}
      onClose={closeImportDialog}
      onMerge={handleImportMerge}
      onOverwrite={handleImportOverwrite}
    />
  )

  return (
    <div
      className="gh-prompts-tab"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 搜索栏 + 操作按钮 */}
      <div className="gh-panel-tool-stack gh-prompts-tool-stack">
        <div className="gh-panel-toolbar">
          <div className="gh-prompt-library-switch" role="tablist">
            <button
              type="button"
              role="tab"
              className="gh-prompt-library-switch-btn"
              data-active={activeLibraryView === "prompts"}
              aria-selected={activeLibraryView === "prompts"}
              onClick={() => setActiveLibraryView("prompts")}>
              {t("promptsViewPrompts")}
            </button>
            <button
              type="button"
              role="tab"
              className="gh-prompt-library-switch-btn"
              data-active={activeLibraryView === "chains"}
              aria-selected={activeLibraryView === "chains"}
              onClick={() => setActiveLibraryView("chains")}>
              {t("promptsViewChains")}
            </button>
          </div>
          <div className="gh-panel-search">
            <span className="gh-panel-search-icon" aria-hidden="true">
              <SearchIcon size={15} />
            </span>
            <input
              type="text"
              className="prompt-search-input gh-panel-search-input"
              placeholder={
                activeLibraryView === "chains"
                  ? t("chainSearchPlaceholder")
                  : t("searchPlaceholder")
              }
              aria-label={
                activeLibraryView === "chains"
                  ? t("chainSearchPlaceholder")
                  : t("searchPlaceholder")
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {activeLibraryView === "prompts" && (
            <div className="gh-panel-menu-anchor">
              <Tooltip content={t("promptImport") + " / " + t("promptExport")}>
                <button
                  type="button"
                  ref={importExportButtonRef}
                  onClick={() => setImportExportMenuOpen(!importExportMenuOpen)}
                  className="gh-panel-icon-btn"
                  aria-label={t("promptImport") + " / " + t("promptExport")}>
                  <ImportIcon size={16} />
                </button>
              </Tooltip>
              {importExportMenuOpen && (
                <>
                  <div
                    className="gh-panel-menu-backdrop"
                    onClick={() => setImportExportMenuOpen(false)}
                  />
                  <div className="gh-panel-menu">
                    <button
                      type="button"
                      className="gh-panel-menu-item"
                      onClick={() => {
                        setImportExportMenuOpen(false)
                        handleImport()
                      }}>
                      <ImportIcon size={14} />
                      {t("promptImport")}
                    </button>
                    <button
                      type="button"
                      className="gh-panel-menu-item"
                      onClick={() => {
                        setImportExportMenuOpen(false)
                        handleExport()
                      }}>
                      <ExportIcon size={14} />
                      {t("promptExport")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 分类标签栏：左侧可滚动 + 右侧固定 */}
      {activeLibraryView === "prompts" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--gh-bg, white)",
            borderBottom: "1px solid var(--gh-border, #e5e7eb)",
            userSelect: "none",
          }}>
          {/* 左侧可滚动分类列表 */}
          <div
            className="prompt-category-bar"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "6px 0 6px 10px",
              display: "flex",
              gap: "5px",
              flexWrap: "nowrap",
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
            onWheel={(e) => {
              // 将竖向滚轮转为横向滚动（Shadow DOM 内 wheel 事件不自动横滚）
              if (e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY
              }
            }}>
            <span
              onClick={() => setSelectedCategory(VIRTUAL_CATEGORY.ALL)}
              style={{
                padding: "4px 10px",
                background:
                  selectedCategory === VIRTUAL_CATEGORY.ALL
                    ? "var(--gh-primary, #4285f4)"
                    : "var(--gh-hover, #f3f4f6)",
                borderRadius: "12px",
                fontSize: "12px",
                color: selectedCategory === VIRTUAL_CATEGORY.ALL ? "white" : "#4b5563",
                cursor: "pointer",
                flexShrink: 0,
                border:
                  selectedCategory === VIRTUAL_CATEGORY.ALL
                    ? "1px solid var(--gh-primary, #4285f4)"
                    : "1px solid transparent",
              }}>
              {t("allCategory")}
            </span>

            {categories.map((cat) => {
              const colorIndex = getCategoryColorIndex(cat)
              return (
                <Tooltip key={cat} content={cat}>
                  <span
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: "4px 10px",
                      background:
                        selectedCategory === cat
                          ? "var(--gh-primary, #4285f4)"
                          : `var(--gh-category-${colorIndex})`,
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: selectedCategory === cat ? "white" : "#4b5563",
                      cursor: "pointer",
                      flexShrink: 0,
                      border:
                        selectedCategory === cat
                          ? "1px solid var(--gh-primary, #4285f4)"
                          : "1px solid transparent",
                      maxWidth: "80px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                    {cat}
                  </span>
                </Tooltip>
              )
            })}
          </div>

          {/* 右侧固定：最近使用 + 管理（仅图标） */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 8px",
              flexShrink: 0,
              borderLeft: "1px solid var(--gh-border, #e5e7eb)",
            }}>
            {/* ⭐ 最近使用（仅图标） */}
            <Tooltip content={t("promptRecentUsed")}>
              <span
                onClick={() => setSelectedCategory(VIRTUAL_CATEGORY.RECENT)}
                style={{
                  padding: "3px 6px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                  background:
                    selectedCategory === VIRTUAL_CATEGORY.RECENT
                      ? "var(--gh-primary, #4285f4)"
                      : "var(--gh-hover, #f3f4f6)",
                  borderRadius: "10px",
                  color: selectedCategory === VIRTUAL_CATEGORY.RECENT ? "white" : "#4b5563",
                  cursor: "pointer",
                  border:
                    selectedCategory === VIRTUAL_CATEGORY.RECENT
                      ? "1px solid var(--gh-primary, #4285f4)"
                      : "1px solid transparent",
                }}>
                <TimeIcon size={14} />
              </span>
            </Tooltip>
            {categories.length > 0 && (
              <Tooltip content={t("manageCategory")}>
                <button
                  onClick={() => setIsCategoryModalOpen(true)}
                  style={{
                    padding: "3px 6px",
                    background: "transparent",
                    border: "1px dashed var(--gh-border, #d1d5db)",
                    borderRadius: "10px",
                    color: "var(--gh-text-secondary, #9ca3af)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                  <SettingsIcon size={13} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {/* 提示词列表 */}
      <div
        ref={promptListRef}
        style={{ flex: 1, overflowY: "auto", padding: "8px", scrollbarWidth: "none" }}>
        {activeLibraryView === "chains" ? (
          renderChainsView()
        ) : filtered.length === 0 ? (
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
          filtered.map((p) => {
            const isSelected = selectedPromptId === p.id
            const isLocated = locatedPromptId === p.id
            const isHighlighted = isSelected || isLocated

            return (
              <div
                key={p.id}
                data-prompt-id={p.id}
                className={`prompt-item ${isHighlighted ? "selected" : ""} ${isLocated ? "located" : ""} ${draggedId === p.id ? "dragging" : ""}`}
                onClick={() => handlePromptClick(p)}
                onDoubleClick={() => handlePromptDoubleClick(p)}
                draggable
                onDragStart={(e) => handleDragStart(e, p.id, e.currentTarget as HTMLDivElement)}
                onDragOver={(e) => handleDragOver(e, p.id)}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(e, p.id)}
                style={{
                  background: isHighlighted
                    ? "linear-gradient(135deg, #e8f0fe 0%, #f1f8e9 100%)"
                    : "var(--gh-bg, white)",
                  border: isHighlighted
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
                    {p.category || t("uncategorized")}
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
                  style={{ position: "absolute", top: "8px", right: "8px", gap: "2px" }}>
                  {/* ⭐ 置顶按钮 */}
                  <Tooltip content={p.pinned ? t("promptUnpin") : t("promptPin")}>
                    <button
                      onClick={(e) => handleTogglePin(p.id, e)}
                      className={`prompt-action-btn${p.pinned ? " active" : ""}`}>
                      <PinIcon size={16} filled={p.pinned} />
                    </button>
                  </Tooltip>
                  {/* ⭐ 预览按钮 */}
                  <Tooltip content={t("promptMarkdownPreview")}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setPreviewModal({ show: true, prompt: p })
                      }}
                      className="prompt-action-btn">
                      <EyeIcon size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content={t("copy")}>
                    <button onClick={(e) => handleCopy(p.content, e)} className="prompt-action-btn">
                      <CopyIcon size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content={t("more")}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setPromptActionMenu({ prompt: p, anchorEl: e.currentTarget })
                      }}
                      className="prompt-action-btn"
                      aria-label={t("more")}
                      title={t("more")}>
                      <MoreHorizontalIcon size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content={t("edit")}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        openEditModal(p)
                      }}
                      className="prompt-action-btn">
                      <EditIcon size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content={t("delete")}>
                    <button
                      onClick={(e) => handleDelete(p.id, e)}
                      className="prompt-action-btn danger">
                      <DeleteIcon size={16} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 添加按钮 */}
      <div style={{ padding: "12px" }}>
        <button
          onClick={() => {
            if (activeLibraryView === "chains") {
              openChainEditor()
              return
            }
            openEditModal()
          }}
          style={{
            width: "100%",
            padding: "10px",
            background: "var(--gh-header-bg)",
            color: "var(--gh-footer-text, var(--gh-text-on-primary, white))",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            boxShadow: "var(--gh-btn-shadow)",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)"
            e.currentTarget.style.boxShadow = "var(--gh-btn-shadow-hover)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)"
            e.currentTarget.style.boxShadow = "var(--gh-btn-shadow)"
          }}>
          <span>+</span>
          <span>{activeLibraryView === "chains" ? t("chainAdd") : t("addPrompt")}</span>
        </button>
      </div>

      {/* 弹窗 */}
      {renderEditModal()}
      {renderCategoryModal()}
      {renderPreviewModal()}
      {renderImportDialog()}
      {renderChainEditorModal()}

      {/* 公共对话框组件 */}
      {confirmState.show && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          danger
          closeOnOverlayClick={false}
          onConfirm={() => {
            closeConfirmDialog()
            confirmState.onConfirm()
          }}
          onCancel={closeConfirmDialog}
        />
      )}
      {promptInputState.show && (
        <InputDialog
          title={promptInputState.title}
          defaultValue={promptInputState.defaultValue}
          closeOnOverlayClick={false}
          onConfirm={(value) => {
            closePromptInputDialog()
            promptInputState.onConfirm(value)
          }}
          onCancel={closePromptInputDialog}
        />
      )}

      {/* ⭐ 变量输入弹窗 */}
      {variableDialogState.show && (
        <VariableInputDialog
          variables={variableDialogState.variables}
          onConfirm={handleVariableConfirm}
          onCancel={closeVariableDialog}
        />
      )}
      {promptActionMenu && (
        <ContextMenu anchorEl={promptActionMenu.anchorEl} onClose={closePromptActionMenu}>
          <MenuButton
            onClick={() => {
              doEnqueuePrompt(promptActionMenu.prompt)
              closePromptActionMenu()
            }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <AddToQueueIcon size={14} />
              <span>{t("promptAddToQueue")}</span>
            </span>
          </MenuButton>
          <MenuButton
            onClick={() => {
              doEnqueuePrompt(promptActionMenu.prompt, true)
              closePromptActionMenu()
            }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <SplitLinesToQueueIcon size={14} />
              <span>{t("promptSplitLinesToQueue")}</span>
            </span>
          </MenuButton>
          {promptMoveTargets.previous && (
            <MenuButton
              onClick={() => {
                movePromptRelativeToVisibleNeighbor(
                  promptActionMenu.prompt.id,
                  promptMoveTargets.previous.id,
                  "before",
                )
                closePromptActionMenu()
              }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <ArrowUpIcon size={14} />
                <span>{t("promptMoveUp")}</span>
              </span>
            </MenuButton>
          )}
          {promptMoveTargets.next && (
            <MenuButton
              onClick={() => {
                movePromptRelativeToVisibleNeighbor(
                  promptActionMenu.prompt.id,
                  promptMoveTargets.next.id,
                  "after",
                )
                closePromptActionMenu()
              }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <ArrowDownIcon size={14} />
                <span>{t("promptMoveDown")}</span>
              </span>
            </MenuButton>
          )}
        </ContextMenu>
      )}

      {/* 图标选择器弹窗 */}
      {showChainIconPicker &&
        chainEditorState.draft &&
        overlayPortalTarget &&
        createPortal(
          <div
            className="prompt-modal gh-interactive"
            {...OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2147483647,
            }}
            onClick={() => setShowChainIconPicker(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <ChainIconPicker
                value={chainEditorState.draft.iconSvg}
                onChange={(_iconId, svg) => {
                  updateChainDraft({ iconSvg: svg })
                  setShowChainIconPicker(false)
                }}
                onClose={() => setShowChainIconPicker(false)}
              />
            </div>
          </div>,
          overlayPortalTarget,
        )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  )
}
