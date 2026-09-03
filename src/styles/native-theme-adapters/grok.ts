export const grokNativeThemeCss = `
/* 链接颜色 */
.\[\&_a\:not\(\.not-prose\)\]\:text-current a:not(.not-prose) {
    color: var(--gh-primary) !important;
}

/* 侧边栏背景 */
[data-sidebar="sidebar"] {
    background-color: color-mix(in srgb, var(--gh-primary) 2%, var(--gh-bg)) !important;
}

`
