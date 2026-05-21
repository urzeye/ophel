/**
 * TokenizedInput — 占位符变量芯片输入组件
 *
 * 在 contenteditable 输入区域中将 {status}、{title}、{model} 等占位符
 * 渲染为蓝色芯片样式，用户可直接编辑普通文本，芯片作为不可编辑的原子单元。
 *
 * 设计要点：
 * - 纯 DOM 操作构建节点，不使用 innerHTML，兼容 CSP / Trusted Types
 * - handleInput 中即时 tokenize DOM，用户手打 {model} 立刻变芯片
 * - useLayoutEffect 仅在外部 value 变更时重渲染（如重置），内部编辑不触发
 * - 空内容允许彻底清空
 * - onChange 输出纯文本字符串，与旧版 <input> 存储格式完全兼容
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react"

export interface TokenizedInputProps {
  value: string
  onChange: (value: string) => void
  tokens: string[]
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
}

const TOKEN_CHIP_CLASS = "token-chip"

// ============ 纯 DOM 节点构建（无 innerHTML，CSP 安全） ============

/**
 * 创建 token 芯片 span 元素
 */
function createTokenChip(token: string): HTMLSpanElement {
  const span = document.createElement("span")
  span.className = TOKEN_CHIP_CLASS
  span.setAttribute("contenteditable", "false")
  span.setAttribute("data-token", token)
  span.textContent = token
  return span
}

/**
 * 将原始文本解析为 DOM 节点数组（Text 节点 + token <span> 节点）
 * 不使用 innerHTML，兼容 CSP / Trusted Types 限制
 */
function buildTokenNodes(text: string, tokens: string[]): (Text | HTMLSpanElement)[] {
  if (!text) return []

  // 构建匹配任意 token 的正则
  const escapedTokens = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const pattern = new RegExp(`(${escapedTokens.join("|")})`, "g")

  const nodes: (Text | HTMLSpanElement)[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    // 匹配前的纯文本
    if (match.index > lastIndex) {
      nodes.push(document.createTextNode(text.slice(lastIndex, match.index)))
    }
    // token 芯片
    nodes.push(createTokenChip(match[0]))
    lastIndex = pattern.lastIndex
  }

  // 末尾剩余文本
  if (lastIndex < text.length) {
    nodes.push(document.createTextNode(text.slice(lastIndex)))
  }

  return nodes
}

/**
 * 用 DOM 节点列表替换容器内容
 */
function replaceContainerContent(container: HTMLElement, nodes: (Text | HTMLSpanElement)[]): void {
  // 清空现有子节点
  while (container.firstChild) {
    container.removeChild(container.firstChild)
  }
  // 填入新节点
  for (const node of nodes) {
    container.appendChild(node)
  }
}

// ============ 光标位置保存 / 恢复 ============

function extractRawText(container: HTMLElement): string {
  return container.textContent || ""
}

function saveCaretOffset(container: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return -1

  const range = sel.getRangeAt(0)
  const preRange = range.cloneRange()
  preRange.selectNodeContents(container)
  preRange.setEnd(range.endContainer, range.endOffset)
  return preRange.toString().length
}

function restoreCaretOffset(container: HTMLElement, offset: number): void {
  if (offset < 0) return

  const sel = window.getSelection()
  if (!sel) return

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if ((node.parentElement as HTMLElement | null)?.classList.contains(TOKEN_CHIP_CLASS)) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  let currentOffset = 0
  let textNode: Text | null

  while ((textNode = walker.nextNode() as Text | null)) {
    const len = textNode.textContent?.length || 0
    if (currentOffset + len >= offset) {
      const range = document.createRange()
      range.setStart(textNode, offset - currentOffset)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    currentOffset += len
  }

  sel.removeAllRanges()
  const lastChild = container.lastChild
  if (lastChild) {
    const range = document.createRange()
    range.setStartAfter(lastChild)
    range.collapse(true)
    sel.addRange(range)
  }
}

/**
 * 将容器内文本 token 化并保留光标位置（纯 DOM 操作，无 innerHTML）
 */
function applyTokenization(container: HTMLElement, tokens: string[]): void {
  const rawText = extractRawText(container)
  const caretOffset = saveCaretOffset(container)
  replaceContainerContent(container, buildTokenNodes(rawText, tokens))
  restoreCaretOffset(container, caretOffset)
}

// ============ React 组件 ============

export const TokenizedInput: React.FC<TokenizedInputProps> = ({
  value,
  onChange,
  tokens,
  placeholder,
  className,
  style,
  disabled,
}) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  const composingRef = useRef(false)
  const internalUpdateRef = useRef(false)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  // 仅在外部 value 变更时重渲染（内部编辑已在 handleInput 中即时 tokenize）
  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    if (composingRef.current) return
    if (internalUpdateRef.current) {
      internalUpdateRef.current = false
      return
    }

    const currentRaw = extractRawText(editor)
    if (currentRaw === value) return

    replaceContainerContent(editor, buildTokenNodes(value, tokens))
  }, [value, tokens])

  const handleInput = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    if (composingRef.current) return

    const rawText = extractRawText(editor)
    if (rawText !== valueRef.current) {
      valueRef.current = rawText
      internalUpdateRef.current = true
      onChange(rawText)
    }

    applyTokenization(editor, tokens)
  }, [onChange, tokens])

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false
    const editor = editorRef.current
    if (!editor) return
    const rawText = extractRawText(editor)
    if (rawText !== valueRef.current) {
      valueRef.current = rawText
      internalUpdateRef.current = true
      onChange(rawText)
    }
    applyTokenization(editor, tokens)
  }, [onChange, tokens])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData("text/plain")
    document.execCommand("insertText", false, text)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return

    if (e.key === "Backspace") {
      const range = sel.getRangeAt(0)
      if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
        const prevSibling = range.startContainer.previousSibling
        if (
          prevSibling instanceof HTMLElement &&
          prevSibling.classList.contains(TOKEN_CHIP_CLASS)
        ) {
          e.preventDefault()
          range.setStartBefore(prevSibling)
          range.setEndAfter(prevSibling)
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }
    }

    if (e.key === "Delete") {
      const range = sel.getRangeAt(0)
      if (range.collapsed && range.endContainer.nodeType === Node.TEXT_NODE) {
        const nextSibling = range.endContainer.nextSibling
        if (
          nextSibling instanceof HTMLElement &&
          nextSibling.classList.contains(TOKEN_CHIP_CLASS)
        ) {
          e.preventDefault()
          range.setStartBefore(nextSibling)
          range.setEndAfter(nextSibling)
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }
    }
  }, [])

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        const editor = editorRef.current
        if (!editor) return
        queueMicrotask(() => {
          if (!editorRef.current) return
          const rawText = extractRawText(editorRef.current)
          if (rawText !== valueRef.current) {
            valueRef.current = rawText
            internalUpdateRef.current = true
            onChange(rawText)
          }
          applyTokenization(editorRef.current, tokens)
        })
      }
    },
    [onChange, tokens],
  )

  const mergedClassName = [
    "settings-input",
    "tokenized-input",
    className,
    disabled ? "tokenized-input-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      ref={editorRef}
      contentEditable={!disabled}
      className={mergedClassName}
      style={style}
      onInput={handleInput}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      data-placeholder={placeholder}
      suppressContentEditableWarning
    />
  )
}

export default TokenizedInput
