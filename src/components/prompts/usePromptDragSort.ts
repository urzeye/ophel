import { useRef, useState } from "react"
import type { DragEvent as ReactDragEvent } from "react"

import type { PromptChain } from "~core/prompt-action-types"
import type { PromptManager } from "~core/prompt-manager"

interface UsePromptDragSortParams {
  manager: PromptManager
  loadData: () => void
  chains: PromptChain[]
  updateChainOrder: (orderedIds: string[]) => void
  onOrderUpdated: () => void
}

export const usePromptDragSort = ({
  manager,
  loadData,
  chains,
  updateChainOrder,
  onOrderUpdated,
}: UsePromptDragSortParams) => {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)
  const dropIndicatorRootRef = useRef<ParentNode | null>(null)
  const [draggedChainId, setDraggedChainId] = useState<string | null>(null)
  const chainDragNodeRef = useRef<HTMLDivElement | null>(null)
  const chainDropIndicatorRootRef = useRef<ParentNode | null>(null)

  const clearPromptDropIndicators = () => {
    const roots = [
      dropIndicatorRootRef.current,
      dragNodeRef.current?.getRootNode() as ParentNode | undefined,
      document,
    ]
    const seenRoots = new Set<ParentNode>()

    roots.forEach((root) => {
      if (!root || seenRoots.has(root)) return
      seenRoots.add(root)
      root.querySelectorAll(".drop-above, .drop-below").forEach((el) => {
        el.classList.remove("drop-above", "drop-below")
      })
    })

    dropIndicatorRootRef.current = null
  }

  const handleDragStart = (e: ReactDragEvent, id: string, node: HTMLDivElement) => {
    const target = e.target as HTMLElement
    if (
      target.closest('button, input, textarea, select, [role="button"], [data-no-row-drag="true"]')
    ) {
      e.preventDefault()
      return
    }

    setDraggedId(id)
    dragNodeRef.current = node
    dropIndicatorRootRef.current = node.getRootNode() as ParentNode
    e.dataTransfer.effectAllowed = "move"
    // 必须调用 setData，部分站点在拖拽冒泡（bubbling）阶段会检测 dataTransfer 为空并取消拖拽
    e.dataTransfer.setData("text/plain", id)
    node.classList.add("dragging")
  }

  const handleDragOver = (e: ReactDragEvent, targetId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"

    if (!draggedId || draggedId === targetId) return

    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const targetRoot = target.getRootNode() as ParentNode

    dropIndicatorRootRef.current = targetRoot
    clearPromptDropIndicators()

    if (e.clientY < midpoint) {
      target.classList.add("drop-above")
    } else {
      target.classList.add("drop-below")
    }
    dropIndicatorRootRef.current = targetRoot
  }

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.classList.remove("dragging")
    }
    clearPromptDropIndicators()
    setDraggedId(null)
    dragNodeRef.current = null
  }

  const handleDrop = async (e: ReactDragEvent, targetId: string) => {
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
    onOrderUpdated()
    loadData()
    handleDragEnd()
  }

  const clearChainDropIndicators = () => {
    const roots = [
      chainDropIndicatorRootRef.current,
      chainDragNodeRef.current?.getRootNode() as ParentNode | undefined,
      document,
    ]
    const seenRoots = new Set<ParentNode>()

    roots.forEach((root) => {
      if (!root || seenRoots.has(root)) return
      seenRoots.add(root)
      root.querySelectorAll(".drop-above, .drop-below").forEach((el) => {
        el.classList.remove("drop-above", "drop-below")
      })
    })

    chainDropIndicatorRootRef.current = null
  }

  const handleChainDragStart = (e: ReactDragEvent, id: string, node: HTMLDivElement) => {
    const target = e.target as HTMLElement
    if (
      target.closest('button, input, textarea, select, [role="button"], [data-no-row-drag="true"]')
    ) {
      e.preventDefault()
      return
    }

    setDraggedChainId(id)
    chainDragNodeRef.current = node
    chainDropIndicatorRootRef.current = node.getRootNode() as ParentNode
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", id)
    node.classList.add("dragging")
  }

  const handleChainDragOver = (e: ReactDragEvent, targetId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"

    if (!draggedChainId || draggedChainId === targetId) return

    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const targetRoot = target.getRootNode() as ParentNode

    chainDropIndicatorRootRef.current = targetRoot
    clearChainDropIndicators()

    if (e.clientY < midpoint) {
      target.classList.add("drop-above")
    } else {
      target.classList.add("drop-below")
    }
    chainDropIndicatorRootRef.current = targetRoot
  }

  const handleChainDragEnd = () => {
    if (chainDragNodeRef.current) {
      chainDragNodeRef.current.classList.remove("dragging")
    }
    clearChainDropIndicators()
    setDraggedChainId(null)
    chainDragNodeRef.current = null
  }

  const handleChainDrop = (e: ReactDragEvent, targetId: string) => {
    e.preventDefault()

    if (!draggedChainId || draggedChainId === targetId) {
      handleChainDragEnd()
      return
    }

    const draggedIndex = chains.findIndex((chain) => chain.id === draggedChainId)
    const targetIndex = chains.findIndex((chain) => chain.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) {
      handleChainDragEnd()
      return
    }

    const newOrder = [...chains]
    const [removed] = newOrder.splice(draggedIndex, 1)

    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const insertBefore = e.clientY < rect.top + rect.height / 2

    let insertIndex = chains.findIndex((chain) => chain.id === targetId)
    if (draggedIndex < insertIndex) {
      insertIndex--
    }
    if (!insertBefore) {
      insertIndex++
    }

    newOrder.splice(insertIndex, 0, removed)
    updateChainOrder(newOrder.map((chain) => chain.id))
    onOrderUpdated()
    handleChainDragEnd()
  }

  return {
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
  }
}
