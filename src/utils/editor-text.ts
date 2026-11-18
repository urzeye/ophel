export const SLATE_PLACEHOLDER_SELECTOR = "[data-slate-placeholder]"

/** Slate 占位节点不是输入内容；适配器校验与提示词队列共用此读取语义。 */
export const getEditorText = (editor: HTMLElement | null): string => {
  if (!editor) return ""
  if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
    return editor.value
  }
  if (!editor.querySelector(SLATE_PLACEHOLDER_SELECTOR)) return editor.textContent ?? ""

  let text = ""
  const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest(SLATE_PLACEHOLDER_SELECTOR)) {
      text += node.nodeValue ?? ""
    }
  }
  return text
}
