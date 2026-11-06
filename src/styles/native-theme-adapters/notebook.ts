/** Notebook 的新版色板在 body 上定义，必须在该层映射到统一主题变量。 */
export const notebookNativeThemeCss = `
:root {
  --mat-sys-background: var(--gh-bg-secondary) !important;
  --mat-sys-on-background: var(--gh-text) !important;
  --mat-sys-on-surface: var(--gh-text) !important;
  --mat-sys-on-surface-variant: var(--gh-text-secondary) !important;
  --mat-sys-outline: var(--gh-border) !important;
}

:root body.luminous-ui {
  --nb-sys-color--surface: var(--gh-bg-secondary) !important;
  --nb-sys-color--surface-bright: var(--gh-bg) !important;
  --nb-sys-color--surface-dim: var(--gh-bg-tertiary) !important;
  --nb-sys-color--on-surface: var(--gh-text) !important;
  --nb-sys-color--on-surface-low: color-mix(in srgb, var(--gh-text) 8%, transparent) !important;
  --nb-sys-color--on-surface-variant: var(--gh-text-secondary) !important;
  --nb-sys-color--brand-blue: var(--gh-primary) !important;
  --nb-sys-elevation--level1-color: color-mix(in srgb, var(--gh-text) 4%, transparent) !important;
}
`
