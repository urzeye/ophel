/**
 * ChatGPT 代码编辑器批量挂载（主世界补丁）
 *
 * ChatGPT 的代码块由 CodeMirror 6 渲染。打开或切换长会话时，同一轮任务里会
 * 创建几十到上百个编辑器实例；每个实例在插入文档的瞬间都会触发一次整页样式
 * 重算，叠加后表现为主线程长时间冻结。
 *
 * 补丁思路：利用 CodeMirror 的构造时序——编辑器根节点先被 appendChild 进文档，
 * 之后才补上类名与内部状态。在根节点尚未标记 .cm-editor 时识别出来并暂扣为游离
 * 节点（游离子树不参与文档样式失效），同一轮任务内的所有编辑器合并到下一个宏任务
 * 一次性挂回，把 N 次整页样式重算摊销为 1 次。
 *
 * 安全约束：
 * - 只有精确匹配结构指纹的节点才会被拦截，其余一律走原生 appendChild；
 *   即使 ChatGPT 改版导致指纹失配，行为也退化为不打补丁的原生挂载。
 * - 挂回前校验父节点仍在文档中、子节点未被其他地方接管，避免复活已卸载的编辑器。
 * - 已检测到其他同类拦截脚本时直接让位，避免双重劫持。
 * - 关闭开关时立即把暂扣的编辑器全部挂回，不留游离节点。
 *
 * 本文件同时被扩展端 MAIN world content script（chatgpt-cm-mount-main.ts）与
 * 油猴端（chatgpt-cm-mount-inject.ts）复用，逻辑保持一致。
 */

/** Content Script 与主世界补丁之间的开关消息类型 */
export const CHATGPT_CM_BATCH_MOUNT_TOGGLE_MESSAGE = "OPHEL_CHATGPT_CM_BATCH_MOUNT_TOGGLE"

const INIT_FLAG = "__ophelChatGptCmBatchMount"
/** 已知的同类 userscript 拦截补丁标志，存在时让位避免双重劫持 */
const EXTERNAL_PATCH_FLAG = "__CHATGPT_CM_PERF_FIX__"
/** 累计多少个"未经拦截直接进入文档的编辑器根"后判定指纹疑似过期并提示 */
const LEAK_WARN_THRESHOLD = 5

interface PendingMount {
  parent: Node
  child: Element
}

export interface ChatGptCmBatchMountWindow extends Window {
  __ophelChatGptCmBatchMount?: {
    state: () => Record<string, number | boolean>
  }
  __CHATGPT_CM_PERF_FIX__?: unknown
  Node: typeof Node
  Element: typeof Element
  MutationObserver: typeof MutationObserver
}

