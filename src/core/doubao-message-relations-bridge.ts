import { EVENT_DOUBAO_MESSAGE_RELATIONS } from "~utils/messaging"

declare const unsafeWindow: Window | undefined

const DOUBAO_CHAIN_PATH = "/im/chain/single"
const DOUBAO_RELATIONS_DATASET_KEY = "ophelDoubaoMessageRelations"
const DOUBAO_RELATIONS_MAX_ITEMS = 2000
const DOUBAO_BRIDGE_STATE_KEY = "__ophelDoubaoMessageRelationsBridge"

type DoubaoMessageRelationSnapshot = {
  conversationId: string
  relations: Array<[assistantMessageId: string, userMessageId: string]>
}

type DoubaoChainMessage = {
  conversation_id?: unknown
  message_id?: unknown
  user_type?: unknown
  bot_reply_message_id?: unknown
}

type DoubaoBridgeState = {
  conversationId: string
  relations: Map<string, string>
}

type DoubaoPageWindow = typeof globalThis & {
  [DOUBAO_BRIDGE_STATE_KEY]?: DoubaoBridgeState
}

function getPageWindow(): DoubaoPageWindow {
  if (typeof unsafeWindow !== "undefined" && unsafeWindow !== window) {
    return unsafeWindow as unknown as DoubaoPageWindow
  }
  return window as DoubaoPageWindow
}

function isDoubaoChainUrl(input: unknown): boolean {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input && typeof input === "object" && "url" in input
          ? String((input as { url?: unknown }).url || "")
          : ""

  if (!rawUrl) return false

  try {
    return new URL(rawUrl, window.location.origin).pathname === DOUBAO_CHAIN_PATH
  } catch {
    return rawUrl.includes(DOUBAO_CHAIN_PATH)
  }
}

function getChainMessages(payload: unknown): DoubaoChainMessage[] {
  if (!payload || typeof payload !== "object") return []

  const downlinkBody = (payload as { downlink_body?: unknown }).downlink_body
  if (!downlinkBody || typeof downlinkBody !== "object") return []

  const chainBody = (downlinkBody as { pull_singe_chain_downlink_body?: unknown })
    .pull_singe_chain_downlink_body
  if (!chainBody || typeof chainBody !== "object") return []

  const messages = (chainBody as { messages?: unknown }).messages
  return Array.isArray(messages) ? (messages as DoubaoChainMessage[]) : []
}

function publishSnapshot(pageWindow: DoubaoPageWindow, state: DoubaoBridgeState): void {
  const root = pageWindow.document.documentElement
  if (!root || !state.conversationId || state.relations.size === 0) return

  const snapshot: DoubaoMessageRelationSnapshot = {
    conversationId: state.conversationId,
    relations: Array.from(state.relations.entries()),
  }
  const serialized = JSON.stringify(snapshot)
  root.dataset[DOUBAO_RELATIONS_DATASET_KEY] = serialized
  pageWindow.postMessage(
    {
      type: EVENT_DOUBAO_MESSAGE_RELATIONS,
      payload: snapshot,
    },
    "*",
  )
}

function collectRelations(pageWindow: DoubaoPageWindow, payload: unknown): void {
  const messages = getChainMessages(payload)
  if (messages.length === 0) return

  const conversationId = messages.find(
    (message) => typeof message.conversation_id === "string" && message.conversation_id,
  )?.conversation_id
  if (typeof conversationId !== "string" || !conversationId) return

  const state = pageWindow[DOUBAO_BRIDGE_STATE_KEY]
  if (!state) return

  if (state.conversationId !== conversationId) {
    state.conversationId = conversationId
    state.relations.clear()
  }

  let changed = false
  for (const message of messages) {
    if (message.user_type !== 2) continue

    const assistantMessageId =
      typeof message.message_id === "string" ? message.message_id.trim() : ""
    const userMessageId =
      typeof message.bot_reply_message_id === "string" ? message.bot_reply_message_id.trim() : ""
    if (!assistantMessageId || !userMessageId || userMessageId === "0") continue
    if (state.relations.get(assistantMessageId) === userMessageId) continue

    state.relations.set(assistantMessageId, userMessageId)
    changed = true
  }

  if (!changed) return

  while (state.relations.size > DOUBAO_RELATIONS_MAX_ITEMS) {
    const oldestKey = state.relations.keys().next().value
    if (typeof oldestKey !== "string") break
    state.relations.delete(oldestKey)
  }

  publishSnapshot(pageWindow, state)
}

async function readFetchResponse(pageWindow: DoubaoPageWindow, response: Response): Promise<void> {
  try {
    collectRelations(pageWindow, await response.json())
  } catch {}
}

function readXhrResponse(pageWindow: DoubaoPageWindow, xhr: XMLHttpRequest): void {
  try {
    if (xhr.responseType === "json") {
      collectRelations(pageWindow, xhr.response)
      return
    }

    if (xhr.responseType === "" || xhr.responseType === "text") {
      collectRelations(pageWindow, JSON.parse(xhr.responseText))
    }
  } catch {}
}

export function initDoubaoMessageRelationsBridge(): void {
  const pageWindow = getPageWindow()
  if (!pageWindow.location.hostname.endsWith("doubao.com")) return
  if (pageWindow[DOUBAO_BRIDGE_STATE_KEY]) return

  pageWindow[DOUBAO_BRIDGE_STATE_KEY] = {
    conversationId: "",
    relations: new Map(),
  }

  const originalFetch = pageWindow.fetch
  pageWindow.fetch = (async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch.apply(pageWindow, args)
    if (isDoubaoChainUrl(args[0])) {
      void readFetchResponse(pageWindow, response.clone())
    }
    return response
  }) as typeof fetch

  const xhrPrototype = pageWindow.XMLHttpRequest.prototype
  const originalOpen = xhrPrototype.open
  const originalSend = xhrPrototype.send
  const requestUrlKey = "__ophelDoubaoRelationsUrl"

  xhrPrototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    ;(this as XMLHttpRequest & Record<string, unknown>)[requestUrlKey] = url.toString()
    return originalOpen.call(this, method, url, ...(rest as [boolean?, string?, string?]))
  }

  xhrPrototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const requestUrl = (this as XMLHttpRequest & Record<string, unknown>)[requestUrlKey]
    if (isDoubaoChainUrl(requestUrl)) {
      this.addEventListener(
        "loadend",
        () => {
          readXhrResponse(pageWindow, this)
        },
        { once: true },
      )
    }
    return originalSend.call(this, body)
  }
}
