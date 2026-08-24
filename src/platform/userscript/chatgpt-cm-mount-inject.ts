/**
 * 油猴脚本版 ChatGPT 代码编辑器批量挂载注入
 *
 * 等效于扩展端 src/contents/chatgpt-cm-mount-main.ts（MAIN world content script）。
 * 油猴脚本没有 world: "MAIN" 机制，通过 unsafeWindow 把补丁安装到页面主世界。
 */

import {
  installChatGptCmBatchMount,
  type ChatGptCmBatchMountWindow,
} from "~core/chatgpt-cm-batch-mount"

declare const unsafeWindow: ChatGptCmBatchMountWindow | undefined

function getPageWindow(): ChatGptCmBatchMountWindow {
  if (typeof unsafeWindow !== "undefined" && unsafeWindow !== window) {
    return unsafeWindow
  }

  return window as ChatGptCmBatchMountWindow
}

export function injectChatGptCmBatchMount(): void {
  const pageWindow = getPageWindow()
  // 仅 ChatGPT 站点需要该补丁，其他站点跳过避免无效劫持
  const hostname = pageWindow.location.hostname
  if (hostname !== "chatgpt.com" && hostname !== "chat.openai.com") return
  installChatGptCmBatchMount(pageWindow)
}
