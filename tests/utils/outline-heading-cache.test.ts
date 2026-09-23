import { describe, expect, it } from "vitest"

import {
  hashOutlineText,
  markdownPlainLength,
  parseMarkdownHeadings,
  stripMarkdownInline,
} from "~utils/outline-heading-cache"

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

describe("stripMarkdownInline", () => {
  it("strips emphasis marks", () => {
    expect(stripMarkdownInline("**粗体** 和 __粗体__")).toBe("粗体 和 粗体")
    expect(stripMarkdownInline("*斜体* 和 _斜体_")).toBe("斜体 和 斜体")
    expect(stripMarkdownInline("~~删除线~~")).toBe("删除线")
  })

  it("strips links and keeps link text", () => {
    expect(stripMarkdownInline("见 [文档](https://example.com)")).toBe("见 文档")
    expect(stripMarkdownInline("见 [文档][ref]")).toBe("见 文档")
  })

  it("strips images and keeps alt text", () => {
    expect(stripMarkdownInline("图 ![示意图](https://example.com/a.png) 完")).toBe("图 示意图 完")
  })

  it("strips inline code backticks", () => {
    expect(stripMarkdownInline("调用 `foo()` 即可")).toBe("调用 foo() 即可")
  })

  it("strips DeepSeek reference marks", () => {
    expect(stripMarkdownInline("结论[reference:0]如下[reference:12]")).toBe("结论如下")
  })

  it("strips HTML tags", () => {
    expect(stripMarkdownInline("a<br>b <sup>1</sup>")).toBe("ab 1")
  })

  it("handles combined formatting and collapses whitespace", () => {
    expect(stripMarkdownInline("**重要**  [结论](https://a.b)[reference:2]\n见 `代码`")).toBe(
      "重要 结论 见 代码",
    )
  })
})

describe("markdownPlainLength", () => {
  it("excludes fenced code block markers but counts code content", () => {
    const markdown = ["前文", "```js", "ab", "```", "后文"].join("\n")
    expect(markdownPlainLength(markdown)).toBe("前文 ab 后文".length)
  })

  it("does not count link URLs", () => {
    expect(markdownPlainLength("[文档](https://example.com/long-url)")).toBe(2)
  })

  it("counts heading marker lines as-is (estimate)", () => {
    expect(markdownPlainLength("## 标题\n正文")).toBe("## 标题 正文".length)
  })
})
