export const qianwenNativeThemeCss = `
/* =============================================
 * Qianwen (通义千问) 站点原生主题适配器 (Qianwen Theme Adapter)
 * ============================================= */
body {
    /* 主要背景 */
    --color-canvas-default: var(--gh-bg) !important;

    /* 次要/浮动层背景 (混入极低浓度主题色) */
    --color-canvas-subtle: color-mix(in srgb, var(--gh-primary) 2%, var(--gh-bg)) !important;

    /* 代码块与表格背景 */
    --color-inline-code-bg: var(--gh-bg-tertiary) !important;
    --color-table-head-th-bg: var(--gh-bg-secondary) !important;

    /* 边框体系 */
    --color-border-muted: color-mix(in srgb, var(--gh-primary) 10%, transparent) !important;
    --color-table-border: color-mix(in srgb, var(--gh-primary) 10%, transparent) !important;
    --color-table-row-border: color-mix(in srgb, var(--gh-primary) 10%, transparent) !important;
    --color-border-default: color-mix(in srgb, var(--gh-primary) 15%, transparent) !important;

    /* 主色调/链接色 */
    --color-link: var(--gh-primary) !important;
    --color-link-border: var(--gh-primary) !important;
    --color-qk-link-border: var(--gh-primary) !important;
}

.bg-pc-sidebar {
    background-color: var(--color-canvas-subtle) !important;
}

`
