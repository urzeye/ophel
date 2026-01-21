import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import monkey from "vite-plugin-monkey"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    monkey({
      entry: "src/platform/userscript/entry.tsx",
      userscript: {
        name: {
          "": "Ophel",
          de: "Ophel - KI-Chat-Verbesserungstool",
          en: "Ophel - AI Chat Enhancement Toolkit",
          es: "Ophel - Herramienta de mejora de chat IA",
          fr: "Ophel - Outil d'amélioration de chat IA",
          ja: "Ophel - AIチャット強化ツール",
          ko: "Ophel - AI 채팅 향상 도구",
          pt: "Ophel - Ferramenta de melhoria de chat IA",
          ru: "Ophel - Инструмент улучшения AI-чата",
          "zh-cn": "Ophel - AI 对话增强工具",
          "zh-tw": "Ophel - AI 對話增強工具",
        },
        description: {
          "": "AI conversation enhancement tool for Gemini/ChatGPT/Claude/Grok/AI Studio",
          de: "Verbessern Sie Gemini/ChatGPT/Claude/Grok/AI Studio mit intelligenten Gliederungen, Konversationsverwaltung, Prompt-Bibliothek, Tastenkürzel, Benachrichtigungen, Theme-Anpassung, Leseverlauf-Wiederherstellung, WebDAV-Synchronisierung und mehr!",
          en: "Enhance Gemini/ChatGPT/Claude/Grok/AI Studio with smart outlines, conversation management, prompt library, shortcuts, completion notifications, theme customization, reading history restoration, WebDAV sync and more!",
          es: "Mejore Gemini/ChatGPT/Claude/Grok/AI Studio con esquemas inteligentes, gestión de conversaciones, biblioteca de prompts, atajos, notificaciones, personalización de temas, restauración del historial, sincronización WebDAV y más!",
          fr: "Améliorez Gemini/ChatGPT/Claude/Grok/AI Studio avec plans intelligents, gestion de conversations, bibliothèque de prompts, raccourcis, notifications, personnalisation de thèmes, restauration de l'historique, synchronisation WebDAV et plus!",
          ja: "Gemini/ChatGPT/Claude/Grok/AI Studio向けにスマートアウトライン、会話管理、プロンプトライブラリ、ショートカット、完了通知、テーマカスタマイズ、閲覧履歴復元、WebDAV同期などの機能を提供し、AI対話体験を向上させます！",
          ko: "Gemini/ChatGPT/Claude/Grok/AI Studio용 스마트 아웃라인, 대화 관리, 프롬프트 라이브러리, 단축키, 완료 알림, 테마 커스터마이징, 읽기 기록 복원, WebDAV 동기화 등 다양한 기능을 제공합니다!",
          pt: "Melhore o Gemini/ChatGPT/Claude/Grok/AI Studio com esboços inteligentes, gestão de conversas, biblioteca de prompts, atalhos, notificações, personalização de temas, restauração do histórico, sincronização WebDAV e mais!",
          ru: "Улучшите Gemini/ChatGPT/Claude/Grok/AI Studio с помощью умных контуров, управления беседами, библиотеки промптов, горячих клавиш, уведомлений, настройки тем, восстановления истории чтения, синхронизации WebDAV и многого другого!",
          "zh-cn":
            "为 Gemini/ChatGPT/Claude/Grok/AI Studio 等提供智能大纲、会话管理、提示词库、快捷键、完成通知、主题布局定制、阅读记录恢复、WebDAV 同步等增强功能，全面提升您的交互体验！",
          "zh-tw":
            "為 Gemini/ChatGPT/Claude/Grok/AI Studio 等提供智能大綱、會話管理、提示詞庫、快捷鍵、完成通知、主題佈局定制、閱讀記錄恢復、WebDAV 同步等增強功能，全面提升您的交互體驗！",
        },

        license: "CC-BY-NC-SA-4.0",
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
      // 替换 chrome-adapter 为 GM_* 实现（注意：必须匹配实际文件路径）
      [path.resolve(__dirname, "src/stores/chrome-adapter.ts")]: path.resolve(
        __dirname,
        "src/platform/userscript/chrome-adapter-polyfill.ts",
      ),

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
  },
})
