export const doubaoNativeThemeCss = `
/* =============================================
 * Doubao 站点原生主题适配器 (Doubao Theme Adapter)
 * ============================================= */
body, body[theme-mode="dark"] .semi-always-light {
    /* 1. 核心页面背景层 (按层级混入超低浓度主题色以增加层次感) */
    --semi-color-bg-0: var(--gh-bg) !important;
    --semi-color-bg-1: color-mix(in srgb, var(--gh-primary) 1%, var(--gh-bg)) !important;
    --semi-color-bg-2: color-mix(in srgb, var(--gh-primary) 2%, var(--gh-bg)) !important;
    --semi-color-bg-3: color-mix(in srgb, var(--gh-primary) 4%, var(--gh-bg)) !important;
    --semi-color-bg-4: color-mix(in srgb, var(--gh-primary) 6%, var(--gh-bg)) !important;
    --semi-color-nav-bg: color-mix(in srgb, var(--gh-primary) 2%, var(--gh-bg)) !important;

    /* 2. 品牌主体色系 (半透明状态利用系统透明度) */
    --semi-color-primary: var(--gh-primary) !important;
    --semi-color-primary-hover: color-mix(in srgb, var(--gh-primary) 85%, white) !important;
    --semi-color-primary-active: color-mix(in srgb, var(--gh-primary) 85%, black) !important;
    --semi-color-primary-light-default: color-mix(in srgb, var(--gh-primary) 10%, transparent) !important;
    --semi-color-primary-light-hover: color-mix(in srgb, var(--gh-primary) 15%, transparent) !important;
    --semi-color-primary-light-active: color-mix(in srgb, var(--gh-primary) 20%, transparent) !important;

    /* 3. 链接与聚焦状态 */
    --semi-color-link: var(--gh-primary) !important;
    --semi-color-link-hover: color-mix(in srgb, var(--gh-primary) 85%, white) !important;
    --semi-color-link-active: color-mix(in srgb, var(--gh-primary) 85%, black) !important;
    --semi-color-focus-border: var(--gh-primary) !important;

    /* 4. 轻交互背景色 (Hover / Active) */
    --semi-color-fill-0: color-mix(in srgb, var(--gh-primary) 4%, transparent) !important;
    --semi-color-fill-1: color-mix(in srgb, var(--gh-primary) 8%, transparent) !important;
    --semi-color-fill-2: color-mix(in srgb, var(--gh-primary) 12%, transparent) !important;

    /* 边框 */
    --semi-color-border: color-mix(in srgb, var(--gh-primary) 10%, transparent) !important;

}
`
