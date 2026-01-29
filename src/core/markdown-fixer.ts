/**
 * Markdown 加粗渲染修复器 (使用 Trusted Types + innerHTML)
 *
 * 使用 innerHTML 批量替换实现，比 markdown-fixer.ts 更简洁
 * 需要在 world: "MAIN" 环境下运行以支持 Trusted Types 策略
 */

import { DOMToolkit } from "~utils/dom-toolkit"
import { setSafeHTML } from "~utils/trusted-types"

// 预编译正则
const REGEX_CODE_BLOCK = /<code\b[^>]*>[\s\S]*?<\/code>/gi
const REGEX_BOLD_TAG = /<b\b[^>]*>([\s\S]*?)<\/b>/gi
const REGEX_MD_BOLD = /\*\*([\s\S]+?)\*\*/g
const REGEX_PLACEHOLDER = /###OPHEL_CODE_(\d+)###/g

/**
 * MarkdownFixer 配置
 */
export interface MarkdownFixerConfig {
  /** 查找段落的选择器，如 "message-content p" 或 "ms-cmark-node span" */
  selector: string
  /** 是否修复 <span> 内部的内容（AI Studio 需要） */
  fixSpanContent?: boolean
}

export class MarkdownFixer {
  private processedNodes = new WeakSet<HTMLElement>()
  private stopObserver: (() => void) | null = null
  private enabled = false
  private config: MarkdownFixerConfig

  constructor(config: MarkdownFixerConfig) {
    this.config = config
  }

  /**
   * 启动修复器
   */
  start() {
    if (this.enabled) return
    this.enabled = true

    // 修复所有已存在的段落
    this.fixAllParagraphs()

    // 监听新增的段落
    this.stopObserver = DOMToolkit.each(this.config.selector, (p, isNew) => {
      if (isNew) {
        // 延迟处理，避免和流式输出冲突
        setTimeout(() => this.fixParagraph(p as HTMLElement), 100)
      }
    })
  }

  /**
   * 停止修复器
   */
  stop() {
    if (!this.enabled) return
    this.enabled = false
    if (this.stopObserver) {
      this.stopObserver()
      this.stopObserver = null
    }
  }

  /**
   * 修复所有段落
   */
  private fixAllParagraphs() {
    const paragraphs = DOMToolkit.query(this.config.selector, {
      all: true,
    }) as Element[]
    paragraphs.forEach((p) => this.fixParagraph(p as HTMLElement))
  }

  /**
   * 修复单个段落
   */
  fixParagraph(p: HTMLElement) {
    if (this.processedNodes.has(p)) return

    const currentHtml = p.innerHTML

    // 使用长度作为 hash 检查是否已处理
    if (p.dataset.mdFixerHash === String(currentHtml.length)) {
      return
    }

    // 快速检查：如果既没有 <b> 也没有 **，跳过
    if (!currentHtml.includes("<b") && !currentHtml.includes("**")) {
      p.dataset.mdFixerHash = String(currentHtml.length)
      this.processedNodes.add(p)
      return
    }

    // === 核心处理逻辑 ===

    // 步骤 1: 保护 code 块
    const codeBlocks: string[] = []
    let protectedHtml = currentHtml.replace(REGEX_CODE_BLOCK, (match) => {
      codeBlocks.push(match)
      return `###OPHEL_CODE_${codeBlocks.length - 1}###`
    })

    // 步骤 2: 将 <b> 统一转为 **（标准化）
    let processedHtml = protectedHtml.replace(REGEX_BOLD_TAG, "**$1**")

    // 步骤 3: 将 ** 转为 <strong>
    let hasChanges = false
    processedHtml = processedHtml.replace(REGEX_MD_BOLD, (_match, content) => {
      hasChanges = true
      return `<strong data-original-markdown="**">${content}</strong>`
    })

    // 只有真正发生了替换才更新 DOM
    if (hasChanges) {
      // 步骤 4: 恢复 code 块
      const finalHtml = processedHtml.replace(REGEX_PLACEHOLDER, (_match, index) => {
        return codeBlocks[parseInt(index, 10)]
      })

      // 更新 DOM
      if (currentHtml !== finalHtml) {
        setSafeHTML(p, finalHtml)
      }
    }

    // 更新 hash 标记
    p.dataset.mdFixerHash = String(p.innerHTML.length)
    this.processedNodes.add(p)
  }
}
