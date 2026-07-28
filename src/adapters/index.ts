/**
 * 站点适配器工厂
 *
 * 根据当前页面 URL 自动选择合适的适配器
 */

import { loadActiveSiteConfigPatch } from "~core/remote-config-cache"
import { platform } from "~platform"
import { APP_VERSION } from "~utils/config"

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
import { ImaAdapter } from "./ima"
import { KimiAdapter } from "./kimi"
import {
  applyMergedConfig,
  resolveSiteConfig,
  supportsBuiltinSiteConfig,
  type SiteConfigPatch,
} from "./declarative"
import { QianwenAdapter } from "./qianwen"
import { QwenAiAdapter } from "./qwen-studio"
import { YuanbaoAdapter } from "./yuanbao"
import { ZaiAdapter } from "./zai"

// 所有内置适配器；顺序即匹配优先级，动态适配包在 Phase 1 追加到独立列表。
const builtinAdapters: SiteAdapter[] = [
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

let registryInitialization: Promise<void> | null = null

async function applyCachedBuiltinPatches(): Promise<void> {
  for (const adapter of builtinAdapters) {
    if (!supportsBuiltinSiteConfig(adapter)) continue

    const siteId = adapter.getSiteId()
    let remotePatch: SiteConfigPatch | undefined
    try {
      remotePatch = await loadActiveSiteConfigPatch(platform.storage, siteId)
    } catch (error) {
      applyMergedConfig(adapter, adapter.getBuiltinConfig())
      console.error(
        `[Ophel] Failed to load cached patch for ${siteId}; using built-in config:`,
        error,
      )
      continue
    }
    const resolved = resolveSiteConfig({
      siteId,
      appVersion: APP_VERSION,
      configVersion: adapter.getBuiltinConfigVersion(),
      baseConfig: adapter.getBuiltinConfig(),
      remotePatch,
    })

    if (remotePatch && resolved.remotePatch.status !== "applied") {
      console.warn(`[Ophel] Cached patch was not applied for ${siteId}:`, resolved.remotePatch)
    }
    applyMergedConfig(adapter, resolved.config)
  }
}

/** 在任何同步 getAdapter() 消费前加载并注入内置站点缓存 patch。 */
export function initAdapterRegistry(): Promise<void> {
  return (registryInitialization ??= applyCachedBuiltinPatches())
}

/** 供 UI gate 等只等待、不重复创建初始化任务的入口使用。 */
export const registryReady = (): Promise<void> => registryInitialization ?? Promise.resolve()

/**
 * 获取当前页面匹配的适配器
 */
export function getAdapter(): SiteAdapter | null {
  for (const adapter of builtinAdapters) {
    if (adapter.match()) {
      return adapter
    }
  }
  return null
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
  FormulaCopySource,
} from "./base"
