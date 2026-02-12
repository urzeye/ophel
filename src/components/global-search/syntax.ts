export type GlobalSearchSyntaxOperator = "type" | "folder" | "tag" | "is" | "level" | "date"

export type GlobalSearchSyntaxDiagnosticCode = "unknownOperator" | "invalidValue" | "conflict"

export interface GlobalSearchSyntaxDiagnostic {
  id: string
  code: GlobalSearchSyntaxDiagnosticCode
  operator: string
  value?: string
  suggestion?: string
}

export interface GlobalSearchSyntaxFilter {
  id: string
  key: GlobalSearchSyntaxOperator
  value: string
  normalizedValue: string
}

export interface ParsedGlobalSearchQuery {
  rawQuery: string
  plainQuery: string
  filters: GlobalSearchSyntaxFilter[]
  diagnostics: GlobalSearchSyntaxDiagnostic[]
}

export interface GlobalSearchSyntaxMatchItem {
  category: string
  breadcrumb?: string
  folderName?: string
  tagNames?: string[]
  tagBadges?: Array<{ name: string }>
  isPinned?: boolean
  searchTimestamp?: number
  outlineTarget?: {
    level?: number
  }
}

export const GLOBAL_SEARCH_SYNTAX_OPERATORS: GlobalSearchSyntaxOperator[] = [
  "type",
  "folder",
  "tag",
  "is",
  "level",
  "date",
]

export const GLOBAL_SEARCH_TYPE_FILTER_VALUES = [
  "outline",
  "conversations",
  "prompts",
  "settings",
] as const

export const GLOBAL_SEARCH_IS_FILTER_VALUES = ["pinned", "unpinned"] as const

export const GLOBAL_SEARCH_LEVEL_FILTER_VALUES = ["0", "1", "2", "3", "4", "5", "6"] as const

export const GLOBAL_SEARCH_DATE_FILTER_SHORTCUT_VALUES = ["7d", "30d"] as const

export const GLOBAL_SEARCH_DAY_MS = 24 * 60 * 60 * 1000

export const normalizeGlobalSearchValue = (value: string): string => value.trim().toLowerCase()

export const toGlobalSearchTokens = (query: string): string[] =>
  normalizeGlobalSearchValue(query)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

