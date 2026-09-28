/**
 * AI Studio RPC 桥（main world 侧）。
 *
 * ResolveDriveResource 等 MakerSuite RPC 的 SAPISIDHASH 校验绑定 Origin 头，
 * content script（isolated world）发起的跨域 fetch 会被浏览器改写 Origin
 * 导致 401，因此请求必须由页面上下文代发（见
 * docs/developer/aistudio-api-outline-plan.md §3）。
 *
 * - 扩展端：src/contents/aistudio-rpc-main.ts 以 world:"MAIN" 安装；
 * - 油猴端：适配器直接把本桥安装到 unsafeWindow。
 * 两侧共享 window.postMessage 请求/响应协议。
 */

import {
  buildGoogleAuthorizationHeader,
  GOOGLE_MAKER_SUITE_RPC_PATH,
  recordGoogleApiKey,
  recordGoogleRpcOrigin,
  resolveGoogleApiKeys,
  resolveGoogleAuthUser,
  resolveGoogleRpcOrigins,
} from "~utils/google-rpc-auth"

export const AISTUDIO_RPC_REQUEST_EVENT = "OPHEL_AISTUDIO_RPC_REQUEST"
export const AISTUDIO_RPC_RESPONSE_EVENT = "OPHEL_AISTUDIO_RPC_RESPONSE"
/** 桥就绪标记（落在共享 DOM 上，isolated world 据此判断桥是否可用） */
export const AISTUDIO_RPC_BRIDGE_ATTR = "data-ophel-aistudio-rpc-main"

export interface AIStudioRpcBridgeWindow extends Window {
  __ophelAIStudioRpcBridgeInstalled?: boolean
}

interface RpcRequestPayload {
  type?: unknown
  requestId?: unknown
  method?: unknown
  args?: unknown
}

const SUPPORTED_METHODS = new Set(["ResolveDriveResource"])

const executeRpc = async (
  pageWindow: AIStudioRpcBridgeWindow,
  method: string,
  args: unknown[],
): Promise<{ ok: boolean; status: number; payload: unknown }> => {
  const origin = pageWindow.location.origin
  const authorization = await buildGoogleAuthorizationHeader(origin)
  const apiKeys = resolveGoogleApiKeys(pageWindow)
  if (!authorization || apiKeys.length === 0) {
    return { ok: false, status: 0, payload: { error: "rpc-auth-missing" } }
  }

  let lastStatus = 0
  const rpcOrigins = resolveGoogleRpcOrigins()
  // 服务端按 key 粒度封禁方法，候选 key 逐个尝试
  for (const apiKey of apiKeys) {
    for (const rpcOrigin of rpcOrigins) {
      try {
        const response = await pageWindow.fetch(
          `${rpcOrigin}${GOOGLE_MAKER_SUITE_RPC_PATH}/${method}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              accept: "*/*",
              authorization,
              "content-type": "application/json+protobuf",
              "x-goog-api-key": apiKey,
              "x-goog-authuser": resolveGoogleAuthUser(),
              "x-user-agent": "grpc-web-javascript/0.1",
            },
            body: JSON.stringify(args),
          },
        )
        lastStatus = response.status
        // 403 是 key 级封禁：同一 key 换 origin 无意义，直接试下一个 key
        if (response.status === 403) break
        if (!response.ok) continue
        recordGoogleRpcOrigin(rpcOrigin)
        recordGoogleApiKey(apiKey)
        return { ok: true, status: response.status, payload: await response.json() }
      } catch {
        // 单个 origin 网络失败，尝试下一个候选
      }
    }
  }
  return { ok: false, status: lastStatus, payload: null }
}

export function installAIStudioRpcBridge(pageWindow: AIStudioRpcBridgeWindow): void {
  if (pageWindow.__ophelAIStudioRpcBridgeInstalled) return
  pageWindow.__ophelAIStudioRpcBridgeInstalled = true

  const markBridgeReady = () => {
    try {
      pageWindow.document?.documentElement?.setAttribute(AISTUDIO_RPC_BRIDGE_ATTR, "1")
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

    const data = event.data as RpcRequestPayload
    if (data?.type !== AISTUDIO_RPC_REQUEST_EVENT) return

    const requestId = typeof data.requestId === "string" ? data.requestId : ""
    const method = typeof data.method === "string" ? data.method : ""
    const args = Array.isArray(data.args) ? data.args : null
    if (!requestId || !SUPPORTED_METHODS.has(method) || !args) return

    void executeRpc(pageWindow, method, args).then((result) => {
      pageWindow.postMessage({ type: AISTUDIO_RPC_RESPONSE_EVENT, requestId, ...result }, "*")
    })
  })
}
