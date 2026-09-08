import { describe, expect, it } from "vitest"
import { cleanOutlineTitle } from "~utils/outline-text"

describe("cleanOutlineTitle", () => {
  it("cleans blockquote markers from user query", () => {
    expect(
      cleanOutlineTitle("> **Role Context**: Acting as a Principal Distributed Systems Architect"),
    ).toBe("Role Context: Acting as a Principal Distributed Systems Architect")

    expect(
      cleanOutlineTitle("> **Production Constraint**: Multi-region active-active deployment"),
    ).toBe("Production Constraint: Multi-region active-active deployment")

    expect(cleanOutlineTitle(">> Nested quote")).toBe("Nested quote")
    expect(cleanOutlineTitle("> > Nested quote with space")).toBe("Nested quote with space")
  })

  it("cleans heading markers from user query", () => {
    expect(cleanOutlineTitle("### Deep Dive Request: Storage & Vector Search")).toBe(
      "Deep Dive Request: Storage & Vector Search",
    )
    expect(cleanOutlineTitle("# Level 1 heading")).toBe("Level 1 heading")
    expect(cleanOutlineTitle("###### Level 6 heading")).toBe("Level 6 heading")
    expect(cleanOutlineTitle("## Closed heading ##")).toBe("Closed heading")
  })

  it("cleans inline formatting: bold, italic, code, strikethrough", () => {
    expect(cleanOutlineTitle("This is **bold** and *italic*")).toBe("This is bold and italic")
    expect(cleanOutlineTitle("This is __bold__ and _italic_")).toBe("This is bold and italic")
    expect(cleanOutlineTitle("Use `const x = 1` for variables")).toBe(
      "Use const x = 1 for variables",
    )
    expect(cleanOutlineTitle("This is ~~deleted~~ text")).toBe("This is deleted text")
  })

  it("cleans list item markers", () => {
    expect(cleanOutlineTitle("- **First item**: detail")).toBe("First item: detail")
    expect(cleanOutlineTitle("* Second item")).toBe("Second item")
    expect(cleanOutlineTitle("+ Third item")).toBe("Third item")
    expect(cleanOutlineTitle("1. Numbered item")).toBe("Numbered item")
    expect(cleanOutlineTitle("1) Parenthesized numbered item")).toBe("Parenthesized numbered item")
    expect(cleanOutlineTitle("- [ ] Task item")).toBe("Task item")
    expect(cleanOutlineTitle("- [x] Completed task")).toBe("Completed task")
  })

  it("converts links and images to plain text", () => {
    expect(cleanOutlineTitle("[OpenAI](https://openai.com) announcement")).toBe(
      "OpenAI announcement",
    )
    expect(cleanOutlineTitle("![Graph Description](https://example.com/img.png)")).toBe(
      "Graph Description",
    )
  })

  it("normalizes multiline text and extra whitespace", () => {
    const multiline = "> Multi-line\n> query with\n> extra spaces"
    expect(cleanOutlineTitle(multiline)).toBe("Multi-line query with extra spaces")
  })

  it("handles backslash escaped characters", () => {
    expect(cleanOutlineTitle("\\# Not a heading and \\*not italic\\*")).toBe(
      "# Not a heading and *not italic*",
    )
  })

  it("falls back safely when input is empty or only special characters", () => {
    expect(cleanOutlineTitle("")).toBe("")
    expect(cleanOutlineTitle("   ")).toBe("")
    // If input consists purely of markers that would be stripped to empty, fallback to trimmed input
    expect(cleanOutlineTitle("###")).toBe("###")
    expect(cleanOutlineTitle(">")).toBe(">")
  })

  it("removes quick quote marker residue (U+2063 invisible separator)", () => {
    // 渲染形态：标记锚点标签只剩不可见分隔符
    expect(cleanOutlineTitle("请分析这段代码 \u2063")).toBe("请分析这段代码")
    // 原始 Markdown 形态：链接文本为 U+2063，整条标记应被移除
    expect(
      cleanOutlineTitle('请分析 [\u2063](#ophel-quick-quote "ophel-quick-quote:abc123")'),
    ).toBe("请分析")
  })
})

describe("export-outline integration with cleanOutlineTitle", () => {
  it("formats user query and assistant headings cleanly", async () => {
    const { createOutlineTextFromOutlineTree } = await import("~utils/export-outline")
    const result = createOutlineTextFromOutlineTree(
      [
        {
          level: 0,
          text: "> **Role Context**: Principal Architect",
          isUserQuery: true,
        },
        {
          level: 2,
          text: "Current Baseline",
          isUserQuery: false,
        },
        {
          level: 0,
          text: "### Deep Dive Request: Storage & Vector Search",
          isUserQuery: true,
        },
      ],
      { includeUserQueries: true },
    )

    expect(result.text).toBe(
      "# Q1. Role Context: Principal Architect\n\n## Current Baseline\n\n# Q2. Deep Dive Request: Storage & Vector Search",
    )
    expect(result.count).toBe(3)
  })
})
