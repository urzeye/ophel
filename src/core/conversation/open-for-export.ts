/**
 * 导出非当前对话前的"先打开"支撑：到达判定，以及整页刷新后的续做标记。
 *
 * navigateToConversation 的返回值只表示"已发起"，不能证明页面已换成目标对话：
 * 会话 ID 切换后，旧对话的消息可能还留在 DOM 里，所以必须等页面内容真正变化。
 */

import type { SiteAdapter } from "~adapters/base"
import { PENDING_EXPORT_OPEN_STORAGE_KEY } from "~constants/storage-keys"
import { DOMToolkit } from "~utils/dom-toolkit"

const READY_POLL_INTERVAL_MS = 250
/** 内容签名连续不变的轮数，用来跳过渲染过程中的中间态 */
const READY_STABLE_ROUNDS = 2
/** 等待目标对话渲染的上限；超时由调用方显式报错，不继续用可能错位的页面导出 */
const OPEN_CONVERSATION_TIMEOUT_MS = 15_000
/** 刷新续做标记的有效期：覆盖整页刷新与站点首屏加载，过期说明用户已经离开 */
const PENDING_EXPORT_OPEN_TTL_MS = 30_000

interface PendingExportOpen {
  conversationId: string
  expiresAt: number
}

/**
 * 当前页面消息的粗粒度签名（提问数、回复数、首尾提问文本），用来判断内容是否已换成目标对话。
 * 不含回复文本：目标对话正在生成时回复文本一直在变，会让稳定判定永远通不过。
 * 返回 null 表示站点没有导出配置（如未声明 export 的站点包），无法按 DOM 判断；
 * 返回空串表示页面上还没有消息。
 */
export function readConversationSignature(adapter: SiteAdapter): string | null {
  const config = adapter.getExportConfig()
  if (!config) return null

  const queryAll = (selector: string): Element[] =>
    (DOMToolkit.query(selector, { all: true, shadow: config.useShadowDOM }) as Element[] | null) ??
    []
  const users = queryAll(config.userQuerySelector)
  const assistants = queryAll(config.assistantResponseSelector)
  if (users.length + assistants.length === 0) return ""

  const readText = (element: Element | undefined): string =>
    (element?.textContent ?? "").trim().slice(0, 80)
  return [
    users.length,
    assistants.length,
    readText(users[0]),
    readText(users[users.length - 1]),
  ].join("|")
}

/**
 * 等待页面换成目标对话：会话 ID 已切到目标，且消息内容与导航前不同并保持稳定。
 * previousSignature 是导航前页面的签名；整页刷新后没有"导航前"，传空串即可。
 */
export async function waitForConversationReady(
  adapter: SiteAdapter,
  conversationId: string,
  previousSignature: string | null,
  timeoutMs = OPEN_CONVERSATION_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  let stableSignature: string | null | undefined
  let stableRounds = 0

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS))

    // 会话 ID 还没切到目标：此前的稳定态属于旧页面，不能累计
    const signature =
      adapter.getSessionId() === conversationId ? readConversationSignature(adapter) : ""
    const isStale = signature !== null && (signature === "" || signature === previousSignature)
    if (isStale) {
      stableSignature = undefined
      stableRounds = 0
      continue
    }

    stableRounds = signature === stableSignature ? stableRounds + 1 : 1
    stableSignature = signature
    if (stableRounds >= READY_STABLE_ROUNDS) return true
  }

  return false
}

/**
 * 发起导航前写入续做标记：导航若退化为整页刷新，当前脚本会随页面销毁，
 * 刷新后由 consumePendingExportOpen 接回。只存目标会话 ID，导出格式和选项
 * 仍由刷新后的导出流程（选项弹窗或默认格式）重新决定。
 */
export function markPendingExportOpen(conversationId: string): void {
  const pending: PendingExportOpen = {
    conversationId,
    expiresAt: Date.now() + PENDING_EXPORT_OPEN_TTL_MS,
  }
  try {
    sessionStorage.setItem(PENDING_EXPORT_OPEN_STORAGE_KEY, JSON.stringify(pending))
  } catch {
    // sessionStorage 不可用时只是失去刷新后的自动续做，用户手动重新导出即可
  }
}

export function clearPendingExportOpen(): void {
  try {
    sessionStorage.removeItem(PENDING_EXPORT_OPEN_STORAGE_KEY)
  } catch {
    // 同 markPendingExportOpen
  }
}

/** 读取并清除续做标记；不存在、已过期或内容损坏都返回 null。 */
export function consumePendingExportOpen(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_EXPORT_OPEN_STORAGE_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PENDING_EXPORT_OPEN_STORAGE_KEY)

    const pending = JSON.parse(raw) as Partial<PendingExportOpen>
    if (typeof pending.conversationId !== "string" || typeof pending.expiresAt !== "number") {
      return null
    }
    return pending.expiresAt > Date.now() ? pending.conversationId : null
  } catch {
    // 存储不可用或标记损坏：按没有续做处理
    return null
  }
}
