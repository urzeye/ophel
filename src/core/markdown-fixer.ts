import { DOMToolkit } from "~utils/dom-toolkit"

/**
 * Markdown 加粗渲染修复器
 * 修复 Gemini 普通版响应中 **text** 未正确渲染为加粗的问题
 * 使用 DOM API 操作 TextNode
 */
export class MarkdownFixer {
  private processedNodes = new WeakSet<HTMLElement>()
  private stopObserver: (() => void) | null = null
  private enabled = false

  constructor() {}

  /**
   * 启动修复器
   * 1. 修复所有已存在的段落（历史消息）
   * 2. 监听新增的段落（新消息/流式输出）
   */
  start() {
    if (this.enabled) return
    this.enabled = true

    // 修复所有已存在的段落
    const paragraphs = DOMToolkit.query("message-content p", {
      all: true
    }) as Element[]
    paragraphs.forEach((p) => this.fixParagraph(p as HTMLElement))

    // 监听新增的段落
    this.stopObserver = DOMToolkit.each("message-content p", (p, isNew) => {
      if (isNew) this.fixParagraph(p as HTMLElement)
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
   * 修复单个段落
   * @param {HTMLElement} p 段落元素
   */
  fixParagraph(p: HTMLElement) {
    if (this.processedNodes.has(p)) return
    this.processedNodes.add(p)

    // 先尝试跨节点修复（处理 ** 跨越 <b> 标签的情况）
    this.fixCrossNodeBold(p)

    // 再处理单节点内的加粗（未被跨节点处理的部分）
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null)
    const nodesToProcess: Node[] = []

    while (walker.nextNode()) {
      const textNode = walker.currentNode
      if (this.shouldSkip(textNode)) continue
      if (textNode.textContent && textNode.textContent.includes("**")) {
        nodesToProcess.push(textNode)
      }
    }

    nodesToProcess.forEach((node) => this.processTextNode(node))
  }

  /**
   * 修复跨节点加粗
   * 策略1：将 <b>text</b> 展开为 **text**
   * 策略2：处理 **<span>text</span>** 这种跨元素的加粗标记
   * @param {HTMLElement} p 段落元素
   */
  fixCrossNodeBold(p: HTMLElement) {
    // 策略1: 查找段落中所有的 <b> 标签，展开为 **text**
    const boldTags = Array.from(p.querySelectorAll("b"))
    boldTags.forEach((bTag) => {
      // 跳过 code/pre 内的 <b> 标签
      if (this.isInsideProtectedArea(bTag)) return

      try {
        // 创建文档片段: ** + 原内容 + **
        const fragment = document.createDocumentFragment()
        fragment.appendChild(document.createTextNode("**"))

        // 将 <b> 的所有子节点移到片段中
        while (bTag.firstChild) {
          fragment.appendChild(bTag.firstChild)
        }

        fragment.appendChild(document.createTextNode("**"))

        // 用片段替换 <b> 标签
        if (bTag.parentNode) {
          bTag.parentNode.replaceChild(fragment, bTag)
        }
      } catch (e) {
        console.warn("[MarkdownFixer] Failed to unwrap <b> tag:", e)
      }
    })

    // 规范化段落，合并相邻的文本节点
    p.normalize()

    // 策略2: 处理 **<span>text</span>** 这种跨元素的加粗标记
    this.fixCrossElementBold(p)
  }

  /**
   * 处理跨元素的加粗标记
   * 通用策略：扫描所有 ** 标记位置，按顺序配对并包裹
   * @param {HTMLElement} p 段落元素
   */
  fixCrossElementBold(p: HTMLElement) {
    let modified = true
    let iterations = 0
    const maxIterations = 50

    while (modified && iterations < maxIterations) {
      modified = false
      iterations++

      // 收集所有 ** 标记的位置
      const markers = this.collectBoldMarkers(p)
      if (markers.length < 2) break

      // 按顺序配对处理
      for (let i = 0; i < markers.length - 1; i += 2) {
        const start = markers[i]
        const end = markers[i + 1]

        if (!start || !end) break

        // 检查是否可以包裹
        if (this.canWrapMarkers(start, end, p)) {
          if (this.wrapBoldMarkers(start, end, p)) {
            modified = true
            break
          }
        }
      }
    }
  }

  /**
   * 收集段落中所有 ** 标记的位置
   * @returns {Array<{node: Text, offset: number}>}
   */
  collectBoldMarkers(p: HTMLElement) {
    const markers: Array<{ node: Text; offset: number }> = []
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null)

    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      if (this.shouldSkip(node)) continue

      const text = node.textContent || ""
      let pos = 0

      while ((pos = text.indexOf("**", pos)) !== -1) {
        markers.push({ node, offset: pos })
        pos += 2
      }
    }

    return markers
  }

