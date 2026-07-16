/**
 * 滚动锁定 - 主世界入口
 *
 * 平台入口只负责 Plasmo 配置；滚动拦截逻辑与油猴共用同一运行时实现。
 */

import { installScrollLockRuntime } from "~core/scroll-lock-runtime"
import type { MainWorldCSConfig } from "~types/plasmo-content-script"

export const config: MainWorldCSConfig = {
  matches: [
    "https://gemini.google.com/*",
    "https://business.gemini.google/*",
    "https://aistudio.google.com/*",
    "https://chatgpt.com/*",
    "https://grok.com/*",
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
  run_at: "document_start",
  persist_across_sessions: false,
}

installScrollLockRuntime(window)
