/**
 * 站点适配器工厂
 *
 * 根据当前页面 URL 自动选择合适的适配器
 */

import { SiteAdapter } from "./base"
import { ChatGPTAdapter } from "./chatgpt"
// import { AIStudioAdapter } from "./ai-studio"
import { ClaudeAdapter } from "./claude"
import { GeminiAdapter } from "./gemini"
import { GeminiEnterpriseAdapter } from "./gemini-enterprise"
import { GrokAdapter } from "./grok"

// 所有可用的适配器
const adapters: SiteAdapter[] = [
  new GeminiEnterpriseAdapter(),
  new GeminiAdapter(),
  new ChatGPTAdapter(),
  new GrokAdapter(),
  // new AIStudioAdapter(),
  new ClaudeAdapter(),
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
  NetworkMonitorConfig,
  ModelSwitcherConfig,
  ExportConfig,
  ConversationObserverConfig,
  AnchorData,
} from "./base"
