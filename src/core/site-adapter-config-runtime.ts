import type { SiteAdapter } from "~adapters/base"
import { DeclarativeAdapter } from "~adapters/declarative/adapter"
import {
  applyMergedConfig,
  resolveSiteConfig,
  supportsBuiltinSiteConfig,
  type SiteConfigLayerOutcome,
} from "~adapters/declarative/merge"
import { APP_VERSION } from "~utils/config"
import type { PlatformStorage } from "~platform"

import { isInstalledSitePackEffectivelyEnabled } from "./pack-manager"
import { createRuntimePackManager } from "./pack-manager-runtime"
import { isCachedSitePackShape, loadActiveSiteConfigPatchDetails } from "./remote-config-cache"
import { loadRemoteConfigState } from "./remote-config-state"

export type ActiveSitePackSource = "registry" | "local"

export interface ActiveAdapterConfigContext {
  kind: "builtin" | "site-pack"
  siteId: string
  siteName: string
  siteInstanceKey: string
  origin: string
  signature: string
  canCheckUpdates: boolean
  baseConfigVersion?: number
  patchVersion?: number
  patchSource?: "registry" | "local"
  patchOutcome?: SiteConfigLayerOutcome
  packId?: string
  activeVersion?: number
  registryVersion?: number
  source?: ActiveSitePackSource
  updateAvailable: boolean
}

export interface AppliedBuiltinAdapterConfig {
  baseConfigVersion: number
  patchVersion?: number
  patchSource?: "registry" | "local"
  patchOutcome: SiteConfigLayerOutcome
}

const getCurrentOrigin = (): string => (typeof window === "undefined" ? "" : window.location.origin)

export async function applyCachedBuiltinAdapterConfig(
  adapter: SiteAdapter,
  storage: PlatformStorage,
): Promise<AppliedBuiltinAdapterConfig | null> {
  if (!supportsBuiltinSiteConfig(adapter)) return null

  const siteId = adapter.getSiteId()
  const baseConfigVersion = adapter.getBuiltinConfigVersion()
  const loadedPatch = await loadActiveSiteConfigPatchDetails(storage, siteId)
  const remotePatch = loadedPatch?.patch
  const resolved = resolveSiteConfig({
    siteId,
    appVersion: APP_VERSION,
    configVersion: baseConfigVersion,
    baseConfig: adapter.getBuiltinConfig(),
    remotePatch,
  })

  if (remotePatch && resolved.remotePatch.status !== "applied") {
    console.warn(`[Ophel] Cached patch was not applied for ${siteId}:`, resolved.remotePatch)
  }
  applyMergedConfig(adapter, resolved.config)

  return {
    baseConfigVersion,
    patchOutcome: resolved.remotePatch,
    ...(resolved.remotePatch.status === "applied" && resolved.remotePatch.patchVersion
      ? {
          patchVersion: resolved.remotePatch.patchVersion,
          ...(loadedPatch ? { patchSource: loadedPatch.source } : {}),
        }
      : {}),
  }
}

const refreshSitePackConfig = async (
  adapter: DeclarativeAdapter,
  storage: PlatformStorage,
): Promise<ActiveAdapterConfigContext> => {
  const initialMetadata = adapter.getSitePackMetadata()
  const packManager = createRuntimePackManager(storage)
  const snapshot = await packManager.getSnapshot()
  for (const issue of snapshot.issues) {
    console.warn("[Ophel] SitePack health refresh issue:", issue)
  }

  const installed = snapshot.packs.find((pack) => pack.manifest.id === initialMetadata.id)
  const activeInstalled =
    installed && isInstalledSitePackEffectivelyEnabled(installed) ? installed : undefined
  if (activeInstalled && activeInstalled.manifest.version > initialMetadata.version) {
    adapter.applySitePackManifest(activeInstalled.manifest)
  }

  const metadata = adapter.getSitePackMetadata()
  const source = installed?.source ?? metadata.source
  const remoteState = await loadRemoteConfigState(storage)
  const cached = remoteState.active?.packs[metadata.id]
  if (cached !== undefined && !isCachedSitePackShape(cached)) {
    throw new Error(`Cached SitePack metadata is malformed: ${metadata.id}`)
  }

  const registryVersion = cached?.manifest.version
  const canCheckUpdates = activeInstalled?.source === "registry"
  const updateAvailable =
    canCheckUpdates && registryVersion !== undefined && registryVersion > metadata.version

  return {
    kind: "site-pack",
    siteId: adapter.getSiteId(),
    siteName: adapter.getName(),
    siteInstanceKey: adapter.getSiteInstanceKey(),
    origin: getCurrentOrigin(),
    signature: `site-pack:${metadata.id}:${metadata.version}`,
    canCheckUpdates,
    packId: metadata.id,
    activeVersion: metadata.version,
    ...(registryVersion !== undefined ? { registryVersion } : {}),
    ...(source ? { source } : {}),
    updateAvailable,
  }
}

export async function refreshActiveAdapterConfig(
  adapter: SiteAdapter,
  storage: PlatformStorage,
): Promise<ActiveAdapterConfigContext> {
  if (adapter instanceof DeclarativeAdapter) {
    return refreshSitePackConfig(adapter, storage)
  }

  const applied = await applyCachedBuiltinAdapterConfig(adapter, storage)
  const signature = applied
    ? `builtin:${adapter.getSiteId()}:base:${applied.baseConfigVersion}:patch:${applied.patchVersion ?? 0}`
    : `builtin:${adapter.getSiteId()}:app:${APP_VERSION}`

  return {
    kind: "builtin",
    siteId: adapter.getSiteId(),
    siteName: adapter.getName(),
    siteInstanceKey: adapter.getSiteInstanceKey(),
    origin: getCurrentOrigin(),
    signature,
    canCheckUpdates: true,
    ...(applied
      ? {
          baseConfigVersion: applied.baseConfigVersion,
          patchOutcome: applied.patchOutcome,
          ...(applied.patchVersion !== undefined ? { patchVersion: applied.patchVersion } : {}),
          ...(applied.patchSource ? { patchSource: applied.patchSource } : {}),
        }
      : {}),
    updateAvailable: false,
  }
}
