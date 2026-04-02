export const grokNativeThemeCss = `
.bg-surface, .bg-surface-base {
    background-color: color-mix(in srgb, var(--gh-primary) 2%, var(--gh-bg)) !important
}

.\[\&_a\:not\(\.not-prose\)\]\:text-current a:not(.not-prose) {
    color: var(--gh-primary) !important;
}


`
