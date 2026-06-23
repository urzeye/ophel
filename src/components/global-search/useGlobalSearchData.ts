import { useMemo } from "react"
import fuzzysort from "fuzzysort"

import { SETTING_ID_ALIASES, type SettingsSearchItem } from "~constants"
import { FEATURE_TIPS } from "~constants/feature-tips"
import type { ConversationManager } from "~core/conversation-manager"
import type { OutlineManager, OutlineNode } from "~core/outline-manager"
import type { ShortcutActionId } from "~constants/shortcuts"
import { t } from "~utils/i18n"
import type { Prompt } from "~utils/storage"

import {
  matchGlobalSearchSyntaxFilters,
  normalizeGlobalSearchValue,
  toGlobalSearchTokens,
  type GlobalSearchSyntaxFilter,
} from "./syntax"
import type {
  GlobalSearchCategoryId,
  GlobalSearchFuzzyMatchMeta,
  GlobalSearchGroupedResult,
  GlobalSearchHighlightField,
  GlobalSearchMatchReason,
  GlobalSearchResultCategory,
  GlobalSearchResultItem,
  GlobalSearchTagBadge,
} from "./types"

interface GlobalSearchScoreField {
  value: string
  exact: number
  prefix: number
  includes: number
  tokenPrefix: number
  tokenIncludes: number
  matchReason?: GlobalSearchMatchReason
  highlightField?: GlobalSearchHighlightField
}

interface GlobalSearchScoreResult {
  score: number
  matchLevel: number
  exactHitCount: number
  prefixHitCount: number
  includesHitCount: number
  matchReasons: GlobalSearchMatchReason[]
  fuzzyMatch?: GlobalSearchFuzzyMatchMeta
}

interface GlobalSearchQueryContext {
  normalizedQuery: string
  tokens: string[]
  enableFuzzySearch: boolean
}

interface GlobalSearchIndexEntry {
  index: number
  fields: GlobalSearchScoreField[]
  searchableText: string
  fuzzyWords: string[]
  fuzzyAcronym: string
  recency?: number
  scoreBoost?: number
  createItem: (
    scoreMeta: GlobalSearchScoreResult,
    queryContext: GlobalSearchQueryContext,
  ) => GlobalSearchResultItem
}

interface LocalizedLabelDefinition {
  key: string
  fallback: string
}

interface UseGlobalSearchDataParams {
  activeGlobalSearchPlainQuery: string
  enableFuzzySearch: boolean
  activeGlobalSearchSyntaxFilters: GlobalSearchSyntaxFilter[]
  settingsSearchResults: SettingsSearchItem[]
  resolveSettingSearchTitle: (item: SettingsSearchItem) => string
  getSettingsBreadcrumb: (settingId: string) => string
  conversationManager: ConversationManager | null
  conversationsSnapshot: unknown
  foldersSnapshot: unknown
  tagsSnapshot: unknown
  promptsSnapshot: Prompt[]
  outlineManager: OutlineManager | null
  outlineSearchVersion: number
  getLocalizedText: (definition: LocalizedLabelDefinition) => string
  resolveShortcutLabel: (actionId: ShortcutActionId) => string | null
  passThroughModifierLabel: string
  activeGlobalSearchCategory: GlobalSearchCategoryId
  expandedGlobalSearchCategories: Partial<Record<GlobalSearchResultCategory, boolean>>
  allCategoryItemLimit: number
}

const ORDERED_GLOBAL_SEARCH_CATEGORIES: GlobalSearchResultCategory[] = [
  "outline",
  "conversations",
  "prompts",
  "settings",
  "tips",
]

const buildSettingAliasMap = (): Record<string, string[]> => {
  return Object.entries(SETTING_ID_ALIASES).reduce(
    (collector, [aliasId, targetSettingId]) => {
      if (!collector[targetSettingId]) {
        collector[targetSettingId] = []
      }
      collector[targetSettingId].push(aliasId)
      return collector
    },
    {} as Record<string, string[]>,
  )
}

const GLOBAL_SEARCH_SETTING_ALIAS_MAP = buildSettingAliasMap()

const buildGlobalSearchSnippet = ({
  content,
  normalizedQuery,
  tokens,
  maxLength = 84,
}: {
  content: string
  normalizedQuery: string
  tokens: string[]
  maxLength?: number
}): string => {
  const normalizedContent = content.replace(/\s+/g, " ").trim()
  if (!normalizedContent) return ""

  const candidates = Array.from(new Set([normalizedQuery, ...tokens])).filter(Boolean)
  const lowerContent = normalizedContent.toLowerCase()

  let firstHitIndex = -1
  candidates.forEach((candidate) => {
    const hitIndex = lowerContent.indexOf(candidate)
    if (hitIndex === -1) return
    if (firstHitIndex === -1 || hitIndex < firstHitIndex) {
      firstHitIndex = hitIndex
    }
  })

  if (firstHitIndex < 0) {
    return normalizedContent.length > maxLength
      ? `${normalizedContent.slice(0, maxLength).trim()}…`
      : normalizedContent
  }

  let start = Math.max(0, firstHitIndex - Math.floor(maxLength * 0.25))
  const end = Math.min(normalizedContent.length, start + maxLength)

  if (end >= normalizedContent.length) {
    start = Math.max(0, normalizedContent.length - maxLength)
  }

  const snippet = normalizedContent.slice(start, end).trim()
  const prefix = start > 0 ? "…" : ""
  const suffix = end < normalizedContent.length ? "…" : ""

  return `${prefix}${snippet}${suffix}`
}

