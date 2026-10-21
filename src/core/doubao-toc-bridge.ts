/**
 * 豆包原生 TOC 桥（main world 侧）。
 *
 * 豆包长会话右侧索引栏（button[data-index-entry-key]）的条目不渲染文本
 * （hover 才出现 tooltip），但完整 entries 数组挂在按钮所在组件链的 props
 * 上。React 挂在 DOM 节点上的 __reactFiber$* 是主世界 wrapper 的 expando
 * 属性，isolated world 不可见，必须进页面上下文读取。
 *
 * - 扩展端：src/contents/doubao-toc-main.ts 以 world:"MAIN" 安装；
 * - 油猴端：适配器直接把本桥安装到 unsafeWindow。
 * 两侧共享 window.postMessage 请求/响应协议。
 */

export const DOUBAO_TOC_REQUEST_EVENT = "OPHEL_DOUBAO_TOC_REQUEST"
export const DOUBAO_TOC_RESPONSE_EVENT = "OPHEL_DOUBAO_TOC_RESPONSE"
/** 桥就绪标记（落在共享 DOM 上，isolated world 据此判断桥是否可用） */
export const DOUBAO_TOC_BRIDGE_ATTR = "data-ophel-doubao-toc-main"

export interface DoubaoTocBridgeWindow extends Window {
  __ophelDoubaoTocBridgeInstalled?: boolean
}

/** 桥返回的单条提问条目（已清洗：去掉回答条目与空文本） */
export interface DoubaoTocBridgeEntry {
  key: string
  messageId: string
  text: string
}

interface TocRequestPayload {
  type?: unknown
  requestId?: unknown
}

/** 沿 React fiber 向上找 entries props 所需的最小结构 */
interface DoubaoReactFiber {
  memoizedProps?: unknown
  return?: DoubaoReactFiber | null
}

const asRawEntry = (
  value: unknown,
): { key: string; messageId: string; queryText: string } | null => {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.key !== "string" || typeof record.queryText !== "string") return null
  return {
    key: record.key,
    messageId: typeof record.messageId === "string" ? record.messageId : "",
    queryText: record.queryText,
  }
}

const extractEntries = (pageWindow: DoubaoTocBridgeWindow): DoubaoTocBridgeEntry[] => {
  const button = pageWindow.document?.querySelector("button[data-index-entry-key]")
  if (!button) return []

  const fiberKey = Object.keys(button).find((key) => key.startsWith("__reactFiber$"))
  let fiber = (
    fiberKey ? (button as unknown as Record<string, unknown>)[fiberKey] : null
  ) as DoubaoReactFiber | null

  while (fiber) {
    const props = fiber.memoizedProps
    if (props && typeof props === "object") {
      const entries = (props as Record<string, unknown>).entries
      if (Array.isArray(entries) && entries.some((item) => asRawEntry(item))) {
        const result: DoubaoTocBridgeEntry[] = []
        for (const item of entries) {
          const raw = asRawEntry(item)
          if (!raw || raw.key.startsWith("answer:")) continue
          const text = raw.queryText.trim()
          if (!text || !raw.messageId) continue
          result.push({ key: raw.key, messageId: raw.messageId, text })
        }
        return result
      }
    }
    fiber = fiber.return ?? null
  }
  return []
}

export function installDoubaoTocBridge(pageWindow: DoubaoTocBridgeWindow): void {
  if (pageWindow.__ophelDoubaoTocBridgeInstalled) return
  pageWindow.__ophelDoubaoTocBridgeInstalled = true

  const markBridgeReady = () => {
    try {
      pageWindow.document?.documentElement?.setAttribute(DOUBAO_TOC_BRIDGE_ATTR, "1")
    } catch {
      // document 尚未就绪时忽略，DOMContentLoaded 再试
    }
  }
  markBridgeReady()
  if (!pageWindow.document?.documentElement && typeof pageWindow.addEventListener === "function") {
    pageWindow.addEventListener("DOMContentLoaded", markBridgeReady, { once: true })
  }

  pageWindow.addEventListener("message", (event) => {
    if (event.source !== pageWindow) return

    const data = event.data as TocRequestPayload
    if (data?.type !== DOUBAO_TOC_REQUEST_EVENT) return

    const requestId = typeof data.requestId === "string" ? data.requestId : ""
    if (!requestId) return

    pageWindow.postMessage(
      { type: DOUBAO_TOC_RESPONSE_EVENT, requestId, entries: extractEntries(pageWindow) },
      "*",
    )
  })
}
