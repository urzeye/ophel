export const getChatgptNativeThemeCss = (): string => `
/* =============================================
 * ChatGPT 站点原生主题适配器 (ChatGPT Theme Adapter)
 * ============================================= */
:root, .dark, .light {
  /* 1. 侧边栏容器 */
  --sidebar-surface-primary: color-mix(in srgb, var(--gh-primary) 1%, var(--gh-bg)) !important;

  /* 悬浮层、气泡和弹窗 */
  --bg-elevated-primary: var(--gh-bg-secondary) !important;
  --bg-elevated-secondary: var(--gh-bg-tertiary) !important;

  /* 底层遮罩 */
  --bg-scrim: var(--gh-overlay-bg) !important;

  /* 2. 文本与图标层级 */
  --icon-primary: var(--gh-text) !important;
  --icon-secondary: var(--gh-text-secondary) !important;
  --icon-tertiary: var(--gh-text-tertiary) !important;

  /* 3. 边框 (使用极其微弱的透明度保持原生通透感) */
  --border-default: color-mix(in srgb, var(--gh-primary) 15%, transparent) !important;
  --border-heavy: color-mix(in srgb, var(--gh-primary) 25%, transparent) !important;
  --border-light: color-mix(in srgb, var(--gh-primary) 8%, transparent) !important;

  /* 4. 品牌高亮/突出显示（绑定 Ophel 主题色） */
  --bg-accent-static: var(--gh-primary) !important;
  --text-accent: var(--gh-primary) !important;
  --icon-accent: var(--gh-primary) !important;
  --interactive-label-accent-default: var(--gh-primary) !important;
  --interactive-label-accent-hover: var(--gh-primary) !important;
  --interactive-label-accent-press: var(--gh-primary) !important;
  --interactive-label-accent-inactive: var(--gh-primary) !important;
  --interactive-label-accent-selected: var(--gh-primary) !important;
  --interactive-icon-accent-default: var(--gh-primary) !important;

  /* 5. 交互状态 (按钮 Hover 等) */
  /* - 次级交互（普通按钮/Icon Hover） */
  --interactive-bg-secondary-hover: var(--gh-hover) !important;
  --interactive-bg-secondary-press: var(--gh-active-bg) !important;
  --interactive-bg-secondary-selected: var(--gh-active-bg) !important;

  /* - 第三级交互（如模型选择器等） */
  --interactive-bg-tertiary-default: var(--gh-bg-secondary) !important;
  --interactive-bg-tertiary-hover: var(--gh-hover) !important;
  --interactive-bg-tertiary-press: var(--gh-active-bg) !important;

  /* 6. 其他小细节 */
  --utility-scrollbar: var(--gh-border) !important;
  /* 行内代码块背景 */
  --gray-100: var(--gh-bg-tertiary) !important;
}

/* 按钮颜色 */
.composer-btn {
  color: var(--gh-primary) !important;
}

/* 链接颜色 */
a.decorated-link:where(:not(.not-markdown *)) {
  color: var(--gh-primary) !important;
}
`

export const chatgptNativeThemeCss = /*#__PURE__*/ getChatgptNativeThemeCss()

/**
 * App shell 只内联当前主题的 lightningcss 开关规则，需补全另一方向才能即时换肤。
 * 使用原生 CSS 的 data-theme 作为锚点，避免依赖已更名的 appearance 属性。
 */
export const CHATGPT_THEME_TOGGLE_STYLE_ID = "gh-chatgpt-theme-toggle"

export const getChatgptThemeToggleCss = (): string => `
html[data-theme="dark"] {
  --theme-variant: dark;
  --lightningcss-light: ;
  --lightningcss-dark: initial;
  color-scheme: dark;
}
html[data-theme="light"] {
  --theme-variant: light;
  --lightningcss-light: initial;
  --lightningcss-dark: ;
  color-scheme: light;
}
`

export const chatgptThemeToggleCss = /*#__PURE__*/ getChatgptThemeToggleCss()

/** 幂等注入主题开关补丁样式。 */
const ensureChatGPTThemeToggleStyle = (): void => {
  if (document.getElementById(CHATGPT_THEME_TOGGLE_STYLE_ID)) return
  const style = document.createElement("style")
  style.id = CHATGPT_THEME_TOGGLE_STYLE_ID
  style.textContent = getChatgptThemeToggleCss()
  document.head.appendChild(style)
}

/** 手动切换与跟随系统共用同一条宿主页主题更新路径。 */
export const applyChatGPTThemeMode = (mode: "light" | "dark"): void => {
  const root = document.documentElement
  const appearanceAttributes = ["data-appearance-mode", "data-appearance-theme"]
  if (
    root.hasAttribute("data-theme") ||
    appearanceAttributes.some((key) => root.hasAttribute(key))
  ) {
    ensureChatGPTThemeToggleStyle()
    root.setAttribute("data-theme", mode)
    for (const attribute of appearanceAttributes) {
      if (root.hasAttribute(attribute)) root.setAttribute(attribute, mode)
    }
  }

  // 保留 chatgpt-theme 等宿主页类名，同时兼容旧版 class 主题和新版的 class 读回。
  root.classList.remove("light", "dark")
  root.classList.add(mode)
}
