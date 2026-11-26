export const IMAGE_EXPORT_DIALOG_CSS = `
.gh-dialog.gh-image-export-dialog {
  width: min(1080px, calc(100vw - 32px)); max-width: 1080px; height: min(800px, calc(100dvh - 32px));
  padding: 0; display: flex; flex-direction: column; overflow: hidden;
  color: var(--gh-text, #1f2937); font-family: var(--gh-font-family, system-ui, sans-serif);
}
.gh-image-export-header, .gh-image-export-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 24px;
}
.gh-image-export-header { border-bottom: 1px solid var(--gh-border, #e5e7eb); }
.gh-image-export-heading { min-width: 0; }
.gh-image-export-header h2 { margin: 0; font-size: 16px; font-weight: 650; line-height: 1.4; }
.gh-image-export-header p { margin: 4px 0 0; font-size: 12px; line-height: 1.5; color: var(--gh-text-secondary, #6b7280); overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.gh-image-export-close { width: 32px; height: 32px; flex: 0 0 auto; padding: 6px; }
.gh-image-export-body { display: grid; grid-template-columns: 248px minmax(0, 1fr); flex: 1; min-height: 0; }
.gh-image-export-controls { padding: 24px; overflow-y: auto; border-right: 1px solid var(--gh-border, #e5e7eb); }
.gh-image-export-controls fieldset { border: 0; margin: 0 0 24px; padding: 0; min-width: 0; }
.gh-image-export-controls legend { margin-bottom: 10px; padding: 0; font-size: 13px; font-weight: 600; }
.gh-image-export-options { display: flex; gap: 8px; flex-wrap: wrap; }
.gh-image-export-choice {
  flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid var(--gh-border, #d1d5db); border-radius: 8px;
  background: var(--gh-bg, #ffffff); color: var(--gh-text, #1f2937); font: inherit; font-size: 13px;
  line-height: 1.5; cursor: pointer; overflow-wrap: anywhere; transition: background 160ms ease, border-color 160ms ease;
}
.gh-image-export-choice[aria-pressed="true"] {
  border-color: var(--gh-primary, #4285f4); background: color-mix(in srgb, var(--gh-primary, #4285f4) 10%, var(--gh-bg, #ffffff));
  color: var(--gh-primary-text, var(--gh-primary, #2563eb)); font-weight: 600;
}
.gh-image-export-choice:hover:not(:disabled) { background: var(--gh-hover, #f3f4f6); }
.gh-image-export-toggle { display: flex; align-items: flex-start; gap: 10px; margin-top: 20px; font-size: 13px; line-height: 1.5; cursor: pointer; }
.gh-image-export-toggle input { accent-color: var(--gh-primary, #4285f4); margin-top: 3px; flex: 0 0 auto; }
.gh-image-export-toggle small { display: block; margin-top: 4px; color: var(--gh-text-secondary, #6b7280); font-size: 12px; }
.gh-image-export-preview {
  overflow: auto; padding: 24px 32px; background: var(--gh-bg-secondary, #f3f4f6); min-width: 0;
  overscroll-behavior: contain; scrollbar-color: var(--gh-border, #d1d5db) transparent;
}
.gh-image-export-preview figure { margin: 0 auto 24px; max-width: 800px; }
.gh-image-export-preview figure:last-child { margin-bottom: 0; }
.gh-image-export-preview a { display: block; border-radius: 8px; overflow: hidden; box-shadow: var(--gh-shadow-md, 0 6px 24px rgba(0,0,0,.12)); }
.gh-image-export-preview img { display: block; width: 100%; height: auto; }
.gh-image-export-preview figcaption { text-align: center; margin-top: 10px; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--gh-text-secondary, #6b7280); }
.gh-image-export-state { min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; }
.gh-image-export-state p { max-width: 36ch; margin: 0; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.gh-image-export-state progress { width: min(240px, 80%); height: 6px; accent-color: var(--gh-primary, #4285f4); }
.gh-image-export-footer { flex-wrap: wrap; border-top: 1px solid var(--gh-border, #e5e7eb); }
.gh-image-export-status { margin: 0; flex: 1 1 180px; color: var(--gh-text-secondary, #6b7280); font-size: 12px; line-height: 1.5; }
.gh-image-export-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gh-image-export-actions .gh-dialog-btn { min-height: 36px; }
.gh-image-export-error { color: var(--gh-danger, #b91c1c); }
.gh-image-export-dialog button:focus-visible, .gh-image-export-dialog a:focus-visible, .gh-image-export-dialog input:focus-visible {
  outline: 2px solid var(--gh-primary, #4285f4); outline-offset: 3px;
}
.gh-image-export-dialog button:disabled { cursor: not-allowed; opacity: .5; }
.gh-image-export-dialog ::selection { background: var(--gh-primary, #4285f4); color: var(--gh-text-on-primary, #fff); }
@media (max-width: 700px) {
  .gh-dialog.gh-image-export-dialog { width: calc(100vw - 16px); height: calc(100dvh - 16px); min-width: 0; }
  .gh-image-export-header, .gh-image-export-footer { padding: 14px 16px; gap: 12px; }
  .gh-image-export-body { display: flex; flex-direction: column; overflow-y: auto; }
  .gh-image-export-controls { overflow: visible; border-right: 0; border-bottom: 1px solid var(--gh-border, #e5e7eb); padding: 16px; display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }
  .gh-image-export-controls fieldset { margin: 0; }
  .gh-image-export-controls fieldset:nth-of-type(3) { grid-column: 1 / -1; }
  .gh-image-export-toggle { margin: 0; }
  .gh-image-export-preview { flex: 1 0 240px; overflow: visible; padding: 16px; }
  .gh-image-export-actions { width: 100%; justify-content: flex-end; }
}
@media (pointer: coarse) {
  .gh-image-export-close { width: 44px; height: 44px; }
  .gh-image-export-choice, .gh-image-export-actions .gh-dialog-btn { min-height: 44px; }
  .gh-image-export-toggle { min-height: 44px; padding-block: 10px; box-sizing: border-box; }
}
@media (prefers-reduced-motion: reduce) { .gh-image-export-choice { transition: none; } }
`
