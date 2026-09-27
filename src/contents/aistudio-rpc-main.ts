/**
 * AI Studio RPC 桥 - 主世界入口
 *
 * MakerSuite RPC 的 SAPISIDHASH 校验绑定 Origin 头，isolated world 的跨域
 * fetch 会被改写 Origin 导致 401，必须在页面上下文代发（与
 * gemini-canvas-main.ts 同一模式）。油猴端由适配器直接安装到 unsafeWindow。
 */

import type { PlasmoCSConfig } from "plasmo"

import { installAIStudioRpcBridge } from "~core/aistudio-rpc-bridge"

export const config: PlasmoCSConfig = {
  matches: ["https://aistudio.google.com/*"],
  world: "MAIN",
  run_at: "document_start",
}

installAIStudioRpcBridge(window)
