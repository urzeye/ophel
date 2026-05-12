export const kimiNativeThemeCss = `
/* =============================================
 * Kimi 站点原生主题适配器 (Kimi Theme Adapter)
 * ============================================= */
:root {
  /* 1. 主体与大容器背景 */
  // --Bg-Primary: var(--gh-bg) !important;
  // --Bg-Tertiary: var(--gh-bg) !important;
  // --Bg-Quaternary: var(--gh-bg) !important;
  // --BgGp-Secondary: var(--gh-bg-secondary) !important;
  // --Always-White: var(--gh-bg) !important;

  /* 2. 灰色次级容器层 (底色画布、侧边栏、交互卡片) */
  --Bg-GroundPC: color-mix(in srgb, var(--gh-primary) 1%, var(--gh-bg)) !important;
  --Bg-Secondary: color-mix(in srgb, var(--gh-primary) 3%, var(--gh-bg)) !important;
  --BgGp-Primary: color-mix(in srgb, var(--gh-primary) 3%, var(--gh-bg)) !important;
  --BgGp-Tertiary: color-mix(in srgb, var(--gh-primary) 4%, var(--gh-bg)) !important;
  --Others-BubbleGray_PC: var(--gh-bg-secondary) !important;

  /* 3. 强调与品牌色 (主色系挂载为 Ophel 主题) */
  --Colors-KMBlue: var(--gh-primary) !important;
  --Colors-KMBlue-hover: color-mix(in srgb, var(--gh-primary) 85%, white) !important;
  --Colors-KMBlue-active: color-mix(in srgb, var(--gh-primary) 85%, black) !important;
  --Others-KMBlue10: color-mix(in srgb, var(--gh-primary) 10%, transparent) !important;

  /* 4. 辅助状态的高亮 */
  --Others-TextSelected: color-mix(in srgb, var(--gh-primary) 20%, transparent) !important;
  --Others-LightBlueBg: color-mix(in srgb, var(--gh-primary) 10%, transparent) !important;

  /* 代码块背景色 */
  --Fills-F1: var(--gh-bg-tertiary) !important;

}

.sidebar {
  background-color: color-mix(in srgb, var(--gh-primary) 1%, var(--gh-bg)) !important;
}

`
