const getGlobalSearchHighlightRanges = (
  value: string,
  tokens: string[],
): Array<{ start: number; end: number }> => {
  if (!value || tokens.length === 0) {
    return []
  }

  const normalizedValue = value.toLowerCase()
  const ranges: Array<{ start: number; end: number }> = []

  tokens.forEach((token) => {
    if (!token) return

    let fromIndex = 0
    while (fromIndex < normalizedValue.length) {
      const hitIndex = normalizedValue.indexOf(token, fromIndex)
      if (hitIndex < 0) {
        break
      }

      ranges.push({ start: hitIndex, end: hitIndex + token.length })
      fromIndex = hitIndex + token.length
    }
  })

  if (ranges.length === 0) {
    return []
  }

  ranges.sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start
    return left.end - right.end
  })

  const mergedRanges: Array<{ start: number; end: number }> = []
  ranges.forEach((range) => {
    const lastRange = mergedRanges[mergedRanges.length - 1]
    if (!lastRange || range.start > lastRange.end) {
      mergedRanges.push({ ...range })
      return
    }

    if (range.end > lastRange.end) {
      lastRange.end = range.end
    }
  })

  return mergedRanges
}

const getGlobalSearchHighlightRangesFromIndexes = (
  value: string,
  indexes?: number[],
): Array<{ start: number; end: number }> => {
  if (!value || !indexes || indexes.length === 0) {
    return []
  }

  const normalizedIndexes = Array.from(
    new Set(
      indexes
        .map((index) => Number(index))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < value.length),
    ),
  ).sort((left, right) => left - right)

  if (normalizedIndexes.length === 0) {
    return []
  }

  const ranges: Array<{ start: number; end: number }> = []
  let rangeStart = normalizedIndexes[0]
  let previousIndex = normalizedIndexes[0]

  for (let index = 1; index < normalizedIndexes.length; index += 1) {
    const currentIndex = normalizedIndexes[index]
    if (currentIndex === previousIndex + 1) {
      previousIndex = currentIndex
      continue
    }

    ranges.push({ start: rangeStart, end: previousIndex + 1 })
    rangeStart = currentIndex
    previousIndex = currentIndex
  }

  ranges.push({ start: rangeStart, end: previousIndex + 1 })
  return ranges
}

export type GlobalSearchHighlightMatchType = "none" | "exact" | "fuzzy"

export const splitGlobalSearchHighlightSegments = (
  value: string,
  tokens: string[],
  fuzzyIndexes?: number[],
): Array<{ text: string; matchType: GlobalSearchHighlightMatchType }> => {
  if (!value) {
    return []
  }

  const exactRanges = getGlobalSearchHighlightRanges(value, tokens)
  const fuzzyRanges = getGlobalSearchHighlightRangesFromIndexes(value, fuzzyIndexes)

  if (exactRanges.length === 0 && fuzzyRanges.length === 0) {
    return [{ text: value, matchType: "none" }]
  }

  const markers = new Array<GlobalSearchHighlightMatchType>(value.length).fill("none")

  fuzzyRanges.forEach((range) => {
    for (let index = range.start; index < range.end; index += 1) {
      markers[index] = "fuzzy"
    }
  })

  exactRanges.forEach((range) => {
    for (let index = range.start; index < range.end; index += 1) {
      markers[index] = "exact"
    }
  })

  const segments: Array<{ text: string; matchType: GlobalSearchHighlightMatchType }> = []
  let cursor = 0
  let currentMatchType = markers[0] || "none"

  for (let index = 1; index <= value.length; index += 1) {
    const nextMatchType = index < value.length ? markers[index] : null
    if (nextMatchType === currentMatchType) {
      continue
    }

    segments.push({
      text: value.slice(cursor, index),
      matchType: currentMatchType,
    })

    cursor = index
    currentMatchType = (nextMatchType || "none") as GlobalSearchHighlightMatchType
  }

  return segments.filter((segment) => segment.text.length > 0)
}
