import { SITE_IDS } from "~constants/defaults"
import { geminiNativeThemeCss } from "./gemini"
import { chatgptNativeThemeCss } from "./chatgpt"

/**
 * 集中管理各原生站点的 CSS 主题变量映射。
 * 格式：[SITE_ID]: cssString
 */
export const siteNativeThemeAdapters: Record<string, string> = {
  [SITE_IDS.GEMINI]: geminiNativeThemeCss,
  [SITE_IDS.CHATGPT]: chatgptNativeThemeCss,
}
