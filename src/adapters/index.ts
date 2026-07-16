/**
 * 站点适配器工厂
 *
 * 先按 hostname 选择唯一模块，再延迟加载对应适配器，避免每个入口都打包全部站点实现。
 */

import type { SiteAdapter } from "./base"
import {
  resolveSupportedAdapterModule,
  type SupportedAdapterModuleKey,
} from "~constants/supported-sites"

export type AdapterModuleKey = SupportedAdapterModuleKey

export function resolveAdapterModuleKey(hostname: string): AdapterModuleKey | null {
  return resolveSupportedAdapterModule(hostname)
}

const adapterLoaders = {
  "gemini-enterprise": async () => {
    const { GeminiEnterpriseAdapter } = await import("./gemini-enterprise")
    return new GeminiEnterpriseAdapter()
  },
  gemini: async () => {
    const { GeminiAdapter } = await import("./gemini")
    return new GeminiAdapter()
  },
  aistudio: async () => {
    const { AIStudioAdapter } = await import("./aistudio")
    return new AIStudioAdapter()
  },
  grok: async () => {
    const { GrokAdapter } = await import("./grok")
    return new GrokAdapter()
  },
  chatgpt: async () => {
    const { ChatGPTAdapter } = await import("./chatgpt")
    return new ChatGPTAdapter()
  },
  claude: async () => {
    const { ClaudeAdapter } = await import("./claude")
    return new ClaudeAdapter()
  },
  deepseek: async () => {
    const { DeepSeekAdapter } = await import("./deepseek")
    return new DeepSeekAdapter()
  },
  doubao: async () => {
    const { DoubaoAdapter } = await import("./doubao")
    return new DoubaoAdapter()
  },
  ima: async () => {
    const { ImaAdapter } = await import("./ima")
    return new ImaAdapter()
  },
  chatglm: async () => {
    const { ChatGLMAdapter } = await import("./chatglm")
    return new ChatGLMAdapter()
  },
  kimi: async () => {
    const { KimiAdapter } = await import("./kimi")
    return new KimiAdapter()
  },
  "qwen-studio": async () => {
    const { QwenAiAdapter } = await import("./qwen-studio")
    return new QwenAiAdapter()
  },
  qianwen: async () => {
    const { QianwenAdapter } = await import("./qianwen")
    return new QianwenAdapter()
  },
  yuanbao: async () => {
    const { YuanbaoAdapter } = await import("./yuanbao")
    return new YuanbaoAdapter()
  },
  zai: async () => {
    const { ZaiAdapter } = await import("./zai")
    return new ZaiAdapter()
  },
} satisfies Record<AdapterModuleKey, () => Promise<SiteAdapter>>

async function createAdapter(moduleKey: AdapterModuleKey): Promise<SiteAdapter> {
  return adapterLoaders[moduleKey]()
}

/**
 * 加载当前页面匹配的适配器。
 */
export async function loadAdapter(
  hostname = window.location.hostname,
): Promise<SiteAdapter | null> {
  const moduleKey = resolveAdapterModuleKey(hostname)
  if (!moduleKey) return null

  const adapter = await createAdapter(moduleKey)
  return adapter.match() ? adapter : null
}

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
