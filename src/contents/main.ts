import type { PlasmoCSConfig } from "plasmo"

import { getAdapterRuntime } from "~core/adapter-runtime"
import { startContentScript } from "~core/content-script-main"

export const config: PlasmoCSConfig = {
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
    "https://qianwen.com/*",
    "https://yuanbao.tencent.com/*",
    "https://chat.z.ai/*",
  ],
  run_at: "document_idle",
}

const adapter = getAdapterRuntime()
if (adapter) {
  startContentScript(adapter)
} else {
  console.error("[Ophel] Site adapter was not registered for:", window.location.hostname)
}
