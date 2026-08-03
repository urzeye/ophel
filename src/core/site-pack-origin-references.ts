import {
  siteMatchPatternOriginPattern,
  siteMatchPatternOriginPatternCovers,
} from "~adapters/declarative/match-pattern"

import { isInstalledSitePackEffectivelyEnabled, type InstalledSitePack } from "./pack-manager"
import {
  canonicalizeSitePackBindingOrigin,
  type SitePackOriginBindingsState,
} from "./site-pack-origin-bindings"

export type SitePackOriginReferenceSource = "static" | "explicit"

export interface SitePackOriginReference {
  packId: string
  source: SitePackOriginReferenceSource
}

export interface SitePackOriginReferenceEntry {
  originPattern: string
  referenceCount: number
  references: SitePackOriginReference[]
}

export interface SitePackOriginBindingIssue {
  code: "binding-pack-missing"
  origin: string
  originPattern: string
  packId: string
  message: string
}

export interface SitePackOriginReferenceGraph {
  originReferences: SitePackOriginReferenceEntry[]
  bindingIssues: SitePackOriginBindingIssue[]
}

const SOURCE_ORDER: Record<SitePackOriginReferenceSource, number> = {
  static: 0,
  explicit: 1,
}

const uniqueSorted = (values: readonly string[]): string[] =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))

export const sitePackBindingOriginPattern = (origin: string): string =>
  `${canonicalizeSitePackBindingOrigin(origin)}/*`

const appendReference = (
  referencesByOrigin: Map<string, SitePackOriginReference[]>,
  originPattern: string,
  reference: SitePackOriginReference,
): void => {
  const references = referencesByOrigin.get(originPattern) ?? []
  if (
    references.some(
      (candidate) => candidate.packId === reference.packId && candidate.source === reference.source,
    )
  ) {
    return
  }
  references.push(reference)
  referencesByOrigin.set(originPattern, references)
}

const sortReferences = (references: readonly SitePackOriginReference[]) =>
  [...references].sort(
    (left, right) =>
      left.packId.localeCompare(right.packId) ||
      SOURCE_ORDER[left.source] - SOURCE_ORDER[right.source],
  )

export const deriveSitePackOriginReferences = (
  packs: readonly InstalledSitePack[],
  bindingState: SitePackOriginBindingsState,
): SitePackOriginReferenceGraph => {
  const referencesByOrigin = new Map<string, SitePackOriginReference[]>()
  const packsById = new Map(packs.map((pack) => [pack.manifest.id, pack] as const))
  const enabledPacks = packs.filter(isInstalledSitePackEffectivelyEnabled)

  for (const pack of enabledPacks) {
    for (const match of pack.manifest.matches) {
      appendReference(referencesByOrigin, siteMatchPatternOriginPattern(match), {
        packId: pack.manifest.id,
        source: "static",
      })
    }
  }

  const bindingIssues: SitePackOriginBindingIssue[] = []
  for (const [origin, binding] of Object.entries(bindingState.bindings)) {
    const originPattern = sitePackBindingOriginPattern(origin)
    const pack = packsById.get(binding.packId)
    if (!pack) {
      bindingIssues.push({
        code: "binding-pack-missing",
        origin,
        originPattern,
        packId: binding.packId,
        message: `SitePack origin binding ${origin} references missing pack ${binding.packId}`,
      })
      continue
    }
    if (isInstalledSitePackEffectivelyEnabled(pack)) {
      appendReference(referencesByOrigin, originPattern, {
        packId: pack.manifest.id,
        source: "explicit",
      })
    }
  }

  return {
    originReferences: Array.from(referencesByOrigin.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([originPattern, references]) => {
        const sortedReferences = sortReferences(references)
        return {
          originPattern,
          referenceCount: sortedReferences.length,
          references: sortedReferences,
        }
      }),
    bindingIssues: bindingIssues.sort(
      (left, right) =>
        left.origin.localeCompare(right.origin) || left.packId.localeCompare(right.packId),
    ),
  }
}

/** 用户为该包显式绑定的 origin 级匹配。 */
export const getSitePackBoundOriginPatterns = (
  pack: InstalledSitePack,
  bindingState: SitePackOriginBindingsState,
): string[] => {
  const patterns: string[] = []

  for (const [origin, binding] of Object.entries(bindingState.bindings)) {
    if (binding.packId === pack.manifest.id) {
      patterns.push(sitePackBindingOriginPattern(origin))
    }
  }

  return uniqueSorted(patterns)
}

export const getSitePackReferencedOriginPatterns = (
  pack: InstalledSitePack,
  bindingState: SitePackOriginBindingsState,
): string[] =>
  uniqueSorted([
    ...pack.manifest.matches.map(siteMatchPatternOriginPattern),
    ...getSitePackBoundOriginPatterns(pack, bindingState),
  ])

export const collapseCoveredSitePackOriginPatterns = (patterns: readonly string[]): string[] => {
  const uniquePatterns = uniqueSorted(patterns)
  return uniquePatterns.filter(
    (candidate) =>
      !uniquePatterns.some(
        (covering) =>
          covering !== candidate && siteMatchPatternOriginPatternCovers(covering, candidate),
      ),
  )
}
