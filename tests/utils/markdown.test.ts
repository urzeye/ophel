import { describe, expect, it } from "vitest"

import { renderMarkdown } from "~utils/markdown"

const renderReleaseNotes = (content: string) =>
  renderMarkdown(content, false, { linkGithubReferences: true })

describe("renderMarkdown linkify CJK tail trimming", () => {
  it("does not swallow CJK text after a bare domain", () => {
    const html = renderReleaseNotes(
      "Gemini Spark（gemini.google.com/spark）的任务对话现在可以同步进对话管理。(#902)",
    )

    expect(html).toContain('<a href="http://gemini.google.com/spark">gemini.google.com/spark</a>')
    expect(html).toContain("）的任务对话现在可以同步进对话管理。")
    // GitHub 引用仍渲染为独立的 issue 链接，不被前面的自动链接吞掉
    expect(html).toContain("gh-release-notes-reference-issue")
    expect(html).toContain(">#902</a>")
  })

  it("trims CJK and full-width punctuation after a scheme URL", () => {
    const html = renderMarkdown("详见 https://example.com/doc）后续内容", false)

    expect(html).toContain('<a href="https://example.com/doc">https://example.com/doc</a>')
    expect(html).toContain("）后续内容")
  })

  it("keeps regular auto links intact", () => {
    const html = renderMarkdown("see https://example.com/a?b=1&c=2 for details", false)

    expect(html).toContain(
      '<a href="https://example.com/a?b=1&amp;c=2">https://example.com/a?b=1&amp;c=2</a>',
    )
  })

  it("keeps email linkification intact", () => {
    const html = renderMarkdown("contact test@example.com please", false)

    expect(html).toContain('<a href="mailto:test@example.com">test@example.com</a>')
  })

  it("leaves explicit markdown links untouched", () => {
    const html = renderMarkdown(
      "[文档](https://example.com/) 与 [页面](https://example.com/页面)",
      false,
    )

    expect(html).toContain('<a href="https://example.com/">文档</a>')
    expect(html).toContain("页面</a>")
  })
})
