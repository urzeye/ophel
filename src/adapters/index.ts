/**
 * 站点适配器工厂
 *
 * 根据当前页面 URL 自动选择合适的适配器
 */

import { AIStudioAdapter } from "./aistudio"
import { SiteAdapter } from "./base"
import { ChatGLMAdapter } from "./chatglm"
import { ChatGPTAdapter } from "./chatgpt"
import { ClaudeAdapter } from "./claude"
import { DeepSeekAdapter } from "./deepseek"
import { DoubaoAdapter } from "./doubao"
import { GeminiAdapter } from "./gemini"
import { GeminiEnterpriseAdapter } from "./gemini-enterprise"
import { GrokAdapter } from "./grok"
import { KimiAdapter } from "./kimi"
import { QianwenAdapter } from "./qianwen"
import { ZaiAdapter } from "./zai"

// 所有可用的适配器
const adapters: SiteAdapter[] = [
  new GeminiEnterpriseAdapter(),
  new GeminiAdapter(),
  new ChatGPTAdapter(),
  new GrokAdapter(),
  new AIStudioAdapter(),
  new ClaudeAdapter(),
  new DeepSeekAdapter(),
  new DoubaoAdapter(),
  new ChatGLMAdapter(),
  new KimiAdapter(),
  new QianwenAdapter(),
  new ZaiAdapter(),
]

/**
 * 获取当前页面匹配的适配器
 */
export function getAdapter(): SiteAdapter | null {
  for (const adapter of adapters) {
    if (adapter.match()) {
      return adapter
    }
  }
  return null
}

/**
 * 获取所有已注册的适配器
 */
export function getAllAdapters(): SiteAdapter[] {
  return [...adapters]
}

// 导出类型和基类
export { SiteAdapter } from "./base"
export type {
  OutlineItem,
  ConversationInfo,
  ConversationDeleteTarget,
  NetworkMonitorConfig,
  ModelSwitcherConfig,
  ExportConfig,
  ConversationObserverConfig,
  SiteDeleteConversationResult,
  AnchorData,
} from "./base"
