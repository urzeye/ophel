/**
 * Format word count number based on locale
 * @param count - The number to format
 * @param locale - The locale string (e.g., "zh-CN", "en", "ja")
 * @returns Formatted string
 */
export function formatWordCount(count: number, locale: string): string {
  if (count < 1000) {
    return count.toString()
  }

  if (locale === "zh-CN" || locale === "zh-TW") {
    if (count >= 10000) {
      // 1.2w
      return (count / 10000).toFixed(1).replace(/\.0$/, "") + "w"
    }

    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k"
    }
  }

  if (count >= 1000) {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1).replace(/\.0$/, "") + "m"
    }
    return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k"
  }

  return count.toString()
}
