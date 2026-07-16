import geminiCanvasMainUrl from "url:../contents/gemini-canvas-main"
import geminiWatermarkMainUrl from "url:../contents/gemini-watermark-main"
import iframeScrollMainUrl from "url:../contents/iframe-scroll-main"
import monitorEntryUrl from "url:../contents/monitor-entry"
import scrollLockMainUrl from "url:../contents/scroll-lock-main"
import yuanbaoMonacoMainUrl from "url:../contents/yuanbao-monaco-main"

const getArtifactName = (url: string): string => url.split("/").pop()?.split("?")[0] || url

export const MAIN_WORLD_CONTENT_SCRIPTS: chrome.scripting.RegisteredContentScript[] = [
  {
    id: "srcContentsGeminiCanvasMain",
    js: [getArtifactName(geminiCanvasMainUrl)],
    matches: ["https://gemini.google.com/*"],
    world: "MAIN",
    runAt: "document_start",
    persistAcrossSessions: false,
  },
  {
    id: "srcContentsGeminiWatermarkMain",
    js: [getArtifactName(geminiWatermarkMainUrl)],
    matches: ["https://gemini.google.com/*"],
    world: "MAIN",
    runAt: "document_start",
    persistAcrossSessions: false,
  },
  {
    id: "srcContentsIframeScrollMain",
    js: [getArtifactName(iframeScrollMainUrl)],
    matches: ["https://gemini.google.com/*", "https://business.gemini.google/*"],
    world: "MAIN",
    runAt: "document_start",
    persistAcrossSessions: false,
  },
  {
    id: "srcContentsMonitorEntry",
    js: [getArtifactName(monitorEntryUrl)],
    matches: [
      "https://gemini.google.com/*",
      "https://business.gemini.google/*",
      "https://aistudio.google.com/*",
      "https://grok.com/*",
      "https://chatgpt.com/*",
      "https://claude.ai/*",
      "https://www.doubao.com/*",
      "https://ima.qq.com/*",
      "https://chat.deepseek.com/*",
      "https://www.kimi.com/*",
      "https://chatglm.cn/*",
      "https://chat.qwen.ai/*",
      "https://www.qianwen.com/*",
      "https://yuanbao.tencent.com/*",
      "https://chat.z.ai/*",
    ],
    world: "MAIN",
    runAt: "document_idle",
    persistAcrossSessions: false,
  },
  {
    id: "srcContentsScrollLockMain",
    js: [getArtifactName(scrollLockMainUrl)],
    matches: [
      "https://gemini.google.com/*",
      "https://business.gemini.google/*",
      "https://aistudio.google.com/*",
      "https://chatgpt.com/*",
      "https://grok.com/*",
      "https://claude.ai/*",
      "https://www.doubao.com/*",
      "https://ima.qq.com/*",
      "https://chat.deepseek.com/*",
      "https://www.kimi.com/*",
      "https://chatglm.cn/*",
      "https://chat.qwen.ai/*",
      "https://www.qianwen.com/*",
      "https://yuanbao.tencent.com/*",
      "https://chat.z.ai/*",
    ],
    world: "MAIN",
    runAt: "document_start",
    persistAcrossSessions: false,
  },
  {
    id: "srcContentsYuanbaoMonacoMain",
    js: [getArtifactName(yuanbaoMonacoMainUrl)],
    matches: ["https://yuanbao.tencent.com/*"],
    world: "MAIN",
    runAt: "document_start",
    persistAcrossSessions: false,
  },
]

export const MAIN_WORLD_CONTENT_SCRIPT_IDS = MAIN_WORLD_CONTENT_SCRIPTS.map(({ id }) => id)
