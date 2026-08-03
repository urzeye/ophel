/**
 * 站点适配器工厂
 *
 * 根据当前页面 URL 自动选择合适的适配器
 */

import {
  isInstalledSitePackEffectivelyEnabled,
  type InstalledSitePack,
  type PackManagerSnapshot,
} from "~core/pack-manager"
import { createRuntimePackManager } from "~core/pack-manager-runtime"
import { primeDynamicPlatforms } from "~core/platform-catalog"
import { applyCachedBuiltinAdapterConfig } from "~core/site-adapter-config-runtime"
import {
  createEmptySitePackOriginBindingsState,
  type SitePackOriginBindingsState,
} from "~core/site-pack-origin-bindings"
import { platform } from "~platform"

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
import { applyMergedConfig, DeclarativeAdapter, supportsBuiltinSiteConfig } from "./declarative"
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

const compareInstalledPacks = (left: InstalledSitePack, right: InstalledSitePack): number =>
  left.installedAt - right.installedAt || left.manifest.id.localeCompare(right.manifest.id)

async function applyCachedBuiltinPatches(): Promise<void> {
  for (const adapter of builtinAdapters) {
    if (!supportsBuiltinSiteConfig(adapter)) continue

    const siteId = adapter.getSiteId()
    try {
      await applyCachedBuiltinAdapterConfig(adapter, platform.storage)
    } catch (error) {
      applyMergedConfig(adapter, adapter.getBuiltinConfig())
      console.error(
        `[Ophel] Failed to load cached patch for ${siteId}; using built-in config:`,
        error,
      )
    }
  }
}

interface DynamicAdapterLoadResult {
  adapters: SiteAdapter[]
  packs: InstalledSitePack[]
  bindings: SitePackOriginBindingsState
}

interface DynamicAdapterEntry {
  adapter: DeclarativeAdapter
  pack: InstalledSitePack
}

const getCurrentUrl = (): URL | null => {
  try {
    return new URL(window.location.href)
  } catch {
    return null
  }
}

const createDynamicAdapterEntries = (
  installedPacks: readonly InstalledSitePack[],
): DynamicAdapterEntry[] => {
  const entries: DynamicAdapterEntry[] = []

  for (const pack of installedPacks) {
    try {
      entries.push({
        adapter: new DeclarativeAdapter(pack.manifest, { installSource: pack.source }),
        pack,
      })
    } catch (error) {
      console.error(
        `[Ophel] Failed to initialize SitePack ${pack.manifest.id}; skipping package:`,
        error,
      )
    }
  }

  return entries
}

async function loadDynamicAdapters(): Promise<DynamicAdapterLoadResult> {
  const packManager = createRuntimePackManager(platform.storage)
  let snapshot: PackManagerSnapshot
  let originBindings: SitePackOriginBindingsState
  try {
    snapshot = await packManager.getEnabledPacks()
    originBindings = await packManager.getOriginBindings()
  } catch (error) {
    console.error(
      "[Ophel] Failed to load installed SitePacks; continuing with built-in adapters:",
      error,
    )
    return { adapters: [], packs: [], bindings: createEmptySitePackOriginBindingsState() }
  }

  const resolved = await resolveDynamicAdapters(snapshot, originBindings)
  return { ...resolved, bindings: originBindings }
}

async function resolveDynamicAdapters(
  snapshot: PackManagerSnapshot,
  originBindings: SitePackOriginBindingsState,
): Promise<Omit<DynamicAdapterLoadResult, "bindings">> {
  for (const issue of snapshot.issues) {
    console.warn("[Ophel] SitePack registry issue:", issue)
  }

  const installedPacks = snapshot.packs
    .filter(isInstalledSitePackEffectivelyEnabled)
    .sort(compareInstalledPacks)
  const entries = createDynamicAdapterEntries(installedPacks)
  const acceptedPacks = entries.map(({ pack }) => pack)
  const currentUrl = getCurrentUrl()
  if (!currentUrl) {
    return { adapters: entries.map(({ adapter }) => adapter), packs: acceptedPacks }
  }

  const currentOrigin = currentUrl.origin
  const binding = originBindings.bindings[currentOrigin]
  if (binding) {
    const entry = entries.find(({ pack }) => pack.manifest.id === binding.packId)
    if (!entry) {
      console.error(
        `[Ophel] Explicit SitePack binding ${currentOrigin} -> ${binding.packId} has no enabled, valid package; dynamic fallback is disabled for this origin.`,
      )
      return { adapters: [], packs: acceptedPacks }
    }

    try {
      return {
        adapters: [
          new DeclarativeAdapter(entry.pack.manifest, {
            explicitOrigin: currentOrigin,
            installSource: entry.pack.source,
          }),
        ],
        packs: acceptedPacks,
      }
    } catch (error) {
      console.error(
        `[Ophel] Failed to initialize explicit SitePack binding ${currentOrigin} -> ${entry.pack.manifest.id}; dynamic fallback is disabled for this origin:`,
        error,
      )
      return { adapters: [], packs: acceptedPacks }
    }
  }

  return { adapters: entries.map(({ adapter }) => adapter), packs: acceptedPacks }
}

async function initializeAdapterRegistry(): Promise<void> {
  await applyCachedBuiltinPatches()
  const dynamic = await loadDynamicAdapters()
  dynamicAdapters = dynamic.adapters
  primeDynamicPlatforms(dynamic.packs, dynamic.bindings)
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
