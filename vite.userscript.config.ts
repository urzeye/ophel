// @ts-nocheck
import { createHash } from "crypto"
import * as fs from "fs"
import * as path from "path"
import * as vm from "vm"
import react from "@vitejs/plugin-react"
import { build as viteBuild, defineConfig, type Plugin } from "vite"
import monkey from "vite-plugin-monkey"

import {
  USERSCRIPT_RESOURCE_DEFINITIONS,
  USERSCRIPT_LOCALE_RESOURCE_DEFINITIONS,
  USERSCRIPT_SUPPORTED_LOCALES,
  type UserscriptLocale,
  type UserscriptLocaleResourceMetaName,
  type UserscriptResourceMetaName,
  getUserscriptAssetBaseUrl,
  getUserscriptLocaleResourceUrls,
  getUserscriptResourceUrls,
} from "./src/platform/userscript/resource-manifest"
import {
  KATEX_CDN_CSS_URL,
  KATEX_CDN_JS_URL,
  KATEX_CSS_RESOURCE_NAME,
} from "./src/platform/userscript/katex-cdn"
import { resources as localeResources } from "./src/locales/resources"

const isUserscriptDevelopmentBuild =
  process.env.NODE_ENV === "development" || Boolean(process.env.USERSCRIPT_ASSET_BASE_URL)

// ========== Dynamic Metadata Loading ==========
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"))
const reactPkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "node_modules/react/package.json"), "utf-8"),
)
const reactDomPkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "node_modules/react-dom/package.json"), "utf-8"),
)
const geminiWatermarkRemoverPkg = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "node_modules/@pilio/gemini-watermark-remover/package.json"),
    "utf-8",
  ),
)
const author: string = pkg.author
const version: string = pkg.version
const license: string = pkg.license
const reactVersion: string = reactPkg.version
const reactDomVersion: string = reactDomPkg.version
const geminiWatermarkRemoverVersion: string = geminiWatermarkRemoverPkg.version
const reactCdnUrl = `https://cdn.jsdelivr.net/npm/react@${reactVersion}/umd/react.production.min.js`
const reactDomCdnUrl = `https://cdn.jsdelivr.net/npm/react-dom@${reactDomVersion}/umd/react-dom.production.min.js`
const geminiWatermarkRemoverGlobalName = "__OphelGeminiWatermarkRemover"
const userscriptMetadataCommentPattern = /^!?\s*(==\/?UserScript==|@)/

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
    it: "Ophel Atlas - Organizzatore di chat IA (Support Gemini, ChatGPT, Claude, Grok, AI Studio)",
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
    it: "Navigatore e organizzatore di chat IA per Gemini, Gemini Enterprise, AI Studio, ChatGPT, Claude, Grok, DeepSeek, Kimi, QwenAI, Doubao, ChatGLM e Z.ai. Aggiunge outline in tempo reale, Search Everywhere, cartelle, pin, coda e libreria prompt, variabili, export Markdown/JSON, sync WebDAV, Zen Mode, lettura ampia, scroll lock, copia LaTeX/tabelle, rinomina schede, privacy, notifiche e cronologia per chat lunghe e riutilizzabili.",
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
const userscriptGeminiWatermarkVendorFileName = `ophel-gemini-watermark-remover-${geminiWatermarkRemoverVersion}-ophel-${version}.js`
const userscriptGeminiWatermarkVendorRelativePath = `${userscriptAssetOutDirName}/${userscriptGeminiWatermarkVendorFileName}`
const userscriptGeminiWatermarkVendorUrl = `${getUserscriptAssetBaseUrl()}/${userscriptGeminiWatermarkVendorRelativePath}`
const userscriptMarkdownVendorFileName = `ophel-markdown-vendor-ophel-${version}.js`
const userscriptMarkdownVendorRelativePath = `${userscriptAssetOutDirName}/${userscriptMarkdownVendorFileName}`
const userscriptMarkdownVendorUrl = `${getUserscriptAssetBaseUrl()}/${userscriptMarkdownVendorRelativePath}`
const userscriptAdaptersVendorFileName = `ophel-adapters-vendor-ophel-${version}.js`
const userscriptAdaptersVendorRelativePath = `${userscriptAssetOutDirName}/${userscriptAdaptersVendorFileName}`
const userscriptAdaptersVendorUrl = `${getUserscriptAssetBaseUrl()}/${userscriptAdaptersVendorRelativePath}`

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
  const releaseNotesStyle = fs.readFileSync(
    path.resolve(__dirname, "src/styles/release-notes.css"),
    "utf-8",
  )
  const settingsStyle = fs.readFileSync(
    path.resolve(__dirname, "src/styles/settings.css"),
    "utf-8",
  )

  return [themeVariablesStyle, mainStyle, conversationsStyle, releaseNotesStyle, settingsStyle].join("\n")
}

function createContentHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12)
}

// Greasyfork 脚本本体大小硬限制 2MB（按字节计）；项目闸门预留余量，
// 触闸说明需要继续向 vendor 拆分，而不是顶着上限发布。
// 必须按 UTF-8 字节而非 UTF-16 码元度量：CJK 字符编码后占 3 字节，
// 按字符数计量可能在未触闸的情况下超出平台字节上限。
const USERSCRIPT_GREASYFORK_BYTE_LIMIT = 2_000_000
const USERSCRIPT_BYTE_GATE = 1_950_000
const userscriptMainFileName = `${pkg.name}.user.js`

function createHashedFileName(fileName: string, content: string | Buffer): string {
  const ext = path.extname(fileName)
  const baseName = fileName.slice(0, fileName.length - ext.length)
  return `${baseName}.${createContentHash(content)}${ext}`
}

function extractReturnedTemplateLiteral(sourceFile: string, functionName: string): string {
  const source = fs.readFileSync(sourceFile, "utf-8")
  const pattern = new RegExp(
    `function\\s+${functionName}\\s*\\(\\)\\s*:\\s*string\\s*{\\s*return\\s+\`([\\s\\S]*?)\`\\s*}`,
  )
  const match = source.match(pattern)

  if (!match) {
    throw new Error(`Unable to extract ${functionName} from ${path.relative(__dirname, sourceFile)}`)
  }

  return match[1]
}

function buildUserscriptSiteIconsResource(): string {
  const sourceFile = path.resolve(__dirname, "src/constants/site-icons.ts")
  const source = fs.readFileSync(sourceFile, "utf-8")
  const executableSource = source.replace(
    /export\s+const\s+SITE_ICONS\s*:\s*Record<string,\s*string>\s*=/,
    "module.exports =",
  )
  const sandbox = { module: { exports: {} } }

  vm.runInNewContext(executableSource, sandbox, {
    filename: sourceFile,
    timeout: 1000,
  })

  return JSON.stringify(sandbox.module.exports)
}

function readUserscriptAssetContent(
  key: keyof typeof USERSCRIPT_RESOURCE_DEFINITIONS,
): string | Buffer {
  if (key === "styles") {
    return buildUserscriptStyleBundle()
  }

  if (key === "markdownPreviewStyles") {
    return extractReturnedTemplateLiteral(
      path.resolve(__dirname, "src/utils/markdown.ts"),
      "getInlineHighlightStyles",
    )
  }

  if (key === "userQueryMarkdownStyles") {
    return extractReturnedTemplateLiteral(
      path.resolve(__dirname, "src/core/user-query-markdown.ts"),
      "getInlineUserQueryMarkdownStyles",
    )
  }

  if (key === "siteIcons") {
    return buildUserscriptSiteIconsResource()
  }

  return fs.readFileSync(userscriptAssetSources[key])
}

