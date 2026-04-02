export const chatgptNativeThemeCss = `
/* =============================================
 * ChatGPT 站点原生主题适配器 (ChatGPT Theme Adapter)
 * ============================================= */
:root, .dark, .light {
  /* 1. 核心页面容器及背景：主背景也稍微混入一点主题色（2%），避免纯白色大面积太刺眼 */
  --bg-primary: color-mix(in srgb, var(--gh-primary) 1%, var(--gh-bg)) !important;
  --bg-secondary: color-mix(in srgb, var(--gh-primary) 2%, var(--gh-bg)) !important;
  --bg-tertiary: color-mix(in srgb, var(--gh-primary) 3%, var(--gh-bg)) !important;

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