const getInboxDisplayName = (): string => {
  const translated = t("conversationsInbox")
  return translated === "conversationsInbox" ? "Inbox" : translated
}

const getFolderDisplayName = (folder: { id: string; name: string; icon?: string }): string => {
  if (folder.id === "inbox") {
    return getInboxDisplayName()
  }

  const trimmedName = (folder.name || "").trim()
  const trimmedIcon = (folder.icon || "").trim()

  if (!trimmedIcon) {
    return trimmedName
  }

  if (trimmedName.startsWith(trimmedIcon)) {
    return trimmedName.slice(trimmedIcon.length).trim()
  }

  return trimmedName
}

const flattenOutlineNodes = (nodes: OutlineNode[]): OutlineNode[] => {
  const collector: OutlineNode[] = []

  const traverse = (items: OutlineNode[]) => {
    items.forEach((node) => {
      collector.push(node)
      if (node.children && node.children.length > 0) {
        traverse(node.children)
      }
    })
  }

  traverse(nodes)
  return collector
}

const GLOBAL_SEARCH_FUZZY_THRESHOLD = 0.24
const GLOBAL_SEARCH_FUZZY_SCORE_MULTIPLIER = 64
const GLOBAL_SEARCH_TYPO_MIN_QUERY_LENGTH = 4
const GLOBAL_SEARCH_TYPO_MAX_DISTANCE_SHORT = 1
const GLOBAL_SEARCH_TYPO_MAX_DISTANCE_LONG = 2
const GLOBAL_SEARCH_FUZZY_FULL_SCAN_LIMIT = 800
const GLOBAL_SEARCH_FUZZY_CANDIDATE_LIMIT = 300

interface GlobalSearchFuzzyMatchResult {
  score: number
  matchReason?: GlobalSearchMatchReason
  highlightField?: GlobalSearchHighlightField
  indexes?: number[]
  isTypoFallback?: boolean
}

const toGlobalSearchFuzzyWords = (value: string): string[] => {
  if (!value) {
    return []
  }

  return value
    .split(/[^a-z0-9\u4e00-\u9fff]+/gi)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
}

const toGlobalSearchAcronym = (words: string[]): string =>
  words
    .map((word) => word[0] || "")
    .join("")
    .trim()

const getBoundedDamerauLevenshteinDistance = (
  source: string,
  target: string,
  maxDistance: number,
): number => {
  const sourceLength = source.length
  const targetLength = target.length

  if (source === target) {
    return 0
  }

  if (Math.abs(sourceLength - targetLength) > maxDistance) {
    return maxDistance + 1
  }

  const prevPrevRow = new Array(targetLength + 1).fill(0)
  const prevRow = new Array(targetLength + 1)
  const currentRow = new Array(targetLength + 1)

  for (let columnIndex = 0; columnIndex <= targetLength; columnIndex += 1) {
    prevRow[columnIndex] = columnIndex
  }

  for (let rowIndex = 1; rowIndex <= sourceLength; rowIndex += 1) {
    currentRow[0] = rowIndex
    let rowBest = currentRow[0]

    for (let columnIndex = 1; columnIndex <= targetLength; columnIndex += 1) {
      const cost = source[rowIndex - 1] === target[columnIndex - 1] ? 0 : 1

      let value = Math.min(
        prevRow[columnIndex] + 1,
        currentRow[columnIndex - 1] + 1,
        prevRow[columnIndex - 1] + cost,
      )

      if (
        rowIndex > 1 &&
        columnIndex > 1 &&
        source[rowIndex - 1] === target[columnIndex - 2] &&
        source[rowIndex - 2] === target[columnIndex - 1]
      ) {
        value = Math.min(value, prevPrevRow[columnIndex - 2] + 1)
      }

      currentRow[columnIndex] = value
      if (value < rowBest) {
        rowBest = value
      }
    }

    if (rowBest > maxDistance) {
      return maxDistance + 1
    }

    for (let columnIndex = 0; columnIndex <= targetLength; columnIndex += 1) {
      prevPrevRow[columnIndex] = prevRow[columnIndex]
      prevRow[columnIndex] = currentRow[columnIndex]
    }
  }

  return prevRow[targetLength]
}

