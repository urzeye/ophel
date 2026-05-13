import cssText from "data-text:~style.css"
import conversationsCssText from "data-text:~styles/conversations.css"
import settingsCssText from "data-text:~styles/settings.css"
import type { PlasmoCSConfig, PlasmoMountShadowHost } from "plasmo"
import React from "react"

import { App } from "~components/App"
import { applyOphelPlatformFontClass } from "~utils/font"

export const config: PlasmoCSConfig = {
  matches: [
    "https://gemini.google.com/*",
    "https://business.gemini.google/*",
    "https://aistudio.google.com/*",
    "https://grok.com/*",
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://www.doubao.com/*",
    "https://ima.qq.com/*",
    "https://chat.deepseek.com/*",
    "https://www.kimi.com/*",
    "https://chatglm.cn/*",
    "https://chat.qwen.ai/*",
    "https://www.qianwen.com/*",
    "https://qianwen.com/*",
    "https://yuanbao.tencent.com/*",
    "https://chat.z.ai/*",
  ],
}

export const getStyle = () => {
  const style = document.createElement("style")

  // 注入 Inter 字体（仅扩展版；油猴版无此 @font-face，自动回退到 system-ui）
  const interFontUrl = chrome.runtime.getURL("assets/fonts/InterVariable.woff2")
  const interFontFace = `
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('${interFontUrl}') format('woff2');
  unicode-range:
    U+0000-02FF, U+0304, U+0308, U+0329,
    U+0370-03FF, U+1D00-1DBF, U+1E00-1EFF, U+1F00-1FFF,
    U+0400-052F, U+1C80-1C88, U+2116, U+2DE0-2DFF, U+A640-A69F,
    U+1EA0-1EF9, U+20AB,
    U+2000-206F, U+20A0-20C0, U+20AC, U+2113, U+2122, U+2191, U+2193,
    U+2212, U+2215, U+2C60-2C7F, U+A720-A7FF, U+FEFF, U+FFFD;
}
`

  // 读取缓存的主题 CSS，预注入到 Shadow DOM 初始样式，避免主题闪烁（FOUC）
  let earlyThemeCSS = ""
  try {
    earlyThemeCSS = localStorage.getItem("ophel_ext_theme_cache") || ""
  } catch {}

  // 合并所有 CSS 样式
  style.textContent =
    interFontFace +
    "\n" +
    cssText +
    "\n" +
    conversationsCssText +
    "\n" +
    settingsCssText +
    (earlyThemeCSS ? "\n" + earlyThemeCSS : "")
  return style
}

/**
 * 自定义 Shadow Host 挂载位置
 *
 * 默认挂载到 document.body（大多数站点）
 * ChatGPT / Grok 特殊处理：延迟挂载 + MutationObserver 监控重挂载
 * 因为这些站点的 React Hydration 会清除 body 下的非预期元素
 */
export const mountShadowHost: PlasmoMountShadowHost = ({
  shadowHost,
  anchor: _anchor,
  mountState: _mountState,
}) => {
  const hostname = window.location.hostname
  applyOphelPlatformFontClass(shadowHost)
  if (hostname.includes("chatglm.cn")) {
    shadowHost.classList.add("gh-site-chatglm")
  }
  // ChatGPT、Claude 和 Grok 都是 Next.js 应用，需要延迟挂载
  const needsDelayedMount =
    hostname.includes("chatgpt.com") ||
    hostname.includes("chat.openai.com") ||
    hostname.includes("grok.com") ||
    hostname.includes("claude.ai") ||
    hostname.includes("deepseek.com") ||
    hostname.includes("yuanbao.tencent.com")

  const doMount = () => {
    if (!shadowHost.parentElement) {
      document.body.appendChild(shadowHost)
    }
  }

  if (needsDelayedMount) {
    // Next.js 站点需要延迟挂载，等待 React Hydration 完成
    // 使用多次延迟尝试，确保挂载成功
    const delays = [500, 1000, 2000, 3000]
    delays.forEach((delay) => {
      setTimeout(doMount, delay)
    })

    // 使用 MutationObserver 持续监控，如果被移除则重新挂载
    const observer = new MutationObserver(() => {
      if (!shadowHost.parentElement) {
        doMount()
      }
    })
    observer.observe(document.body, { childList: true, subtree: false })
  } else {
    // 其他站点直接挂载到 body
    doMount()
  }
}

const PlasmoApp = () => {
  return <App />
}

export default PlasmoApp
