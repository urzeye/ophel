import { describe, expect, it } from "vitest"

import {
  consolidateThoughtBlocks,
  formatToMarkdown,
  type ExportMessage,
  type ExportMetadata,
} from "~utils/exporter"
import { setLanguage } from "~utils/i18n"

setLanguage("zh-CN")

const metadata: ExportMetadata = {
  title: "normalize test",
  url: "https://example.com",
  exportTime: "2026-01-01 00:00:00",
  source: "Example",
  showIndex: true,
  customDivider: "",
}

const user = (content: string): ExportMessage => ({ role: "user", content })
const assistant = (content: string): ExportMessage => ({ role: "assistant", content })

describe("consolidateThoughtBlocks fenced code", () => {
  it("leaves thought-like quotes inside fenced code blocks untouched", () => {
    const content = [
      "示例：",
      "",
      "```markdown",
      "> [Thoughts]",
      "> 第一段思考",
      "",
      "> [Thoughts]",
      "> 第二段思考",
      "```",
    ].join("\n")

    expect(consolidateThoughtBlocks(content)).toBe(content)
  })

  it("does not rewrite localized thought markers inside fenced code blocks", () => {
    const content = ["```markdown", "> [思维链]", "> 内容", "```"].join("\n")

    expect(consolidateThoughtBlocks(content)).toBe(content)
  })

  it("still consolidates fragmented thought blocks outside code fences", () => {
    const content = "> [Thoughts]\n> first\n\n> [Thoughts]\n> second"

    expect(consolidateThoughtBlocks(content)).toBe("> [Thoughts]\n> first\n>\n> second")
  })
})

describe("export turn numbering", () => {
  it("numbers turns starting from the first user message", () => {
    const md = formatToMarkdown(metadata, [
      user("提问一"),
      assistant("回答一"),
      user("提问二"),
      assistant("回答二"),
    ])

    expect(md).toContain("## 1. 🙋")
    expect(md).toContain("## 1. 🤖")
    expect(md).toContain("## 2. 🙋")
    expect(md).toContain("## 2. 🤖")
  })

  it("leaves a leading assistant greeting unnumbered instead of duplicating 1", () => {
    const md = formatToMarkdown(metadata, [assistant("开场问候"), user("提问"), assistant("回答")])

    expect(md).toContain("## 🤖 Example\n\n开场问候")
    expect(md).toContain("## 1. 🙋")
    expect(md).toContain("## 1. 🤖 Example\n\n回答")
    expect(md.match(/## 1\./g)).toHaveLength(2)
  })

  it("keeps header separators fixed while applying the custom divider between messages", () => {
    const md = formatToMarkdown({ ...metadata, customDivider: "***" }, [
      user("提问"),
      assistant("回答"),
    ])

    // 标题与元信息头前后的分隔线固定为 ---
    expect(md).toContain("# normalize test\n\n---\n\n##")
    expect(md).toMatch(/- \*\*.*\*\*: https:\/\/example\.com\n\n---\n\n/)
    // 消息之间使用自定义分割线
    expect(md).toContain("提问\n\n***\n\n")
    expect(md).toContain("回答\n\n***")
  })

  it("omits message dividers but keeps header separators when the custom divider is empty", () => {
    const md = formatToMarkdown(metadata, [user("提问"), assistant("回答")])

    expect(md).toContain("# normalize test\n\n---\n\n##")
    expect(md).toContain("提问\n\n##")
  })
})
