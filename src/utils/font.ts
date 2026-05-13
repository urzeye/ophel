/**
 * 限制本机 Inter 只处理拉丁等常用字符，避免 CJK/韩文误用 Inter 导致缺字。
 */
export const INTER_LOCAL_FONT_FACE = `@font-face {
  font-family: "Inter";
  src: local("Inter"), local("InterVariable");
  font-style: normal;
  font-weight: 100 900;
  unicode-range:
    U+0000-02FF, U+0304, U+0308, U+0329, U+0370-03FF, U+1D00-1DBF, U+1E00-1EFF,
    U+1F00-1FFF, U+0400-052F, U+1C80-1C88, U+2116, U+2DE0-2DFF, U+A640-A69F,
    U+1EA0-1EF9, U+20AB, U+2000-206F, U+20A0-20C0, U+20AC, U+2113, U+2122,
    U+2191, U+2193, U+2212, U+2215, U+2C60-2C7F, U+A720-A7FF, U+FEFF, U+FFFD;
}`

export type OphelRuntimePlatform = "macos" | "windows" | "other"

export const OPHEL_PLATFORM_FONT_CLASSES = [
  "gh-platform-macos",
  "gh-platform-windows",
  "gh-platform-other",
] as const

export const INTER_SYSTEM_FONT_FAMILY =
  '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Microsoft YaHei", "PingFang SC", "Hiragino Sans SC", "Apple SD Gothic Neo", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif'

export const INTER_MACOS_CJK_FONT_FAMILY =
  '"Inter", "Hiragino Sans SC", "PingFang SC", "Apple SD Gothic Neo", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Microsoft YaHei", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif'

export const OPHEL_FONT_FAMILY_CSS_VAR = `var(--gh-font-family, ${INTER_SYSTEM_FONT_FAMILY})`

export function getOphelRuntimePlatform(): OphelRuntimePlatform {
  if (typeof navigator === "undefined") return "other"

  const userAgentDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform
  const platformText = [navigator.platform, userAgentDataPlatform, navigator.userAgent]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (/mac|iphone|ipad|ipod/.test(platformText)) return "macos"
  if (/win/.test(platformText)) return "windows"
  return "other"
}

export function getPlatformFontFamily(platform = getOphelRuntimePlatform()): string {
  return platform === "macos" ? INTER_MACOS_CJK_FONT_FAMILY : INTER_SYSTEM_FONT_FAMILY
}

export function getOphelPlatformFontClassName(
  platform = getOphelRuntimePlatform(),
): (typeof OPHEL_PLATFORM_FONT_CLASSES)[number] {
  return `gh-platform-${platform}` as (typeof OPHEL_PLATFORM_FONT_CLASSES)[number]
}

export function applyOphelPlatformFontClass(element: Element): void {
  element.classList.remove(...OPHEL_PLATFORM_FONT_CLASSES)
  element.classList.add(getOphelPlatformFontClassName())
}

export const INTER_CJK_FONT_FAMILY = getPlatformFontFamily()