const getGlobalSearchFuzzyMatch = ({
  normalizedQuery,
  fields,
}: {
  normalizedQuery: string
  fields: GlobalSearchScoreField[]
}): GlobalSearchFuzzyMatchResult | null => {
  if (!normalizedQuery) {
    return null
  }

  let bestMatch: GlobalSearchFuzzyMatchResult | null = null
  const typoMaxDistance =
    normalizedQuery.length >= 8
      ? GLOBAL_SEARCH_TYPO_MAX_DISTANCE_LONG
      : GLOBAL_SEARCH_TYPO_MAX_DISTANCE_SHORT

  fields.forEach((field) => {
    if (!field.value) {
      return
    }

    const fuzzyResult = fuzzysort.single(normalizedQuery, field.value)
    if (!fuzzyResult || fuzzyResult.score < GLOBAL_SEARCH_FUZZY_THRESHOLD) {
      return
    }

    if (!bestMatch || fuzzyResult.score > bestMatch.score) {
      bestMatch = {
        score: fuzzyResult.score,
        matchReason: field.matchReason,
        highlightField: field.highlightField,
        indexes: Array.from(fuzzyResult.indexes || []),
        isTypoFallback: false,
      }
    }

    return
  })

  if (bestMatch) {
    return bestMatch
  }

  if (normalizedQuery.length < GLOBAL_SEARCH_TYPO_MIN_QUERY_LENGTH) {
    return null
  }

  fields.forEach((field) => {
    if (!field.value) {
      return
    }

    const words = toGlobalSearchFuzzyWords(field.value)
    words.forEach((word) => {
      if (Math.abs(word.length - normalizedQuery.length) > typoMaxDistance) {
        return
      }

      const distance = getBoundedDamerauLevenshteinDistance(normalizedQuery, word, typoMaxDistance)

      if (distance > typoMaxDistance) {
        return
      }

      const typoScore = Math.max(
        GLOBAL_SEARCH_FUZZY_THRESHOLD,
        0.58 - distance * 0.14 - Math.abs(word.length - normalizedQuery.length) * 0.03,
      )

      if (!bestMatch || typoScore > bestMatch.score) {
        bestMatch = {
          score: typoScore,
          matchReason: field.matchReason,
          highlightField: field.highlightField,
          indexes: undefined,
          isTypoFallback: true,
        }
      }
    })
  })

  return bestMatch
}

const getGlobalSearchScore = ({
  normalizedQuery,
  tokens,
  index,
  fields,
  enableFuzzySearch,
  baseScoreWhenEmpty = 1000,
}: {
  normalizedQuery: string
  tokens: string[]
  index: number
  fields: GlobalSearchScoreField[]
  enableFuzzySearch: boolean
  baseScoreWhenEmpty?: number
}): GlobalSearchScoreResult | null => {
  const searchableText = fields.map((field) => field.value).join(" ")
  const hasAllTokenMatches = tokens.every((token) => searchableText.includes(token))
  const fuzzyMatch =
    enableFuzzySearch && normalizedQuery
      ? getGlobalSearchFuzzyMatch({
          normalizedQuery,
          fields,
        })
      : null

  if (!hasAllTokenMatches && !fuzzyMatch) {
    return null
  }

  if (!normalizedQuery) {
    return {
      score: baseScoreWhenEmpty - index,
      matchLevel: 0,
      exactHitCount: 0,
      prefixHitCount: 0,
      includesHitCount: 0,
      matchReasons: [],
    }
  }

  let score = 0
  let matchLevel = 0
  let exactHitCount = 0
  let prefixHitCount = 0
  let includesHitCount = 0
  const matchReasons = new Set<GlobalSearchMatchReason>()

  fields.forEach((field) => {
    const normalizedValue = field.value
    if (!normalizedValue) {
      return
    }

    let fieldMatchLevel = 0
    let tokenMatchedByPrefix = false
    let tokenMatchedByIncludes = false

    if (normalizedValue === normalizedQuery) {
      score += field.exact
      fieldMatchLevel = 3
      exactHitCount += 1
    } else if (normalizedValue.startsWith(normalizedQuery)) {
      score += field.prefix
      fieldMatchLevel = 2
      prefixHitCount += 1
    } else if (normalizedValue.includes(normalizedQuery)) {
      score += field.includes
      fieldMatchLevel = 1
      includesHitCount += 1
    }

    matchLevel = Math.max(matchLevel, fieldMatchLevel)

    if (fieldMatchLevel > 0 && field.matchReason) {
      matchReasons.add(field.matchReason)
    }

    tokens.forEach((token) => {
      if (normalizedValue.startsWith(token)) {
        score += field.tokenPrefix
        tokenMatchedByPrefix = true
      }
      if (normalizedValue.includes(token)) {
        score += field.tokenIncludes
        tokenMatchedByIncludes = true
      }
    })

    if (fieldMatchLevel === 0) {
      if (tokenMatchedByPrefix) {
        matchLevel = Math.max(matchLevel, 2)
        prefixHitCount += 1
        if (field.matchReason) {
          matchReasons.add(field.matchReason)
        }
      } else if (tokenMatchedByIncludes) {
        matchLevel = Math.max(matchLevel, 1)
        includesHitCount += 1
        if (field.matchReason) {
          matchReasons.add(field.matchReason)
        }
      }
    } else {
      matchLevel = Math.max(matchLevel, fieldMatchLevel)
    }
  })

  const shouldUseFuzzyFallback = Boolean(fuzzyMatch && matchLevel === 0)

  if (shouldUseFuzzyFallback && fuzzyMatch) {
    const normalizedFuzzyScore = Math.round(fuzzyMatch.score * GLOBAL_SEARCH_FUZZY_SCORE_MULTIPLIER)
    score += normalizedFuzzyScore + 16
    matchReasons.add("fuzzy")

    if (fuzzyMatch.matchReason) {
      matchReasons.add(fuzzyMatch.matchReason)
    }
  }

  if (matchLevel === 0 && !fuzzyMatch) {
    return null
  }

  return {
    score,
    matchLevel,
    exactHitCount,
    prefixHitCount,
    includesHitCount,
    matchReasons: Array.from(matchReasons),
    fuzzyMatch: shouldUseFuzzyFallback
      ? {
          field: fuzzyMatch?.highlightField,
          indexes: fuzzyMatch?.indexes,
          isTypoFallback: fuzzyMatch?.isTypoFallback,
        }
      : undefined,
  }
}

