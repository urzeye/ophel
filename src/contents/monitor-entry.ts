import { initGeminiTitleGuard } from "~core/gemini-title-guard"
import type { MainWorldCSConfig } from "~types/plasmo-content-script"
import { initNetworkMonitor } from "../core/network-monitor"

export const config: MainWorldCSConfig = {
  matches: [
    "https://gemini.google.com/*",
    "https://business.gemini.google/*",
    "https://aistudio.google.com/*",
    "https://grok.com/*",
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://www.doubao.com/*",
    "https://ima.qq.com/*",
    "https://chat.deepseek.com/*",
    "https://www.kimi.com/*",
    "https://chatglm.cn/*",
    "https://chat.qwen.ai/*",
    "https://www.qianwen.com/*",
    "https://yuanbao.tencent.com/*",
    "https://chat.z.ai/*",
  ],
  world: "MAIN",
  persist_across_sessions: false,
}

// 初始化 NetworkMonitor
// 此文件作为 Main World Sciprt 注入，运行在页面上下文中
initGeminiTitleGuard()
initNetworkMonitor()
