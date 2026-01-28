// @ts-nocheck
import * as fs from "fs"
import * as path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import monkey from "vite-plugin-monkey"

// ========== Dynamic Metadata Loading ==========
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"))
const author: string = pkg.author
const version: string = pkg.version
const license: string = pkg.license

// Locale directory to userscript locale code mapping
const localeMapping: Record<string, string> = {
  zh_CN: "zh-CN",
  zh_TW: "zh-TW",
  en: "en",
  de: "de",
  es: "es",
  fr: "fr",
  ja: "ja",
  ko: "ko",
  pt_BR: "pt-BR",
  ru: "ru",
}

// Read name and description from locale files
function loadLocalizedMetadata(): {
  name: Record<string, string>
  description: Record<string, string>
} {
  const name: Record<string, string> = { "": "Ophel - AI Chat Page Enhancer" } // Default fallback
  const description: Record<string, string> = {
    "": "Ophel is a comprehensive AI chat experience enhancer supporting Gemini, ChatGPT, Claude, Grok, and AI Studio. ✨ Core Features: 🧠 Smart Outline (Precise hierarchy, click to jump to user questions), 💬 Conversation Management (Pin/Group/Tag management, keyword search, bulk export), 🔧 UI & Reading Optimization (Widescreen immersive mode, user question Markdown rendering, quick navigation, scroll lock, auto-restore reading history, Markdown fix/watermark removal), ⚡ High Productivity (One-click copy for Markdown tables/LaTeX formulas, global shortcuts, custom tab names, AI completion desktop notifications, model lock), ⌨️ Prompt Library (Variable support/Markdown preview), 🎭 Claude Enhancements (Session Key switching & management), 🔒 Data Privacy (Privacy mode, local storage/import & export, WebDAV sync). | Ophel 是一款全方位的 AI 聊天体验增强工具，支持 Gemini、ChatGPT、Claude、Grok 和 AI Studio。✨ 核心功能：🧠 智能大纲（精准识别层级、支持点击跳转用户问题）、💬 会话管理（支持置顶/分组/标签管理、关键词搜索、批量导出）、🔧 界面与阅读优化（宽屏沉浸模式、用户问题 Markdown 渲染、快捷导航、滚动锁定、阅读历史自动恢复、Markdown 格式修复/去水印）、⚡ 高效生产力（Markdown 表格/LaTeX 公式一键复制、全局快捷键、自定义标签页名称、AI 生成完成桌面通知、模型锁定）、⌨️ 提示词库（支持变量/Markdown 预览）、🎭 Claude 专属增强（Session Key 切换与管理）、🔒 数据隐私（隐私模式、数据本地存储/导入导出、WebDAV 云同步）。",
  }

  const localesDir = path.resolve(__dirname, "locales")
  for (const [dirName, localeCode] of Object.entries(localeMapping)) {
    const messagesPath = path.join(localesDir, dirName, "messages.json")
    if (fs.existsSync(messagesPath)) {
      try {
        const messages = JSON.parse(fs.readFileSync(messagesPath, "utf-8"))
        if (messages.extensionName?.message) {
          name[localeCode] = messages.extensionName.message
        }
        if (messages.extensionDescription?.message) {
          description[localeCode] = messages.extensionDescription.message
        }
      } catch {
        console.warn(`Failed to parse ${messagesPath}`)
      }
    }
  }
  return { name, description }
}

const { name: localizedName, description: localizedDescription } = loadLocalizedMetadata()

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    monkey({
      entry: "src/platform/userscript/entry.tsx",
      userscript: {
        name: localizedName,
        description: localizedDescription,
        version: version,
        author: author,
        namespace: "https://github.com/urzeye/ophel",
        license: license,
        icon: "https://raw.githubusercontent.com/urzeye/ophel/main/assets/icon.png",
        match: [
          "https://gemini.google.com/*",
          "https://business.gemini.google/*",
          "https://aistudio.google.com/*",
          "https://grok.com/*",
          "https://chat.openai.com/*",
          "https://chatgpt.com/*",
          "https://claude.ai/*",
        ],
        grant: [
          "GM_getValue",
          "GM_setValue",
          "GM_deleteValue",
          "GM_addValueChangeListener",
          "GM_removeValueChangeListener",
          "GM_xmlhttpRequest",
          "GM_notification",
          "GM_cookie",
          "unsafeWindow",
          "window.focus",
        ],
        connect: ["*"],
        "run-at": "document-idle",
        noframes: true,
        homepageURL: "https://github.com/urzeye/ophel",
        supportURL: "https://github.com/urzeye/ophel/issues",
      },
      build: {
        // CSS 自动注入到 head
        autoGrant: true,
      },
    }),
  ],
  resolve: {
    alias: {
      // ========== Userscript Polyfills ==========
      // 替换 @plasmohq/storage 为 GM_* 实现
      "@plasmohq/storage": path.resolve(__dirname, "src/platform/userscript/storage-polyfill.ts"),
      // 注意：chrome-adapter.ts 已内置跨平台支持（通过 __PLATFORM__ 判断），无需 alias 替换

      // ========== 路径别名（与 Plasmo 的 ~ 别名一致）==========
      "~adapters": path.resolve(__dirname, "src/adapters"),
      "~components": path.resolve(__dirname, "src/components"),
      "~constants": path.resolve(__dirname, "src/constants"),
      "~contents": path.resolve(__dirname, "src/contents"),
      "~contexts": path.resolve(__dirname, "src/contexts"),
      "~core": path.resolve(__dirname, "src/core"),
      "~hooks": path.resolve(__dirname, "src/hooks"),
      "~locales": path.resolve(__dirname, "src/locales"),
      "~platform": path.resolve(__dirname, "src/platform"),
      "~stores": path.resolve(__dirname, "src/stores"),
      "~styles": path.resolve(__dirname, "src/styles"),
      "~tabs": path.resolve(__dirname, "src/tabs"),
      "~types": path.resolve(__dirname, "src/types"),
      "~utils": path.resolve(__dirname, "src/utils"),
      "~style.css": path.resolve(__dirname, "src/style.css"),
      "~": path.resolve(__dirname, "src"),
    },
  },
  define: {
    // 注入平台标识
    __PLATFORM__: JSON.stringify("userscript"),
  },
  build: {
    outDir: "build/userscript",
    minify: "terser",
    terserOptions: {
      format: {
        // 保留油猴 meta 注释
        comments: /==\/?UserScript==|@/,
      },
    },
    rollupOptions: {
      // 构建警告抑制
      onwarn(warning, warn) {
        if (warning.message.includes("dynamic import will not move module into another chunk"))
          return
        warn(warning)
      },
    },
  },
})
