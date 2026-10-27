/**
 * 彩色底上的文字颜色
 *
 * 标签颜色由用户任选，预置色里有不少偏亮（如卡其色、金色），固定白字对比度只有 1.3:1 左右。
 * 与 GitHub 标签同一判断：伽马空间加权亮度达到阈值用深色字，否则用白字。
 * 比“取 WCAG 对比度更高的一边”更符合直觉：红、蓝、紫等饱和色仍是白字，只有偏亮的颜色换深色字。
 */

const LIGHT_TEXT = "#ffffff"
const DARK_TEXT = "#111827"
const LIGHTNESS_THRESHOLD = 0.453

const HEX_COLOR_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** 无法解析的颜色（非 #RGB / #RRGGBB）保持原来的白字 */
export function getReadableTextColor(backgroundColor: string): string {
  const match = HEX_COLOR_PATTERN.exec(backgroundColor.trim())
  if (!match) return LIGHT_TEXT

  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((char) => char + char)
          .join("")
      : match[1]
  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
  const lightness = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255
  return lightness >= LIGHTNESS_THRESHOLD ? DARK_TEXT : LIGHT_TEXT
}
