/**
 * 站点适配器工厂
 *
 * 根据当前页面 URL 自动选择合适的适配器
 */

// 内置适配器列表由 ~adapters/builtin 提供；油猴构建中该模块被 alias 替换为
// vendor 桥接实现（见 builtin.ts 注释），浏览器扩展构建不受影响。
// 必须使用 ~ 别名导入，油猴 vite alias 才能拦截。
import { builtinAdapters } from "~adapters/builtin"
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

import { SiteAdapter } from "./base"
import { applyMergedConfig, DeclarativeAdapter, supportsBuiltinSiteConfig } from "./declarative"

let dynamicAdapters: SiteAdapter[] = []

let registryInitialization: Promise<void> | null = null

export interface BrokenOriginBinding {
  origin: string
  packId: string
}

// 当前 origin 存在显式绑定、但绑定的包不可用时的记录,供入口层给用户可见提示。
let brokenOriginBinding: BrokenOriginBinding | null = null

export const getBrokenOriginBinding = (): BrokenOriginBinding | null => brokenOriginBinding

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

  brokenOriginBinding = null

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
      brokenOriginBinding = { origin: currentOrigin, packId: binding.packId }
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
      brokenOriginBinding = { origin: currentOrigin, packId: binding.packId }
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

/** 按 storage 中的 local/remote patch 重新注入内置适配器配置。 */
export async function reapplyBuiltinSiteConfig(siteId: string): Promise<boolean> {
  const adapter = builtinAdapters.find((candidate) => candidate.getSiteId() === siteId)
  if (!adapter || !supportsBuiltinSiteConfig(adapter)) return false
  try {
    await applyCachedBuiltinAdapterConfig(adapter, platform.storage)
    return true
  } catch (error) {
    applyMergedConfig(adapter, adapter.getBuiltinConfig())
    console.error(`[Ophel] Failed to reapply config for ${siteId}; using built-in config:`, error)
    return false
  }
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
