// @ts-nocheck
import { createHash } from "crypto"
import * as fs from "fs"
import * as path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import monkey from "vite-plugin-monkey"

import {
  USERSCRIPT_RESOURCE_DEFINITIONS,
  type UserscriptResourceMetaName,
  getUserscriptResourceUrls,
} from "./src/platform/userscript/resource-manifest"

// ========== Dynamic Metadata Loading ==========
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"))
const author: string = pkg.author
const version: string = pkg.version
const license: string = pkg.license

type UserscriptMetadata = {
  name: Record<string, string>
  description: Record<string, string>
}

const USERSCRIPT_NAME_MAX = 100
const USERSCRIPT_DESCRIPTION_MAX = 500

const userscriptMetadata: UserscriptMetadata = {
  name: {
    "": "Ophel Atlas - AI 对话结构化与导航工具, 全能AI助手 (支持 Gemini, ChatGPT, Claude, Grok, AI Studio, 豆包)",
    "zh-CN": "Ophel Atlas - AI 对话结构化与导航工具, 全能AI助手 (支持 Gemini, ChatGPT, Claude, Grok, AI Studio, 豆包)",
    "zh-TW": "Ophel Atlas - AI 對話結構化與導覽工具, 全能AI助手 (支持 Gemini, ChatGPT, Claude, Grok, AI Studio, 豆包)",
    en: "Ophel Atlas - AI Chat Organizer & Navigator (Support Gemini, ChatGPT, Claude, Grok, AI Studio)",
    de: "Ophel Atlas - KI-Chat-Organizer & Navigator (Support Gemini, ChatGPT, Claude, Grok, AI Studio)",
    es: "Ophel Atlas - Organizador de Chats de IA (Support Gemini, ChatGPT, Claude, Grok, AI Studio)",
    fr: "Ophel Atlas - Organisateur de Chat IA (Support Gemini, ChatGPT, Claude, Grok, AI Studio)",
    ja: "Ophel Atlas - AI対話の構造化とナビゲーションツール (Support Gemini, ChatGPT, Claude, Grok, AI Studio)",
    ko: "Ophel Atlas - AI 채팅 정리 및 탐색 도구 (Support Gemini, ChatGPT, Claude, Grok, AI Studio)",
    "pt-BR": "Ophel Atlas - Organizador de Chat de IA (Support Gemini, ChatGPT, Claude, Grok, AI Studio)",
    ru: "Ophel Atlas - Органайзер AI-чатов (Support Gemini, ChatGPT, Claude, Grok, AI Studio)",
  },
  description: {
    "": "适用于 Gemini、Gemini Enterprise、AI Studio、ChatGPT、Claude、Grok、DeepSeek、QwenAI、豆包、Kimi、ChatGLM、Z.ai 的 AI 对话导航与整理工具，提供实时大纲、Search Everywhere 全局搜索、会话文件夹、置顶、提示词队列与提示词库、提示词变量、Markdown/JSON 导出、思维链导出控制、WebDAV 同步、禅模式、宽屏/全屏阅读、滚动锁定、主题切换、LaTeX/表格复制、标签页重命名、隐私模式、完成通知音、阅读历史恢复、快捷键与批量导入提示词队列，让长 AI 对话更易搜索、更易导航、更易沉淀、更易复用。",
    en: "AI chat navigator and organizer for Gemini, Gemini Enterprise, AI Studio, ChatGPT, Claude, Grok, DeepSeek, Kimi, QwenAI, Doubao, ChatGLM, and Z.ai. Adds real-time outlines, Search Everywhere, conversation folders, pinning, prompt queue, prompt library, Markdown/JSON export, WebDAV sync, Zen Mode, wide/full-screen reading, scroll lock, LaTeX/table copy, tab renaming, privacy mode, notifications, reading history restore, shortcuts, prompt variables, and theme tweaks. Sound presets. Batch import.",
    "zh-CN": "适用于 Gemini、Gemini Enterprise、AI Studio、ChatGPT、Claude、Grok、DeepSeek、QwenAI、豆包、Kimi、ChatGLM、Z.ai 的 AI 对话导航与整理工具，提供实时大纲、Search Everywhere 全局搜索、会话文件夹、置顶、提示词队列与提示词库、提示词变量、Markdown/JSON 导出、思维链导出控制、WebDAV 同步、禅模式、宽屏/全屏阅读、滚动锁定、主题切换、LaTeX/表格复制、标签页重命名、隐私模式、完成通知音、阅读历史恢复、快捷键与批量导入提示词队列，让长 AI 对话更易搜索、更易导航、更易沉淀、更易复用。",
    "zh-TW": "適用於 Gemini、Gemini Enterprise、AI Studio、ChatGPT、Claude、Grok、DeepSeek、QwenAI、豆包、Kimi、ChatGLM、Z.ai 的 AI 對話導覽與整理工具，提供即時大綱、Search Everywhere 全域搜尋、對話資料夾、置頂、提示詞佇列與提示詞庫、提示詞變數、Markdown/JSON 匯出、思維鏈匯出控制、WebDAV 同步、禪模式、寬螢幕/全螢幕閱讀、捲動鎖定、主題切換、LaTeX/表格複製、分頁重新命名、隱私模式、完成通知音、閱讀歷史恢復、快捷鍵與批量匯入提示詞佇列，讓長 AI 對話更易搜尋、更易導覽、更易沉澱、更易複用。",
    de: "KI-Chat-Navigator für Gemini, Gemini Enterprise, AI Studio, ChatGPT, Claude, Grok, DeepSeek, Kimi, QwenAI, Doubao, ChatGLM und Z.ai. Mit Echtzeit-Gliederung, Search Everywhere, Ordnern, Pinning, Prompt-Queue, Markdown/JSON-Export, WebDAV-Sync, Zen Mode, Scroll Lock, Tab-Umbenennung, Benachrichtigungen und Verlauf für lange, durchsuchbare AI-Chats.",
    es: "Navegador y organizador de chats con IA para Gemini, Gemini Enterprise, AI Studio, ChatGPT, Claude, Grok, DeepSeek, Kimi, QwenAI, Doubao, ChatGLM y Z.ai. Incluye esquemas en tiempo real, Search Everywhere, carpetas, fijado, cola y biblioteca de prompts, variables, exportación Markdown/JSON, sincronización WebDAV, Zen Mode, lectura amplia, bloqueo de desplazamiento, copia de LaTeX/tablas, renombrado de pestañas, privacidad, notificaciones e historial para chats largos y reutilizables.",
    fr: "Navigateur et organisateur de chats IA pour Gemini, Gemini Enterprise, AI Studio, ChatGPT, Claude, Grok, DeepSeek, Kimi, QwenAI, Doubao, ChatGLM et Z.ai. Ajoute un plan en temps réel, Search Everywhere, dossiers, épinglage, file et bibliothèque de prompts, variables, export Markdown/JSON, sync WebDAV, Zen Mode, lecture large, verrouillage du défilement, copie LaTeX/tableaux, renommage des onglets, confidentialité, notifications et reprise de lecture pour des chats IA longs et réutilisables.",
    ja: "Gemini、Gemini Enterprise、AI Studio、ChatGPT、Claude、Grok、DeepSeek、QwenAI、豆包、Kimi、ChatGLM、Z.ai に対応する AI対話ナビゲーション整理ツール。リアルタイム目次、Search Everywhere、会話フォルダ、ピン留め、プロンプトキューとプロンプトライブラリ、プロンプト変数、Markdown/JSON エクスポート、WebDAV 同期、禅モード、ワイド/全画面読書、スクロールロック、LaTeX/表コピー、タブ名変更、プライバシーモード、完了通知、閲覧履歴復元を提供し、長い AI 対話を検索しやすく再利用しやすくします。",
    ko: "Gemini, Gemini Enterprise, AI Studio, ChatGPT, Claude, Grok, DeepSeek, QwenAI, 豆包, Kimi, ChatGLM, Z.ai를 지원하는 AI 대화 탐색·정리 도구입니다. 실시간 개요, Search Everywhere, 대화 폴더, 고정, 프롬프트 큐와 프롬프트 라이브러리, 프롬프트 변수, Markdown/JSON 내보내기, WebDAV 동기화, Zen Mode, 와이드/전체 화면 읽기, 스크롤 잠금, LaTeX/표 복사, 탭 이름 변경, 프라이버시 모드, 완료 알림, 읽기 기록 복원을 제공해 긴 AI 대화를 더 쉽게 검색하고 재사용할 수 있게 합니다.",
    "pt-BR": "Navegador e organizador de chats com IA para Gemini, Gemini Enterprise, AI Studio, ChatGPT, Claude, Grok, DeepSeek, Kimi, QwenAI, Doubao, ChatGLM e Z.ai. Inclui outlines em tempo real, Search Everywhere, pastas, fixação, fila e biblioteca de prompts, variáveis, exportação Markdown/JSON, sincronização WebDAV, Zen Mode, leitura ampla, scroll lock, cópia de LaTeX/tabelas, renomeação de abas, privacidade, notificações e histórico para chats longos, pesquisáveis e reutilizáveis.",
    ru: "Навигатор и органайзер AI-чатов для Gemini, Gemini Enterprise, AI Studio, ChatGPT, Claude, Grok, DeepSeek, Kimi, QwenAI, Doubao, ChatGLM и Z.ai. Добавляет структуру в реальном времени, Search Everywhere, папки, закрепление, очередь и библиотеку промптов, переменные, экспорт Markdown/JSON, синхронизацию WebDAV, Zen Mode, широкий режим, Scroll Lock, копирование LaTeX/таблиц, переименование вкладок, приватный режим, уведомления и историю чтения для длинных и переиспользуемых AI-чатов.",
  },
}

