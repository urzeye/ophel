export const deepseekNativeThemeCss = `
/* =============================================
 * DeepSeek 站点原生主题适配器 (DeepSeek Theme Adapter)
 * ============================================= */
body, page, .ds-theme {
    /* 核心页面背景层 - 覆盖基础背景 */
    --dsw-alias-bg-base: color-mix(in srgb, var(--gh-primary) 2%, var(--gh-bg)) !important;

    --dsr-side-hover-bg: var(--gh-hover) !important;

    --dsw-alias-markdown-inline-code: var(--gh-bg-tertiary) !important;
    --dsw-alias-markdown-code-block-banner: var(--gh-bg-tertiary) !important;
    --dsw-alias-markdown-code-block: var(--gh-bg-secondary) !important;
}

/* 侧边栏背景 */
.b8812f16, .f3d18f6a {
    background-color: var(--dsw-alias-bg-base) !important;
}
`
