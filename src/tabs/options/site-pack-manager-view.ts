import { resolveSitePackDescription, resolveSitePackName } from "~adapters/declarative/localization"
import type { SitePackManifest } from "~adapters/declarative/types"
import {
  SITE_PACK_MAX_BYTES,
  validateSitePackManifest,
  type SitePackValidationError,
} from "~adapters/declarative/validate"
import type { InstalledSitePack, PackManagerSyncResult } from "~core/pack-manager"
import type { RemoteConfigState } from "~core/remote-config-types"

export type RegistrySitePackAvailability = "available" | "disabled" | "incompatible"

export interface RegistrySitePackView {
  id: string
  name: string
  description?: string
  latestVersion: number
  availableVersion?: number
  minAppVersion: string
  matches: string[]
  availability: RegistrySitePackAvailability
  theme?: SitePackManifest["theme"]
  logoUrl?: SitePackManifest["logoUrl"]
  installed?: InstalledSitePack
}

export type SitePackImportParseResult =
  | { valid: true; manifest: SitePackManifest; errors: [] }
  | { valid: false; errors: SitePackValidationError[] }

export const selectRuntimePreparationPacks = (
  installedPacks: readonly InstalledSitePack[],
  syncResult: Pick<PackManagerSyncResult, "updatedPackIds" | "statusChangedPackIds">,
): InstalledSitePack[] => {
  const changedPackIds = new Set([...syncResult.updatedPackIds, ...syncResult.statusChangedPackIds])
  return installedPacks.filter((pack) => changedPackIds.has(pack.manifest.id))
}

export const buildRegistrySitePackViews = (
  remoteState: RemoteConfigState | null,
  installedPacks: readonly InstalledSitePack[],
  language: string,
): RegistrySitePackView[] => {
  const active = remoteState?.active
  if (!active) return []

  const installedById = new Map(installedPacks.map((pack) => [pack.manifest.id, pack] as const))

  return active.index.packs
    .map((entry): RegistrySitePackView => {
      const cached = active.packs[entry.id]
      const installed = installedById.get(entry.id)
      const description = cached ? resolveSitePackDescription(cached.manifest, language) : undefined
      const availability: RegistrySitePackAvailability = entry.disabled
        ? "disabled"
        : cached
          ? "available"
          : "incompatible"
      // 已安装时优先反映实际运行的 manifest 图标，否则用 registry 缓存的清单
      const logoUrl = installed?.manifest.logoUrl ?? cached?.manifest.logoUrl

      return {
        id: entry.id,
        name: cached ? resolveSitePackName(cached.manifest, language) : entry.id,
        ...(description ? { description } : {}),
        latestVersion: entry.version,
        ...(cached ? { availableVersion: cached.manifest.version } : {}),
        minAppVersion: entry.minAppVersion,
        matches: [...entry.matches],
        availability,
        ...(cached?.manifest.theme ? { theme: cached.manifest.theme } : {}),
        ...(logoUrl ? { logoUrl } : {}),
        ...(installed ? { installed } : {}),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

export const parseSitePackImport = (text: string, byteSize: number): SitePackImportParseResult => {
  if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > SITE_PACK_MAX_BYTES) {
    return {
      valid: false,
      errors: [
        {
          path: "$",
          code: "too_large",
          message: `File must not exceed ${SITE_PACK_MAX_BYTES} bytes`,
        },
      ],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      valid: false,
      errors: [
        {
          path: "$",
          code: "invalid_value",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }

  // 本地导入是用户主动提供的文件，允许 http match，覆盖自建的明文 HTTP 实例
  const validation = validateSitePackManifest(parsed, { allowHttpMatches: true })
  if (!validation.valid) {
    return { valid: false, errors: validation.errors }
  }

  return { valid: true, manifest: validation.value, errors: [] }
}
