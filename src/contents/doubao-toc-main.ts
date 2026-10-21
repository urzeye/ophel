/**
 * 豆包原生 TOC 桥 - 主世界入口
 *
 * React fiber 的 __reactFiber$* expando 只在页面上下文可见（与
 * aistudio-rpc-main.ts 同一模式）。油猴端由适配器直接安装到 unsafeWindow。
 */

import type { PlasmoCSConfig } from "plasmo"

import { installDoubaoTocBridge } from "~core/doubao-toc-bridge"

export const config: PlasmoCSConfig = {
  matches: ["https://www.doubao.com/*"],
  world: "MAIN",
  run_at: "document_start",
}

installDoubaoTocBridge(window)
