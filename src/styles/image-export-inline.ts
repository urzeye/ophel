export const IMAGE_EXPORT_DIALOG_CSS = `
.gh-dialog.gh-image-export-dialog {
  width: min(1160px, calc(100vw - 32px));
  max-width: 1160px;
  height: min(840px, calc(100dvh - 32px));
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--gh-border, rgba(0, 0, 0, 0.08));
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text, #1f2937);
  font-family: var(--gh-font-family, "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Microsoft YaHei", "PingFang SC", "Hiragino Sans SC", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif);
  animation: gh-image-export-dialog-in 240ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes gh-image-export-dialog-in {
  from { opacity: 0; transform: translateY(8px) scale(0.99); }
  to { opacity: 1; transform: none; }
}

.gh-dialog.gh-image-export-dialog:focus {
  outline: none;
}
.gh-image-export-header,
.gh-image-export-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px;
  flex-shrink: 0;
}
.gh-image-export-header {
  border-bottom: 1px solid var(--gh-border, #e5e7eb);
}
.gh-image-export-header-lead {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.gh-image-export-header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--gh-primary, #4285f4) 12%, transparent);
  color: var(--gh-primary-text, var(--gh-primary, #4285f4));
}
.gh-image-export-heading { min-width: 0; }
.gh-image-export-header h2 {
  margin: 0;
  font-size: 15.5px;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.01em;
}
.gh-image-export-header p {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--gh-text-secondary, #6b7280);
  overflow-wrap: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}
.gh-image-export-close {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--gh-text-secondary, #6b7280);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, transform 120ms ease;
}
.gh-image-export-close:hover:not(:disabled) {
  background: var(--gh-hover, rgba(0, 0, 0, 0.05));
  color: var(--gh-text, #1f2937);
}
.gh-image-export-close:active:not(:disabled) {
  transform: translateY(1px);
}

.gh-image-export-body {
  display: grid;
  grid-template-columns: 324px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}

/* 控制列：高秩序操作台控件 */
.gh-image-export-controls {
  padding: 16px 18px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-right: 1px solid var(--gh-border, #e5e7eb);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--gh-text-tertiary, #8d94a1) 48%, transparent) transparent;
}
.gh-image-export-controls::-webkit-scrollbar,
.gh-image-export-preview::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.gh-image-export-controls::-webkit-scrollbar-track,
.gh-image-export-preview::-webkit-scrollbar-track {
  background: transparent;
}
.gh-image-export-controls::-webkit-scrollbar-thumb,
.gh-image-export-preview::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--gh-text-tertiary, #8d94a1) 45%, transparent);
  border-radius: 999px;
}
.gh-image-export-controls::-webkit-scrollbar-thumb:hover,
.gh-image-export-preview::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--gh-text-secondary, #6b7280) 65%, transparent);
}

.gh-image-export-all-controls {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.gh-image-export-all-controls:disabled {
  opacity: 0.55;
  pointer-events: none;
}
.gh-image-export-primary-controls {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gh-image-export-choice-group {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.gh-image-export-choice-group legend {
  margin-bottom: 6px;
  padding: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--gh-text-secondary, #6b7280);
  letter-spacing: 0.01em;
}
.gh-image-export-options {
  display: flex;
  align-items: stretch;
  gap: 3px;
  padding: 3px;
  background: var(--gh-bg-secondary, #f9fafb);
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 8px;
}
/* 按内容权重弹性分配，禁止单词从中间折断；超长多语言仅在词边界平衡换行 */
.gh-image-export-choice {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--gh-text-secondary, #6b7280);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.3;
  text-align: center;
  cursor: pointer;
  word-break: normal;
  overflow-wrap: break-word;
  hyphens: auto;
  text-wrap: balance;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease, transform 120ms ease;
}
.gh-image-export-choice:hover:not(:disabled):not([aria-pressed="true"]) {
  color: var(--gh-text, #1f2937);
  background: color-mix(in srgb, var(--gh-text, #1f2937) 6%, transparent);
}
.gh-image-export-choice:active:not(:disabled) {
  transform: translateY(1px);
}
.gh-image-export-choice[aria-pressed="true"] {
  background: var(--gh-bg, #ffffff);
  color: var(--gh-primary-text, var(--gh-primary, #4285f4));
  font-weight: 600;
  box-shadow:
    var(--gh-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.08)),
    0 0 0 1px color-mix(in srgb, var(--gh-primary, #4285f4) 24%, var(--gh-border, #d1d5db));
}

/* 统一开关行 */
.gh-image-export-toggle-wrap {
  display: flex;
  flex-direction: column;
}
.gh-image-export-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  padding: 5px 8px;
  margin: 0 -8px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gh-text, #1f2937);
  cursor: pointer;
  user-select: none;
  transition: background 140ms ease;
  box-sizing: border-box;
}
.gh-image-export-toggle:hover {
  background: var(--gh-hover, rgba(0, 0, 0, 0.04));
}
.gh-image-export-toggle-label {
  min-width: 0;
  overflow-wrap: break-word;
}
.gh-image-export-toggle-hint {
  margin: 2px 0 4px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--gh-text-secondary, #6b7280);
}

/* 可折叠分组 */
.gh-image-export-group {
  border-top: 1px solid var(--gh-border, #e5e7eb);
  margin-top: 14px;
  padding-top: 10px;
}
.gh-image-export-group summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  margin: 0 -8px;
  border-radius: 8px;
  cursor: pointer;
  list-style: none;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--gh-text, #1f2937);
  user-select: none;
  transition: background 140ms ease;
}
.gh-image-export-group summary::-webkit-details-marker { display: none; }
.gh-image-export-group summary:hover {
  background: var(--gh-hover, rgba(0, 0, 0, 0.04));
}
.gh-image-export-summary-title {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gh-image-export-summary-end {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-shrink: 0;
}
.gh-image-export-summary-meta {
  font-size: 12px;
  font-weight: 450;
  color: var(--gh-text-secondary, #6b7280);
  font-variant-numeric: tabular-nums;
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gh-image-export-chevron {
  flex-shrink: 0;
  color: var(--gh-text-secondary, #6b7280);
  transform: rotate(-90deg);
  transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gh-image-export-group[open] > summary .gh-image-export-chevron {
  transform: rotate(0deg);
}
.gh-image-export-group-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
}

/* 输入框与内联动作 */
.gh-image-export-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--gh-text-secondary, #6b7280);
}
.gh-image-export-field-label {
  font-size: 12px;
  font-weight: 550;
  color: var(--gh-text-secondary, #6b7280);
}
.gh-image-export-field > span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.gh-image-export-field output {
  font-size: 12px;
  font-weight: 600;
  color: var(--gh-text, #1f2937);
  font-variant-numeric: tabular-nums;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--gh-bg-tertiary, var(--gh-hover, #f3f4f6));
}
.gh-image-export-title-field {
  margin-bottom: 2px;
}
.gh-image-export-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.gh-image-export-field input[type="text"] {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid var(--gh-input-border, var(--gh-border, #d1d5db));
  background: var(--gh-input-bg, var(--gh-bg, #ffffff));
  color: var(--gh-text, #1f2937);
  font: inherit;
  font-size: 13px;
  caret-color: var(--gh-primary, #4285f4);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.gh-image-export-field input[type="text"]::placeholder {
  color: var(--gh-text-tertiary, var(--gh-text-secondary, #8d94a1));
}
.gh-image-export-field input[type="text"]:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--gh-primary, #4285f4) 60%, var(--gh-input-border, var(--gh-border, #d1d5db)));
}
.gh-image-export-field input[type="text"]:focus {
  outline: 2px solid transparent;
  border-color: var(--gh-primary, #4285f4);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--gh-primary, #4285f4) 18%, transparent);
}
.gh-image-export-field input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.gh-image-export-inline-icon-btn {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 6px;
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text-secondary, #6b7280);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease, transform 120ms ease;
}
.gh-image-export-inline-icon-btn:hover:not(:disabled) {
  background: var(--gh-hover, #f3f4f6);
  color: var(--gh-text, #1f2937);
}
.gh-image-export-inline-icon-btn:active:not(:disabled) {
  transform: translateY(1px);
}

/* 自定义滑块：双色填充轨道，兼容 Chrome 与 Firefox */
.gh-image-export-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 5px;
  margin: 6px 0 2px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--gh-primary, #4285f4) 0%,
    var(--gh-primary, #4285f4) var(--range-pct, 50%),
    color-mix(in srgb, var(--gh-text-secondary, #6b7280) 24%, transparent) var(--range-pct, 50%),
    color-mix(in srgb, var(--gh-text-secondary, #6b7280) 24%, transparent) 100%
  );
  cursor: pointer;
}
.gh-image-export-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--gh-bg, #ffffff);
  border: 2px solid var(--gh-primary, #4285f4);
  box-shadow: var(--gh-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.2));
  transition: transform 140ms ease, box-shadow 140ms ease;
}
.gh-image-export-range:hover::-webkit-slider-thumb {
  transform: scale(1.1);
}
.gh-image-export-range::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--gh-bg, #ffffff);
  border: 2px solid var(--gh-primary, #4285f4);
  box-shadow: var(--gh-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.2));
  box-sizing: border-box;
  transition: transform 140ms ease;
}
.gh-image-export-range::-moz-range-track {
  height: 5px;
  border-radius: 999px;
  background: transparent;
}

/* 水印内嵌卡片与取色控件 */
.gh-image-export-watermark-section {
  border-top: 1px solid var(--gh-border, #e5e7eb);
  margin-top: 14px;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gh-image-export-watermark-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  background: var(--gh-bg-secondary, #f9fafb);
  border: 1px solid var(--gh-border, #e5e7eb);
}
.gh-image-export-watermark-empty-note {
  margin: -4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--gh-text-secondary, #6b7280);
}
.gh-image-export-watermark-params {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.gh-image-export-watermark-params:disabled {
  opacity: 0.48;
  pointer-events: none;
}
.gh-image-export-watermark-card .gh-image-export-options {
  flex-wrap: wrap;
  background: var(--gh-bg-tertiary, color-mix(in srgb, var(--gh-bg-secondary, #f3f4f6) 65%, var(--gh-border, #e5e7eb)));
}
.gh-image-export-watermark-card .gh-image-export-choice {
  flex: 1 1 108px;
}
.gh-image-export-watermark-card .gh-image-export-toggle {
  margin: 0 -4px;
  padding: 4px;
}
.gh-image-export-subgroup {
  margin-top: 2px;
  padding-top: 8px;
}
.gh-image-export-subgroup summary {
  margin: 0 -4px;
  padding: 5px 4px;
  font-size: 12.5px;
}
.gh-image-export-color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.gh-image-export-color-picker {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 4px 9px 4px 5px;
  border-radius: 6px;
  border: 1px solid var(--gh-input-border, var(--gh-border, #d1d5db));
  background: var(--gh-input-bg, var(--gh-bg, #ffffff));
  cursor: pointer;
  box-sizing: border-box;
}
/* 透明原生取色器本身不可见，由外层容器承接键盘焦点环以符合 WCAG 2.4.7；支持 :has 时仅在键盘焦点显环 */
.gh-image-export-color-picker:focus-within {
  outline: 2px solid var(--gh-primary, #4285f4);
  outline-offset: 2px;
}
@supports selector(:has(*)) {
  .gh-image-export-color-picker:focus-within {
    outline: none;
  }
  .gh-image-export-color-picker:has(input:focus-visible) {
    outline: 2px solid var(--gh-primary, #4285f4);
    outline-offset: 2px;
  }
}
.gh-image-export-color-picker input[type="color"] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.gh-image-export-color-swatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--gh-text, #1f2937) 18%, transparent);
  flex-shrink: 0;
}
.gh-image-export-color-picker code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--gh-text, #1f2937);
}
.gh-image-export-swatches {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.gh-image-export-swatch-btn {
  position: relative;
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--gh-text, #1f2937) 26%, transparent);
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease;
}
/* 扩展透明点击热区至 28px，保持视觉圆点精巧的同时满足可达性 */
.gh-image-export-swatch-btn::after {
  content: "";
  position: absolute;
  inset: -5px;
}
.gh-image-export-swatch-btn:hover:not(:disabled) {
  transform: scale(1.12);
}
.gh-image-export-swatch-btn:active:not(:disabled) {
  transform: scale(0.95);
}
.gh-image-export-swatch-btn[aria-pressed="true"] {
  box-shadow: 0 0 0 2px var(--gh-bg, #ffffff), 0 0 0 3.5px var(--gh-primary, #4285f4);
}

.gh-image-export-controls-footer {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--gh-border, #e5e7eb);
}
.gh-image-export-reset {
  width: 100%;
  min-height: 34px;
  padding-block: 6px;
  font-size: 13px;
  font-weight: 550;
  line-height: 1.3;
  border-radius: 8px;
  white-space: normal;
  text-wrap: balance;
}
.gh-image-export-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--gh-text-secondary, #6b7280);
}

/* 预览列：微点阵工作台，所见即所得，无误导白框 */
.gh-image-export-preview-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  position: relative;
}
.gh-image-export-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 9px 20px;
  border-bottom: 1px solid var(--gh-border, #e5e7eb);
  background: var(--gh-bg, #ffffff);
  font-size: 12px;
  color: var(--gh-text-secondary, #6b7280);
}
.gh-image-export-zoom-bar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--gh-bg-secondary, #f9fafb);
  border: 1px solid var(--gh-border, #e5e7eb);
}
.gh-image-export-zoom-btn {
  padding: 4px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--gh-text-secondary, #6b7280);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease, transform 120ms ease;
}
.gh-image-export-zoom-btn:hover:not(:disabled):not([aria-pressed="true"]) {
  color: var(--gh-text, #1f2937);
  background: color-mix(in srgb, var(--gh-text, #1f2937) 6%, transparent);
}
.gh-image-export-zoom-btn:active:not(:disabled) {
  transform: translateY(1px);
}
.gh-image-export-zoom-btn[aria-pressed="true"] {
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text, #1f2937);
  font-weight: 600;
  box-shadow: var(--gh-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.08));
}
.gh-image-export-toolbar-right {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-left: auto;
  min-width: 0;
}
.gh-image-export-toolbar-meta {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--gh-text-secondary, #6b7280);
  white-space: nowrap;
}
.gh-image-export-open-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--gh-border, #e5e7eb);
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text, #1f2937);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease, transform 120ms ease;
}
.gh-image-export-open-btn:hover:not(:disabled) {
  background: var(--gh-hover, #f3f4f6);
  border-color: color-mix(in srgb, var(--gh-text-secondary, #6b7280) 38%, var(--gh-border, #e5e7eb));
}
.gh-image-export-open-btn:active:not(:disabled) {
  transform: translateY(1px);
}

/* 后台更新时的极细顶部进度条，不占位不闪屏 */
.gh-image-export-update-bar {
  position: relative;
  height: 0;
  z-index: 2;
}
.gh-image-export-update-bar progress,
.gh-image-export-update-bar .gh-image-export-indeterminate {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  display: block;
}
.gh-image-export-update-bar progress {
  appearance: none;
  border: 0;
  background: transparent;
}
.gh-image-export-update-bar progress::-webkit-progress-bar {
  background: color-mix(in srgb, var(--gh-primary, #4285f4) 14%, transparent);
}
.gh-image-export-update-bar progress::-webkit-progress-value {
  background: var(--gh-primary, #4285f4);
  transition: width 180ms ease;
}
.gh-image-export-update-bar progress::-moz-progress-bar {
  background: var(--gh-primary, #4285f4);
}

/* 不确定阶段滑动条：替代去外观后静止不动的原生 indeterminate progress */
.gh-image-export-indeterminate {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--gh-primary, #4285f4) 16%, transparent);
}
.gh-image-export-indeterminate::after {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 38%;
  border-radius: inherit;
  background: var(--gh-primary, #4285f4);
  animation: gh-image-export-indeterminate 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes gh-image-export-indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(360%); }
}

.gh-image-export-preview {
  flex: 1;
  overflow: auto;
  padding: 0;
  min-width: 0;
  overscroll-behavior: contain;
  background-color: color-mix(in srgb, var(--gh-bg-secondary, #f9fafb) 55%, var(--gh-bg-tertiary, var(--gh-hover, #e5e7eb)));
  background-image: radial-gradient(
    color-mix(in srgb, var(--gh-text, #1f2937) 9%, transparent) 1px,
    transparent 1px
  );
  background-size: 16px 16px;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--gh-text-tertiary, #8d94a1) 48%, transparent) transparent;
  transition: opacity 180ms ease;
}
.gh-image-export-preview.is-pannable {
  cursor: grab;
}
.gh-image-export-preview.is-panning {
  cursor: grabbing;
  user-select: none;
}
.gh-image-export-preview-stage {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  min-width: 100%;
  padding: 28px 32px;
  box-sizing: border-box;
  gap: 28px;
}
.gh-image-export-preview.is-updating figure {
  opacity: 0.72;
}
.gh-image-export-preview figure {
  margin: 0;
  width: 100%;
  transition: opacity 180ms ease;
  animation: gh-image-export-page-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: calc(var(--i, 0) * 50ms);
}

.gh-image-export-canvas-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--gh-text, #1f2937) 10%, transparent);
  border-radius: 6px;
  overflow: hidden;
  background: transparent;
  box-shadow: var(--gh-shadow-lg, 0 14px 36px -10px rgba(0, 0, 0, 0.18));
  transition: box-shadow 180ms ease;
}
.gh-image-export-canvas-btn.is-fit { cursor: zoom-in; }
.gh-image-export-canvas-btn.is-static { cursor: default; }
.gh-image-export-canvas-btn.is-zoomed { cursor: zoom-out; }
.gh-image-export-preview.is-pannable .gh-image-export-canvas-btn { cursor: grab; }
.gh-image-export-preview.is-panning .gh-image-export-canvas-btn { cursor: grabbing; }
.gh-image-export-canvas-btn:hover:not(:disabled) {
  box-shadow:
    0 2px 4px color-mix(in srgb, var(--gh-text, #000000) 10%, transparent),
    var(--gh-shadow-lg, 0 20px 44px -10px rgba(0, 0, 0, 0.24));
}
.gh-image-export-preview img {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
  -webkit-user-drag: none;
}
.gh-image-export-page-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  padding: 0 2px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--gh-text-secondary, #6b7280);
}
.gh-image-export-caption-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gh-image-export-page-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.gh-image-export-caption-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 6px;
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text-secondary, #6b7280);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease, transform 120ms ease;
}
.gh-image-export-caption-btn:hover:not(:disabled) {
  background: var(--gh-hover, #f3f4f6);
  color: var(--gh-text, #1f2937);
  border-color: color-mix(in srgb, var(--gh-primary, #4285f4) 40%, var(--gh-border, #e5e7eb));
}
.gh-image-export-caption-btn:active:not(:disabled) {
  transform: translateY(1px);
}
@keyframes gh-image-export-page-in {
  from { opacity: 0; transform: translateY(10px) scale(0.99); }
  to { opacity: 1; transform: none; }
}

/* 首次加载态：迷你页面骨架 + 真实进度 */
.gh-image-export-state {
  min-height: 100%;
  padding: 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  text-align: center;
}
.gh-image-export-state p {
  max-width: 38ch;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--gh-text-secondary, #6b7280);
  overflow-wrap: break-word;
}
.gh-image-export-state progress,
.gh-image-export-state .gh-image-export-indeterminate {
  width: min(220px, 80%);
  height: 4px;
}
.gh-image-export-state progress {
  appearance: none;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--gh-text, #1f2937) 10%, transparent);
  overflow: hidden;
}
.gh-image-export-state progress::-webkit-progress-bar {
  background: color-mix(in srgb, var(--gh-text, #1f2937) 10%, transparent);
  border-radius: 999px;
}
.gh-image-export-state progress::-webkit-progress-value {
  background: var(--gh-primary, #4285f4);
  border-radius: 999px;
  transition: width 200ms ease;
}
.gh-image-export-state progress::-moz-progress-bar {
  background: var(--gh-primary, #4285f4);
  border-radius: 999px;
}
.gh-image-export-skeleton {
  width: 184px;
  padding: 16px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--gh-bg, #ffffff);
  border: 1px solid var(--gh-border, #e5e7eb);
  box-shadow: var(--gh-shadow-lg, 0 16px 40px -16px rgba(0, 0, 0, 0.18));
  animation: gh-image-export-skeleton-in 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.gh-image-export-skeleton span {
  display: block;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  background: var(--gh-bg-secondary, #f3f4f6);
}
.gh-image-export-skeleton span::after {
  content: "";
  position: absolute;
  inset: 0;
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
  align-self: flex-end;
  width: 74%;
  height: 24px;
  border-radius: 8px 8px 4px 8px;
  background: color-mix(in srgb, var(--gh-primary, #4285f4) 12%, transparent);
}
.gh-image-export-skeleton .gh-image-export-sk-short { width: 56%; }
.gh-image-export-skeleton .gh-image-export-sk-media {
  width: 100%;
  height: 44px;
  border-radius: 8px;
  margin-top: 4px;
  border: 1px solid var(--gh-border, #e5e7eb);
  box-sizing: border-box;
}
@keyframes gh-image-export-shimmer { to { transform: translateX(100%); } }
@keyframes gh-image-export-skeleton-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: none; }
}

/* 错误态 */
.gh-image-export-error-icon { color: var(--gh-danger, #ef4444); }
.gh-image-export-error-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 100%;
}
.gh-image-export-error-actions .gh-dialog-btn { white-space: normal; }

/* 页脚 */
.gh-image-export-footer {
  flex-wrap: wrap;
  gap: 10px 16px;
  border-top: 1px solid var(--gh-border, #e5e7eb);
  background: var(--gh-bg, #ffffff);
}
.gh-image-export-status {
  margin: 0;
  flex: 1 1 200px;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  color: var(--gh-text-secondary, #6b7280);
  font-size: 12.5px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
}
.gh-image-export-status-note {
  color: var(--gh-text-tertiary, var(--gh-text-secondary, #8d94a1));
  font-size: 12px;
}
.gh-image-export-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}
.gh-image-export-actions .gh-dialog-btn {
  min-height: 36px;
  padding: 7px 15px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 550;
  white-space: nowrap;
  flex-shrink: 0;
  word-break: normal;
  overflow-wrap: normal;
}
.gh-image-export-error { color: var(--gh-danger, #ef4444); }
.gh-image-export-state .gh-image-export-error {
  color: var(--gh-text, #1f2937);
  font-weight: 500;
}

.gh-image-export-dialog button:focus-visible,
.gh-image-export-dialog a:focus-visible,
.gh-image-export-dialog input:focus-visible,
.gh-image-export-dialog summary:focus-visible {
  outline: 2px solid var(--gh-primary, #4285f4);
  outline-offset: 2px;
}
.gh-image-export-dialog button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.gh-image-export-dialog ::selection {
  background: var(--gh-primary, #4285f4);
  color: var(--gh-text-on-primary, #ffffff);
}

@media (max-width: 900px) {
  .gh-image-export-body {
    grid-template-columns: 296px minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .gh-dialog.gh-image-export-dialog {
    width: calc(100vw - 16px);
    height: calc(100dvh - 16px);
    min-width: 0;
  }
  .gh-image-export-header,
  .gh-image-export-footer {
    padding: 12px 16px;
    gap: 10px;
  }
  /* 窄屏固定上方预览窗、下方控制区独立滚动，消除双层滚动打架与盲调 */
  .gh-image-export-body {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .gh-image-export-preview-pane {
    order: -1;
    flex: 0 0 auto;
    height: min(300px, 38dvh);
    min-height: 180px;
    border-bottom: 1px solid var(--gh-border, #e5e7eb);
    overflow: hidden;
  }
  .gh-image-export-controls {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    border-right: 0;
    padding: 14px 16px 18px;
  }
  .gh-image-export-preview-toolbar {
    padding: 8px 14px;
  }
  .gh-image-export-preview {
    flex: 1 1 auto;
    padding: 0;
  }
  .gh-image-export-preview-stage {
    padding: 14px;
    gap: 18px;
  }
  .gh-image-export-open-btn span {
    display: none;
  }
  .gh-image-export-open-btn {
    min-width: 32px;
    min-height: 32px;
    padding: 5px 7px;
  }
  .gh-image-export-actions {
    width: 100%;
    justify-content: flex-end;
    gap: 6px;
  }
  .gh-image-export-actions .gh-dialog-btn {
    padding: 7px 11px;
    gap: 5px;
    font-size: 12.5px;
  }
}

@media (pointer: coarse) {
  .gh-image-export-close,
  .gh-image-export-inline-icon-btn,
  .gh-image-export-caption-btn {
    width: 44px;
    height: 44px;
  }
  .gh-image-export-open-btn {
    min-width: 44px;
    min-height: 44px;
  }
  .gh-image-export-choice,
  .gh-image-export-zoom-btn,
  .gh-image-export-actions .gh-dialog-btn,
  .gh-image-export-error-actions .gh-dialog-btn,
  .gh-image-export-reset,
  .gh-image-export-group summary {
    min-height: 44px;
  }
  .gh-image-export-toggle {
    min-height: 44px;
    padding-block: 10px;
  }
  .gh-image-export-swatch-btn {
    width: 24px;
    height: 24px;
  }
  .gh-image-export-swatch-btn::after {
    inset: -10px;
  }
  .gh-image-export-swatches {
    gap: 14px;
  }
  .gh-image-export-range {
    height: 8px;
    margin: 14px 0 8px;
  }
  .gh-image-export-range::-webkit-slider-thumb {
    width: 22px;
    height: 22px;
  }
  .gh-image-export-range::-moz-range-thumb {
    width: 22px;
    height: 22px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gh-image-export-close,
  .gh-image-export-choice,
  .gh-image-export-toggle,
  .gh-image-export-group summary,
  .gh-image-export-chevron,
  .gh-image-export-field input[type="text"],
  .gh-image-export-inline-icon-btn,
  .gh-image-export-range::-webkit-slider-thumb,
  .gh-image-export-range::-moz-range-thumb,
  .gh-image-export-swatch-btn,
  .gh-image-export-zoom-btn,
  .gh-image-export-open-btn,
  .gh-image-export-caption-btn,
  .gh-image-export-canvas-btn,
  .gh-image-export-preview,
  .gh-image-export-preview figure,
  .gh-image-export-update-bar progress::-webkit-progress-value,
  .gh-image-export-state progress::-webkit-progress-value {
    transition: none;
  }
  .gh-dialog.gh-image-export-dialog,
  .gh-image-export-preview figure,
  .gh-image-export-skeleton {
    animation: none;
  }
  .gh-image-export-skeleton span::after {
    animation: none;
    content: none;
  }
  .gh-image-export-indeterminate::after {
    animation: none;
    width: 50%;
    transform: translateX(50%);
  }
}
`