const compareGlobalSearchRankedItems = (
  left: { scoreMeta: GlobalSearchScoreResult; index: number; recency?: number },
  right: { scoreMeta: GlobalSearchScoreResult; index: number; recency?: number },
): number => {
  if (right.scoreMeta.matchLevel !== left.scoreMeta.matchLevel) {
    return right.scoreMeta.matchLevel - left.scoreMeta.matchLevel
  }

  if (right.scoreMeta.exactHitCount !== left.scoreMeta.exactHitCount) {
    return right.scoreMeta.exactHitCount - left.scoreMeta.exactHitCount
  }

  if (right.scoreMeta.prefixHitCount !== left.scoreMeta.prefixHitCount) {
    return right.scoreMeta.prefixHitCount - left.scoreMeta.prefixHitCount
  }

  if (right.scoreMeta.includesHitCount !== left.scoreMeta.includesHitCount) {
    return right.scoreMeta.includesHitCount - left.scoreMeta.includesHitCount
  }

  if (right.scoreMeta.score !== left.scoreMeta.score) {
    return right.scoreMeta.score - left.scoreMeta.score
  }

  const leftRecency = left.recency || 0
  const rightRecency = right.recency || 0
  if (rightRecency !== leftRecency) {
    return rightRecency - leftRecency
  }

  return left.index - right.index
}

const createGlobalSearchIndexEntry = (
  entry: Omit<GlobalSearchIndexEntry, "searchableText" | "fuzzyWords" | "fuzzyAcronym">,
): GlobalSearchIndexEntry => {
  const searchableText = entry.fields
    .map((field) => field.value)
    .filter(Boolean)
    .join(" ")
  const fuzzyWords = toGlobalSearchFuzzyWords(searchableText)

  return {
    ...entry,
    searchableText,
    fuzzyWords,
    fuzzyAcronym: toGlobalSearchAcronym(fuzzyWords),
  }
}

const isGlobalSearchSubsequence = (query: string, value: string): boolean => {
  if (!query || query.length > value.length) return false

  let queryIndex = 0
  for (
    let valueIndex = 0;
    valueIndex < value.length && queryIndex < query.length;
    valueIndex += 1
  ) {
    if (value[valueIndex] === query[queryIndex]) {
      queryIndex += 1
    }
  }

  return queryIndex === query.length
}

const hasGlobalSearchTypoCandidate = (
  entry: GlobalSearchIndexEntry,
  normalizedQuery: string,
): boolean => {
  if (normalizedQuery.length < GLOBAL_SEARCH_TYPO_MIN_QUERY_LENGTH) {
    return false
  }

  const typoMaxDistance =
    normalizedQuery.length >= 8
      ? GLOBAL_SEARCH_TYPO_MAX_DISTANCE_LONG
      : GLOBAL_SEARCH_TYPO_MAX_DISTANCE_SHORT

  return entry.fuzzyWords.some((word) => {
    if (Math.abs(word.length - normalizedQuery.length) > typoMaxDistance) {
      return false
    }

    return (
      getBoundedDamerauLevenshteinDistance(normalizedQuery, word, typoMaxDistance) <=
      typoMaxDistance
    )
  })
}

const getGlobalSearchLimitedFuzzyCandidateRank = (
  entry: GlobalSearchIndexEntry,
  queryContext: GlobalSearchQueryContext,
): number => {
  const { normalizedQuery, tokens } = queryContext
  if (!normalizedQuery) return -1

  if (entry.searchableText === normalizedQuery) return 5
  if (entry.searchableText.startsWith(normalizedQuery)) return 4
  if (entry.searchableText.includes(normalizedQuery)) return 3
  if (entry.fuzzyAcronym === normalizedQuery || entry.fuzzyAcronym.startsWith(normalizedQuery)) {
    return 3
  }
  if (entry.fuzzyAcronym.includes(normalizedQuery)) return 2

  if (tokens.some((token) => entry.searchableText.startsWith(token))) {
    return 2
  }

  if (tokens.some((token) => entry.searchableText.includes(token))) {
    return 1
  }

  if (
    normalizedQuery.length >= 2 &&
    entry.fuzzyAcronym &&
    isGlobalSearchSubsequence(normalizedQuery, entry.fuzzyAcronym)
  ) {
    return 2
  }

  if (hasGlobalSearchTypoCandidate(entry, normalizedQuery)) {
    return 2
  }

  if (
    normalizedQuery.length >= 3 &&
    isGlobalSearchSubsequence(normalizedQuery, entry.searchableText)
  ) {
    return 0
  }

  return -1
}

const getGlobalSearchFuzzyCandidates = (
  unmatchedEntries: GlobalSearchIndexEntry[],
  allEntryCount: number,
  queryContext: GlobalSearchQueryContext,
): GlobalSearchIndexEntry[] => {
  if (allEntryCount <= GLOBAL_SEARCH_FUZZY_FULL_SCAN_LIMIT) {
    return unmatchedEntries
  }

  const rankedCandidates = unmatchedEntries
    .map((entry) => ({
      entry,
      rank: getGlobalSearchLimitedFuzzyCandidateRank(entry, queryContext),
    }))
    .filter(({ rank }) => rank >= 0)
    .sort((left, right) => {
      if (right.rank !== left.rank) return right.rank - left.rank
      return left.entry.index - right.entry.index
    })
    .slice(0, GLOBAL_SEARCH_FUZZY_CANDIDATE_LIMIT)
    .map(({ entry }) => entry)

  return rankedCandidates.length > 0
    ? rankedCandidates
    : unmatchedEntries.slice(0, GLOBAL_SEARCH_FUZZY_CANDIDATE_LIMIT)
}

