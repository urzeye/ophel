/**
 * TokenizedInput — 占位符变量芯片输入组件
 *
 * 在 contenteditable 输入区域中将 {status}、{title}、{model} 等占位符
 * 渲染为蓝色芯片样式，用户可直接编辑普通文本，芯片作为不可编辑的原子单元。
 *
 * 设计要点：
 * - handleInput 中即时 tokenize DOM，用户手打 {model} 立刻变芯片
 * - useLayoutEffect 仅在外部 value 变更时重渲染（如重置），内部编辑不触发
 * - 空内容不使用 ZWS，允许彻底清空
 * - onChange 输出纯文本字符串，与旧版 <input> 存储格式完全兼容
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react"

export interface TokenizedInputProps {
  /** 原始格式字符串（含 {status} 等占位符） */
  value: string
  /** 值变更回调，返回原始格式字符串 */
  onChange: (value: string) => void
  /** 占位符 token 列表 */
  tokens: string[]
  /** placeholder 文本 */
  placeholder?: string
  /** 额外的 className */
  className?: string
  /** 额外的 style */
  style?: React.CSSProperties
  /** 是否禁用 */
  disabled?: boolean
}

const TOKEN_CHIP_CLASS = "token-chip"

/**
 * 将文本中的 token 占位符转为 HTML 芯片
 */
function tokenizeHTML(text: string, tokens: string[]): string {
  if (!text) return ""

  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    html = html.replace(
      new RegExp(escaped, "g"),
      `<span class="${TOKEN_CHIP_CLASS}" contenteditable="false" data-token="${token}">${token}</span>`,
    )
  }

  return html
}

/**
 * 从容器的 textContent 提取原始格式字符串
 * （token 芯片的文本内容就是占位符原文，所以直接取 textContent 即可）
 */
function extractRawText(container: HTMLElement): string {
  return container.textContent || ""
}

/**
 * 保存光标在容器内的字符偏移位置（仅计算可编辑文本节点）
 */
function saveCaretOffset(container: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return -1

  const range = sel.getRangeAt(0)
  const preRange = range.cloneRange()
  preRange.selectNodeContents(container)
  preRange.setEnd(range.endContainer, range.endOffset)
  return preRange.toString().length
}

/**
 * 恢复光标到容器内指定字符偏移位置
 */
function restoreCaretOffset(container: HTMLElement, offset: number): void {
  if (offset < 0) return

  const sel = window.getSelection()
  if (!sel) return

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement
      if (parent?.classList.contains(TOKEN_CHIP_CLASS)) {
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

  // 回退：放到末尾
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
 * 将容器内文本 token 化并保留光标位置
 */
function applyTokenization(container: HTMLElement, tokens: string[]): void {
  const rawText = extractRawText(container)
  const caretOffset = saveCaretOffset(container)
  container.innerHTML = tokenizeHTML(rawText, tokens)
  restoreCaretOffset(container, caretOffset)
}

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
  // 标记是否为内部编辑触发，用于跳过 useLayoutEffect 的重渲染
  const internalUpdateRef = useRef(false)

  // 同步外部 value 引用
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

    editor.innerHTML = tokenizeHTML(value, tokens)
  }, [value, tokens])

  // 内部编辑：提取原始文本 → 通知外部 → 即时 tokenize DOM
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

    // 即时 tokenize，让用户手打 {model} 也能立刻看到芯片
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

  // 阻止粘贴富文本
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData("text/plain")
    document.execCommand("insertText", false, text)
  }, [])

  // 退格/删除键：光标紧邻芯片时，选中芯片使其一键整体删除
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // 先让浏览器处理默认行为，在 keyup 后再 tokenize
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

  // keyup 后补一次 tokenize（处理 Backspace/Delete 删除芯片后的 DOM 状态）
  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        const editor = editorRef.current
        if (!editor) return
        // 延迟到下一个微任务，确保浏览器已完成 DOM 修改
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
