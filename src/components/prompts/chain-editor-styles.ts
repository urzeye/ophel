export const CHAIN_EDITOR_PORTAL_STYLES = `
.gh-chain-editor {
  width: min(680px, 92vw);
  max-height: 86vh;
  padding: 0 !important;
  border-radius: 12px;
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text, #1f2937);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  box-shadow: var(--gh-shadow-lg, 0 20px 50px rgba(0, 0, 0, 0.3));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.25s ease-out;
}

.gh-chain-editor-header,
.gh-chain-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--gh-border, #e5e7eb);
}

.gh-chain-editor-footer {
  justify-content: flex-end;
  border-top: 1px solid var(--gh-border, #e5e7eb);
  border-bottom: none;
}

.gh-chain-editor-title {
  color: var(--gh-text, #1f2937);
  font-size: 16px;
  font-weight: 650;
}

.gh-chain-editor-subtitle,
.gh-chain-section-subtitle,
.gh-chain-field-help {
  color: var(--gh-text-tertiary, #9ca3af);
  font-size: 12px;
  line-height: 1.45;
}

.gh-chain-editor-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: var(--gh-hover, #f3f4f6);
  color: var(--gh-text-secondary, #6b7280);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.gh-chain-editor-scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--gh-text-tertiary, #9ca3af) 64%, transparent)
    transparent;
}

.gh-chain-editor-scroll::-webkit-scrollbar {
  width: 10px;
}

.gh-chain-editor-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.gh-chain-editor-scroll::-webkit-scrollbar-thumb {
  min-height: 42px;
  border: 3px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--gh-text-tertiary, #9ca3af) 56%, transparent);
  background-clip: content-box;
}

.gh-chain-editor-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--gh-text-secondary, #6b7280) 72%, transparent);
  background-clip: content-box;
}

.gh-chain-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.gh-chain-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  color: var(--gh-text, #374151);
  font-size: 13px;
  font-weight: 600;
}

.gh-chain-field input,
.gh-chain-field textarea,
.gh-chain-step-row select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--gh-input-border, #d1d5db);
  border-radius: 7px;
  background: var(--gh-input-bg, var(--gh-bg, #ffffff));
  color: var(--gh-text, #1f2937);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.gh-chain-field input,
.gh-chain-step-row select {
  height: 34px;
  padding: 0 10px;
}

.gh-chain-field textarea {
  min-height: 74px;
  padding: 8px 10px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
}

.gh-chain-field input:focus,
.gh-chain-field textarea:focus,
.gh-chain-step-row select:focus {
  border-color: var(--gh-primary, #4285f4);
  box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.12);
}

.gh-chain-icon-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.gh-chain-visibility-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  padding: 5px 8px 5px 6px;
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 999px;
  background: var(--gh-bg-secondary, #f9fafb);
  color: var(--gh-text, #374151);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.gh-chain-visibility-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.gh-chain-visibility-switch {
  position: relative;
  width: 28px;
  height: 16px;
  flex: 0 0 28px;
  border-radius: 999px;
  background: var(--gh-border, #d1d5db);
  transition: background 0.16s;
}

.gh-chain-visibility-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
  transition: transform 0.16s;
}

.gh-chain-visibility-toggle input:checked + .gh-chain-visibility-switch {
  background: var(--gh-primary, #4285f4);
}

.gh-chain-visibility-toggle input:checked + .gh-chain-visibility-switch::after {
  transform: translateX(12px);
}

.gh-chain-visibility-toggle-text {
  min-width: 0;
  line-height: 1.25;
}

.gh-chain-icon-control-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.gh-chain-icon-preview {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 10px 14px;
  box-sizing: border-box;
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 8px;
  background: var(--gh-bg-secondary, #f9fafb);
  color: var(--gh-text-secondary, #6b7280);
  font-size: 14px;
  font-weight: 500;
}

.gh-chain-icon-preview.empty {
  color: var(--gh-text-tertiary, #9ca3af);
  font-weight: 400;
}

.gh-chain-icon-preview-svg {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.gh-chain-icon-preview-svg svg {
  width: 22px;
  height: 22px;
}

.gh-chain-icon-select-btn {
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 8px;
  background: var(--gh-bg, #ffffff);
  color: var(--gh-primary, #3b82f6);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition:
    background 0.16s,
    border-color 0.16s;
}

.gh-chain-icon-select-btn:hover {
  border-color: var(--gh-primary, #3b82f6);
  background: var(--gh-primary-light, #eff6ff);
}

.gh-chain-editor-section {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--gh-border, #e5e7eb);
}

.gh-chain-queue-gate {
  display: flex;
  align-items: stretch;
  flex-direction: column;
  justify-content: flex-start;
  gap: 10px;
  margin: 0 0 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--gh-primary, #4285f4) 22%, var(--gh-border, #e5e7eb));
  border-radius: 8px;
  background: color-mix(in srgb, var(--gh-primary, #4285f4) 7%, var(--gh-bg, #ffffff));
}

.gh-chain-queue-gate.editor {
  margin-bottom: 14px;
}

.gh-chain-queue-gate-copy {
  min-width: 0;
  width: 100%;
}

.gh-chain-queue-gate-title {
  color: var(--gh-text, #111827);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
}

.gh-chain-queue-gate-description {
  margin-top: 3px;
  color: var(--gh-text-secondary, #6b7280);
  font-size: 12px;
  line-height: 1.4;
}

.gh-chain-queue-gate-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.gh-chain-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.gh-chain-section-title {
  color: var(--gh-text, #1f2937);
  font-size: 13px;
  font-weight: 650;
}

.gh-chain-step-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gh-chain-step-row {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 14px;
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 10px;
  background: var(--gh-bg, #ffffff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
}

.gh-chain-step-row:hover {
  border-color: var(--gh-border-hover, #d1d5db);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.gh-chain-step-row.dragging {
  opacity: 0.5;
  cursor: grabbing;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.gh-chain-step-header-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.gh-chain-step-drag-handle {
  width: 16px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--gh-text-tertiary, #c5c8cc);
  cursor: grab;
  flex-shrink: 0;
  transition: color 0.15s;
}

.gh-chain-step-drag-handle:hover {
  color: var(--gh-text-secondary, #6b7280);
}

.gh-chain-step-row.dragging .gh-chain-step-drag-handle {
  cursor: grabbing;
}

.gh-chain-step-index {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--gh-primary, #4285f4);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.gh-chain-step-mode-switch {
  display: flex;
  padding: 2px;
  border-radius: 7px;
  background: var(--gh-bg-secondary, #f3f4f6);
  border: 1px solid var(--gh-border, #e5e7eb);
  gap: 0;
  flex: 0 0 auto;
}

.gh-chain-step-mode-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--gh-text-tertiary, #9ca3af);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  line-height: 1.4;
}

.gh-chain-step-mode-btn:hover {
  color: var(--gh-text-secondary, #6b7280);
}

.gh-chain-step-mode-btn.active {
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text, #1f2937);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.gh-chain-step-delete-btn {
  width: 28px;
  height: 28px;
  margin-left: auto;
  flex-shrink: 0;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--gh-text-tertiary, #d1d5db);
  opacity: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
}

.gh-chain-step-row:hover .gh-chain-step-delete-btn {
  opacity: 1;
}

.gh-chain-step-delete-btn:hover {
  background: rgba(254, 226, 226, 1);
  color: var(--gh-text-danger, #ef4444);
  transform: scale(1.05);
}

.gh-chain-step-delete-btn:active {
  transform: scale(0.95);
  background: rgba(254, 202, 202, 1);
}

.gh-chain-step-delete-btn svg {
  width: 16px;
  height: 16px;
  stroke-width: 2.5;
}

.gh-chain-step-input-row {
  width: 100%;
}

.gh-chain-step-inline-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 80px;
  padding: 10px 12px;
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 8px;
  background: var(--gh-bg-secondary, #f9fafb);
  color: var(--gh-text, #1f2937);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  resize: vertical;
  outline: none;
  transition: all 0.15s;
}

.gh-chain-step-inline-input:focus {
  border-color: var(--gh-primary, #4285f4);
  background: var(--gh-bg, #ffffff);
  box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.08);
}

.gh-chain-step-inline-input::placeholder {
  color: var(--gh-text-tertiary, #9ca3af);
}

.gh-chain-step-prompt-select {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 8px;
  background: var(--gh-bg-secondary, #f9fafb);
  color: var(--gh-text, #1f2937);
  font-size: 13px;
  outline: none;
  transition: all 0.15s;
  cursor: pointer;
}

.gh-chain-step-prompt-select:focus {
  border-color: var(--gh-primary, #4285f4);
  background: var(--gh-bg, #ffffff);
  box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.08);
}

.gh-chain-step-actions {
  display: flex;
  gap: 2px;
}

.gh-chain-step-empty {
  padding: 20px;
  border: 1.5px dashed var(--gh-border, #d1d5db);
  border-radius: 10px;
  color: var(--gh-text-tertiary, #9ca3af);
  font-size: 13px;
  text-align: center;
}

.gh-chain-variable-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.gh-chain-variable-chip,
.gh-chain-variable-muted {
  padding: 4px 7px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.25;
}

.gh-chain-variable-chip {
  border: 1px solid rgba(66, 133, 244, 0.25);
  background: rgba(66, 133, 244, 0.08);
  color: var(--gh-primary, #4285f4);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.gh-chain-variable-chip.custom {
  border-color: var(--gh-border, #e5e7eb);
  background: var(--gh-bg-secondary, #f9fafb);
  color: var(--gh-text-secondary, #6b7280);
}

.gh-chain-variable-muted {
  color: var(--gh-text-tertiary, #9ca3af);
}

.gh-chain-preview-section {
  position: relative;
}

.gh-chain-preview-toggle {
  padding: 5px 12px;
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 6px;
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text-secondary, #6b7280);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.gh-chain-preview-toggle:hover {
  background: var(--gh-hover, #f3f4f6);
  color: var(--gh-text, #1f2937);
}

.gh-chain-preview-nav-float {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  margin: 12px 0 0;
  border-radius: 8px;
  background: var(--gh-bg, rgba(255, 255, 255, 0.92));
  backdrop-filter: blur(8px);
  border: 1px solid var(--gh-border, #e5e7eb);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  flex-wrap: wrap;
}

.gh-chain-preview-nav-label {
  color: var(--gh-text-tertiary, #9ca3af);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-right: 4px;
  flex-shrink: 0;
}

.gh-chain-preview-nav-btn {
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--gh-text-secondary, #6b7280);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  gap: 4px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gh-chain-preview-nav-btn:hover {
  background: rgba(66, 133, 244, 0.08);
  color: var(--gh-primary, #4285f4);
}

.gh-chain-preview-nav-btn .nav-btn-num {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: var(--gh-bg-secondary, #f3f4f6);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
}

.gh-chain-preview-nav-btn .nav-btn-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.gh-chain-preview-nav-btn:hover .nav-btn-num {
  background: rgba(66, 133, 244, 0.15);
  color: var(--gh-primary, #4285f4);
}

.gh-chain-preview-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
  padding-bottom: 4px;
}

.gh-chain-preview-step {
  border: 1px solid var(--gh-border, #e5e7eb);
  border-radius: 10px;
  overflow: hidden;
  background: var(--gh-bg, #ffffff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.15s;
}

.gh-chain-preview-step:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.gh-chain-preview-step-header {
  padding: 10px 14px;
  background: var(--gh-bg-secondary, #f9fafb);
  border-bottom: 1px solid var(--gh-border, #e5e7eb);
  display: flex;
  align-items: center;
  gap: 10px;
}

.gh-chain-preview-step-number {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--gh-primary, #4285f4);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.gh-chain-preview-step-title {
  color: var(--gh-text, #1f2937);
  font-size: 13px;
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gh-chain-preview-step-body {
  padding: 14px;
  color: var(--gh-text, #1f2937);
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
  max-height: 360px;
  overflow-y: auto;
}

.gh-chain-preview-step-body p {
  margin: 0 0 0.75em;
}

.gh-chain-preview-step-body p:last-child {
  margin-bottom: 0;
}

.gh-chain-preview-step-body code {
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--gh-bg-secondary, #f3f4f6);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
}

.gh-chain-preview-step-body pre {
  margin: 0.75em 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--gh-bg-secondary, #f3f4f6);
  overflow-x: auto;
}

.gh-chain-preview-step-body pre code {
  padding: 0;
  background: none;
}

.gh-chain-preview-step-body blockquote {
  margin: 0.75em 0;
  padding: 8px 14px;
  border-left: 3px solid var(--gh-primary, #4285f4);
  background: rgba(66, 133, 244, 0.04);
  border-radius: 0 6px 6px 0;
  color: var(--gh-text-secondary, #6b7280);
}

.gh-chain-preview-empty {
  color: var(--gh-text-tertiary, #9ca3af);
  font-style: italic;
}

.prompt-action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

@media (max-width: 520px) {
  .gh-chain-form-grid {
    grid-template-columns: 1fr;
  }

  .gh-chain-icon-header,
  .gh-chain-icon-control-row {
    align-items: stretch;
    flex-direction: column;
  }

  .gh-chain-visibility-toggle,
  .gh-chain-icon-select-btn {
    width: 100%;
    justify-content: center;
  }

  .gh-chain-step-header-row {
    flex-wrap: wrap;
  }

  .gh-chain-step-mode-switch {
    order: 10;
    width: 100%;
    margin-top: 4px;
  }

  .gh-chain-preview-nav-float {
    position: static;
    backdrop-filter: none;
  }
}
`
