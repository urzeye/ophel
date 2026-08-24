/**
 * ChatGPT 代码编辑器批量挂载 - 主世界入口
 *
 * 需要在页面脚本之前劫持 appendChild，因此以 MAIN world + document_start 注入。
 * 具体实现见 core/chatgpt-cm-batch-mount.ts（油猴端复用同一实现）。
 */

import type { PlasmoCSConfig } from "plasmo"

import { installChatGptCmBatchMount } from "~core/chatgpt-cm-batch-mount"

export const config: PlasmoCSConfig = {
  matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  world: "MAIN",
  run_at: "document_start",
}

installChatGptCmBatchMount(window)