function validateUserscriptMetadata(metadata: UserscriptMetadata) {
  for (const [locale, value] of Object.entries(metadata.name)) {
    if (value.length > USERSCRIPT_NAME_MAX)
      throw new Error(`Userscript name for locale "${locale || "default"}" exceeds ${USERSCRIPT_NAME_MAX} characters`)
  }

  for (const [locale, value] of Object.entries(metadata.description)) {
    if (value.length > USERSCRIPT_DESCRIPTION_MAX)
      throw new Error(`Userscript description for locale "${locale || "default"}" exceeds ${USERSCRIPT_DESCRIPTION_MAX} characters`)
  }
}

validateUserscriptMetadata(userscriptMetadata)

const userscriptBuildOutDir = path.resolve(__dirname, "build/userscript")
const userscriptAssetOutDirName = "userscript-assets"
const userscriptAssetOutDir = path.join(userscriptBuildOutDir, userscriptAssetOutDirName)
const userscriptAssetManifestFileName = "manifest.json"

const userscriptAssetSources = {
  icon: path.resolve(__dirname, "assets/icon.png"),
  notificationDefault: path.resolve(
    __dirname,
    "assets/notification-sounds/streaming-complete-v2.mp3",
  ),
  notificationSoftChime: path.resolve(
    __dirname,
    "assets/notification-sounds/soft-chime.ogg",
  ),
  notificationGlassPing: path.resolve(
    __dirname,
    "assets/notification-sounds/glass-ping.ogg",
  ),
  notificationBrightAlert: path.resolve(
    __dirname,
    "assets/notification-sounds/bright-alert.ogg",
  ),
  watermarkBg48: path.resolve(
    __dirname,
    "assets/userscript/ophel-watermark-bg-48.png",
  ),
  watermarkBg96: path.resolve(
    __dirname,
    "assets/userscript/ophel-watermark-bg-96.png",
  ),
} as const

