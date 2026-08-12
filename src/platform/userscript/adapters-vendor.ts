/**
 * 油猴 adapters vendor 入口（独立 vite lib 构建，经 @require 引入）。
 *
 * 把全部内置适配器类注册到 window.__OphelBuiltinAdapters，
 * 主包的 ~adapters/builtin alias（builtin-adapters.ts）读取并实例化。
 * 数组顺序即匹配优先级，必须与 src/adapters/builtin.ts 保持一致。
 *
 * 注意：本 bundle 先于油猴主包执行，顶层不允许访问 chrome/GM 存储；
 * 有状态模块（settings-store、watermark-remover、i18n）已由
 * vendor-bridge shim 替换，运行时懒解析主包发布的桥接对象。
 */
import { AIStudioAdapter } from "~adapters/aistudio"
import { ChatGLMAdapter } from "~adapters/chatglm"
import { ChatGPTAdapter } from "~adapters/chatgpt"
import { ClaudeAdapter } from "~adapters/claude"
import { DeepSeekAdapter } from "~adapters/deepseek"
import { DoubaoAdapter } from "~adapters/doubao"
import { GeminiAdapter } from "~adapters/gemini"
import { GeminiEnterpriseAdapter } from "~adapters/gemini-enterprise"
import { GrokAdapter } from "~adapters/grok"
import { ImaAdapter } from "~adapters/ima"
import { KimiAdapter } from "~adapters/kimi"
import { QianwenAdapter } from "~adapters/qianwen"
import { QwenAiAdapter } from "~adapters/qwen-studio"
import { YuanbaoAdapter } from "~adapters/yuanbao"
import { ZaiAdapter } from "~adapters/zai"

import type {} from "./vendor-bridge/types"

declare const __OPHEL_APP_VERSION__: string

// 版本握手：主包实例化前校验 version 与 schemaVersion，
// 防止脚本本体更新后 @require 缓存滞留导致的静默错配。
window.__OphelAdaptersVendorMeta = {
  version: __OPHEL_APP_VERSION__,
  schemaVersion: 1,
}

window.__OphelBuiltinAdapters = [
  GeminiEnterpriseAdapter,
  GeminiAdapter,
  ChatGPTAdapter,
  GrokAdapter,
  AIStudioAdapter,
  ClaudeAdapter,
  DeepSeekAdapter,
  DoubaoAdapter,
  ImaAdapter,
  ChatGLMAdapter,
  KimiAdapter,
  QwenAiAdapter,
  QianwenAdapter,
  YuanbaoAdapter,
  ZaiAdapter,
]
