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

export const splitGlobalSearchHighlightSegments = (
  value: string,
  tokens: string[],
): Array<{ text: string; highlighted: boolean }> => {
  if (!value) {
    return []
  }

  const ranges = getGlobalSearchHighlightRanges(value, tokens)
  if (ranges.length === 0) {
    return [{ text: value, highlighted: false }]
  }

  const segments: Array<{ text: string; highlighted: boolean }> = []
  let cursor = 0

  ranges.forEach((range) => {
    if (range.start > cursor) {
      segments.push({ text: value.slice(cursor, range.start), highlighted: false })
    }

    segments.push({ text: value.slice(range.start, range.end), highlighted: true })
    cursor = range.end
  })

  if (cursor < value.length) {
    segments.push({ text: value.slice(cursor), highlighted: false })
  }

  return segments.filter((segment) => segment.text.length > 0)
}