const withGlobalSearchScoreBoost = (
  scoreMeta: GlobalSearchScoreResult,
  scoreBoost: number | undefined,
): GlobalSearchScoreResult => {
  if (!scoreBoost) return scoreMeta

  return {
    ...scoreMeta,
    score: scoreMeta.score + scoreBoost,
  }
}

const scoreGlobalSearchIndexEntries = (
  entries: GlobalSearchIndexEntry[],
  queryContext: GlobalSearchQueryContext,
): GlobalSearchResultItem[] => {
  const scoredItems: Array<{
    item: GlobalSearchResultItem
    scoreMeta: GlobalSearchScoreResult
    index: number
    recency?: number
  }> = []
  const fuzzyFallbackCandidates: GlobalSearchIndexEntry[] = []

  entries.forEach((entry) => {
    const scoreMeta = getGlobalSearchScore({
      normalizedQuery: queryContext.normalizedQuery,
      tokens: queryContext.tokens,
      index: entry.index,
      enableFuzzySearch: false,
      fields: entry.fields,
    })

    if (scoreMeta) {
      const boostedScoreMeta = withGlobalSearchScoreBoost(scoreMeta, entry.scoreBoost)
      scoredItems.push({
        item: entry.createItem(boostedScoreMeta, queryContext),
        scoreMeta: boostedScoreMeta,
        index: entry.index,
        recency: entry.recency,
      })
      return
    }

    if (queryContext.enableFuzzySearch && queryContext.normalizedQuery) {
      fuzzyFallbackCandidates.push(entry)
    }
  })

  if (queryContext.enableFuzzySearch && queryContext.normalizedQuery) {
    getGlobalSearchFuzzyCandidates(fuzzyFallbackCandidates, entries.length, queryContext).forEach(
      (entry) => {
        const scoreMeta = getGlobalSearchScore({
          normalizedQuery: queryContext.normalizedQuery,
          tokens: queryContext.tokens,
          index: entry.index,
          enableFuzzySearch: true,
          fields: entry.fields,
        })

        if (!scoreMeta) return

        const boostedScoreMeta = withGlobalSearchScoreBoost(scoreMeta, entry.scoreBoost)
        scoredItems.push({
          item: entry.createItem(boostedScoreMeta, queryContext),
          scoreMeta: boostedScoreMeta,
          index: entry.index,
          recency: entry.recency,
        })
      },
    )
  }

  return scoredItems.sort(compareGlobalSearchRankedItems).map(({ item }) => item)
}

