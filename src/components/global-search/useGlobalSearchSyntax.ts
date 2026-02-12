import { useMemo } from "react"

import {
  GLOBAL_SEARCH_DATE_FILTER_SHORTCUT_VALUES,
  GLOBAL_SEARCH_LEVEL_FILTER_VALUES,
  GLOBAL_SEARCH_SYNTAX_OPERATORS,
  GLOBAL_SEARCH_TYPE_FILTER_VALUES,
  getGlobalSearchTrailingTokenInfo,
  type GlobalSearchSyntaxDiagnostic,
  type GlobalSearchSyntaxOperator,
} from "./syntax"
import type {
  GlobalSearchMatchReason,
  GlobalSearchResultItem,
  GlobalSearchSyntaxSuggestionItem,
} from "./types"

interface UseGlobalSearchSyntaxParams {
  getLocalizedText: (definition: { key: string; fallback: string }) => string
  activeGlobalSearchSyntaxFilters: Array<{ id: string; key: string; value: string }>
  filterChipMaxCount: number
  isGlobalSettingsSearchOpen: boolean
  settingsSearchInputValue: string
  filteredGlobalSearchResults: GlobalSearchResultItem[]
  suggestionLimit: number
}

export const useGlobalSearchSyntax = ({
  getLocalizedText,
  activeGlobalSearchSyntaxFilters,
  filterChipMaxCount,
  isGlobalSettingsSearchOpen,
  settingsSearchInputValue,
  filteredGlobalSearchResults,
  suggestionLimit,
}: UseGlobalSearchSyntaxParams) => {
  const globalSearchFilterChipLabelPrefixMap = useMemo(
    () => ({
      type: getLocalizedText({ key: "globalSearchSyntaxOperatorType", fallback: "Type" }),
      folder: getLocalizedText({ key: "globalSearchSyntaxOperatorFolder", fallback: "Folder" }),
      tag: getLocalizedText({ key: "globalSearchSyntaxOperatorTag", fallback: "Tag" }),
      is: getLocalizedText({ key: "globalSearchSyntaxOperatorIs", fallback: "State" }),
      level: getLocalizedText({ key: "globalSearchSyntaxOperatorLevel", fallback: "Level" }),
      date: getLocalizedText({ key: "globalSearchSyntaxOperatorDate", fallback: "Date" }),
    }),
    [getLocalizedText],
  )

  const globalSearchSuggestionOperatorLabels = useMemo(
    () => ({
      type: getLocalizedText({ key: "globalSearchSyntaxOperatorType", fallback: "Type" }),
      folder: getLocalizedText({ key: "globalSearchSyntaxOperatorFolder", fallback: "Folder" }),
      tag: getLocalizedText({ key: "globalSearchSyntaxOperatorTag", fallback: "Tag" }),
      is: getLocalizedText({ key: "globalSearchSyntaxOperatorIs", fallback: "State" }),
      level: getLocalizedText({ key: "globalSearchSyntaxOperatorLevel", fallback: "Level" }),
      date: getLocalizedText({ key: "globalSearchSyntaxOperatorDate", fallback: "Date" }),
    }),
    [getLocalizedText],
  )

  const globalSearchSuggestionLevelDescription = useMemo(
    () =>
      getLocalizedText({
        key: "globalSearchSyntaxSuggestionLevelDesc",
        fallback: "Filter outline level (0 = user query)",
      }),
    [getLocalizedText],
  )

  const globalSearchSuggestionDateDescription = useMemo(
    () =>
      getLocalizedText({
        key: "globalSearchSyntaxSuggestionDateDesc",
        fallback: "Filter by recent days (conversations and prompts only)",
      }),
    [getLocalizedText],
  )

  const globalSearchSuggestionOperatorDescriptions = useMemo(
    () => ({
      type: getLocalizedText({
        key: "globalSearchSyntaxSuggestionTypeDesc",
        fallback: "Filter by result type",
      }),
      folder: getLocalizedText({
        key: "globalSearchSyntaxSuggestionFolderDesc",
        fallback: "Filter by folder or category",
      }),
      tag: getLocalizedText({
        key: "globalSearchSyntaxSuggestionTagDesc",
        fallback: "Filter by tag name",
      }),
      is: getLocalizedText({
        key: "globalSearchSyntaxSuggestionIsDesc",
        fallback: "Filter by status",
      }),
      level: getLocalizedText({
        key: "globalSearchSyntaxSuggestionLevelDesc",
        fallback: "Filter outline level (0 = user query)",
      }),
      date: getLocalizedText({
        key: "globalSearchSyntaxSuggestionDateDesc",
        fallback: "Filter by recent days (conversations and prompts only)",
      }),
    }),
    [getLocalizedText],
  )

  const globalSearchSuggestionTypeDescriptions = useMemo(
    () => ({
      outline: getLocalizedText({ key: "globalSearchCategoryOutline", fallback: "Outline" }),
      conversations: getLocalizedText({
        key: "globalSearchCategoryConversations",
        fallback: "Conversations",
      }),
      prompts: getLocalizedText({ key: "globalSearchCategoryPrompts", fallback: "Prompts" }),
      settings: getLocalizedText({ key: "globalSearchCategorySettings", fallback: "Settings" }),
    }),
    [getLocalizedText],
  )

  const globalSearchSuggestionIsDescriptions = useMemo(
    () => ({
      pinned: getLocalizedText({ key: "globalSearchSyntaxPinned", fallback: "Pinned" }),
      unpinned: getLocalizedText({ key: "globalSearchSyntaxUnpinned", fallback: "Unpinned" }),
    }),
    [getLocalizedText],
  )

  const globalSearchSyntaxDiagnosticMessages = useMemo(
    () => ({
      unknownOperator: getLocalizedText({
        key: "globalSearchSyntaxDiagnosticUnknownOperator",
        fallback: "Unknown operator",
      }),
      invalidValue: getLocalizedText({
        key: "globalSearchSyntaxDiagnosticInvalidValue",
        fallback: "Invalid filter value",
      }),
      conflict: getLocalizedText({
        key: "globalSearchSyntaxDiagnosticConflict",
        fallback: "Conflicting filters removed",
      }),
    }),
    [getLocalizedText],
  )

  const globalSearchSyntaxHelpTitle = useMemo(
    () =>
      getLocalizedText({
        key: "globalSearchSyntaxHelpTitle",
        fallback: "Search syntax examples",
      }),
    [getLocalizedText],
  )

  const globalSearchSyntaxHelpDescription = useMemo(
    () =>
      getLocalizedText({
        key: "globalSearchSyntaxHelpDesc",
        fallback: "Click to insert. Keywords are English-only.",
      }),
    [getLocalizedText],
  )

  const globalSearchSyntaxHelpItems = useMemo<GlobalSearchSyntaxSuggestionItem[]>(
    () => [
      {
        id: "help:type:outline",
        token: "type:outline",
        label: "type:outline",
        description: globalSearchSuggestionTypeDescriptions.outline,
      },
      {
        id: "help:type:conversations",
        token: "type:conversations",
        label: "type:conversations",
        description: globalSearchSuggestionTypeDescriptions.conversations,
      },
      {
        id: "help:type:prompts",
        token: "type:prompts",
        label: "type:prompts",
        description: globalSearchSuggestionTypeDescriptions.prompts,
      },
      {
        id: "help:type:settings",
        token: "type:settings",
        label: "type:settings",
        description: globalSearchSuggestionTypeDescriptions.settings,
      },
      {
        id: "help:is:pinned",
        token: "is:pinned",
        label: "is:pinned",
        description: globalSearchSuggestionIsDescriptions.pinned,
      },
      {
        id: "help:is:unpinned",
        token: "is:unpinned",
        label: "is:unpinned",
        description: globalSearchSuggestionIsDescriptions.unpinned,
      },
      {
        id: "help:level:0",
        token: "level:0",
        label: "level:0",
        description: getLocalizedText({
          key: "globalSearchSyntaxSuggestionLevelQueryDesc",
          fallback: "Outline user query",
        }),
      },
      {
        id: "help:date:7d",
        token: "date:7d",
        label: "date:7d",
        description: globalSearchSuggestionDateDescription,
      },
      {
        id: "help:date:30d",
        token: "date:30d",
        label: "date:30d",
        description: globalSearchSuggestionDateDescription,
      },
      {
        id: "help:folder:inbox",
        token: "folder:inbox",
        label: "folder:inbox",
        description: globalSearchSuggestionOperatorDescriptions.folder,
      },
      {
        id: "help:tag:work",
        token: "tag:work",
        label: "tag:work",
        description: globalSearchSuggestionOperatorDescriptions.tag,
      },
    ],
    [
      getLocalizedText,
      globalSearchSuggestionDateDescription,
      globalSearchSuggestionIsDescriptions.pinned,
      globalSearchSuggestionIsDescriptions.unpinned,
      globalSearchSuggestionOperatorDescriptions.folder,
      globalSearchSuggestionOperatorDescriptions.tag,
      globalSearchSuggestionTypeDescriptions.conversations,
      globalSearchSuggestionTypeDescriptions.outline,
      globalSearchSuggestionTypeDescriptions.prompts,
      globalSearchSuggestionTypeDescriptions.settings,
    ],
  )

  const activeGlobalSearchFilterChips = useMemo(
    () =>
      activeGlobalSearchSyntaxFilters.slice(0, filterChipMaxCount).map((filter) => ({
        id: filter.id,
        key: filter.key,
        value: filter.value,
        label: `${
          globalSearchFilterChipLabelPrefixMap[
            filter.key as keyof typeof globalSearchFilterChipLabelPrefixMap
          ]
        }: ${filter.value}`,
      })),
    [activeGlobalSearchSyntaxFilters, filterChipMaxCount, globalSearchFilterChipLabelPrefixMap],
  )

  const hasOverflowGlobalSearchFilterChips =
    activeGlobalSearchSyntaxFilters.length > filterChipMaxCount

  const globalSearchSyntaxSuggestions = useMemo<GlobalSearchSyntaxSuggestionItem[]>(() => {
    if (!isGlobalSettingsSearchOpen) {
      return []
    }

    const trailingTokenInfo = getGlobalSearchTrailingTokenInfo(settingsSearchInputValue)
    const trailingToken = trailingTokenInfo?.token || ""
    const hasTrailingToken = trailingToken.length > 0
    const normalizedTrailingToken = trailingToken.toLowerCase()
    const trailingTokenOperatorMatch = trailingToken.match(/^([a-z]+):(.*)$/i)

    if (trailingTokenOperatorMatch) {
      const operator = trailingTokenOperatorMatch[1].toLowerCase() as GlobalSearchSyntaxOperator
      if (!GLOBAL_SEARCH_SYNTAX_OPERATORS.includes(operator)) {
        return []
      }

      const rawValue = trailingTokenOperatorMatch[2] || ""
      const normalizedRawValue = rawValue.toLowerCase()
      const suggestions: GlobalSearchSyntaxSuggestionItem[] = []
      const appendSuggestion = (candidate: GlobalSearchSyntaxSuggestionItem) => {
        if (suggestions.some((item) => item.id === candidate.id)) {
          return
        }
        suggestions.push(candidate)
      }

      if (operator === "type") {
        GLOBAL_SEARCH_TYPE_FILTER_VALUES.forEach((value) => {
          if (rawValue && !value.toLowerCase().startsWith(normalizedRawValue)) {
            return
          }

          appendSuggestion({
            id: `type:${value}`,
            token: `type:${value}`,
            label: `type:${value} · ${globalSearchSuggestionTypeDescriptions[value]}`,
            description: globalSearchSuggestionOperatorDescriptions.type,
          })
        })
      } else if (operator === "is") {
        const value = "pinned"
        if (!rawValue || value.startsWith(normalizedRawValue)) {
          appendSuggestion({
            id: "is:pinned",
            token: "is:pinned",
            label: `is:pinned · ${globalSearchSuggestionIsDescriptions.pinned}`,
            description: globalSearchSuggestionOperatorDescriptions.is,
          })
        }

        const unpinnedValue = "unpinned"
        if (!rawValue || unpinnedValue.startsWith(normalizedRawValue)) {
          appendSuggestion({
            id: "is:unpinned",
            token: "is:unpinned",
            label: `is:unpinned · ${globalSearchSuggestionIsDescriptions.unpinned}`,
            description: globalSearchSuggestionOperatorDescriptions.is,
          })
        }
      } else if (operator === "level") {
        GLOBAL_SEARCH_LEVEL_FILTER_VALUES.forEach((value) => {
          if (rawValue && !value.startsWith(normalizedRawValue)) {
            return
          }

          const isQueryLevel = value === "0"
          appendSuggestion({
            id: `level:${value}`,
            token: `level:${value}`,
            label: `level:${value}`,
            description: isQueryLevel
              ? getLocalizedText({
                  key: "globalSearchSyntaxSuggestionLevelQueryDesc",
                  fallback: "Outline user query",
                })
              : globalSearchSuggestionLevelDescription,
          })
        })
      } else if (operator === "date") {
        const dynamicDayMatch = normalizedRawValue.match(/^(\d{0,3})d?$/)
        if (dynamicDayMatch) {
          const dayValue = dynamicDayMatch[1]
          if (dayValue) {
            const dynamicToken = `${dayValue}d`
            const dynamicDays = Number(dayValue)
            if (dynamicDays > 0) {
              appendSuggestion({
                id: `date:${dynamicToken}`,
                token: `date:${dynamicToken}`,
                label: `date:${dynamicToken}`,
                description: globalSearchSuggestionDateDescription,
              })
            }
          }
        }

        GLOBAL_SEARCH_DATE_FILTER_SHORTCUT_VALUES.forEach((value) => {
          if (rawValue && !value.startsWith(normalizedRawValue)) {
            return
          }

          appendSuggestion({
            id: `date:${value}`,
            token: `date:${value}`,
            label: `date:${value}`,
            description: globalSearchSuggestionDateDescription,
          })
        })
      }

      if (operator === "folder") {
        const folderCandidates = new Map<string, string>()
        filteredGlobalSearchResults.forEach((item) => {
          const candidate = (item.folderName || "").trim()
          if (!candidate) {
            return
          }

          const normalizedCandidate = candidate.toLowerCase()
          if (rawValue && !normalizedCandidate.includes(normalizedRawValue)) {
            return
          }

          folderCandidates.set(normalizedCandidate, candidate)
        })

        Array.from(folderCandidates.values())
          .slice(0, suggestionLimit)
          .forEach((candidate) => {
            const needsQuote = /\s/.test(candidate)
            const filterToken = needsQuote ? `folder:"${candidate}"` : `folder:${candidate}`

            appendSuggestion({
              id: `folder:${candidate.toLowerCase()}`,
              token: filterToken,
              label: `folder:${candidate}`,
              description: globalSearchSuggestionOperatorDescriptions.folder,
            })
          })
      }

      if (operator === "tag") {
        const tagCandidates = new Map<string, string>()
        filteredGlobalSearchResults.forEach((item) => {
          const candidateTags = item.tagNames || item.tagBadges?.map((tag) => tag.name) || []
          candidateTags.forEach((tagName) => {
            const candidate = tagName.trim()
            if (!candidate) {
              return
            }

            const normalizedCandidate = candidate.toLowerCase()
            if (rawValue && !normalizedCandidate.includes(normalizedRawValue)) {
              return
            }

            tagCandidates.set(normalizedCandidate, candidate)
          })
        })

        Array.from(tagCandidates.values())
          .slice(0, suggestionLimit)
          .forEach((candidate) => {
            const needsQuote = /\s/.test(candidate)
            const filterToken = needsQuote ? `tag:"${candidate}"` : `tag:${candidate}`

            appendSuggestion({
              id: `tag:${candidate.toLowerCase()}`,
              token: filterToken,
              label: `tag:${candidate}`,
              description: globalSearchSuggestionOperatorDescriptions.tag,
            })
          })
      }

      return suggestions.slice(0, suggestionLimit)
    }

    const operatorSuggestions = GLOBAL_SEARCH_SYNTAX_OPERATORS.filter((operator) => {
      if (!hasTrailingToken) {
        return true
      }
      return operator.startsWith(normalizedTrailingToken)
    }).map((operator) => ({
      id: `operator:${operator}`,
      token: `${operator}:`,
      label: `${operator}: ${globalSearchSuggestionOperatorLabels[operator]}`,
      description: globalSearchSuggestionOperatorDescriptions[operator],
    }))

    return operatorSuggestions.slice(0, suggestionLimit)
  }, [
    filteredGlobalSearchResults,
    getLocalizedText,
    globalSearchSuggestionDateDescription,
    globalSearchSuggestionIsDescriptions,
    globalSearchSuggestionLevelDescription,
    globalSearchSuggestionOperatorDescriptions,
    globalSearchSuggestionOperatorLabels,
    globalSearchSuggestionTypeDescriptions,
    isGlobalSettingsSearchOpen,
    settingsSearchInputValue,
    suggestionLimit,
  ])

  const shouldShowGlobalSearchSyntaxSuggestions =
    globalSearchSyntaxSuggestions.length > 0 &&
    Boolean(getGlobalSearchTrailingTokenInfo(settingsSearchInputValue)?.token)

  return {
    activeGlobalSearchFilterChips,
    hasOverflowGlobalSearchFilterChips,
    globalSearchSyntaxDiagnosticMessages,
    globalSearchSyntaxHelpTitle,
    globalSearchSyntaxHelpDescription,
    globalSearchSyntaxHelpItems,
    globalSearchSyntaxSuggestions,
    shouldShowGlobalSearchSyntaxSuggestions,
  }
}
