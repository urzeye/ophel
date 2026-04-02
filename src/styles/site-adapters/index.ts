import { SITE_IDS } from "~constants/defaults"
import { geminiNativeThemeCss } from "./gemini"
import { chatgptNativeThemeCss } from "./chatgpt"
import { aistudioNativeThemeCss } from "./aistudio"
import { grokNativeThemeCss } from "./grok"
import { claudeNativeThemeCss } from "./claude"
import { doubaoNativeThemeCss } from "./doubao"

/**
 * 集中管理各原生站点的 CSS 主题变量映射。
 * 格式：[SITE_ID]: cssString
 */
export const siteNativeThemeAdapters: Record<string, string> = {
  [SITE_IDS.GEMINI]: geminiNativeThemeCss,
  [SITE_IDS.CHATGPT]: chatgptNativeThemeCss,
  [SITE_IDS.AISTUDIO]: aistudioNativeThemeCss,
  [SITE_IDS.GROK]: grokNativeThemeCss,
  [SITE_IDS.CLAUDE]: claudeNativeThemeCss,
  doubao: doubaoNativeThemeCss, // 临时使用字符串字面量或等待 SITE_IDS 更新
}
