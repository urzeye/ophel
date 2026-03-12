import { useMemo } from "react"
import fuzzysort from "fuzzysort"

import { SETTING_ID_ALIASES, type SettingsSearchItem } from "~constants"
import type { ConversationManager } from "~core/conversation-manager"
import type { OutlineManager, OutlineNode } from "~core/outline-manager"
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
  activeGlobalSearchCategory: GlobalSearchCategoryId
  expandedGlobalSearchCategories: Partial<Record<GlobalSearchResultCategory, boolean>>
  allCategoryItemLimit: number
}

const ORDERED_GLOBAL_SEARCH_CATEGORIES: GlobalSearchResultCategory[] = [
  "outline",
  "conversations",
  "prompts",
  "settings",
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
  activeGlobalSearchCategory,
  expandedGlobalSearchCategories,
  allCategoryItemLimit,
}: UseGlobalSearchDataParams) => {
  const settingsGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    const normalizedQuery = normalizeGlobalSearchValue(activeGlobalSearchPlainQuery)
    const tokens = toGlobalSearchTokens(activeGlobalSearchPlainQuery)

    const scoredItems = settingsSearchResults
      .map((item, index) => {
        const title = resolveSettingSearchTitle(item)
        const normalizedTitle = normalizeGlobalSearchValue(title)
        const normalizedKeywords = normalizeGlobalSearchValue((item.keywords || []).join(" "))
        const normalizedSettingId = normalizeGlobalSearchValue(item.settingId)
        const normalizedAliasKeywords = normalizeGlobalSearchValue(
          (GLOBAL_SEARCH_SETTING_ALIAS_MAP[item.settingId] || []).join(" "),
        )
        const scoreMeta = getGlobalSearchScore({
          normalizedQuery,
          tokens,
          index,
          enableFuzzySearch,
          fields: [
            {
              value: normalizedTitle,
              exact: 220,
              prefix: 140,
              includes: 100,
              tokenPrefix: 24,
              tokenIncludes: 12,
              matchReason: "title",
              highlightField: "title",
            },
            {
              value: normalizedKeywords,
              exact: 0,
              prefix: 0,
              includes: 68,
              tokenPrefix: 0,
              tokenIncludes: 8,
              matchReason: "keyword",
            },
            {
              value: normalizedSettingId,
              exact: 0,
              prefix: 0,
              includes: 48,
              tokenPrefix: 0,
              tokenIncludes: 6,
              matchReason: "id",
              highlightField: "code",
            },
            {
              value: normalizedAliasKeywords,
              exact: 0,
              prefix: 0,
              includes: 44,
              tokenPrefix: 0,
              tokenIncludes: 6,
              matchReason: "alias",
            },
          ],
        })

        if (scoreMeta === null) {
          return null
        }

        return {
          item: {
            id: `settings:${item.settingId}`,
            title,
            breadcrumb: getSettingsBreadcrumb(item.settingId),
            code: item.settingId,
            category: "settings" as const,
            settingId: item.settingId,
            matchReasons: scoreMeta.matchReasons,
            fuzzyMatch: scoreMeta.fuzzyMatch,
          },
          scoreMeta,
          index,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort(compareGlobalSearchRankedItems)

    return scoredItems.map(({ item }) => item)
  }, [
    activeGlobalSearchPlainQuery,
    enableFuzzySearch,
    getSettingsBreadcrumb,
    resolveSettingSearchTitle,
    settingsSearchResults,
  ])

  const conversationGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    if (!conversationManager) {
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

    const normalizedQuery = normalizeGlobalSearchValue(activeGlobalSearchPlainQuery)
    const tokens = toGlobalSearchTokens(activeGlobalSearchPlainQuery)
    const untitledConversation = getLocalizedText({
      key: "untitledConversation",
      fallback: "Untitled conversation",
    })

    const scoredItems = conversations
      .map((conversation, index) => {
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

        const normalizedTitle = normalizeGlobalSearchValue(title)
        const normalizedFolder = normalizeGlobalSearchValue(folderLabel)
        const normalizedTags = normalizeGlobalSearchValue(
          tagBadges.map((tag) => tag.name).join(" "),
        )
        const scoreMeta = getGlobalSearchScore({
          normalizedQuery,
          tokens,
          index,
          enableFuzzySearch,
          fields: [
            {
              value: normalizedTitle,
              exact: 220,
              prefix: 140,
              includes: 100,
              tokenPrefix: 24,
              tokenIncludes: 12,
              matchReason: "title",
              highlightField: "title",
            },
            {
              value: normalizedFolder,
              exact: 0,
              prefix: 0,
              includes: 72,
              tokenPrefix: 0,
              tokenIncludes: 8,
              matchReason: "folder",
              highlightField: "breadcrumb",
            },
            {
              value: normalizedTags,
              exact: 0,
              prefix: 0,
              includes: 64,
              tokenPrefix: 0,
              tokenIncludes: 8,
              matchReason: "tag",
            },
          ],
        })

        if (scoreMeta === null) {
          return null
        }

        const finalScoreMeta = {
          ...scoreMeta,
          score: scoreMeta.score + (conversation.pinned ? 6 : 0),
        }

        return {
          item: {
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
            matchReasons: finalScoreMeta.matchReasons,
            fuzzyMatch: finalScoreMeta.fuzzyMatch,
          },
          scoreMeta: finalScoreMeta,
          index,
          recency: conversation.updatedAt || 0,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort(compareGlobalSearchRankedItems)

    return scoredItems.map(({ item }) => item)
  }, [
    conversationManager,
    conversationsSnapshot,
    foldersSnapshot,
    tagsSnapshot,
    getLocalizedText,
    activeGlobalSearchPlainQuery,
    enableFuzzySearch,
  ])

  const promptsGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    const normalizedQuery = normalizeGlobalSearchValue(activeGlobalSearchPlainQuery)
    const tokens = toGlobalSearchTokens(activeGlobalSearchPlainQuery)
    const promptsLabel = getLocalizedText({
      key: "globalSearchCategoryPrompts",
      fallback: "Prompts",
    })
    const uncategorizedLabel = getLocalizedText({
      key: "uncategorized",
      fallback: "Uncategorized",
    })

    const scoredItems = promptsSnapshot
      .map((prompt, index) => {
        const title =
          prompt.title?.trim() ||
          prompt.content?.trim().split("\n")[0] ||
          `${promptsLabel} #${index + 1}`
        const content = prompt.content?.trim() || ""
        const categoryLabel = prompt.category?.trim() || uncategorizedLabel
        const breadcrumb = `${promptsLabel} / ${categoryLabel}`

        const normalizedTitle = normalizeGlobalSearchValue(title)
        const normalizedContent = normalizeGlobalSearchValue(content)
        const normalizedCategory = normalizeGlobalSearchValue(categoryLabel)
        const normalizedPromptId = normalizeGlobalSearchValue(prompt.id)
        const scoreMeta = getGlobalSearchScore({
          normalizedQuery,
          tokens,
          index,
          enableFuzzySearch,
          fields: [
            {
              value: normalizedTitle,
              exact: 220,
              prefix: 140,
              includes: 100,
              tokenPrefix: 24,
              tokenIncludes: 12,
              matchReason: "title",
              highlightField: "title",
            },
            {
              value: normalizedCategory,
              exact: 0,
              prefix: 0,
              includes: 70,
              tokenPrefix: 0,
              tokenIncludes: 8,
              matchReason: "category",
              highlightField: "breadcrumb",
            },
            {
              value: normalizedContent,
              exact: 0,
              prefix: 0,
              includes: 60,
              tokenPrefix: 0,
              tokenIncludes: 6,
              matchReason: "content",
              highlightField: "snippet",
            },
            {
              value: normalizedPromptId,
              exact: 0,
              prefix: 0,
              includes: 20,
              tokenPrefix: 0,
              tokenIncludes: 4,
              matchReason: "id",
              highlightField: "code",
            },
          ],
        })

        if (scoreMeta === null) {
          return null
        }

        const finalScoreMeta = {
          ...scoreMeta,
          score: scoreMeta.score + (prompt.pinned ? 6 : 0),
        }

        const snippet = finalScoreMeta.matchReasons.includes("content")
          ? buildGlobalSearchSnippet({
              content,
              normalizedQuery,
              tokens,
            })
          : ""

        return {
          item: {
            id: `prompts:${prompt.id}`,
            title,
            breadcrumb,
            snippet,
            category: "prompts" as const,
            promptId: prompt.id,
            promptContent: prompt.content,
            folderName: categoryLabel,
            isPinned: Boolean(prompt.pinned),
            searchTimestamp: prompt.lastUsedAt || 0,
            matchReasons: finalScoreMeta.matchReasons,
            fuzzyMatch: finalScoreMeta.fuzzyMatch,
          },
          scoreMeta: finalScoreMeta,
          index,
          recency: prompt.lastUsedAt || 0,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort(compareGlobalSearchRankedItems)

    return scoredItems.map(({ item }) => item)
  }, [activeGlobalSearchPlainQuery, enableFuzzySearch, getLocalizedText, promptsSnapshot])

  const outlineGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(() => {
    if (!outlineManager) {
      return []
    }

    void outlineSearchVersion

    const outlineNodes = flattenOutlineNodes(outlineManager.getTree())
    const normalizedQuery = normalizeGlobalSearchValue(activeGlobalSearchPlainQuery)
    const tokens = toGlobalSearchTokens(activeGlobalSearchPlainQuery)
    const outlineLabel = getLocalizedText({
      key: "globalSearchCategoryOutline",
      fallback: "Outline",
    })
    const outlineQueryLabel = getLocalizedText({
      key: "outlineOnlyUserQueries",
      fallback: "Queries",
    })
    const outlineReplyLabel = getLocalizedText({
      key: "globalSearchOutlineReplies",
      fallback: "Replies",
    })

    const scoredItems = outlineNodes
      .map((node, index) => {
        const title = node.text?.trim()
        if (!title) {
          return null
        }

        const code = node.isUserQuery ? `Q${node.queryIndex ?? index + 1}` : `H${node.level}`
        const roleLabel = node.isUserQuery ? outlineQueryLabel : outlineReplyLabel
        const breadcrumb = node.isUserQuery
          ? `${outlineLabel} / ${roleLabel}`
          : `${outlineLabel} / ${roleLabel} / H${node.level}`

        const normalizedTitle = normalizeGlobalSearchValue(title)
        const normalizedType = normalizeGlobalSearchValue(
          node.isUserQuery ? roleLabel : `${roleLabel} h${node.level}`,
        )
        const normalizedCode = normalizeGlobalSearchValue(code)
        const scoreMeta = getGlobalSearchScore({
          normalizedQuery,
          tokens,
          index,
          enableFuzzySearch,
          fields: [
            {
              value: normalizedTitle,
              exact: 200,
              prefix: 120,
              includes: 90,
              tokenPrefix: 16,
              tokenIncludes: 10,
              matchReason: "title",
              highlightField: "title",
            },
            {
              value: normalizedType,
              exact: 0,
              prefix: 0,
              includes: 48,
              tokenPrefix: 0,
              tokenIncludes: 6,
              matchReason: "type",
              highlightField: "breadcrumb",
            },
            {
              value: normalizedCode,
              exact: 0,
              prefix: 0,
              includes: 36,
              tokenPrefix: 0,
              tokenIncludes: 4,
              matchReason: "code",
              highlightField: "code",
            },
          ],
        })

        if (scoreMeta === null) {
          return null
        }

        const finalScoreMeta = {
          ...scoreMeta,
          score: scoreMeta.score + (node.isBookmarked ? 4 : 0),
        }

        return {
          item: {
            id: `outline:${node.index}`,
            title,
            breadcrumb,
            code,
            category: "outline" as const,
            matchReasons: finalScoreMeta.matchReasons,
            fuzzyMatch: finalScoreMeta.fuzzyMatch,
            outlineTarget: {
              index: node.index,
              level: node.level,
              text: title,
              isUserQuery: Boolean(node.isUserQuery),
              queryIndex: node.queryIndex,
              isGhost: Boolean(node.isGhost),
              scrollTop: node.scrollTop,
            },
          },
          scoreMeta: finalScoreMeta,
          index,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort(compareGlobalSearchRankedItems)

    return scoredItems.map(({ item }) => item)
  }, [
    activeGlobalSearchPlainQuery,
    enableFuzzySearch,
    outlineManager,
    getLocalizedText,
    outlineSearchVersion,
  ])

  const normalizedGlobalSearchResults = useMemo<GlobalSearchResultItem[]>(
    () => [
      ...settingsGlobalSearchResults,
      ...conversationGlobalSearchResults,
      ...outlineGlobalSearchResults,
      ...promptsGlobalSearchResults,
    ],
    [
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
