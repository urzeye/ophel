/**
 * 站点适配器工厂
 *
 * 根据当前页面 URL 自动选择合适的适配器
 */

import type { InstalledSitePack, PackManagerSnapshot } from "~core/pack-manager"
import { loadActiveSiteConfigPatch } from "~core/remote-config-cache"
import { createRuntimePackManager } from "~core/pack-manager-runtime"
import { primeDynamicPlatforms } from "~core/platform-catalog"
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
  DeclarativeAdapter,
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
let dynamicAdapters: SiteAdapter[] = []

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

interface DynamicAdapterLoadResult {
  adapters: SiteAdapter[]
  packs: InstalledSitePack[]
}

async function loadDynamicAdapters(): Promise<DynamicAdapterLoadResult> {
  let snapshot: PackManagerSnapshot
  try {
    snapshot = await createRuntimePackManager(platform.storage).getEnabledPacks()
  } catch (error) {
    console.error(
      "[Ophel] Failed to load installed SitePacks; continuing with built-in adapters:",
      error,
    )
    return { adapters: [], packs: [] }
  }

  for (const issue of snapshot.issues) {
    console.warn("[Ophel] SitePack registry issue:", issue)
  }

  const adapters: SiteAdapter[] = []
  const packs: InstalledSitePack[] = []
  for (const pack of snapshot.packs) {
    try {
      adapters.push(new DeclarativeAdapter(pack.manifest))
      packs.push(pack)
    } catch (error) {
      console.error(
        `[Ophel] Failed to initialize SitePack ${pack.manifest.id}; skipping package:`,
        error,
      )
    }
  }
  return { adapters, packs }
}

async function initializeAdapterRegistry(): Promise<void> {
  await applyCachedBuiltinPatches()
  const dynamic = await loadDynamicAdapters()
  dynamicAdapters = dynamic.adapters
  primeDynamicPlatforms(dynamic.packs)
}

/** 在任何同步 getAdapter() 消费前加载内置 patch 与已启用 SitePack。 */
export function initAdapterRegistry(): Promise<void> {
  return (registryInitialization ??= initializeAdapterRegistry())
}

/** 供 UI gate 等等待同一个初始化任务的入口使用。 */
export const registryReady = (): Promise<void> => initAdapterRegistry()

/** 清除远程 patch 后，立即让已配置化内置适配器回到内置配置。 */
export function resetBuiltinSiteConfig(siteId: string): boolean {
  const adapter = builtinAdapters.find((candidate) => candidate.getSiteId() === siteId)
  if (!adapter || !supportsBuiltinSiteConfig(adapter)) return false
  return applyMergedConfig(adapter, adapter.getBuiltinConfig())
}

/**
 * 获取当前页面匹配的适配器
 */
export function getAdapter(): SiteAdapter | null {
  for (const adapter of builtinAdapters) {
    if (adapter.match()) {
      return adapter
    }
  }
  for (const adapter of dynamicAdapters) {
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