export const useGlobalSearchData = ({
  activeGlobalSearchPlainQuery,
  enableFuzzySearch,
  activeGlobalSearchSyntaxFilters,
  settingsSearchResults,
  resolveSettingSearchTitle,
  getSettingsBreadcrumb,
  conversationManager,
  conversationsSnapshot,
  foldersSnapshot,
  tagsSnapshot,
  promptsSnapshot,
  outlineManager,
  outlineSearchVersion,
  getLocalizedText,
  resolveShortcutLabel,
  passThroughModifierLabel,
  activeGlobalSearchCategory,
  expandedGlobalSearchCategories,
  allCategoryItemLimit,
}: UseGlobalSearchDataParams) => {
  const trimmedGlobalSearchPlainQuery = activeGlobalSearchPlainQuery.trimStart()
  const isTipsMode =
    trimmedGlobalSearchPlainQuery.startsWith("tip:") || activeGlobalSearchCategory === "tips"

  const tipsGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    if (!isTipsMode) {
      return []
    }
    const tipsQuery = trimmedGlobalSearchPlainQuery.startsWith("tip:")
      ? trimmedGlobalSearchPlainQuery.slice(4).trim().toLowerCase()
      : trimmedGlobalSearchPlainQuery.trim().toLowerCase()
    const tipsLabel = getLocalizedText({ key: "featureTipsCategory", fallback: "Feature Tips" })
    const shortcutNotConfiguredLabel = getLocalizedText({
      key: "featureTipShortcutNotConfigured",
      fallback: "Shortcut not configured",
    })

    const buildFeatureTipText = (
      tipId: string,
      field: "title" | "desc" | "path",
      shortcutLabels: string[],
    ) =>
      t(`featureTip-${tipId}-${field}`, {
        modifier: passThroughModifierLabel,
        shortcut:
          shortcutLabels.length > 0 ? shortcutLabels.join(" / ") : shortcutNotConfiguredLabel,
      })

    return FEATURE_TIPS.map((tip) => {
      const shortcutLabels =
        tip.shortcutIds
          ?.map((id) => resolveShortcutLabel(id))
          .filter((label): label is string => Boolean(label)) ?? []

      const title = buildFeatureTipText(tip.id, "title", shortcutLabels)
      const desc = buildFeatureTipText(tip.id, "desc", shortcutLabels)
      const path = buildFeatureTipText(tip.id, "path", shortcutLabels)
      const shortcutText = shortcutLabels.join(" / ")
      const snippet = shortcutText ? `${desc}  [${shortcutText}]` : desc

      return {
        id: `tips:${tip.id}`,
        title,
        breadcrumb: `${tipsLabel} / ${path}`,
        snippet,
        category: "tips" as const,
        tipId: tip.id,
        tipHighlightTarget: tip.highlightTarget,
        tipActionText: path,
        tipShortcutIds: tip.shortcutIds,
      }
    }).filter((tipItem) => {
      if (!tipsQuery) {
        return true
      }

      return [tipItem.title, tipItem.snippet, tipItem.tipActionText]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(tipsQuery))
    })
  }, [
    getLocalizedText,
    isTipsMode,
    passThroughModifierLabel,
    resolveShortcutLabel,
    trimmedGlobalSearchPlainQuery,
  ])

  const globalSearchQueryContext = useMemo<GlobalSearchQueryContext>(
    () => ({
      normalizedQuery: normalizeGlobalSearchValue(activeGlobalSearchPlainQuery),
      tokens: toGlobalSearchTokens(activeGlobalSearchPlainQuery),
      enableFuzzySearch,
    }),
    [activeGlobalSearchPlainQuery, enableFuzzySearch],
  )

  const settingsGlobalSearchIndex = useMemo<GlobalSearchIndexEntry[]>(() => {
    if (isTipsMode) {
      return []
    }

    return settingsSearchResults.map((item, index) => {
      const title = resolveSettingSearchTitle(item)
      const breadcrumb = getSettingsBreadcrumb(item.settingId)
      const fields: GlobalSearchScoreField[] = [
        {
          value: normalizeGlobalSearchValue(title),
          exact: 220,
          prefix: 140,
          includes: 100,
          tokenPrefix: 24,
          tokenIncludes: 12,
          matchReason: "title",
          highlightField: "title",
        },
        {
          value: normalizeGlobalSearchValue((item.keywords || []).join(" ")),
          exact: 0,
          prefix: 0,
          includes: 68,
          tokenPrefix: 0,
          tokenIncludes: 8,
          matchReason: "keyword",
        },
        {
          value: normalizeGlobalSearchValue(item.settingId),
          exact: 0,
          prefix: 0,
          includes: 48,
          tokenPrefix: 0,
          tokenIncludes: 6,
          matchReason: "id",
          highlightField: "code",
        },
        {
          value: normalizeGlobalSearchValue(
            (GLOBAL_SEARCH_SETTING_ALIAS_MAP[item.settingId] || []).join(" "),
          ),
          exact: 0,
          prefix: 0,
          includes: 44,
          tokenPrefix: 0,
          tokenIncludes: 6,
          matchReason: "alias",
        },
      ]

      return createGlobalSearchIndexEntry({
        index,
        fields,
        createItem: (scoreMeta) => ({
          id: `settings:${item.settingId}`,
          title,
          breadcrumb,
          code: item.settingId,
          category: "settings" as const,
          settingId: item.settingId,
          matchReasons: scoreMeta.matchReasons,
          fuzzyMatch: scoreMeta.fuzzyMatch,
        }),
      })
    })
  }, [getSettingsBreadcrumb, isTipsMode, resolveSettingSearchTitle, settingsSearchResults])

  const settingsGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    if (isTipsMode) {
      return []
    }

    return scoreGlobalSearchIndexEntries(settingsGlobalSearchIndex, globalSearchQueryContext)
  }, [globalSearchQueryContext, isTipsMode, settingsGlobalSearchIndex])

  const conversationGlobalSearchIndex = useMemo<GlobalSearchIndexEntry[]>(() => {
    if (isTipsMode || !conversationManager) {
      return []
    }

    void conversationsSnapshot
    void foldersSnapshot
    void tagsSnapshot

    const conversations = conversationManager.getConversations()
    const folders = conversationManager.getFolders()
    const tags = conversationManager.getTags()

    const folderMap = new Map(folders.map((folder) => [folder.id, folder]))
    const tagMap = new Map(tags.map((tag) => [tag.id, tag]))

    const untitledConversation = getLocalizedText({
      key: "untitledConversation",
      fallback: "Untitled conversation",
    })

    return conversations.map((conversation, index) => {
      const title = conversation.title?.trim() || untitledConversation
      const folder = folderMap.get(conversation.folderId)
      const folderLabel = folder
        ? `${folder.icon ? `${folder.icon} ` : ""}${getFolderDisplayName(folder)}`.trim()
        : conversation.folderId
      const tagBadges = (conversation.tagIds || [])
        .map((tagId) => {
          const tag = tagMap.get(tagId)
          if (!tag) return null
          return {
            id: tag.id,
            name: tag.name,
            color: tag.color,
          }
        })
        .filter((tag): tag is GlobalSearchTagBadge => Boolean(tag))

      const fields: GlobalSearchScoreField[] = [
        {
          value: normalizeGlobalSearchValue(title),
          exact: 220,
          prefix: 140,
          includes: 100,
          tokenPrefix: 24,
          tokenIncludes: 12,
          matchReason: "title",
          highlightField: "title",
        },
        {
          value: normalizeGlobalSearchValue(folderLabel),
          exact: 0,
          prefix: 0,
          includes: 72,
          tokenPrefix: 0,
          tokenIncludes: 8,
          matchReason: "folder",
          highlightField: "breadcrumb",
        },
        {
          value: normalizeGlobalSearchValue(tagBadges.map((tag) => tag.name).join(" ")),
          exact: 0,
          prefix: 0,
          includes: 64,
          tokenPrefix: 0,
          tokenIncludes: 8,
          matchReason: "tag",
        },
      ]

      return createGlobalSearchIndexEntry({
        index,
        fields,
        recency: conversation.updatedAt || 0,
        scoreBoost: conversation.pinned ? 6 : 0,
        createItem: (scoreMeta) => ({
          id: `conversations:${conversation.id}`,
          title,
          breadcrumb: folderLabel,
          category: "conversations" as const,
          conversationId: conversation.id,
          conversationUrl: conversation.url,
          tagBadges,
          folderName: folderLabel,
          tagNames: tagBadges.map((tag) => tag.name),
          isPinned: Boolean(conversation.pinned),
          searchTimestamp: conversation.updatedAt || 0,
          matchReasons: scoreMeta.matchReasons,
          fuzzyMatch: scoreMeta.fuzzyMatch,
        }),
      })
    })
  }, [
    conversationManager,
    conversationsSnapshot,
    foldersSnapshot,
    tagsSnapshot,
    getLocalizedText,
    isTipsMode,
  ])

  const conversationGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    if (isTipsMode) {
      return []
    }

    return scoreGlobalSearchIndexEntries(conversationGlobalSearchIndex, globalSearchQueryContext)
  }, [conversationGlobalSearchIndex, globalSearchQueryContext, isTipsMode])

  const promptsGlobalSearchIndex = useMemo<GlobalSearchIndexEntry[]>(() => {
    if (isTipsMode) {
      return []
    }

    const promptsLabel = getLocalizedText({
      key: "globalSearchCategoryPrompts",
      fallback: "Prompts",
    })
    const uncategorizedLabel = getLocalizedText({
      key: "uncategorized",
      fallback: "Uncategorized",
    })

    return promptsSnapshot.map((prompt, index) => {
      const title =
        prompt.title?.trim() ||
        prompt.content?.trim().split("\n")[0] ||
        `${promptsLabel} #${index + 1}`
      const content = prompt.content?.trim() || ""
      const categoryLabel = prompt.category?.trim() || uncategorizedLabel
      const breadcrumb = `${promptsLabel} / ${categoryLabel}`

      const fields: GlobalSearchScoreField[] = [
        {
          value: normalizeGlobalSearchValue(title),
          exact: 220,
          prefix: 140,
          includes: 100,
          tokenPrefix: 24,
          tokenIncludes: 12,
          matchReason: "title",
          highlightField: "title",
        },
        {
          value: normalizeGlobalSearchValue(categoryLabel),
          exact: 0,
          prefix: 0,
          includes: 70,
          tokenPrefix: 0,
          tokenIncludes: 8,
          matchReason: "category",
          highlightField: "breadcrumb",
        },
        {
          value: normalizeGlobalSearchValue(content),
          exact: 0,
          prefix: 0,
          includes: 60,
          tokenPrefix: 0,
          tokenIncludes: 6,
          matchReason: "content",
          highlightField: "snippet",
        },
        {
          value: normalizeGlobalSearchValue(prompt.id),
          exact: 0,
          prefix: 0,
          includes: 20,
          tokenPrefix: 0,
          tokenIncludes: 4,
          matchReason: "id",
          highlightField: "code",
        },
      ]

      return createGlobalSearchIndexEntry({
        index,
        fields,
        recency: prompt.lastUsedAt || 0,
        scoreBoost: prompt.pinned ? 6 : 0,
        createItem: (scoreMeta, queryContext) => ({
          id: `prompts:${prompt.id}`,
          title,
          breadcrumb,
          snippet: scoreMeta.matchReasons.includes("content")
            ? buildGlobalSearchSnippet({
                content,
                normalizedQuery: queryContext.normalizedQuery,
                tokens: queryContext.tokens,
              })
            : "",
          category: "prompts" as const,
          promptId: prompt.id,
          promptContent: prompt.content,
          folderName: categoryLabel,
          isPinned: Boolean(prompt.pinned),
          searchTimestamp: prompt.lastUsedAt || 0,
          matchReasons: scoreMeta.matchReasons,
          fuzzyMatch: scoreMeta.fuzzyMatch,
        }),
      })
    })
  }, [getLocalizedText, isTipsMode, promptsSnapshot])

  const promptsGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    if (isTipsMode) {
      return []
    }

    return scoreGlobalSearchIndexEntries(promptsGlobalSearchIndex, globalSearchQueryContext)
  }, [globalSearchQueryContext, isTipsMode, promptsGlobalSearchIndex])

  const outlineGlobalSearchIndex = useMemo<GlobalSearchIndexEntry[]>(() => {
    if (isTipsMode || !outlineManager) {
      return []
    }

    void outlineSearchVersion

    const outlineNodes = flattenOutlineNodes(outlineManager.getTree())
    const outlineLabel = getLocalizedText({
      key: "globalSearchCategoryOutline",
      fallback: "Outline",
    })
    const outlineQueryLabel = getLocalizedText({
      key: "outlineUserQueryRoleLabel",
      fallback: "User queries",
    })
    const outlineReplyLabel = getLocalizedText({
      key: "globalSearchOutlineReplies",
      fallback: "Replies",
    })

    return outlineNodes
      .map((node, index): GlobalSearchIndexEntry | null => {
        const title = node.text?.trim()
        if (!title) {
          return null
        }

        const code = node.isUserQuery ? `Q${node.queryIndex ?? index + 1}` : `H${node.level}`
        const roleLabel = node.isUserQuery ? outlineQueryLabel : outlineReplyLabel
        const breadcrumb = node.isUserQuery
          ? `${outlineLabel} / ${roleLabel}`
          : `${outlineLabel} / ${roleLabel} / H${node.level}`

        const fields: GlobalSearchScoreField[] = [
          {
            value: normalizeGlobalSearchValue(title),
            exact: 200,
            prefix: 120,
            includes: 90,
            tokenPrefix: 16,
            tokenIncludes: 10,
            matchReason: "title",
            highlightField: "title",
          },
          {
            value: normalizeGlobalSearchValue(
              node.isUserQuery ? roleLabel : `${roleLabel} h${node.level}`,
            ),
            exact: 0,
            prefix: 0,
            includes: 48,
            tokenPrefix: 0,
            tokenIncludes: 6,
            matchReason: "type",
            highlightField: "breadcrumb",
          },
          {
            value: normalizeGlobalSearchValue(code),
            exact: 0,
            prefix: 0,
            includes: 36,
            tokenPrefix: 0,
            tokenIncludes: 4,
            matchReason: "code",
            highlightField: "code",
          },
        ]

        return createGlobalSearchIndexEntry({
          index,
          fields,
          scoreBoost: node.isBookmarked ? 4 : 0,
          createItem: (scoreMeta) => ({
            id: `outline:${node.index}`,
            title,
            breadcrumb,
            code,
            category: "outline" as const,
            matchReasons: scoreMeta.matchReasons,
            fuzzyMatch: scoreMeta.fuzzyMatch,
            outlineTarget: {
              index: node.index,
              level: node.level,
              text: title,
              isUserQuery: Boolean(node.isUserQuery),
              id: node.id,
              navigationId: node.navigationId,
              queryIndex: node.queryIndex,
              isGhost: Boolean(node.isGhost),
              scrollTop: node.scrollTop,
            },
          }),
        })
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  }, [getLocalizedText, isTipsMode, outlineManager, outlineSearchVersion])

  const outlineGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    if (isTipsMode) {
      return []
    }

    return scoreGlobalSearchIndexEntries(outlineGlobalSearchIndex, globalSearchQueryContext)
  }, [globalSearchQueryContext, isTipsMode, outlineGlobalSearchIndex])

  const normalizedGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(
    () => [
      ...tipsGlobalSearchResults,
      ...settingsGlobalSearchResults,
      ...conversationGlobalSearchResults,
      ...outlineGlobalSearchResults,
      ...promptsGlobalSearchResults,
    ],
    [
      tipsGlobalSearchResults,
      conversationGlobalSearchResults,
      outlineGlobalSearchResults,
      promptsGlobalSearchResults,
      settingsGlobalSearchResults,
    ],
  )

  const filteredGlobalSearchResults = useMemo(
    () =>
      normalizedGlobalSearchResults.filter((item) =>
        matchGlobalSearchSyntaxFilters(item, activeGlobalSearchSyntaxFilters),
      ),
    [activeGlobalSearchSyntaxFilters, normalizedGlobalSearchResults],
  )

  const globalSearchResultCounts = useMemo(() => {
    const counts: Record<GlobalSearchCategoryId, number> = {
      all: 0,
      outline: 0,
      conversations: 0,
      prompts: 0,
      settings: 0,
      tips: 0,
    }

    filteredGlobalSearchResults.forEach((item) => {
      counts[item.category] += 1
      counts.all += 1
    })

    return counts
  }, [filteredGlobalSearchResults])

  const groupedGlobalSearchResults = useMemo<GlobalSearchGroupedResult[]>(() => {
    if (activeGlobalSearchCategory !== "all") {
      return []
    }

    return ORDERED_GLOBAL_SEARCH_CATEGORIES.map((category) => {
      const categoryItems = filteredGlobalSearchResults.filter((item) => item.category === category)
      const isExpanded = Boolean(expandedGlobalSearchCategories[category])
      const visibleCount = isExpanded ? categoryItems.length : allCategoryItemLimit
      const items = categoryItems.slice(0, visibleCount)
      const remainingCount = Math.max(0, categoryItems.length - items.length)

      return {
        category,
        items,
        totalCount: categoryItems.length,
        hasMore: remainingCount > 0,
        isExpanded,
        remainingCount,
      }
    }).filter((group) => group.items.length > 0)
  }, [
    activeGlobalSearchCategory,
    allCategoryItemLimit,
    expandedGlobalSearchCategories,
    filteredGlobalSearchResults,
  ])

  const visibleGlobalSearchResults = useMemo(() => {
    if (activeGlobalSearchCategory !== "all") {
      return filteredGlobalSearchResults.filter(
        (item) => item.category === activeGlobalSearchCategory,
      )
    }

    return groupedGlobalSearchResults.flatMap((group) => group.items)
  }, [activeGlobalSearchCategory, filteredGlobalSearchResults, groupedGlobalSearchResults])

  return {
    filteredGlobalSearchResults,
    globalSearchResultCounts,
    groupedGlobalSearchResults,
    visibleGlobalSearchResults,
  }
}
