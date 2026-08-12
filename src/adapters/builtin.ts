/**
 * 内置站点适配器列表
 *
 * 浏览器扩展构建直接打包本模块。
 * 油猴构建通过 vite alias 把 `~adapters/builtin` 替换为
 * `src/platform/userscript/builtin-adapters.ts`，适配器类由
 * @require 引入的 adapters vendor 在 `window.__OphelBuiltinAdapters` 上提供，
 * 以压缩油猴脚本本体的字符数。
 */

import { AIStudioAdapter } from "./aistudio"
import type { SiteAdapter } from "./base"
import { ChatGLMAdapter } from "./chatglm"
import { ChatGPTAdapter } from "./chatgpt"
import { ClaudeAdapter } from "./claude"
import { DeepSeekAdapter } from "./deepseek"
import { DoubaoAdapter } from "./doubao"
import { GeminiAdapter } from "./gemini"
import { GeminiEnterpriseAdapter } from "./gemini-enterprise"
import { GrokAdapter } from "./grok"
import { ImaAdapter } from "./ima"
import { KimiAdapter } from "./kimi"
import { QianwenAdapter } from "./qianwen"
import { QwenAiAdapter } from "./qwen-studio"
import { YuanbaoAdapter } from "./yuanbao"
import { ZaiAdapter } from "./zai"

// 顺序即匹配优先级；油猴 vendor 入口必须保持同一顺序。
export const builtinAdapters: SiteAdapter[] = [
  new GeminiEnterpriseAdapter(),
  new GeminiAdapter(),
  new ChatGPTAdapter(),
  new GrokAdapter(),
  new AIStudioAdapter(),
  new ClaudeAdapter(),
  new DeepSeekAdapter(),
  new DoubaoAdapter(),
  new ImaAdapter(),
  new ChatGLMAdapter(),
  new KimiAdapter(),
  new QwenAiAdapter(),
  new QianwenAdapter(),
  new YuanbaoAdapter(),
  new ZaiAdapter(),
]