async function buildGeminiWatermarkVendor(): Promise<void> {
  await viteBuild({
    configFile: false,
    publicDir: false,
    define: {
      __PLATFORM__: JSON.stringify("userscript"),
      __OPHEL_DEV__: JSON.stringify(false),
    },
    build: {
      outDir: userscriptAssetOutDir,
      emptyOutDir: false,
      minify: "terser",
      lib: {
        entry: path.resolve(
          __dirname,
          "src/platform/userscript/gemini-watermark-remover-vendor.ts",
        ),
        name: "OphelGeminiWatermarkRemoverVendor",
        formats: ["iife"],
        fileName: () => userscriptGeminiWatermarkVendorFileName,
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  })
}

async function buildMarkdownVendor(): Promise<void> {
  await viteBuild({
    configFile: false,
    publicDir: false,
    define: {
      __PLATFORM__: JSON.stringify("userscript"),
      __OPHEL_DEV__: JSON.stringify(false),
    },
    resolve: {
      alias: {
        "~platform/katex": path.resolve(__dirname, "src/platform/userscript/katex.ts"),
        "~": path.resolve(__dirname, "src"),
      },
    },
    build: {
      outDir: userscriptAssetOutDir,
      emptyOutDir: false,
      minify: "terser",
      lib: {
        entry: path.resolve(__dirname, "src/platform/userscript/markdown-vendor.ts"),
        name: "OphelMarkdownVendor",
        formats: ["iife"],
        fileName: () => userscriptMarkdownVendorFileName,
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  })
}

// 内置站点适配器独立 vendor 构建（经 @require 引入，压缩脚本本体字符数）。
// 有状态模块（settings-store / watermark-remover / i18n）alias 到
// vendor-bridge shim，运行时转发主包 window.__OphelAdaptersVendorBridge；
// 其余共享模块无状态，vendor 自带副本即可。
async function buildAdaptersVendor(): Promise<void> {
  await viteBuild({
    configFile: false,
    publicDir: false,
    plugins: [
      {
        name: "ophel-adapters-vendor-stubs",
        enforce: "pre",
        resolveId(source, importer) {
          // platform.remoteConfig 仅设置 UI 使用，vendor 内不会调用；
          // 截断该动态导入，避免把站点包注册表链路打包进 vendor。
          if (source === "./remote-config" && importer?.endsWith("platform/userscript/index.ts")) {
            return path.resolve(
              __dirname,
              "src/platform/userscript/vendor-bridge/remote-config-stub.ts",
            )
          }
          return null
        },
      },
    ],
    define: {
      __PLATFORM__: JSON.stringify("userscript"),
      __OPHEL_DEV__: JSON.stringify(false),
      __OPHEL_APP_VERSION__: JSON.stringify(version),
    },
    resolve: {
      alias: {
        // ========== React 走 @require 的 window 全局（与主包一致）==========
        "react/jsx-runtime": path.resolve(
          __dirname,
          "src/platform/userscript/react-jsx-runtime.ts",
        ),
        "react-dom/client": path.resolve(
          __dirname,
          "src/platform/userscript/react-dom-client-global.ts",
        ),
        "react-dom": path.resolve(__dirname, "src/platform/userscript/react-dom-global.ts"),
        react: path.resolve(__dirname, "src/platform/userscript/react-global.ts"),
        // ========== 主包持有的有状态模块（桥接 shim）==========
        "~stores/settings-store": path.resolve(
          __dirname,
          "src/platform/userscript/vendor-bridge/settings-store.ts",
        ),
        "~core/watermark-remover": path.resolve(
          __dirname,
          "src/platform/userscript/vendor-bridge/watermark-remover.ts",
        ),
        "~utils/i18n": path.resolve(__dirname, "src/platform/userscript/vendor-bridge/i18n.ts"),
        // ========== 与主包一致的 window 全局/polyfill ==========
        "~utils/markdown": path.resolve(__dirname, "src/platform/userscript/markdown-global.ts"),
        "~constants/site-icons": path.resolve(
          __dirname,
          "src/platform/userscript/site-icons.ts",
        ),
        "~platform/katex": path.resolve(__dirname, "src/platform/userscript/katex.ts"),
        // 平台实现编译期选择（必须放在 ~platform 之前，精确匹配优先）
        "~platform/impl": path.resolve(__dirname, "src/platform/userscript/impl.ts"),
        "@plasmohq/storage": path.resolve(
          __dirname,
          "src/platform/userscript/storage-polyfill.ts",
        ),
        // ========== 路径别名（与主包一致）==========
        "~adapters": path.resolve(__dirname, "src/adapters"),
        "~components": path.resolve(__dirname, "src/components"),
        "~constants": path.resolve(__dirname, "src/constants"),
        "~core": path.resolve(__dirname, "src/core"),
        "~platform": path.resolve(__dirname, "src/platform"),
        "~stores": path.resolve(__dirname, "src/stores"),
        "~styles": path.resolve(__dirname, "src/styles"),
        "~types": path.resolve(__dirname, "src/types"),
        "~utils": path.resolve(__dirname, "src/utils"),
        "~": path.resolve(__dirname, "src"),
      },
    },
    build: {
      outDir: userscriptAssetOutDir,
      emptyOutDir: false,
      minify: "terser",
      lib: {
        entry: path.resolve(__dirname, "src/platform/userscript/adapters-vendor.ts"),
        name: "OphelAdaptersVendor",
        formats: ["iife"],
        fileName: () => userscriptAdaptersVendorFileName,
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  })
}

const localUserscriptResourceEntries = Object.entries(USERSCRIPT_RESOURCE_DEFINITIONS).filter(
  ([, definition]) => !("externalUrl" in definition),
)

const userscriptResourceFiles = Object.fromEntries(
  localUserscriptResourceEntries.map(([key, definition]) => {
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

const userscriptLocaleResourceFiles = Object.fromEntries(
  USERSCRIPT_SUPPORTED_LOCALES.map((locale) => {
    const definition = USERSCRIPT_LOCALE_RESOURCE_DEFINITIONS[locale]
    const content = JSON.stringify(
      localeResources[locale as keyof typeof localeResources],
      null,
      0,
    )
    const fileName = createHashedFileName(definition.fileName, content)

    return [
      locale,
      {
        ...definition,
        locale,
        content,
        fileName,
        relativePath: `${userscriptAssetOutDirName}/${fileName}`,
      },
    ]
  }),
) as Record<
  UserscriptLocale,
  {
    locale: UserscriptLocale
    metaName: UserscriptLocaleResourceMetaName
    fileName: string
    content: string
    relativePath: string
  }
>

const userscriptLocaleResourcePaths = Object.fromEntries(
  Object.values(userscriptLocaleResourceFiles).map(({ metaName, relativePath }) => [
    metaName,
    relativePath,
  ]),
) as Record<UserscriptLocaleResourceMetaName, string>

function emitUserscriptAssets(): Plugin {
  return {
    name: "ophel-userscript-assets",
    async writeBundle() {
      fs.mkdirSync(userscriptAssetOutDir, { recursive: true })

      for (const { relativePath, content } of Object.values(userscriptResourceFiles)) {
        fs.writeFileSync(path.join(userscriptBuildOutDir, relativePath), content)
      }

      for (const { relativePath, content } of Object.values(userscriptLocaleResourceFiles)) {
        fs.writeFileSync(path.join(userscriptBuildOutDir, relativePath), content)
      }

      await buildGeminiWatermarkVendor()
      await buildMarkdownVendor()
      await buildAdaptersVendor()

      fs.writeFileSync(
        path.join(userscriptAssetOutDir, userscriptAssetManifestFileName),
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            version,
            resources: Object.fromEntries(
              [
                ...Object.values(userscriptResourceFiles),
                ...Object.values(userscriptLocaleResourceFiles),
              ].map(({ metaName, fileName, relativePath }) => [
                metaName,
                { fileName, relativePath },
              ]),
            ),
            requires: {
              geminiWatermarkRemover: {
                fileName: userscriptGeminiWatermarkVendorFileName,
                relativePath: userscriptGeminiWatermarkVendorRelativePath,
                version: geminiWatermarkRemoverVersion,
              },
              markdownVendor: {
                fileName: userscriptMarkdownVendorFileName,
                relativePath: userscriptMarkdownVendorRelativePath,
              },
              adaptersVendor: {
                fileName: userscriptAdaptersVendorFileName,
                relativePath: userscriptAdaptersVendorRelativePath,
              },
            },
            requireUrls: {
              geminiWatermarkRemover: userscriptGeminiWatermarkVendorUrl,
              markdownVendor: userscriptMarkdownVendorUrl,
              adaptersVendor: userscriptAdaptersVendorUrl,
            },
          },
          null,
          2,
        ),
        "utf-8",
      )

      // ========== SRI 完整性片段 + 字符数闸门 ==========
      // monkey 在 generateBundle 阶段产出最终 user.js，writeBundle 时文件已落盘。
      // 为自托管资源的 @require/@resource URL 追加 #sha256= 片段，
      // 支持 SRI 的脚本管理器（Tampermonkey）安装时校验内容完整性；
      // 不支持的引擎会忽略 fragment，行为不变。
      const mainScriptPath = path.join(userscriptBuildOutDir, userscriptMainFileName)
      let mainScript = fs.readFileSync(mainScriptPath, "utf-8")
      const assetBaseUrl = getUserscriptAssetBaseUrl()
      const selfHostedRelativePaths = [
        ...Object.values(userscriptResourceFiles).map(({ relativePath }) => relativePath),
        ...Object.values(userscriptLocaleResourceFiles).map(({ relativePath }) => relativePath),
        userscriptGeminiWatermarkVendorRelativePath,
        userscriptMarkdownVendorRelativePath,
        userscriptAdaptersVendorRelativePath,
      ]

      for (const relativePath of selfHostedRelativePaths) {
        const url = `${assetBaseUrl}/${relativePath}`
        if (!mainScript.includes(url) || mainScript.includes(`${url}#sha256=`)) continue

        const digest = createHash("sha256")
          .update(fs.readFileSync(path.join(userscriptBuildOutDir, relativePath)))
          .digest("hex")
        mainScript = mainScript.replaceAll(url, `${url}#sha256=${digest}`)
      }

      fs.writeFileSync(mainScriptPath, mainScript, "utf-8")

      const mainScriptBytes = Buffer.byteLength(mainScript, "utf8")
      if (mainScriptBytes > USERSCRIPT_BYTE_GATE) {
        throw new Error(
          `${userscriptMainFileName} is ${mainScriptBytes} bytes, exceeding the ` +
            `${USERSCRIPT_BYTE_GATE} project gate (Greasyfork hard limit ` +
            `${USERSCRIPT_GREASYFORK_BYTE_LIMIT}). Move more code into @require vendor ` +
            "bundles or @resource data instead of shipping near the limit.",
        )
      }
      console.warn(
        `[ophel-userscript-assets] ${userscriptMainFileName}: ${mainScriptBytes} bytes ` +
          `(gate ${USERSCRIPT_BYTE_GATE}, Greasyfork limit ${USERSCRIPT_GREASYFORK_BYTE_LIMIT})`,
      )
    },
  }
}

const userscriptResourceUrls = getUserscriptResourceUrls(userscriptResourcePaths)
const userscriptLocaleResourceUrls = getUserscriptLocaleResourceUrls(userscriptLocaleResourcePaths)

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
        match: ["https://*/*"],
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
        "run-at": "document-start",
        noframes: true,
        homepageURL: "https://github.com/urzeye/ophel",
        supportURL: "https://github.com/urzeye/ophel/issues",
        tag: [
          "ai",
          "chat",
          "productivity",
          "navigation",
          "outline",
          "conversation",
          "prompt",
          "export",
          "chinese",
          "multilingual",
          "cross-platform",
          "ai-assistant",
          "all-in-one",
          "全能AI助手",
        ],
        require: [
          reactCdnUrl,
          reactDomCdnUrl,
          "https://cdn.jsdelivr.net/npm/fuzzysort@3.1.0/fuzzysort.min.js",
          KATEX_CDN_JS_URL,
          userscriptMarkdownVendorUrl,
          userscriptGeminiWatermarkVendorUrl,
          userscriptAdaptersVendorUrl,
        ],
        resource: {
          ...userscriptResourceUrls,
          ...userscriptLocaleResourceUrls,
          [KATEX_CSS_RESOURCE_NAME]: KATEX_CDN_CSS_URL,
        },
      },
      build: {
        // CSS 自动注入到 head
        autoGrant: true,
        externalGlobals: {
          "@pilio/gemini-watermark-remover": geminiWatermarkRemoverGlobalName,
        },
      },
    }),
  ],
  resolve: {
    alias: {
      // ========== Userscript Polyfills ==========
      "react/jsx-runtime": path.resolve(__dirname, "src/platform/userscript/react-jsx-runtime.ts"),
      "react-dom/client": path.resolve(
        __dirname,
        "src/platform/userscript/react-dom-client-global.ts",
      ),
      "react-dom": path.resolve(__dirname, "src/platform/userscript/react-dom-global.ts"),
      react: path.resolve(__dirname, "src/platform/userscript/react-global.ts"),
      // 替换 @plasmohq/storage 为 GM_* 实现
      "@plasmohq/storage": path.resolve(__dirname, "src/platform/userscript/storage-polyfill.ts"),
      fuzzysort: path.resolve(__dirname, "src/platform/userscript/fuzzysort-global.ts"),
      "~constants/site-icons": path.resolve(__dirname, "src/platform/userscript/site-icons.ts"),
      "~utils/i18n": path.resolve(__dirname, "src/platform/userscript/i18n.ts"),
      "~utils/markdown": path.resolve(__dirname, "src/platform/userscript/markdown-global.ts"),
      "~platform/katex": path.resolve(__dirname, "src/platform/userscript/katex.ts"),
      // 注意：chrome-adapter.ts 已内置跨平台支持（通过 __PLATFORM__ 判断），无需 alias 替换

      // ========== 路径别名（与 Plasmo 的 ~ 别名一致）==========
      // 内置适配器列表改由 @require 的 adapters vendor 提供（必须放在 ~adapters 之前）
      "~adapters/builtin": path.resolve(__dirname, "src/platform/userscript/builtin-adapters.ts"),
      // 平台实现编译期选择（必须放在 ~platform 之前，精确匹配优先）
      "~platform/impl": path.resolve(__dirname, "src/platform/userscript/impl.ts"),
      "~adapters": path.resolve(__dirname, "src/adapters"),
      "~components": path.resolve(__dirname, "src/components"),
      "~constants": path.resolve(__dirname, "src/constants"),
      "~contents": path.resolve(__dirname, "src/contents"),
      "~contexts": path.resolve(__dirname, "src/contexts"),
      "~core": path.resolve(__dirname, "src/core"),
      "~hooks": path.resolve(__dirname, "src/hooks"),
      "~locales": path.resolve(__dirname, "src/locales"),
      "~platform": path.resolve(__dirname, "src/platform"),
      "~release-notes": path.resolve(__dirname, "src/release-notes"),
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
    __OPHEL_DEV__: JSON.stringify(isUserscriptDevelopmentBuild),
    // 与 adapters vendor 的版本握手标识
    __OPHEL_APP_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: "build/userscript",
    cssCodeSplit: false,
    modulePreload: false,
    minify: "terser",
    terserOptions: {
      format: {
        // 保留油猴 meta 注释
        comments: userscriptMetadataCommentPattern,
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