function buildUserscriptStyleBundle(): string {
  const themeVariablesStyle = fs.readFileSync(
    path.resolve(__dirname, "src/styles/theme-variables.css"),
    "utf-8",
  )
  const mainStyle = fs
    .readFileSync(path.resolve(__dirname, "src/style.css"), "utf-8")
    .replace(/@import\s+["'][^"']*theme-variables\.css["'];?\s*/g, "")
  const conversationsStyle = fs.readFileSync(
    path.resolve(__dirname, "src/styles/conversations.css"),
    "utf-8",
  )
  const settingsStyle = fs.readFileSync(
    path.resolve(__dirname, "src/styles/settings.css"),
    "utf-8",
  )

  return [themeVariablesStyle, mainStyle, conversationsStyle, settingsStyle].join("\n")
}

function createContentHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12)
}

function createHashedFileName(fileName: string, content: string | Buffer): string {
  const ext = path.extname(fileName)
  const baseName = fileName.slice(0, fileName.length - ext.length)
  return `${baseName}.${createContentHash(content)}${ext}`
}

function readUserscriptAssetContent(
  key: keyof typeof USERSCRIPT_RESOURCE_DEFINITIONS,
): string | Buffer {
  if (key === "styles") {
    return buildUserscriptStyleBundle()
  }

  return fs.readFileSync(userscriptAssetSources[key])
}

