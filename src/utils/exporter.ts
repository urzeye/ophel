/**
 * 会话导出工具
 * 支持导出为 Markdown、JSON、TXT 格式
 */

import type { SiteAdapter } from "~adapters/base"
import { t } from "~utils/i18n"

interface ExportOptions {
  format: "markdown" | "json" | "txt"
  includeMetadata?: boolean
  filename?: string
}

interface ConversationMessage {
  role: "user" | "assistant"
  content: string
  timestamp?: number
}

export class Exporter {
  private adapter: SiteAdapter

  constructor(adapter: SiteAdapter) {
    this.adapter = adapter
  }

  /**
   * 导出当前会话
   */
  async exportCurrent(options: ExportOptions): Promise<string> {
    const messages = this.extractMessages()
    const title = this.adapter.getConversationTitle() || "Untitled"

    switch (options.format) {
      case "markdown":
        return this.toMarkdown(title, messages, options.includeMetadata)
      case "json":
        return this.toJSON(title, messages, options.includeMetadata)
      case "txt":
        return this.toTXT(title, messages)
      default:
        return this.toMarkdown(title, messages, options.includeMetadata)
    }
  }

  /**
   * 下载导出内容
   */
  download(content: string, filename: string, format: string) {
    const mimeTypes: Record<string, string> = {
      markdown: "text/markdown",
      json: "application/json",
      txt: "text/plain",
    }

    const blob = new Blob([content], { type: mimeTypes[format] || "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * 复制到剪贴板
   */
  async copyToClipboard(content: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(content)
      return true
    } catch (e) {
      console.error("Failed to copy:", e)
      return false
    }
  }

  private extractMessages(): ConversationMessage[] {
    const messages: ConversationMessage[] = []

    // 使用 adapter 的方法获取消息 (如果存在)
    if ((this.adapter as any).extractConversationMessages) {
      return (this.adapter as any).extractConversationMessages()
    }

    // 默认提取逻辑
    const userQueries = document.querySelectorAll("[data-query-text]")
    const aiResponses = document.querySelectorAll(".response-content, .model-response")

    userQueries.forEach((el, i) => {
      messages.push({
        role: "user",
        content: (el as HTMLElement).textContent || "",
      })
      if (aiResponses[i]) {
        messages.push({
          role: "assistant",
          content: (aiResponses[i] as HTMLElement).textContent || "",
        })
      }
    })

    return messages
  }

  private toMarkdown(
    title: string,
    messages: ConversationMessage[],
    includeMetadata?: boolean,
  ): string {
    let md = `# ${title}\n\n`

    if (includeMetadata) {
      md += `> **导出时间**: ${new Date().toLocaleString()}\n`
      md += `> **来源**: ${this.adapter.getName()}\n`
      md += `> **链接**: ${window.location.href}\n\n`
      md += `---\n\n`
    }

    messages.forEach((msg) => {
      const roleLabel = msg.role === "user" ? "**User**" : "**Assistant**"
      md += `${roleLabel}:\n\n${msg.content}\n\n---\n\n`
    })

    return md
  }

  private toJSON(
    title: string,
    messages: ConversationMessage[],
    includeMetadata?: boolean,
  ): string {
    const data: any = {
      title,
      messages,
    }

    if (includeMetadata) {
      data.metadata = {
        exportTime: new Date().toISOString(),
        source: this.adapter.getName(),
        url: window.location.href,
      }
    }

    return JSON.stringify(data, null, 2)
  }

  private toTXT(title: string, messages: ConversationMessage[]): string {
    let txt = `${title}\n${"=".repeat(title.length)}\n\n`

    messages.forEach((msg) => {
      const roleLabel = msg.role === "user" ? "[User]" : "[Assistant]"
      txt += `${roleLabel}\n${msg.content}\n\n`
    })

    return txt
  }
}
