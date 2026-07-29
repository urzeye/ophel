import type { InstalledSitePack } from "~core/pack-manager"
import { createRuntimePackManager } from "~core/pack-manager-runtime"
import type { SitePackOriginBinding } from "~core/site-pack-origin-bindings"
import { platform } from "~platform"
import { getCurrentLang } from "~utils/i18n"

import type {
  SitePackDetectIssue,
  SitePackDetectWaitResult,
  SitePackDetectWaitStatus,
} from "./declarative/detect"
import { resolveSitePackName } from "./declarative/localization"

export interface SitePackDetectionCandidate {
  packId: string
  name: string
  installedAt: number
}

export interface SitePackDetectionState {
  origin: string
  status: SitePackDetectWaitStatus
  activePackId: string | null
  candidates: SitePackDetectionCandidate[]
  attempts: number
  elapsedMs: number
  issues: SitePackDetectIssue[]
}

interface RuntimeSitePackDetectionState {
  origin: string
  status: SitePackDetectWaitStatus
  packs: InstalledSitePack[]
  attempts: number
  elapsedMs: number
  issues: SitePackDetectIssue[]
}

let runtimeState: RuntimeSitePackDetectionState | null = null

const compareInstalledPacks = (left: InstalledSitePack, right: InstalledSitePack): number =>
  left.installedAt - right.installedAt || left.manifest.id.localeCompare(right.manifest.id)

const cloneDetectionState = (state: RuntimeSitePackDetectionState): SitePackDetectionState => ({
  origin: state.origin,
  status: state.status,
  activePackId: state.packs[0]?.manifest.id ?? null,
  candidates: state.packs.map((pack) => ({
    packId: pack.manifest.id,
    name: resolveSitePackName(pack.manifest, getCurrentLang()),
    installedAt: pack.installedAt,
  })),
  attempts: state.attempts,
  elapsedMs: state.elapsedMs,
  issues: state.issues.map((issue) => ({ ...issue })),
})

export const clearSitePackDetectionState = (): void => {
  runtimeState = null
}

export const recordSitePackDetectionResult = (
  origin: string,
  result: SitePackDetectWaitResult,
): void => {
  runtimeState = {
    origin,
    status: result.status,
    packs: [...result.matches].sort(compareInstalledPacks),
    attempts: result.attempts,
    elapsedMs: result.elapsedMs,
    issues: result.issues.map((issue) => ({ ...issue })),
  }
}

/** 返回当前 detect 绑定的只读运行时结果，不新增持久化状态。 */
export const getSitePackDetectionState = (): SitePackDetectionState | null =>
  runtimeState ? cloneDetectionState(runtimeState) : null

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * 把当前 detect 候选写回唯一的 origin binding 真值；调用方成功后应刷新页面。
 */
export async function selectDetectedSitePack(packId: string): Promise<void> {
  const detection = runtimeState
  if (!detection || detection.status !== "matched") {
    throw new Error("No matched SitePack detect candidates are available")
  }

  const selectedPack = detection.packs.find((pack) => pack.manifest.id === packId)
  if (!selectedPack) {
    throw new Error(`SitePack ${packId} is not a matched candidate for ${detection.origin}`)
  }

  const packManager = createRuntimePackManager(platform.storage)
  const bindingState = await packManager.getOriginBindings()
  const previousBinding = bindingState.bindings[detection.origin]
  if (previousBinding?.mode !== "detect") {
    throw new Error(`SitePack origin ${detection.origin} is no longer in detect mode`)
  }

  const explicitBinding: SitePackOriginBinding = { mode: "explicit", packId }
  const requestName =
    resolveSitePackName(selectedPack.manifest, getCurrentLang()).trim().slice(0, 120) || packId
  const permission = await platform.sitePacks.ensureBindingOrigin(
    detection.origin,
    explicitBinding,
    requestName,
  )
  if (permission === "denied") {
    throw new Error(`Permission was denied for SitePack origin ${detection.origin}`)
  }

  let bindingWritten = false
  try {
    await packManager.setOriginBinding(detection.origin, explicitBinding)
    bindingWritten = true
    await platform.sitePacks.reconcile()
  } catch (error) {
    if (!bindingWritten) throw error

    try {
      await packManager.setOriginBinding(detection.origin, previousBinding)
      await platform.sitePacks.reconcile()
    } catch (rollbackError) {
      throw new Error(
        `Failed to select detected SitePack: ${getErrorMessage(error)}; rollback failed: ${getErrorMessage(rollbackError)}`,
      )
    }
    throw error
  }
}
