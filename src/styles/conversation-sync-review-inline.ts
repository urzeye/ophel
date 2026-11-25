// Portal styles shared by extension and userscript builds.
export const CONVERSATION_SYNC_REVIEW_STYLES = `
.gh-dialog.gh-sync-review {
  width: min(640px, calc(100vw - 24px));
  max-width: 640px;
  min-width: 0;
  max-height: calc(100dvh - 24px);
  font-family: Inter, system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--gh-text, #1f2937);
}
.gh-sync-review *,
.gh-sync-review *::before,
.gh-sync-review *::after {
  box-sizing: border-box;
}
.gh-sync-review-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.gh-sync-review-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--gh-border, #d1d5db) transparent;
}
.gh-sync-review .gh-dialog-frame-header,
.gh-sync-review .gh-dialog-frame-footer {
  flex-shrink: 0;
}
.gh-sync-review .gh-dialog-frame-title {
  margin: 0;
  line-height: 1.4;
}
.gh-sync-review .gh-dialog-frame-subtitle {
  margin: 12px 18px 0;
  font-size: 13px;
}
.gh-sync-review-controls {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--gh-bg, #ffffff);
  padding: 12px 18px 0;
  flex-shrink: 0;
}
.gh-sync-review-controls .gh-dialog-input {
  margin: 0;
  font: inherit;
}
.gh-sync-review-controls .gh-dialog-input::placeholder {
  color: var(--gh-text-secondary, #6b7280);
  opacity: 1;
}
.gh-sync-review-selection {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 4px 0;
}
.gh-sync-review-selection label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  cursor: pointer;
}
.gh-sync-review-count {
  color: var(--gh-text-secondary, #6b7280);
  font-variant-numeric: tabular-nums;
}
.gh-sync-review-invert {
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--gh-primary-text, var(--gh-primary, #4285f4));
  cursor: pointer;
  font: inherit;
}
.gh-sync-review-invert:hover:not(:disabled) {
  text-decoration: underline;
}
.gh-sync-review-invert:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.gh-sync-review-list {
  padding: 0 18px;
}
.gh-sync-review-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-top: 1px solid var(--gh-border, #e5e7eb);
}
.gh-sync-review-row:has(input:checked) {
  background: var(--gh-hover, #f3f4f6);
}
.gh-sync-review-row label {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 0;
  cursor: pointer;
}
.gh-sync-review input[type="checkbox"] {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  margin: 3px 0 0;
  accent-color: var(--gh-primary, #4285f4);
}
.gh-sync-review-row-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.gh-sync-review-row-title {
  font-size: 13px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.gh-sync-review-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  color: var(--gh-text-secondary, #6b7280);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.gh-sync-review-meta > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.gh-sync-review-tag-dot {
  flex: 0 0 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.gh-sync-review-open {
  display: flex;
  flex: 0 0 44px;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: 4px;
  border-radius: 6px;
  color: var(--gh-text-secondary, #6b7280);
}
.gh-sync-review-open:hover {
  background: var(--gh-hover, #f3f4f6);
  color: var(--gh-text, #1f2937);
}
.gh-sync-review-empty {
  margin: 0;
  padding: 28px 0;
  color: var(--gh-text-secondary, #6b7280);
}
.gh-sync-review-footer {
  flex-direction: column;
  gap: 10px;
}
.gh-sync-review-footer p {
  margin: 0;
  color: var(--gh-text-secondary, #6b7280);
  font-size: 12px;
}
.gh-sync-review-footer-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.gh-sync-review-footer-actions .gh-dialog-btn {
  min-height: 40px;
  white-space: normal;
  font: inherit;
}
.gh-sync-review :is(input, button, a):focus-visible {
  outline: 2px solid var(--gh-primary, #4285f4);
  outline-offset: 2px;
}
@media (max-width: 520px) {
  .gh-sync-review-selection {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .gh-sync-review-selection label {
    min-width: 0;
    grid-column: 1;
    grid-row: 1;
  }
  .gh-sync-review-invert {
    min-height: 44px;
    grid-column: 2;
    grid-row: 1;
  }
  .gh-sync-review-count {
    grid-column: 1 / -1;
  }
  .gh-sync-review .gh-dialog-frame-header,
  .gh-sync-review .gh-dialog-frame-footer {
    padding: 14px;
  }
  .gh-sync-review-controls {
    padding: 10px 14px 0;
  }
  .gh-sync-review .gh-dialog-frame-subtitle {
    margin: 12px 14px 0;
  }
  .gh-sync-review-list {
    padding: 0 14px;
  }
  .gh-sync-review-footer-actions .gh-dialog-btn {
    flex: 1 1 100%;
    min-height: 44px;
  }
  .gh-sync-review .gh-dialog-frame-close {
    width: 44px;
    height: 44px;
  }
}
`
