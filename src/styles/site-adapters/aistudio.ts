export const aistudioNativeThemeCss = `
/* =============================================
 * AI Studio 站点原生主题适配器 (AI Studio Theme Adapter)
 * ============================================= */
:root, body.light-theme, body.dark-theme {
  /* 1. 核心大容器背景（主画板、主表面） */
  --color-v3-surface: var(--gh-bg) !important;
  --color-canvas-background: var(--gh-bg) !important;

  /* 核心内部容器背景（带微弱主题色渐进染色） */
  --color-v3-surface-container: color-mix(in srgb, var(--gh-primary) 2%, var(--gh-bg)) !important;
  --color-v3-surface-container-high: color-mix(in srgb, var(--gh-primary) 4%, var(--gh-bg)) !important;
  --color-v3-surface-container-highest: color-mix(in srgb, var(--gh-primary) 6%, var(--gh-bg)) !important;

  /* 2. 侧边栏与导航 */
  --color-v3-surface-left-nav: color-mix(in srgb, var(--gh-primary) 3%, var(--gh-bg)) !important;

  /* 3. 边框线（结合原本高亮的颜色降维处理） */
  --color-v3-outline: var(--gh-border) !important;
  --color-v3-outline-var: color-mix(in srgb, var(--gh-primary) 15%, transparent) !important;
  --color-v3-surface-left-nav-border: var(--gh-border) !important;

  /* 4. 交互层级 (悬停、卡片高亮等) */
  --color-v3-hover: var(--gh-hover) !important;
  --color-v3-button-container: var(--gh-bg-secondary) !important;
  --color-v3-button-container-high: var(--gh-bg-tertiary) !important;
  --color-v3-button-container-highest: var(--gh-active-bg) !important;

  /* 5. 品牌重点色 (链接到 Ophel 主题主色调) */
  --color-v3-outline-accent: var(--gh-primary) !important;
  --color-inverse-primary: var(--gh-primary) !important;

}

.inline-code {
  background-color: var(--gh-bg-tertiary) !important;
}
`