  /**
   * 检查两个标记之间是否可以包裹
   */
  canWrapMarkers(
    start: { node: Text; offset: number },
    end: { node: Text; offset: number },
    container: HTMLElement
  ) {
    // 同一节点内的情况交给 processTextNode 处理
    if (start.node === end.node) {
      return false
    }

    // 检查两个标记之间是否只有内联元素
    try {
      const range = document.createRange()
      range.setStart(start.node, start.offset + 2)
      range.setEnd(end.node, end.offset)

      const fragment = range.cloneContents()
      const inlineTags = [
        "span",
        "a",
        "em",
        "i",
        "strong",
        "b",
        "code",
        "mark",
        "cite"
      ]

      // 检查片段中是否只有内联元素
      const walker = document.createTreeWalker(
        fragment,
        NodeFilter.SHOW_ELEMENT,
        null
      )
      while (walker.nextNode()) {
        const current = walker.currentNode as HTMLElement
        const tag = current.tagName?.toLowerCase()
        if (!inlineTags.includes(tag)) {
          return false
        }
      }

      return true
    } catch (e) {
      return false
    }
  }

  /**
   * 包裹两个 ** 标记之间的内容
   */
  wrapBoldMarkers(
    start: { node: Text; offset: number },
    end: { node: Text; offset: number },
    container: HTMLElement
  ) {
    try {
      const startNode = start.node
      const endNode = end.node
      const startOffset = start.offset
      const endOffset = end.offset

      // 分割开始节点：[前面的文本][**][后面的文本]
      const startText = startNode.textContent || ""
      const beforeStart = startText.slice(0, startOffset)
      const afterStart = startText.slice(startOffset + 2)

      // 分割结束节点：[前面的文本][**][后面的文本]
      const endText = endNode.textContent || ""
      const beforeEnd = endText.slice(0, endOffset)
      const afterEnd = endText.slice(endOffset + 2)

      // 创建 Range 选中要加粗的内容
      const range = document.createRange()

      // 更新开始节点内容并设置 range 起点
      if (afterStart) {
        // 开始节点在 ** 后面还有内容
        startNode.textContent = beforeStart
        const afterStartNode = document.createTextNode(afterStart)
        if (startNode.parentNode) {
          startNode.parentNode.insertBefore(
            afterStartNode,
            startNode.nextSibling
          )
        }
        range.setStartBefore(afterStartNode)
      } else {
        // ** 在开始节点末尾
        startNode.textContent = beforeStart
        range.setStartAfter(startNode)
      }

      // 更新结束节点内容并设置 range 终点
      if (beforeEnd) {
        // 结束节点在 ** 前面还有内容
        endNode.textContent = afterEnd
        const beforeEndNode = document.createTextNode(beforeEnd)
        if (endNode.parentNode) {
          endNode.parentNode.insertBefore(beforeEndNode, endNode)
        }
        range.setEndAfter(beforeEndNode)
      } else {
        // ** 在结束节点开头
        endNode.textContent = afterEnd
        range.setEndBefore(endNode)
      }

      // 提取内容
      const contents = range.extractContents()

      // 展开提取内容中的 <b> 标签（只保留其内容）
      this.unwrapBoldTags(contents)

      // 创建 <strong> 元素
      const strong = document.createElement("strong")
      strong.dataset.originalMarkdown = "**"
      strong.appendChild(contents)

      // 插入 <strong>
      range.insertNode(strong)

      // 清理空节点
      if (startNode.textContent === "" && startNode.parentNode) {
        startNode.parentNode.removeChild(startNode)
      }
      if (endNode.textContent === "" && endNode.parentNode) {
        endNode.parentNode.removeChild(endNode)
      }

      // 规范化
      container.normalize()

      return true
    } catch (e) {
      console.warn("[MarkdownFixer] Failed to wrap bold markers:", e)
      return false
    }
  }

  /**
   * 处理单个文本节点内的加粗
   */
  processTextNode(textNode: Node) {
    if (this.shouldSkip(textNode)) return

    const text = textNode.textContent || ""
    const parts = text.split(/(\*\*.*?\*\*)/g) // 简单分割

    if (parts.length <= 1) return

    const fragment = document.createDocumentFragment()

    parts.forEach((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        const strong = document.createElement("strong")
        strong.textContent = part.slice(2, -2)
        strong.dataset.originalMarkdown = "**"
        fragment.appendChild(strong)
      } else if (part) {
        fragment.appendChild(document.createTextNode(part))
      }
    })

    if (textNode.parentNode) {
      textNode.parentNode.replaceChild(fragment, textNode)
    }
  }

  shouldSkip(node: Node) {
    if (!node.parentElement) return true
    const parent = node.parentElement
    // 跳过已经加粗的，或者在代码块中的
    if (
      parent.tagName === "STRONG" ||
      parent.tagName === "B" ||
      parent.closest("code") ||
      parent.closest("pre")
    ) {
      return true
    }
    return false
  }

  isInsideProtectedArea(node: HTMLElement) {
    return node.closest("code") || node.closest("pre")
  }

  unwrapBoldTags(fragment: DocumentFragment) {
    const bTags = Array.from(fragment.querySelectorAll("b"))
    bTags.forEach((b) => {
      while (b.firstChild) {
        b.parentNode?.insertBefore(b.firstChild, b)
      }
      b.parentNode?.removeChild(b)
    })
  }
}
