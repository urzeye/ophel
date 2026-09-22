import { describe, expect, it } from "vitest"

import type { OutlineNode } from "~core/outline-manager"
import { buildVisibilityMaps } from "~utils/outline-visibility"

// minLevel = 3 的文档：H3 的 relativeLevel 为 1，relativeLevel 与绝对 level 不一致。
// 层级滑块语义为绝对 level，可见性过滤必须按 node.level 判断。
const makeNode = (
  index: number,
  level: number,
  overrides: Partial<OutlineNode> = {},
): OutlineNode => ({
  index,
  level,
  relativeLevel: level === 0 ? 0 : level - 3 + 1,
  text: `node-${index}`,
  element: null,
  isUserQuery: level === 0,
  children: [],
  collapsed: false,
  ...overrides,
})

const buildVisible = (tree: OutlineNode[], displayLevel: number) =>
  buildVisibilityMaps(tree, displayLevel, 0, "", false, false).visibleMap

describe("buildVisibilityMaps absolute level filtering", () => {
  it("shows headings whose absolute level is within displayLevel", () => {
    const h4 = makeNode(2, 4)
    const h3 = makeNode(1, 3, { children: [h4], collapsed: true })
    const query = makeNode(0, 0, { children: [h3] })

    const visibleMap = buildVisible([query], 3)

    expect(visibleMap[0]).toBe(true)
    expect(visibleMap[1]).toBe(true)
    expect(visibleMap[2]).toBe(false)
  })

  it("hides deeper siblings even when a shallower sibling keeps the parent expanded", () => {
    // 倒置标题顺序：H5 先出现，与 H3 同为提问节点的直接子级。
    // 父级因 H3（level 3 <= 3）未折叠，H5 的 relativeLevel 为 3，
    // 按旧的 relativeLevel 判定会被错误显示，绝对 level 判定必须隐藏
    const h5 = makeNode(1, 5)
    const h3 = makeNode(2, 3)
    const query = makeNode(0, 0, { children: [h5, h3] })

    const visibleMap = buildVisible([query], 3)

    expect(visibleMap[1]).toBe(false)
    expect(visibleMap[2]).toBe(true)
  })

  it("reveals nodes beyond displayLevel when an ancestor is force-expanded (locate)", () => {
    const h5 = makeNode(1, 5)
    const query = makeNode(0, 0, { children: [h5], forceExpanded: true })

    const visibleMap = buildVisible([query], 3)

    expect(visibleMap[1]).toBe(true)
  })

  it("keeps user query roots visible at displayLevel 0", () => {
    const h3 = makeNode(1, 3)
    const query = makeNode(0, 0, { children: [h3], collapsed: true })

    const visibleMap = buildVisible([query], 0)

    expect(visibleMap[0]).toBe(true)
    expect(visibleMap[1]).toBe(false)
  })
})