const userscriptResourceFiles = Object.fromEntries(
  Object.entries(USERSCRIPT_RESOURCE_DEFINITIONS).map(([key, definition]) => {
    const content = readUserscriptAssetContent(key as keyof typeof USERSCRIPT_RESOURCE_DEFINITIONS)
    const fileName = createHashedFileName(definition.fileName, content)

    return [
      key,
      {
        ...definition,
        content,
        fileName,
        relativePath: `${userscriptAssetOutDirName}/${fileName}`,
      },
    ]
  }),
) as Record<
  keyof typeof USERSCRIPT_RESOURCE_DEFINITIONS,
  {
    metaName: UserscriptResourceMetaName
    fileName: string
    content: string | Buffer
    relativePath: string
  }
>

const userscriptResourcePaths = Object.fromEntries(
  Object.values(userscriptResourceFiles).map(({ metaName, relativePath }) => [metaName, relativePath]),
) as Record<UserscriptResourceMetaName, string>

function emitUserscriptAssets(): Plugin {
  return {
    name: "ophel-userscript-assets",
    writeBundle() {
      fs.mkdirSync(userscriptAssetOutDir, { recursive: true })

      for (const { relativePath, content } of Object.values(userscriptResourceFiles)) {
        fs.writeFileSync(path.join(userscriptBuildOutDir, relativePath), content)
      }

      fs.writeFileSync(
        path.join(userscriptAssetOutDir, userscriptAssetManifestFileName),
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            version,
            resources: Object.fromEntries(
              Object.values(userscriptResourceFiles).map(({ metaName, fileName, relativePath }) => [
                metaName,
                { fileName, relativePath },
              ]),
            ),
          },
          null,
          2,
        ),
        "utf-8",
      )
    },
  }
}

const userscriptResourceUrls = getUserscriptResourceUrls(userscriptResourcePaths)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    emitUserscriptAssets(),
    monkey({
      entry: "src/platform/userscript/entry.tsx",
      userscript: {
        name: userscriptMetadata.name,
        description: userscriptMetadata.description,
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
          "https://www.doubao.com/*",
          "https://chat.deepseek.com/*",
          "https://www.kimi.com/*",
          "https://chatglm.cn/*",
          "https://chat.qwen.ai/*",
          "https://www.qianwen.com/*",
          "https://chat.z.ai/*",
        ],
        grant: [
          "GM_getResourceText",
          "GM_getResourceURL",
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
        // WebDAV sync in userscript mode relies on GM_xmlhttpRequest against
        // user-configured arbitrary hosts, so @connect must stay open-ended.
        connect: ["*"],
        "run-at": "document-idle",
        noframes: true,
        homepageURL: "https://github.com/urzeye/ophel",
        supportURL: "https://github.com/urzeye/ophel/issues",
        require: ["https://cdn.jsdelivr.net/npm/fuzzysort@3.1.0/fuzzysort.min.js"],
        resource: userscriptResourceUrls,
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
      fuzzysort: path.resolve(__dirname, "src/platform/userscript/fuzzysort-global.ts"),
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
    cssCodeSplit: false,
    modulePreload: false,
    minify: "terser",
    terserOptions: {
      format: {
        // 保留油猴 meta 注释
        comments: /==\/?UserScript==|@/,
      },
    },
    rollupOptions: {
      output: {
        // Userscript 版本必须产出真正的单文件脚本，避免运行时通过 <script>
        // 动态加载 chunk，进而被 Gemini / Claude 等站点的 CSP 直接拦截。
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
      // 构建警告抑制
      onwarn(warning, warn) {
        if (warning.message.includes("dynamic import will not move module into another chunk"))
          return
        warn(warning)
      },
    },
  },
})