const normalizeGlobalSearchRawToken = (rawToken: string): string => {
  if (!rawToken) {
    return ""
  }

  return rawToken
    .replace(/^"|"$/g, "")
    .replace(/\\([\\"\s:])/g, "$1")
    .trim()
}

export const tryParseGlobalSearchDateDays = (value: string): number | null => {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d{1,3})d$/)
  if (!match) {
    return null
  }

  const days = Number(match[1])
  if (!Number.isFinite(days) || days <= 0) {
    return null
  }

  return days
}

const shouldTreatGlobalSearchFilterAsConflict = (
  filter: GlobalSearchSyntaxFilter,
  existingFilters: GlobalSearchSyntaxFilter[],
): boolean => {
  const normalizedValue = filter.normalizedValue

  if (filter.key === "type") {
    return existingFilters.some(
      (existingFilter) =>
        existingFilter.key === "type" && existingFilter.normalizedValue !== normalizedValue,
    )
  }

  if (filter.key === "is") {
    return existingFilters.some(
      (existingFilter) =>
        existingFilter.key === "is" && existingFilter.normalizedValue !== normalizedValue,
    )
  }

  if (filter.key === "level") {
    return existingFilters.some(
      (existingFilter) =>
        existingFilter.key === "level" && existingFilter.normalizedValue !== normalizedValue,
    )
  }

  if (filter.key === "date") {
    return existingFilters.some(
      (existingFilter) =>
        existingFilter.key === "date" && existingFilter.normalizedValue !== normalizedValue,
    )
  }

  return false
}

const isValidGlobalSearchFilterValue = (
  operator: GlobalSearchSyntaxOperator,
  normalizedValue: string,
): boolean => {
  if (!normalizedValue) {
    return false
  }

  if (operator === "type") {
    return GLOBAL_SEARCH_TYPE_FILTER_VALUES.includes(
      normalizedValue as (typeof GLOBAL_SEARCH_TYPE_FILTER_VALUES)[number],
    )
  }

  if (operator === "is") {
    return GLOBAL_SEARCH_IS_FILTER_VALUES.includes(
      normalizedValue as (typeof GLOBAL_SEARCH_IS_FILTER_VALUES)[number],
    )
  }

  if (operator === "level") {
    return GLOBAL_SEARCH_LEVEL_FILTER_VALUES.includes(
      normalizedValue as (typeof GLOBAL_SEARCH_LEVEL_FILTER_VALUES)[number],
    )
  }

  if (operator === "date") {
    return tryParseGlobalSearchDateDays(normalizedValue) !== null
  }

  return true
}

const getGlobalSearchFilterValueSuggestion = (
  operator: GlobalSearchSyntaxOperator,
): string | undefined => {
  if (operator === "type") {
    return "outline | conversations | prompts | settings"
  }

  if (operator === "is") {
    return "pinned | unpinned"
  }

  if (operator === "level") {
    return "0 ~ 6"
  }

  if (operator === "date") {
    return "Nd (e.g. 7d, 30d)"
  }

  return undefined
}

const createGlobalSearchFilterId = (
  operator: GlobalSearchSyntaxOperator,
  normalizedValue: string,
  sequence: number,
): string => `${operator}:${normalizedValue}:${sequence}`

const getClosestGlobalSearchOperator = (operator: string): GlobalSearchSyntaxOperator | null => {
  const normalizedOperator = operator.trim().toLowerCase()
  if (!normalizedOperator) {
    return null
  }

  const prefixMatchedOperator = GLOBAL_SEARCH_SYNTAX_OPERATORS.find((candidate) =>
    candidate.startsWith(normalizedOperator),
  )
  if (prefixMatchedOperator) {
    return prefixMatchedOperator
  }

  const containsMatchedOperator = GLOBAL_SEARCH_SYNTAX_OPERATORS.find((candidate) =>
    normalizedOperator.startsWith(candidate),
  )
  if (containsMatchedOperator) {
    return containsMatchedOperator
  }

  return null
}

export const parseGlobalSearchQuery = (query: string): ParsedGlobalSearchQuery => {
  const pattern = /(^|\s)([a-z]+):((?:"(?:\\.|[^"])+")|(?:\\.|[^\s])+)/gi
  const filters: GlobalSearchSyntaxFilter[] = []
  const diagnostics: GlobalSearchSyntaxDiagnostic[] = []
  const consumedRanges: Array<{ start: number; end: number }> = []
  const seenFilterCounts: Partial<Record<GlobalSearchSyntaxOperator, number>> = {}

  let match = pattern.exec(query)
  while (match) {
    const rawOperator = (match[2] || "").toLowerCase()
    const rawToken = match[3] || ""
    const tokenStart = (match.index || 0) + (match[1]?.length || 0)
    const tokenEnd = tokenStart + `${rawOperator}:${rawToken}`.length
    const hasUnclosedQuote = rawToken.startsWith('"') !== rawToken.endsWith('"')
    const suggestionOperator = getClosestGlobalSearchOperator(rawOperator)
    const value = normalizeGlobalSearchRawToken(rawToken)
    const normalizedValue = normalizeGlobalSearchValue(value)

    if (!GLOBAL_SEARCH_SYNTAX_OPERATORS.includes(rawOperator as GlobalSearchSyntaxOperator)) {
      diagnostics.push({
        id: `unknown:${rawOperator}:${match.index || 0}`,
        code: "unknownOperator",
        operator: rawOperator,
        suggestion: suggestionOperator || undefined,
      })
      match = pattern.exec(query)
      continue
    }

    const operator = rawOperator as GlobalSearchSyntaxOperator

    if (hasUnclosedQuote) {
      diagnostics.push({
        id: `invalid:${operator}:quote:${match.index || 0}`,
        code: "invalidValue",
        operator,
        value: rawToken,
      })
      consumedRanges.push({ start: tokenStart, end: tokenEnd })
      match = pattern.exec(query)
      continue
    }

    if (!value) {
      diagnostics.push({
        id: `invalid:${operator}:empty:${match.index || 0}`,
        code: "invalidValue",
        operator,
      })
      consumedRanges.push({ start: tokenStart, end: tokenEnd })
      match = pattern.exec(query)
      continue
    }

    if (!isValidGlobalSearchFilterValue(operator, normalizedValue)) {
      diagnostics.push({
        id: `invalid:${operator}:${normalizedValue}:${match.index || 0}`,
        code: "invalidValue",
        operator,
        value,
        suggestion: getGlobalSearchFilterValueSuggestion(operator),
      })
      consumedRanges.push({ start: tokenStart, end: tokenEnd })
      match = pattern.exec(query)
      continue
    }

    const currentSequence = (seenFilterCounts[operator] || 0) + 1
    seenFilterCounts[operator] = currentSequence

    const nextFilter: GlobalSearchSyntaxFilter = {
      id: createGlobalSearchFilterId(operator, normalizedValue, currentSequence),
      key: operator,
      value,
      normalizedValue,
    }

    if (shouldTreatGlobalSearchFilterAsConflict(nextFilter, filters)) {
      diagnostics.push({
        id: `conflict:${operator}:${normalizedValue}:${match.index || 0}`,
        code: "conflict",
        operator,
        value,
      })
      consumedRanges.push({ start: tokenStart, end: tokenEnd })
      match = pattern.exec(query)
      continue
    }

    consumedRanges.push({ start: tokenStart, end: tokenEnd })
    filters.push(nextFilter)

    match = pattern.exec(query)
  }

  if (consumedRanges.length === 0) {
    return {
      rawQuery: query,
      plainQuery: query.trim(),
      filters,
      diagnostics,
    }
  }

  consumedRanges.sort((left, right) => left.start - right.start)

  let plainQuery = ""
  let cursor = 0
  consumedRanges.forEach((range) => {
    if (cursor < range.start) {
      plainQuery += `${query.slice(cursor, range.start)} `
    }
    cursor = range.end
  })

  if (cursor < query.length) {
    plainQuery += query.slice(cursor)
  }

  return {
    rawQuery: query,
    plainQuery: plainQuery.replace(/\s+/g, " ").trim(),
    filters,
    diagnostics,
  }
}

export const stringifyGlobalSearchQuery = ({
  plainQuery,
  filters,
}: {
  plainQuery: string
  filters: GlobalSearchSyntaxFilter[]
}): string => {
  const filterText = filters
    .map((filter) => {
      const escapedValue = filter.value.replace(/([\\"])/g, "\\$1")
      const needsQuote = /\s/.test(filter.value)
      const safeValue = needsQuote ? `"${escapedValue}"` : escapedValue
      return `${filter.key}:${safeValue}`
    })
    .join(" ")

  return `${plainQuery} ${filterText}`.replace(/\s+/g, " ").trim()
}

export const matchGlobalSearchSyntaxFilters = (
  item: GlobalSearchSyntaxMatchItem,
  filters: GlobalSearchSyntaxFilter[],
): boolean => {
  if (filters.length === 0) {
    return true
  }

  return filters.every((filter) => {
    const value = filter.normalizedValue

    if (filter.key === "type") {
      return item.category.toLowerCase().includes(value)
    }

    if (filter.key === "folder") {
      const folderValue = (item.folderName || item.breadcrumb || "").toLowerCase()
      return folderValue.includes(value)
    }

    if (filter.key === "tag") {
      const tags = item.tagNames || item.tagBadges?.map((tag) => tag.name) || []
      return tags.some((tagName) => tagName.toLowerCase().includes(value))
    }

    if (filter.key === "is") {
      if (value === "pinned") {
        return Boolean(item.isPinned)
      }
      if (value === "unpinned") {
        return !item.isPinned
      }
      return false
    }

    if (filter.key === "level") {
      if (item.category !== "outline") {
        return false
      }

      return String(item.outlineTarget?.level ?? "") === value
    }

    if (filter.key === "date") {
      if (item.category !== "conversations" && item.category !== "prompts") {
        return false
      }

      const days = tryParseGlobalSearchDateDays(value)
      if (days === null) {
        return false
      }

      const timestamp = item.searchTimestamp || 0
      if (timestamp <= 0) {
        return false
      }

      const now = Date.now()
      return now - timestamp <= days * GLOBAL_SEARCH_DAY_MS
    }

    return true
  })
}

export const getGlobalSearchTrailingTokenInfo = (
  inputValue: string,
): { token: string; start: number; end: number } | null => {
  const match = inputValue.match(/(^|\s)([^\s]*)$/)
  if (!match) {
    return null
  }

  const token = match[2] || ""
  const end = inputValue.length
  const start = end - token.length

  return {
    token,
    start,
    end,
  }
}
