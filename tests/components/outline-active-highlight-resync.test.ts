import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")

const compact = (source: string): string => source.replace(/\s+/g, " ")

const outlineTabSource = compact(readSource("../../src/components/OutlineTab.tsx"))

describe("outline active highlight resync after tree rebuild", () => {
  it("keeps the highlight on the current active node when it still belongs to the tree", () => {
    expect(outlineTabSource).toContain(
      "const nodeIsCurrent = activeNode !== null && isCurrentVisibilityNode(activeNode)",
    )
    expect(outlineTabSource).toContain(
      "if (nodeIsCurrent && activeNode) { updateVisibleHighlightIndex(getVisibleHeadingHighlightIndex(activeNode)) return }",
    )
  })

  it("recomputes the highlight from the live page instead of reusing the stale index after a rebuild", () => {
    // 树重建会替换全部节点对象并重排 index（如 AI 回复标题并入），
    // 但根节点数不变时滚动同步不会重跑；此时必须用间谍按页面位置重算
    expect(outlineTabSource).toContain(
      "const hasPositionless = manager.hasPositionlessOutlineNodes()",
    )
    expect(outlineTabSource).toContain(
      'if ( followMode === "current" && (activeIndexRef.current !== null || hasPositionless) && (!nodeIsCurrent || hasPositionless) ) { const container = manager.getScrollContainer() const freshActive = container ? manager.findMountedActiveNode(container) : null',
    )
    expect(outlineTabSource).toContain("updateActiveIndex(freshActive?.index ?? null, freshActive)")

    // 陈旧 index 回退只允许出现在间谍重算之后（非跟随模式）
    const effectStart = outlineTabSource.indexOf("const activeNode = activeNodeRef.current")
    const effectEnd = outlineTabSource.indexOf("}, [ parentMap, visibleMap, tree.length,")
    expect(effectStart).toBeGreaterThan(-1)
    expect(effectEnd).toBeGreaterThan(effectStart)
    const effectBody = outlineTabSource.slice(effectStart, effectEnd)
    const spyBranch = effectBody.indexOf("manager.findMountedActiveNode(container)")
    const staleFallback = effectBody.indexOf(
      "updateVisibleHighlightIndex(getVisibleHighlightIndex(activeIndexRef.current))",
    )
    expect(spyBranch).toBeGreaterThan(-1)
    expect(staleFallback).toBeGreaterThan(spyBranch)
  })

  it("only auto-scrolls the panel when the recomputed highlight actually changes", () => {
    expect(outlineTabSource).toContain(
      "const visibleChanged = freshVisible !== visibleHighlightRef.current",
    )
    expect(outlineTabSource).toContain(
      'if (visibleChanged && freshVisible !== null && !userScrollingOutlineRef.current) { scrollOutlineNodeIntoView(freshVisible, "center") }',
    )
  })
})
