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

/**
 * 格式化日期时间（中等日期 + 短时间），用于「上次检查」「上次同步」「备份时间」等状态展示
 * @param value - 时间戳、ISO 字符串或 Date；无法解析时原样返回，不吞掉异常值
 * @param locale - BCP 47 locale，调用方传入 getCurrentLocale()
 */
export function formatDateTime(value: number | string | Date, locale: string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date)
}
