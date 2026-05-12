export const geminiNativeThemeCss = `
/* =============================================
 * Gemini 站点原生主题适配器 (Gemini Theme Adapter)
 * ============================================= */
:root body.light-theme, :root body.dark-theme, :root {
  /* 1. 核心页面背景层 */
  --bard-color-lm-surface: var(--gh-bg) !important;
  --bard-color-lm-surface-bright: var(--gh-bg) !important;
  --bard-color-lm-surface-dim: var(--gh-bg-secondary) !important;
  --bard-color-footer-background: var(--gh-bg-secondary) !important;
  --bard-color-inverse-primary-background: var(--gh-bg-tertiary) !important;

  /* 2. 侧边栏与浮动层：使用极其微弱的主色调混合背景，避免大面积色块导致“太亮”或“太腻” */
  --bard-color-sidenav-background-desktop: color-mix(in srgb, var(--gh-primary) 5%, var(--gh-bg)) !important;

  --bard-color-icon-container-background: color-mix(in srgb, var(--gh-primary) 6%, var(--gh-bg)) !important;

  /* 3. 全局核心文字 */
  --bard-color-lm-on-surface: var(--gh-text) !important;
  --bard-color-sentence-prefix-color: var(--gh-text) !important;
  --bard-color-lm-on-surface-variant: var(--gh-text-secondary) !important;
  --bard-color-sentence-words-color: var(--gh-text-secondary) !important;
  --bard-color-image-lightbox-text: var(--gh-text-tertiary) !important;
  --bard-color-code-comment: var(--gh-text-tertiary) !important;

  /* 4. 品牌高亮与强调色（绑定我们插件的主题色段） */
  --bard-color-surface-tint: var(--gh-primary) !important;
  --bard-color-form-field-outline-active: var(--gh-primary) !important;
  --bard-color-brand-text-gradient-stop-1: var(--gh-primary) !important;
  --bard-color-chrome-experiment-badge: var(--gh-primary) !important;
  --bard-color-share-link: var(--gh-primary) !important;

  /* 5. 分叉对话、状态卡片相关 */
  --bard-color-zero-state-card-selected: var(--gh-active-bg) !important;
  --bard-color-zero-state-prompt-chip-background: var(--gh-hover) !important;

  /* 6. 其他元素 */
  --gem-sys-color--primary: var(--gh-primary) !important;
  /* 图标颜色 */
  --mat-icon-color: var(--gh-primary) !important;
}

/* 仅在 AI 回复容器内覆盖 surface-container-high（用于代码块背景），
 * 不在 :root 全局设置，以免影响用户气泡等其他使用该变量的元素 */
model-response, .model-response-container {
  --gem-sys-color--surface-container-high: var(--gh-bg-tertiary) !important;
}`
