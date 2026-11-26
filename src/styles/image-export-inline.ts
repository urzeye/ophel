export const IMAGE_EXPORT_DIALOG_CSS = `
.gh-dialog.gh-image-export-dialog {
  width: min(1080px, calc(100vw - 32px)); max-width: 1080px; height: min(800px, calc(100dvh - 32px));
  padding: 0; display: flex; flex-direction: column; overflow: hidden;
  color: var(--gh-text, #1f2937); font-family: var(--gh-font-family, system-ui, sans-serif);
  animation: gh-image-export-dialog-in 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes gh-image-export-dialog-in {
  from { opacity: 0; transform: translateY(10px) scale(0.99); }
  to { opacity: 1; transform: none; }
}
.gh-image-export-header, .gh-image-export-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 24px;
}
.gh-image-export-header { border-bottom: 1px solid var(--gh-border, #e5e7eb); }
.gh-image-export-heading { min-width: 0; }
.gh-image-export-header h2 { margin: 0; font-size: 16px; font-weight: 650; line-height: 1.4; letter-spacing: -0.01em; }
.gh-image-export-header p {
  margin: 3px 0 0; font-size: 12px; line-height: 1.5; color: var(--gh-text-secondary, #6b7280);
  overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
.gh-image-export-close { width: 32px; height: 32px; flex: 0 0 auto; padding: 6px; border-radius: 8px; }

.gh-image-export-body { display: grid; grid-template-columns: 252px minmax(0, 1fr); flex: 1; min-height: 0; }

/* 控制列：分组标签 + 分段控件 */
.gh-image-export-controls { padding: 20px 20px 24px; overflow-y: auto; border-right: 1px solid var(--gh-border, #e5e7eb); }
.gh-image-export-controls fieldset { border: 0; margin: 0 0 18px; padding: 0; min-width: 0; }
.gh-image-export-controls fieldset:disabled { opacity: 0.55; }
.gh-image-export-controls legend {
  margin-bottom: 8px; padding: 0; font-size: 12px; font-weight: 600;
  color: var(--gh-text-secondary, #6b7280); letter-spacing: 0.01em;
}
.gh-image-export-options {
  display: flex; gap: 2px; padding: 2px;
  background: var(--gh-bg-secondary, #f3f4f6);
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 10px;
}
.gh-image-export-choice {
  flex: 1; min-width: 0; padding: 6px 10px; border: 0; border-radius: 8px;
  background: transparent; color: var(--gh-text-secondary, #6b7280);
  font: inherit; font-size: 13px; font-weight: 500; line-height: 1.5; cursor: pointer;
  overflow-wrap: anywhere;
  transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
}
.gh-image-export-choice:hover:not(:disabled):not([aria-pressed="true"]) {
  color: var(--gh-text, #1f2937);
  background: color-mix(in srgb, var(--gh-text, #1f2937) 6%, transparent);
}
.gh-image-export-choice[aria-pressed="true"] {
  background: var(--gh-bg, #ffffff); color: var(--gh-text, #1f2937); font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 0 0 1px color-mix(in srgb, var(--gh-border, #d1d5db) 70%, transparent);
}
.gh-image-export-toggle {
  display: flex; align-items: flex-start; gap: 10px; margin-top: 14px; padding: 8px 10px;
  border-radius: 10px; font-size: 13px; line-height: 1.5; cursor: pointer;
  transition: background 160ms ease;
}
.gh-image-export-toggle:hover { background: var(--gh-hover, #f3f4f6); }
.gh-image-export-toggle input { accent-color: var(--gh-primary, #4285f4); margin-top: 3px; flex: 0 0 auto; }
.gh-image-export-toggle small { display: block; margin-top: 2px; color: var(--gh-text-secondary, #6b7280); font-size: 12px; }

/* 预览列：灰底 + 装裱卡片 */
.gh-image-export-preview {
  overflow: auto; padding: 28px 32px; background: var(--gh-bg-secondary, #f3f4f6); min-width: 0;
  overscroll-behavior: contain; scrollbar-color: var(--gh-border, #d1d5db) transparent;
}
.gh-image-export-preview figure { margin: 0 auto 24px; max-width: 800px; animation: gh-image-export-page-in 340ms cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: calc(var(--i, 0) * 70ms); }
.gh-image-export-preview figure:last-child { margin-bottom: 0; }
.gh-image-export-preview a {
  display: block; padding: 10px; border-radius: 14px;
  background: var(--gh-bg, #ffffff); border: 1px solid var(--gh-border, #e5e7eb);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05), 0 16px 40px -16px rgba(0, 0, 0, 0.18);
  transition: box-shadow 200ms ease, transform 200ms ease;
}
.gh-image-export-preview a:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06), 0 24px 48px -16px rgba(0, 0, 0, 0.22);
}
.gh-image-export-preview img { display: block; width: 100%; height: auto; border-radius: 8px; }
.gh-image-export-preview figcaption {
  text-align: center; margin-top: 10px; font-size: 12px;
  font-variant-numeric: tabular-nums; color: var(--gh-text-secondary, #6b7280);
}
@keyframes gh-image-export-page-in {
  from { opacity: 0; transform: translateY(12px) scale(0.985); }
  to { opacity: 1; transform: none; }
}

/* 加载态：迷你页面骨架 + 真实进度 */
.gh-image-export-state {
  min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; text-align: center;
}
.gh-image-export-state p { max-width: 36ch; margin: 0; font-size: 13px; line-height: 1.6; color: var(--gh-text-secondary, #6b7280); overflow-wrap: anywhere; }
.gh-image-export-state progress {
  width: min(220px, 80%); height: 4px; appearance: none; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--gh-text, #1f2937) 10%, transparent); overflow: hidden;
}
.gh-image-export-state progress::-webkit-progress-bar { background: color-mix(in srgb, var(--gh-text, #1f2937) 10%, transparent); border-radius: 999px; }
.gh-image-export-state progress::-webkit-progress-value { background: var(--gh-primary, #4285f4); border-radius: 999px; transition: width 200ms ease; }
.gh-image-export-state progress::-moz-progress-bar { background: var(--gh-primary, #4285f4); border-radius: 999px; }
.gh-image-export-skeleton {
  width: 176px; padding: 16px; border-radius: 14px;
  display: flex; flex-direction: column; gap: 8px;
  background: var(--gh-bg, #ffffff); border: 1px solid var(--gh-border, #e5e7eb);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05), 0 16px 40px -16px rgba(0, 0, 0, 0.18);
  animation: gh-image-export-skeleton-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.gh-image-export-skeleton span {
  display: block; height: 8px; border-radius: 4px; overflow: hidden; position: relative;
  background: var(--gh-bg-secondary, #f3f4f6);
}
.gh-image-export-skeleton span::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 25%, color-mix(in srgb, var(--gh-text, #1f2937) 9%, transparent) 50%, transparent 75%);
  transform: translateX(-100%);
  animation: gh-image-export-shimmer 1.5s ease-in-out infinite;
}
.gh-image-export-skeleton span:nth-child(2)::after { animation-delay: 0.08s; }
.gh-image-export-skeleton span:nth-child(3)::after { animation-delay: 0.16s; }
.gh-image-export-skeleton span:nth-child(4)::after { animation-delay: 0.24s; }
.gh-image-export-skeleton span:nth-child(5)::after { animation-delay: 0.32s; }
.gh-image-export-skeleton span:nth-child(6)::after { animation-delay: 0.4s; }
.gh-image-export-skeleton .gh-image-export-sk-title { width: 64%; height: 10px; }
.gh-image-export-skeleton .gh-image-export-sk-meta { width: 38%; height: 6px; margin-bottom: 4px; }
.gh-image-export-skeleton .gh-image-export-sk-bubble {
  align-self: flex-end; width: 78%; height: 26px; border-radius: 8px 8px 3px 8px;
  background: color-mix(in srgb, var(--gh-primary, #4285f4) 12%, transparent);
}
.gh-image-export-skeleton .gh-image-export-sk-short { width: 56%; }
.gh-image-export-skeleton .gh-image-export-sk-media {
  width: 100%; height: 44px; border-radius: 8px; margin-top: 4px;
  border: 1px solid var(--gh-border, #e5e7eb); box-sizing: border-box;
}
@keyframes gh-image-export-shimmer { to { transform: translateX(100%); } }
@keyframes gh-image-export-skeleton-in {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to { opacity: 1; transform: none; }
}

/* 错误态 */
.gh-image-export-error-icon { color: var(--gh-danger, #b91c1c); }
.gh-image-export-error-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; max-width: 100%; }
.gh-image-export-error-actions .gh-dialog-btn { white-space: normal; }

.gh-image-export-footer { flex-wrap: wrap; border-top: 1px solid var(--gh-border, #e5e7eb); }
.gh-image-export-status {
  margin: 0; flex: 1 1 180px; color: var(--gh-text-secondary, #6b7280);
  font-size: 12px; line-height: 1.5; font-variant-numeric: tabular-nums;
}
.gh-image-export-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gh-image-export-actions .gh-dialog-btn { min-height: 36px; }
.gh-image-export-error { color: var(--gh-danger, #b91c1c); }
.gh-image-export-state .gh-image-export-error { color: var(--gh-text, #1f2937); font-weight: 500; }
.gh-image-export-dialog button:focus-visible, .gh-image-export-dialog a:focus-visible, .gh-image-export-dialog input:focus-visible {
  outline: 2px solid var(--gh-primary, #4285f4); outline-offset: 3px;
}
.gh-image-export-dialog button:disabled { cursor: not-allowed; opacity: 0.5; }
.gh-image-export-dialog ::selection { background: var(--gh-primary, #4285f4); color: var(--gh-text-on-primary, #fff); }

@media (max-width: 700px) {
  .gh-dialog.gh-image-export-dialog { width: calc(100vw - 16px); height: calc(100dvh - 16px); min-width: 0; }
  .gh-image-export-header, .gh-image-export-footer { padding: 14px 16px; gap: 12px; }
  .gh-image-export-body { display: flex; flex-direction: column; overflow-y: auto; }
  .gh-image-export-controls { overflow: visible; border-right: 0; border-bottom: 1px solid var(--gh-border, #e5e7eb); padding: 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .gh-image-export-controls fieldset { margin: 0; }
  .gh-image-export-controls .gh-image-export-wide-options { grid-column: 1 / -1; }
  .gh-image-export-toggle { margin: 0; }
  .gh-image-export-preview { flex: 1 0 240px; overflow: visible; padding: 16px; }
  .gh-image-export-actions { width: 100%; justify-content: flex-end; }
}
@media (pointer: coarse) {
  .gh-image-export-close { width: 44px; height: 44px; }
  .gh-image-export-choice, .gh-image-export-actions .gh-dialog-btn, .gh-image-export-error-actions .gh-dialog-btn { min-height: 44px; }
  .gh-image-export-toggle { min-height: 44px; padding-block: 10px; box-sizing: border-box; }
}
@media (prefers-reduced-motion: reduce) {
  .gh-image-export-choice, .gh-image-export-toggle, .gh-image-export-preview a { transition: none; }
  .gh-dialog.gh-image-export-dialog, .gh-image-export-preview figure, .gh-image-export-skeleton { animation: none; }
  .gh-image-export-skeleton span::after { animation: none; content: none; }
}
`