export function installChatGptCmBatchMount(pageWindow: ChatGptCmBatchMountWindow): void {
  if (pageWindow[INIT_FLAG]) return
  if (pageWindow[EXTERNAL_PATCH_FLAG]) return

  const pageDocument = pageWindow.document
  if (!pageDocument || pageDocument.defaultView !== pageWindow) return

  const nodeProto = pageWindow.Node?.prototype
  const descriptor = nodeProto
    ? Object.getOwnPropertyDescriptor(nodeProto, "appendChild")
    : undefined
  const nativeAppendChild = descriptor?.value
  if (!nodeProto || !descriptor || typeof nativeAppendChild !== "function") return

  // 开关状态：默认启用（与默认设置一致），由 Content Script 经 postMessage 校准
  let enabled = true
  let flushing = false
  let flushTimer: number | null = null
  const queue: PendingMount[] = []
  const queuedChildren = new WeakSet<Element>()
  const handledChildren = new WeakSet<Element>()

  const stats = {
    intercepted: 0,
    mounted: 0,
    skipped: 0,
    batches: 0,
    leaked: 0,
    stale: false,
  }

  pageWindow[INIT_FLAG] = {
    state: () => ({ ...stats, enabled, queued: queue.length }),
  }

  /**
   * 仅匹配 CodeMirror 构造时序中"根节点已挂入、类名尚未设置"的瞬间：
   * 根节点恰有两个元素子节点（.cm-announced + .cm-scroller）且自身不带 .cm-editor。
   */
  const isUninitializedEditorRoot = (parent: Node, child: Node): boolean => {
    if (!enabled || flushing) return false
    if (!(parent instanceof pageWindow.Element)) return false
    if (!(child instanceof pageWindow.Element)) return false
    if (!parent.isConnected || child.isConnected) return false
    if (child.ownerDocument !== pageDocument) return false
    if (child.classList.contains("cm-editor")) return false
    if (child.childElementCount !== 2) return false

    const announced = child.firstElementChild
    const scroller = announced?.nextElementSibling
    return Boolean(
      announced?.classList.contains("cm-announced") &&
        scroller?.classList.contains("cm-scroller") &&
        !scroller.nextElementSibling,
    )
  }

  const flushQueue = () => {
    if (flushTimer !== null) {
      pageWindow.clearTimeout(flushTimer)
      flushTimer = null
    }
    if (queue.length === 0) return

    const batch = queue.splice(0, queue.length)
    flushing = true
    try {
      for (const { parent, child } of batch) {
        // 父节点已卸载或子节点已被别处接管时不再挂回，避免复活失效实例
        if (!parent.isConnected || child.isConnected || child.parentNode) {
          stats.skipped += 1
          continue
        }
        // 单个节点挂回失败（如父节点结构中途变化）不影响同批其他节点
        try {
          nativeAppendChild.call(parent, child)
          stats.mounted += 1
        } catch {
          stats.skipped += 1
        }
      }
    } finally {
      flushing = false
    }
    stats.batches += 1
  }

  const scheduleFlush = () => {
    if (flushTimer !== null) return
    flushTimer = pageWindow.setTimeout(flushQueue, 0)
  }

  const patchedAppendChild = function (this: Node, child: Node): Node {
    if (isUninitializedEditorRoot(this, child)) {
      const el = child as Element
      if (!queuedChildren.has(el)) {
        queuedChildren.add(el)
        handledChildren.add(el)
        queue.push({ parent: this, child: el })
        stats.intercepted += 1
      }
      scheduleFlush()
      return child
    }
    return nativeAppendChild.call(this, child)
  }

  try {
    Object.defineProperty(nodeProto, "appendChild", {
      ...descriptor,
      value: patchedAppendChild,
    })
  } catch {
    // 描述符不可写时放弃补丁，页面行为与未安装一致
    delete pageWindow[INIT_FLAG]
    return
  }

  // 指纹过期探测：观察到足够多的编辑器根未经拦截直接进入文档时提示一次。
  // 不打补丁的功能（拦截失配天然透传），仅用于排查 ChatGPT 前端改版。
  const startLeakWatch = () => {
    const looksLikeEditorRoot = (el: Element): boolean => {
      if (el.classList.contains("cm-editor")) return true
      const announced = el.firstElementChild
      const scroller = announced?.nextElementSibling
      return (
        el.childElementCount === 2 &&
        Boolean(announced?.classList.contains("cm-announced")) &&
        Boolean(scroller?.classList.contains("cm-scroller"))
      )
    }

    const movedNodes = new WeakSet<Element>()
    new pageWindow.MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === 1 && looksLikeEditorRoot(node as Element)) {
            movedNodes.add(node as Element)
          }
        })
      }
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return
          const el = node as Element
          if (!looksLikeEditorRoot(el)) return
          if (movedNodes.has(el) || handledChildren.has(el)) return
          if (!enabled || stats.stale) return
          stats.leaked += 1
          if (stats.leaked >= LEAK_WARN_THRESHOLD) {
            stats.stale = true
            console.warn(
              "[Ophel] ChatGPT code block batch mount: editor structure no longer matches, patch is pass-through now.",
            )
          }
        })
      }
    }).observe(pageDocument.body, { childList: true, subtree: true })
  }

  if (pageDocument.body) {
    startLeakWatch()
  } else {
    const bootObserver = new pageWindow.MutationObserver(() => {
      if (pageDocument.body) {
        bootObserver.disconnect()
        startLeakWatch()
      }
    })
    bootObserver.observe(pageDocument.documentElement, { childList: true, subtree: true })
  }

  pageWindow.addEventListener("message", (event) => {
    const data = event.data
    if (!data || typeof data !== "object") return
    if (data.type !== CHATGPT_CM_BATCH_MOUNT_TOGGLE_MESSAGE) return
    const next = Boolean(data.enabled)
    if (next === enabled) return
    enabled = next
    if (!enabled) flushQueue()
  })
}
