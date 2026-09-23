import { describe, expect, it } from "vitest"

import { hashOutlineText, parseMarkdownHeadings } from "~utils/outline-heading-cache"

describe("parseMarkdownHeadings", () => {
  it("parses ATX headings with levels", () => {
    const markdown = ["# 一级", "正文", "### 三级标题", "###### 六级"].join("\n")
    expect(parseMarkdownHeadings(markdown)).toEqual([
      { level: 1, text: "一级" },
      { level: 3, text: "三级标题" },
      { level: 6, text: "六级" },
    ])
  })

  it("strips optional closing hash sequences", () => {
    expect(parseMarkdownHeadings("## 标题 ##")).toEqual([{ level: 2, text: "标题" }])
  })

  it("requires a space after # and skips empty headings", () => {
    expect(parseMarkdownHeadings("#没有空格")).toEqual([])
    expect(parseMarkdownHeadings("# ")).toEqual([])
  })

  it("ignores # lines inside fenced code blocks", () => {
    const markdown = [
      "```",
      "# 代码里的注释",
      "```",
      "## 真正的标题",
      "~~~",
      "# 另一个代码块",
      "~~~",
      "### 结尾",
    ].join("\n")
    expect(parseMarkdownHeadings(markdown)).toEqual([
      { level: 2, text: "真正的标题" },
      { level: 3, text: "结尾" },
    ])
  })

  it("respects maxLevel", () => {
    const markdown = ["# 一", "### 三", "##### 五"].join("\n")
    expect(parseMarkdownHeadings(markdown, 3)).toEqual([
      { level: 1, text: "一" },
      { level: 3, text: "三" },
    ])
  })

  it("returns empty array for empty input", () => {
    expect(parseMarkdownHeadings("")).toEqual([])
  })
})

describe("hashOutlineText", () => {
  it("is deterministic and differs across inputs", () => {
    expect(hashOutlineText("标题")).toBe(hashOutlineText("标题"))
    expect(hashOutlineText("标题A")).not.toBe(hashOutlineText("标题B"))
  })
})
