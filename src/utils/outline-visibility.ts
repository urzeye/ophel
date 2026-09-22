import type { OutlineNode } from "~core/outline-manager"

// 计算大纲节点的可见性/父级映射。层级滑块语义为绝对 level（H1-H6），
// 与 outline-manager 的折叠判定（child.level > displayLevel）保持一致；
// relativeLevel 仅用于缩进样式与根节点识别，不参与层级过滤
export const buildVisibilityMaps = (
  tree: OutlineNode[],
  displayLevel: number,
  minRelativeLevel: number,
  searchQuery: string,
  searchLevelManual: boolean,
  bookmarkMode: boolean,
) => {
  const parentMap: Record<number, number | null> = {}
  const parentNodeMap = new WeakMap<OutlineNode, OutlineNode | null>()
  const visibleNodeSet = new WeakSet<OutlineNode>()
  const visibleMap: Record<number, boolean> = {}
  const bookmarkMemo = new Map<number, boolean>()

  const hasBookmarkInSubtree = (node: OutlineNode): boolean => {
    const cached = bookmarkMemo.get(node.index)
    if (cached !== undefined) return cached
    let has = !!node.isBookmarked
    if (!has && node.children && node.children.length > 0) {
      for (const child of node.children) {
        if (hasBookmarkInSubtree(child)) {
          has = true
          break
        }
      }
    }
    bookmarkMemo.set(node.index, has)
    return has
  }

  const hasBookmarkInDescendants = (node: OutlineNode): boolean => {
    if (!node.children || node.children.length === 0) return false
    return node.children.some(hasBookmarkInSubtree)
  }

  const traverse = (
    node: OutlineNode,
    parentIndex: number | null,
    parentNode: OutlineNode | null,
    parentCollapsed: boolean,
    parentForceExpanded: boolean,
    ancestorHasBookmark: boolean,
  ) => {
    parentMap[node.index] = parentIndex
    parentNodeMap.set(node, parentNode)

    const nodeHasBookmark = hasBookmarkInSubtree(node)
    const isBookmarkRelevant = nodeHasBookmark || ancestorHasBookmark

    let shouldShow: boolean
    if (bookmarkMode) {
      if (isBookmarkRelevant) {
        const isSearchMatch = !searchQuery || node.isMatch || node.hasMatchedDescendant
        shouldShow = !parentCollapsed && isSearchMatch
      } else {
        shouldShow = false
      }
    } else {
      const isRootNode = node.relativeLevel === minRelativeLevel
      const isLevelAllowed = node.level <= displayLevel || parentForceExpanded

      if (isRootNode) {
        if (searchQuery) {
          shouldShow = node.isMatch || node.hasMatchedDescendant
        } else {
          shouldShow = true
        }
      } else {
        const isRelevant =
          !searchQuery || node.isMatch || node.hasMatchedDescendant || parentForceExpanded

        if (searchQuery && !searchLevelManual) {
          shouldShow = isRelevant && !parentCollapsed
        } else if (searchQuery && searchLevelManual) {
          shouldShow = isRelevant && isLevelAllowed && !parentCollapsed
        } else {
          shouldShow = isLevelAllowed && !parentCollapsed
        }
      }

      if (parentCollapsed) {
        shouldShow = false
      }
    }

    if (node.forceVisible) {
      shouldShow = true
    }

    visibleMap[node.index] = shouldShow
    if (shouldShow) {
      visibleNodeSet.add(node)
    }

    const childParentCollapsed = node.collapsed || parentCollapsed
    const childParentForceExpanded = node.forceExpanded || parentForceExpanded
    const childAncestorHasBookmark =
      ancestorHasBookmark || (node.isBookmarked && !hasBookmarkInDescendants(node))

    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => {
        traverse(
          child,
          node.index,
          node,
          childParentCollapsed,
          childParentForceExpanded,
          childAncestorHasBookmark,
        )
      })
    }
  }

  tree.forEach((root) => traverse(root, null, null, false, false, false))

  return { parentMap, parentNodeMap, visibleMap, visibleNodeSet }
}
