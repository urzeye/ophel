/**
 * TokenizedInput — 占位符变量芯片输入组件
 *
 * 在 contenteditable 输入区域中将 {status}、{title}、{model} 等占位符
 * 渲染为蓝色芯片样式，用户可直接编辑普通文本，芯片作为不可编辑的原子单元。
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
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

  for (const token of tokens) {
    // 转义 token 中的正则特殊字符
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    html = html.replace(
      new RegExp(escaped, "g"),
      `<span class="${TOKEN_CHIP_CLASS}" contenteditable="false" data-token="${escaped}">${token}</span>`,
    )
  }

  // 空值时保留一个零宽空格以保证 contenteditable 可聚焦
  if (!html.trim()) {
    html = "&#8203;"
  }

  return html
}

/**
 * 保存光标在容器内的字符偏移位置
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

  // 使用 TreeWalker 遍历所有文本节点
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // 跳过芯片内部的文本节点
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

  // 跟踪外部 value 变化
  useEffect(() => {
    valueRef.current = value
  }, [value])

  // 渲染 token 芯片（仅在外部 value 变化或初始化时触发）
  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    // 如果用户正在编辑中（compositionstart → compositionend 之间），跳过重渲染
    if (composingRef.current) return

    const currentText = editor.textContent || ""
    // 如果当前显示内容与目标一致，跳过（避免不必要的重渲染丢失光标）
    if (currentText === value) return

    const caretOffset = saveCaretOffset(editor)
    editor.innerHTML = tokenizeHTML(value, tokens)
    restoreCaretOffset(editor, caretOffset)
  }, [value, tokens])

  const handleInput = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    // IME 组合输入中不触发 onChange
    if (composingRef.current) return

    const rawText = editor.textContent || ""
    if (rawText !== valueRef.current) {
      valueRef.current = rawText
      onChange(rawText)
    }
  }, [onChange])

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false
    // composition 结束后手动触发一次
    const editor = editorRef.current
    if (!editor) return
    const rawText = editor.textContent || ""
    if (rawText !== valueRef.current) {
      valueRef.current = rawText
      onChange(rawText)
    }
  }, [onChange])

  // 阻止粘贴富文本
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData("text/plain")
    document.execCommand("insertText", false, text)
  }, [])

  // 处理退格键：当光标在芯片后面时，选中芯片以便一键删除
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
          // 光标紧跟在芯片后面 → 选中芯片使其一次性删除
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
          // 光标紧接在芯片前面 → 选中芯片使其一次性删除
          e.preventDefault()
          range.setStartBefore(nextSibling)
          range.setEndAfter(nextSibling)
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }
    }
  }, [])

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
      data-placeholder={placeholder}
      suppressContentEditableWarning
    />
  )
}

export default TokenizedInput
