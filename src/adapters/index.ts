/**
 * 站点适配器工厂
 *
 * 先按 hostname 选择唯一模块，再延迟加载对应适配器，避免每个入口都打包全部站点实现。
 */

import type { SiteAdapter } from "./base"

export type AdapterModuleKey =
  | "aistudio"
  | "chatglm"
  | "chatgpt"
  | "claude"
  | "deepseek"
  | "doubao"
  | "gemini"
  | "gemini-enterprise"
  | "grok"
  | "ima"
  | "kimi"
  | "qianwen"
  | "qwen-studio"
  | "yuanbao"
  | "zai"

export function resolveAdapterModuleKey(hostname: string): AdapterModuleKey | null {
  const normalizedHostname = hostname.toLowerCase()

  switch (normalizedHostname) {
    case "business.gemini.google":
      return "gemini-enterprise"
    case "gemini.google.com":
      return "gemini"
    case "aistudio.google.com":
      return "aistudio"
    case "grok.com":
      return "grok"
    case "chatgpt.com":
      return "chatgpt"
    case "claude.ai":
    case "claude.com":
      return "claude"
    case "chat.deepseek.com":
      return "deepseek"
    case "www.doubao.com":
      return "doubao"
    case "ima.qq.com":
      return "ima"
    case "chatglm.cn":
      return "chatglm"
    case "www.kimi.com":
      return "kimi"
    case "chat.qwen.ai":
      return "qwen-studio"
    case "www.qianwen.com":
    case "qianwen.com":
      return "qianwen"
    case "yuanbao.tencent.com":
      return "yuanbao"
    case "chat.z.ai":
      return "zai"
    default:
      return null
  }
}

async function createAdapter(moduleKey: AdapterModuleKey): Promise<SiteAdapter> {
  switch (moduleKey) {
    case "gemini-enterprise": {
      const { GeminiEnterpriseAdapter } = await import("./gemini-enterprise")
      return new GeminiEnterpriseAdapter()
    }
    case "gemini": {
      const { GeminiAdapter } = await import("./gemini")
      return new GeminiAdapter()
    }
    case "aistudio": {
      const { AIStudioAdapter } = await import("./aistudio")
      return new AIStudioAdapter()
    }
    case "grok": {
      const { GrokAdapter } = await import("./grok")
      return new GrokAdapter()
    }
    case "chatgpt": {
      const { ChatGPTAdapter } = await import("./chatgpt")
      return new ChatGPTAdapter()
    }
    case "claude": {
      const { ClaudeAdapter } = await import("./claude")
      return new ClaudeAdapter()
    }
    case "deepseek": {
      const { DeepSeekAdapter } = await import("./deepseek")
      return new DeepSeekAdapter()
    }
    case "doubao": {
      const { DoubaoAdapter } = await import("./doubao")
      return new DoubaoAdapter()
    }
    case "ima": {
      const { ImaAdapter } = await import("./ima")
      return new ImaAdapter()
    }
    case "chatglm": {
      const { ChatGLMAdapter } = await import("./chatglm")
      return new ChatGLMAdapter()
    }
    case "kimi": {
      const { KimiAdapter } = await import("./kimi")
      return new KimiAdapter()
    }
    case "qwen-studio": {
      const { QwenAiAdapter } = await import("./qwen-studio")
      return new QwenAiAdapter()
    }
    case "qianwen": {
      const { QianwenAdapter } = await import("./qianwen")
      return new QianwenAdapter()
    }
    case "yuanbao": {
      const { YuanbaoAdapter } = await import("./yuanbao")
      return new YuanbaoAdapter()
    }
    case "zai": {
      const { ZaiAdapter } = await import("./zai")
      return new ZaiAdapter()
    }
  }
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
