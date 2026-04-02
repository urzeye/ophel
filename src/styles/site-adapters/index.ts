import { SITE_IDS } from "~constants/defaults"
import { geminiNativeThemeCss } from "./gemini"
import { chatgptNativeThemeCss } from "./chatgpt"
import { aistudioNativeThemeCss } from "./aistudio"
import { grokNativeThemeCss } from "./grok"
import { claudeNativeThemeCss } from "./claude"
import { doubaoNativeThemeCss } from "./doubao"
import { deepseekNativeThemeCss } from "./deepseek"

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
  [SITE_IDS.DOUBAO]: doubaoNativeThemeCss,
  [SITE_IDS.DEEPSEEK]: deepseekNativeThemeCss,
}
