import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import type { SiteAdapter } from "~adapters/base"
import {
  AddToQueueIcon,
  CheckIcon,
  ClearIcon,
  CopyIcon,
  DeleteIcon,
  EditIcon,
  ExportIcon,
  EyeIcon,
  ImportIcon,
  MoreHorizontalIcon,
  PinIcon,
  SplitLinesToQueueIcon,
  SettingsIcon,
  TimeIcon,
} from "~components/icons"
import { ContextMenu, MenuButton } from "~components/ConversationMenus"
import { Button, ConfirmDialog, InputDialog, SafeSvgMarkup, Tooltip } from "~components/ui"
import {
  extractVariables,
  type ParsedVariable,
  replaceVariables,
  VariableInputDialog,
} from "~components/VariableInputDialog"
import { ChainIconPicker } from "~components/ChainIconPicker"
import { VIRTUAL_CATEGORY } from "~constants"
import { CHAIN_ICON_PRESETS } from "~constants/chain-icons"
import type { PromptChain, PromptChainStep } from "~core/prompt-action-types"
import { enqueuePrompt, sendOrQueuePrompt } from "~core/prompt-actions"
import type { PromptManager } from "~core/prompt-manager"
import { usePromptChainsStore } from "~stores/prompt-chains-store"
import { useSettingsStore } from "~stores/settings-store"
import { APP_NAME } from "~utils/config"
import { t } from "~utils/i18n"
import { initCopyButtons, showCopySuccess } from "~utils/icons"
import { getHighlightStyles, renderMarkdown } from "~utils/markdown"
import { OPHEL_INTERACTION_LAYER_PROPS } from "~utils/dom-toolkit"
import type { Prompt } from "~utils/storage"
import { showToast } from "~utils/toast"
import { createSafeHTML } from "~utils/trusted-types"

interface PromptsTabProps {
  manager: PromptManager
  adapter?: SiteAdapter | null
  onPromptSelect?: (prompt: Prompt | null) => void
  selectedPromptId?: string | null
}

// 确认对话框状态类型
interface ConfirmState {
  show: boolean
  title: string
  message: string
  onConfirm: () => void
}

// 输入对话框状态类型
interface PromptInputState {
  show: boolean
  title: string
  defaultValue: string
  onConfirm: (value: string) => void
}

interface OpenPromptVariableDialogDetail {
  promptId?: string
  submitAfterInsert?: boolean
}

interface LocatePromptDetail {
  promptId?: string
}

type PromptLibraryView = "prompts" | "chains"

type ChainDraft = Omit<PromptChain, "id" | "createdAt" | "updatedAt"> & {
  id?: string
}

const CHAIN_EDITOR_PORTAL_STYLES = `
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
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isPromptLike = (value: unknown): value is Prompt => {
  if (!isRecord(value)) return false

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.content === "string" &&
    typeof value.category === "string" &&
    (value.pinned === undefined || typeof value.pinned === "boolean") &&
    (value.lastUsedAt === undefined || typeof value.lastUsedAt === "number")
  )
}

const parseImportedPrompts = (value: unknown): Prompt[] | null => {
  const promptList = (() => {
    if (Array.isArray(value)) return value

    if (!isRecord(value)) return null

    if (Array.isArray(value.prompts)) return value.prompts

    if (isRecord(value.data) && Array.isArray(value.data.prompts)) {
      return value.data.prompts
    }

    if (isRecord(value.state) && Array.isArray(value.state.prompts)) {
      return value.state.prompts
    }

    return null
  })()

  if (!promptList || !promptList.every(isPromptLike)) return null

  return promptList
}
// 根据分类名称哈希自动分配颜色索引 1-7
const getCategoryColorIndex = (categoryName: string): number => {
  let hash = 0
  for (let i = 0; i < categoryName.length; i++) {
    hash = categoryName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return (Math.abs(hash) % 7) + 1
}

export const PromptsTab: React.FC<PromptsTabProps> = ({
  manager,
  adapter,
  onPromptSelect,
  selectedPromptId,
}) => {
  const DOUBLE_CLICK_DELAY_MS = 340

  const doubleClickToSend = useSettingsStore(
    (state) => state.settings.features?.prompts?.doubleClickToSend ?? false,
  )
  const submitShortcut = useSettingsStore(
    (state) => state.settings.features?.prompts?.submitShortcut ?? "enter",
  )
  const promptQueueEnabled = useSettingsStore(
    (state) => state.settings.features?.prompts?.promptQueue ?? false,
  )
  const quickQuoteEnabled = useSettingsStore(
    (state) => state.settings.features?.prompts?.quickQuoteEnabled ?? true,
  )
  const updatePromptQueueSetting = useSettingsStore((state) => state.updateDeepSetting)

  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>(VIRTUAL_CATEGORY.ALL)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeLibraryView, setActiveLibraryView] = useState<PromptLibraryView>("prompts")
  const chains = usePromptChainsStore((state) => state.chains)
  const addChain = usePromptChainsStore((state) => state.addChain)
  const updateChain = usePromptChainsStore((state) => state.updateChain)
  const deleteChain = usePromptChainsStore((state) => state.deleteChain)
  const duplicateChain = usePromptChainsStore((state) => state.duplicateChain)
  const updateChainOrder = usePromptChainsStore((state) => state.updateOrder)

  // 模态弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<Partial<Prompt> | null>(null)
  const [chainEditorState, setChainEditorState] = useState<{
    show: boolean
    draft: ChainDraft | null
    showExecutionPreview: boolean
    draggedStepId: string | null
  }>({ show: false, draft: null, showExecutionPreview: false, draggedStepId: null })

  // 图标选择器弹窗状态
  const [showChainIconPicker, setShowChainIconPicker] = useState(false)

  // 分类管理弹窗状态
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)

  // 确认对话框状态
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    show: false,
    title: "",
    message: "",
    onConfirm: () => {},
  })

  // 输入对话框状态
  const [promptInputState, setPromptInputState] = useState<PromptInputState>({
    show: false,
    title: "",
    defaultValue: "",
    onConfirm: () => {},
  })
  // 拖拽状态
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)
  const dropIndicatorRootRef = useRef<ParentNode | null>(null)
  const [draggedChainId, setDraggedChainId] = useState<string | null>(null)
  const chainDragNodeRef = useRef<HTMLDivElement | null>(null)
  const chainDropIndicatorRootRef = useRef<ParentNode | null>(null)

  // 变量输入弹窗状态
  const [variableDialogState, setVariableDialogState] = useState<{
    show: boolean
    prompt: Prompt | null
    variables: ParsedVariable[]
    submitAfterInsert: boolean
    enqueueAfterResolve: boolean
    enqueueSplitByLine: boolean
  }>({
    show: false,
    prompt: null,
    variables: [],
    submitAfterInsert: false,
    enqueueAfterResolve: false,
    enqueueSplitByLine: false,
  })

  // 导入确认弹窗状态
  const [importDialogState, setImportDialogState] = useState<{
    show: boolean
    prompts: Prompt[]
  }>({ show: false, prompts: [] })

  // 导入导出菜单状态
  const [importExportMenuOpen, setImportExportMenuOpen] = useState(false)
  const importExportButtonRef = useRef<HTMLButtonElement>(null)

  // Markdown 预览开关
  const [showPreview, setShowPreview] = useState(false)

  // 快捷预览弹窗状态
  const [previewModal, setPreviewModal] = useState<{
    show: boolean
    prompt: Prompt | null
  }>({ show: false, prompt: null })

  const clickTimerRef = useRef<number | null>(null)
  const locateHighlightTimerRef = useRef<number | null>(null)
  const promptListRef = useRef<HTMLDivElement | null>(null)
  const [locatedPromptId, setLocatedPromptId] = useState<string | null>(null)
  const [promptActionMenu, setPromptActionMenu] = useState<{
    prompt: Prompt
    anchorEl: HTMLElement
  } | null>(null)

  // 预览容器 refs（用于初始化 SVG 图标）
  const editPreviewRef = useRef<HTMLDivElement>(null)
  const modalPreviewRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback(() => {
    const allPrompts = manager.getPrompts()
    const allCategories = manager.getCategories()
    setPrompts(allPrompts)
    setCategories(allCategories)

    // 分类有效性检查：如果当前选中的分类不再存在或变空，回退到「全部」
    setSelectedCategory((prev) => {
      if (prev === VIRTUAL_CATEGORY.ALL) return prev
      // 检查分类是否还存在
      if (!allCategories.includes(prev)) return VIRTUAL_CATEGORY.ALL
      // 检查分类下是否还有提示词
      const hasPrompts = allPrompts.some((p) => p.category === prev)
      if (!hasPrompts) return VIRTUAL_CATEGORY.ALL
      return prev
    })
  }, [manager])

  const openVariableDialogByPromptId = useCallback(
    (promptId: string, submitAfterInsert = false) => {
      const targetPrompt = manager.getPrompts().find((prompt) => prompt.id === promptId)
      if (!targetPrompt) {
        return false
      }

      const variables = extractVariables(targetPrompt.content)
      if (variables.length === 0) {
        return false
      }

      setVariableDialogState({
        show: true,
        prompt: targetPrompt,
        variables,
        submitAfterInsert,
        enqueueAfterResolve: false,
        enqueueSplitByLine: false,
      })
      return true
    },
    [manager],
  )

  const locatePromptById = useCallback(
    (promptId: string) => {
      const targetPrompt = manager.getPrompts().find((prompt) => prompt.id === promptId)
      if (!targetPrompt) {
        return false
      }

      setActiveLibraryView("prompts")
      setSelectedCategory(VIRTUAL_CATEGORY.ALL)
      setSearchQuery("")
      onPromptSelect?.(null)
      setLocatedPromptId(targetPrompt.id)
      return true
    },
    [manager, onPromptSelect],
  )

  useEffect(() => {
    const ophelWindow = window as Window & {
      __ophelPendingPromptVariableDialog?: OpenPromptVariableDialogDetail | null
    }

    const handleOpenPromptVariableDialog = (event: Event) => {
      const detail = (event as CustomEvent<OpenPromptVariableDialogDetail>).detail
      const promptId = detail?.promptId
      if (!promptId) {
        return
      }

      const opened = openVariableDialogByPromptId(promptId, Boolean(detail?.submitAfterInsert))
      if (opened) {
        onPromptSelect?.(null)
        ophelWindow.__ophelPendingPromptVariableDialog = null
      }
    }

    window.addEventListener("ophel:openPromptVariableDialog", handleOpenPromptVariableDialog)

    const pending = ophelWindow.__ophelPendingPromptVariableDialog
    if (pending?.promptId) {
      const opened = openVariableDialogByPromptId(
        pending.promptId,
        Boolean(pending.submitAfterInsert),
      )
      if (opened) {
        onPromptSelect?.(null)
        ophelWindow.__ophelPendingPromptVariableDialog = null
      }
    }

    return () => {
      window.removeEventListener("ophel:openPromptVariableDialog", handleOpenPromptVariableDialog)
    }
  }, [onPromptSelect, openVariableDialogByPromptId])

  useEffect(() => {
    const ophelWindow = window as Window & {
      __ophelPendingLocatePrompt?: LocatePromptDetail | null
    }

    const handleLocatePrompt = (event: Event) => {
      const detail = (event as CustomEvent<LocatePromptDetail>).detail
      const promptId = detail?.promptId
      if (!promptId) {
        return
      }

      const located = locatePromptById(promptId)
      if (located) {
        ophelWindow.__ophelPendingLocatePrompt = null
      }
    }

    window.addEventListener("ophel:locatePrompt", handleLocatePrompt)

    const pending = ophelWindow.__ophelPendingLocatePrompt
    if (pending?.promptId) {
      const located = locatePromptById(pending.promptId)
      if (located) {
        ophelWindow.__ophelPendingLocatePrompt = null
      }
    }

    return () => {
      window.removeEventListener("ophel:locatePrompt", handleLocatePrompt)
    }
  }, [locatePromptById])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current)
      }
      if (locateHighlightTimerRef.current !== null) {
        window.clearTimeout(locateHighlightTimerRef.current)
      }
    }
  }, [])

  // 编辑模态框预览渲染后初始化复制按钮
  useEffect(() => {
    if (showPreview && editPreviewRef.current) {
      initCopyButtons(editPreviewRef.current, { size: 14, color: "#6b7280" })
    }
  }, [showPreview, editingPrompt?.content])

  // 快捷预览模态框渲染后初始化复制按钮
  useEffect(() => {
    if (previewModal.show && modalPreviewRef.current) {
      initCopyButtons(modalPreviewRef.current, { size: 14, color: "#6b7280" })
    }
  }, [previewModal.show, previewModal.prompt])

  const getFilteredPrompts = () => {
    let filtered: Prompt[]

    // 最近使用筛选：显示有 lastUsedAt 的，按时间倒序
    if (selectedCategory === VIRTUAL_CATEGORY.RECENT) {
      filtered = manager
        .getPrompts()
        .filter((p) => p.lastUsedAt)
        .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
        .slice(0, 10) // 只显示最近 10 个

      // 搜索过滤
      if (searchQuery) {
        const lower = searchQuery.toLowerCase()
        filtered = filtered.filter(
          (p) => p.title.toLowerCase().includes(lower) || p.content.toLowerCase().includes(lower),
        )
      }
    } else {
      filtered = manager.filterPrompts(searchQuery, selectedCategory)
    }

    // 置顶的提示词优先显示（最近使用模式下不重排）
    if (selectedCategory !== VIRTUAL_CATEGORY.RECENT) {
      filtered = filtered.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return 0
      })
    }

    return filtered
  }

  // 显示确认对话框
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmState({ show: true, title, message, onConfirm })
  }

  // 显示输入对话框
  const showPromptInput = (
    title: string,
    defaultValue: string,
    onConfirm: (value: string) => void,
  ) => {
    setPromptInputState({ show: true, title, defaultValue, onConfirm })
  }

  const createDefaultChainStep = (): PromptChainStep => ({
    id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    mode: "prompt",
    promptId: prompts[0]?.id || "",
    inlineContent: "",
    runMode: "enqueue",
    splitMode: "none",
  })

  const createDefaultChainDraft = (): ChainDraft => ({
    title: "",
    description: "",
    iconSvg: CHAIN_ICON_PRESETS[0]?.svg || "",
    showInSelectionPopover: true,
    steps: prompts[0] ? [createDefaultChainStep()] : [],
    lastUsedAt: undefined,
  })

  const openChainEditor = (chain?: PromptChain) => {
    setChainEditorState({
      show: true,
      draft: chain
        ? { ...chain, steps: chain.steps.map((step) => ({ ...step })) }
        : createDefaultChainDraft(),
      showExecutionPreview: false,
      draggedStepId: null,
    })
  }

  const closeChainEditor = useCallback(() => {
    setChainEditorState({
      show: false,
      draft: null,
      showExecutionPreview: false,
      draggedStepId: null,
    })
  }, [])

  const updateChainDraft = (updates: Partial<ChainDraft>) => {
    setChainEditorState((state) =>
      state.draft ? { ...state, draft: { ...state.draft, ...updates } } : state,
    )
  }

  const enablePromptQueue = useCallback(() => {
    updatePromptQueueSetting("features", "prompts", "promptQueue", true)
    showToast(t("chainQueueEnabledToast"), 1800)
  }, [updatePromptQueueSetting])

  const enableQuickQuote = useCallback(() => {
    updatePromptQueueSetting("features", "prompts", "quickQuoteEnabled", true)
    showToast(t("chainQuickQuoteEnabledToast"), 1800)
  }, [updatePromptQueueSetting])

  const openPromptQueueSettings = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("ophel:navigateSettingsPage", {
        detail: { settingId: "prompt-queue" },
      }),
    )
  }, [])

  const openQuickQuoteSettings = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("ophel:navigateSettingsPage", {
        detail: { settingId: "prompt-quick-quote-enabled" },
      }),
    )
  }, [])

  const enablePromptQueueAndCreateChain = () => {
    updatePromptQueueSetting("features", "prompts", "promptQueue", true)
    showToast(t("chainQueueEnabledToast"), 1800)
    openChainEditor()
  }

  const updateChainStep = (stepId: string, updates: Partial<PromptChainStep>) => {
    setChainEditorState((state) => {
      if (!state.draft) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          steps: state.draft.steps.map((step) =>
            step.id === stepId ? { ...step, ...updates } : step,
          ),
        },
      }
    })
  }

  const addChainStep = () => {
    setChainEditorState((state) => {
      if (!state.draft) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          steps: [...state.draft.steps, createDefaultChainStep()],
        },
      }
    })
  }

  const removeChainStep = (stepId: string) => {
    setChainEditorState((state) => {
      if (!state.draft) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          steps: state.draft.steps.filter((step) => step.id !== stepId),
        },
      }
    })
  }

  const handleStepDragStart = (stepId: string) => {
    setChainEditorState((state) => ({ ...state, draggedStepId: stepId }))
  }

  const handleStepDragOver = (e: React.DragEvent, targetStepId: string) => {
    e.preventDefault()
    const draggedId = chainEditorState.draggedStepId
    if (!draggedId || draggedId === targetStepId) return

    setChainEditorState((state) => {
      if (!state.draft) return state
      const steps = [...state.draft.steps]
      const draggedIndex = steps.findIndex((s) => s.id === draggedId)
      const targetIndex = steps.findIndex((s) => s.id === targetStepId)
      if (draggedIndex === -1 || targetIndex === -1) return state

      const [draggedStep] = steps.splice(draggedIndex, 1)
      steps.splice(targetIndex, 0, draggedStep)
      return { ...state, draft: { ...state.draft, steps } }
    })
  }

  const handleStepDragEnd = () => {
    setChainEditorState((state) => ({ ...state, draggedStepId: null }))
  }

  const saveChainDraft = () => {
    const draft = chainEditorState.draft
    if (!draft) return

    const title = draft.title.trim()
    // 验证步骤：prompt 模式需要 promptId，inline 模式需要 inlineContent
    const steps = draft.steps
      .map((step): PromptChainStep | null => {
        if (step.mode === "inline") {
          return step.inlineContent?.trim()
            ? {
                ...step,
                promptId: "",
                inlineContent: step.inlineContent,
              }
            : null
        }

        return step.promptId
          ? {
              ...step,
              mode: "prompt",
              inlineContent: "",
            }
          : null
      })
      .filter((step): step is PromptChainStep => step !== null)
    if (!title) {
      showToast(t("chainTitleRequired"), 2200)
      return
    }
    if (steps.length === 0) {
      showToast(t("chainStepRequired"), 2200)
      return
    }

    const payload = {
      title,
      description: draft.description?.trim() || "",
      iconSvg: draft.iconSvg?.trim() || "",
      showInSelectionPopover: draft.showInSelectionPopover !== false,
      steps,
      lastUsedAt: draft.lastUsedAt,
    }

    if (draft.id) {
      updateChain(draft.id, payload)
      showToast(t("chainUpdated"), 1800)
    } else {
      addChain(payload)
      showToast(t("chainAdded"), 1800)
    }
    closeChainEditor()
  }

  const getPromptTitle = (promptId: string) =>
    prompts.find((prompt) => prompt.id === promptId)?.title || t("chainMissingPrompt")

  const getChainStepSearchText = (step: PromptChainStep) => {
    if (step.mode === "inline") return step.inlineContent || ""
    return getPromptTitle(step.promptId)
  }

  const filteredChains = chains.filter((chain) => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    const stepText = chain.steps.map(getChainStepSearchText).join(" ")
    return `${chain.title} ${chain.description || ""} ${stepText}`.toLowerCase().includes(query)
  })

  // 选中提示词并插入
  const handleSelect = async (prompt: Prompt, submitAfterInsert = false) => {
    // Extract variables from the selected prompt
    const variables = extractVariables(prompt.content)

    if (variables.length > 0) {
      // Prompt includes variables; open the variable dialog first
      setVariableDialogState({
        show: true,
        prompt,
        variables,
        submitAfterInsert,
        enqueueAfterResolve: false,
        enqueueSplitByLine: false,
      })
    } else {
      // No variables; insert or send directly.
      if (submitAfterInsert) {
        await doSend(prompt, prompt.content)
        return
      }

      await doInsert(prompt, prompt.content)
    }
  }

  const doInsert = async (prompt: Prompt, content: string) => {
    const success = await manager.insertPrompt(content)
    if (success) {
      manager.updateLastUsed(prompt.id)
      onPromptSelect?.(prompt)
      showToast(`${t("inserted")}: ${prompt.title}`)
    } else {
      showToast(t("insertFailed"))
    }
  }

  const doSend = async (prompt: Prompt, content: string) => {
    const result = await sendOrQueuePrompt({
      adapter,
      manager,
      content,
      submitShortcut,
      context: {
        source: "prompt-library",
        prompt,
      },
    })

    if (result.status === "insert-failed") {
      showToast(t("insertFailed"))
      return
    }

    manager.updateLastUsed(prompt.id)

    if (result.status === "send-failed") {
      showToast(t("promptSendFailed"))
      onPromptSelect?.(prompt)
      return
    }

    onPromptSelect?.(null)

    if (result.status === "queued") {
      showToast(t("promptQueued", { count: String(result.count) }), 2500)
      return
    }

    showToast(`${t("promptSent")}: ${prompt.title}`)
  }

  const enqueueResolvedPrompt = (prompt: Prompt, content: string, splitByLine = false) => {
    const result = enqueuePrompt({
      content,
      splitByLine,
      context: {
        source: "prompt-library",
        prompt,
      },
    })

    if (result.status === "disabled") {
      showToast(t("promptQueueEnableHint"), 3000)
      return
    }

    if (result.status === "empty") {
      showToast(t("promptEnqueueEmpty"), 2500)
      return
    }

    manager.updateLastUsed(prompt.id)
    showToast(t("promptQueued", { count: String(result.count) }), 2500)
  }

  const doEnqueuePrompt = (prompt: Prompt, splitByLine = false) => {
    if (!promptQueueEnabled) {
      showToast(t("promptQueueEnableHint"), 3000)
      return
    }

    const variables = extractVariables(prompt.content)
    if (variables.length > 0) {
      setVariableDialogState({
        show: true,
        prompt,
        variables,
        submitAfterInsert: false,
        enqueueAfterResolve: true,
        enqueueSplitByLine: splitByLine,
      })
      return
    }

    enqueueResolvedPrompt(prompt, prompt.content, splitByLine)
  }

  const handleVariableConfirm = async (values: Record<string, string>) => {
    const { prompt, submitAfterInsert, enqueueAfterResolve, enqueueSplitByLine } =
      variableDialogState
    if (!prompt) return

    const replacedContent = replaceVariables(prompt.content, values)
    setVariableDialogState({
      show: false,
      prompt: null,
      variables: [],
      submitAfterInsert: false,
      enqueueAfterResolve: false,
      enqueueSplitByLine: false,
    })

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    if (submitAfterInsert) {
      await doSend(prompt, replacedContent)
      return
    }

    if (enqueueAfterResolve) {
      enqueueResolvedPrompt(prompt, replacedContent, enqueueSplitByLine)
      return
    }

    await doInsert(prompt, replacedContent)
  }

  const handlePromptClick = (prompt: Prompt) => {
    setLocatedPromptId(null)

    if (!doubleClickToSend) {
      void handleSelect(prompt)
      return
    }

    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }

    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null
      void handleSelect(prompt)
    }, DOUBLE_CLICK_DELAY_MS)
  }

  const handlePromptDoubleClick = (prompt: Prompt) => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }

    if (doubleClickToSend) {
      void handleSelect(prompt, true)
    }
  }

  // Toggle pin state
  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    manager.togglePin(id)
    loadData()
  }

  // 导出提示词为 JSON 文件
  const handleExport = () => {
    const allPrompts = manager.getPrompts()
    const json = JSON.stringify(allPrompts, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${APP_NAME}-prompts-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(t("promptExportSuccess"))
  }

  // 导入提示词
  const handleImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const imported = parseImportedPrompts(JSON.parse(text))

        if (!imported) {
          console.error("[Ophel] prompt import failed: unsupported prompt file format")
          showToast(t("promptImportFailed"))
          return
        }

        // 显示导入确认弹窗（支持覆盖/合并/取消）
        setImportDialogState({ show: true, prompts: imported })
      } catch (error) {
        console.error("[Ophel] prompt import failed:", error)
        showToast(t("promptImportFailed"))
      }
    }
    input.click()
  }

  // 处理覆盖导入
  const handleImportOverwrite = () => {
    const imported = importDialogState.prompts
    manager.setPrompts(imported)
    loadData()
    setImportDialogState({ show: false, prompts: [] })
    showToast(t("promptImportSuccess").replace("{count}", imported.length.toString()))
  }

  // 处理合并导入（按 ID 合并）
  const handleImportMerge = () => {
    const imported = importDialogState.prompts
    const existing = manager.getPrompts()
    const existingIds = new Set(existing.map((p) => p.id))

    // 分离：已存在的（更新）和 新的（追加）
    const toUpdate = imported.filter((p) => existingIds.has(p.id))
    const toAdd = imported.filter((p) => !existingIds.has(p.id))

    // 更新已存在的
    toUpdate.forEach((p) => {
      manager.updatePrompt(p.id, {
        title: p.title,
        content: p.content,
        category: p.category,
        pinned: p.pinned,
      })
    })

    // 追加新的
    toAdd.forEach((p) => {
      manager.addPrompt({
        title: p.title,
        content: p.content,
        category: p.category,
        pinned: p.pinned,
      })
    })

    loadData()
    setImportDialogState({ show: false, prompts: [] })
    const msg = `已合并：更新 ${toUpdate.length} 个，新增 ${toAdd.length} 个`
    showToast(
      t("promptMergeSuccess")
        ?.replace("{updated}", toUpdate.length.toString())
        .replace("{added}", toAdd.length.toString()) || msg,
    )
  }

  // 保存提示词（新增/编辑）
  const handleSave = async () => {
    if (!editingPrompt?.title || !editingPrompt?.content) {
      showToast(t("fillTitleContent"))
      return
    }

    const newCategory = editingPrompt.category || t("uncategorized")
    let shouldSwitchToNewCategory = false

    if (editingPrompt.id) {
      // 编辑时检查是否需要切换分类
      const oldPrompt = prompts.find((p) => p.id === editingPrompt.id)
      const oldCategory = oldPrompt?.category

      // 如果分类发生变更，且当前选中的就是原分类
      if (oldCategory && oldCategory !== newCategory && selectedCategory === oldCategory) {
        // 检查编辑后原分类是否会变空
        const otherPromptsInOldCategory = prompts.filter(
          (p) => p.category === oldCategory && p.id !== editingPrompt.id,
        )
        if (otherPromptsInOldCategory.length === 0) {
          shouldSwitchToNewCategory = true
        }
      }

      await manager.updatePrompt(editingPrompt.id, {
        title: editingPrompt.title,
        content: editingPrompt.content,
        category: newCategory,
      })
      showToast(t("promptUpdated"))

      // 切换到新分类
      if (shouldSwitchToNewCategory) {
        setSelectedCategory(newCategory)
      }
    } else {
      await manager.addPrompt({
        title: editingPrompt.title!,
        content: editingPrompt.content!,
        category: newCategory,
      })
      showToast(t("promptAdded"))
    }
    closeEditModal()
    loadData()
  }

  const closeEditModal = useCallback(() => {
    setIsModalOpen(false)
    setEditingPrompt(null)
  }, [])

  const closeCategoryModal = useCallback(() => {
    setIsCategoryModalOpen(false)
  }, [])

  const closeConfirmDialog = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, show: false }))
  }, [])

  const closePromptInputDialog = useCallback(() => {
    setPromptInputState((prev) => ({ ...prev, show: false }))
  }, [])

  const closePreviewModal = useCallback(() => {
    setPreviewModal({ show: false, prompt: null })
  }, [])

  const closeImportDialog = useCallback(() => {
    setImportDialogState({ show: false, prompts: [] })
  }, [])

  const closeVariableDialog = useCallback(() => {
    setVariableDialogState({
      show: false,
      prompt: null,
      variables: [],
      submitAfterInsert: false,
      enqueueAfterResolve: false,
      enqueueSplitByLine: false,
    })
  }, [])

  const closePromptActionMenu = useCallback(() => {
    setPromptActionMenu(null)
  }, [])

  // 删除提示词
  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    showConfirm(t("confirmDelete"), "确定删除该提示词？", async () => {
      await manager.deletePrompt(id)
      showToast(t("deleted"))
      loadData()
    })
  }

  // 复制提示词内容
  const handleCopy = async (content: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(content)
      showToast(t("copied"))
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      showToast(t("copied"))
    }
  }

  // 打开编辑/新增弹窗
  const openEditModal = (prompt?: Prompt) => {
    if (prompt) {
      setEditingPrompt({ ...prompt })
    } else {
      // 新建时：如果当前选中了真实分类，使用该分类；否则使用第一个真实分类或「未分类」
      const isVirtualCategory =
        selectedCategory === VIRTUAL_CATEGORY.ALL || selectedCategory === VIRTUAL_CATEGORY.RECENT
      const defaultCategory = isVirtualCategory
        ? categories[0] || t("uncategorized")
        : selectedCategory
      setEditingPrompt({ title: "", content: "", category: defaultCategory })
    }
    setIsModalOpen(true)
  }

  // === 分类管理 ===
  const handleRenameCategory = (oldName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    showPromptInput(t("newCategoryName"), oldName, async (newName: string) => {
      if (newName && newName.trim() && newName !== oldName) {
        await manager.renameCategory(oldName, newName.trim())
        showToast(t("categoryRenamedTo").replace("{name}", newName.trim()))
        // 如果当前选中的分类被重命名，同步更新选中状态
        if (selectedCategory === oldName) {
          setSelectedCategory(newName.trim())
        }
        loadData()
      }
    })
  }

  const handleDeleteCategory = (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    showConfirm(
      t("confirmDeleteCategory"),
      t("confirmDeleteCategoryMsg").replace("{name}", name),
      async () => {
        await manager.deleteCategory(name)
        showToast(t("categoryDeletedMsg").replace("{name}", name))
        if (selectedCategory === name) {
          setSelectedCategory(VIRTUAL_CATEGORY.ALL)
        }
        loadData()
      },
    )
  }

  // === 拖拽排序 ===
  const clearPromptDropIndicators = useCallback(() => {
    const roots = [
      dropIndicatorRootRef.current,
      dragNodeRef.current?.getRootNode() as ParentNode | undefined,
      document,
    ]
    const seenRoots = new Set<ParentNode>()

    roots.forEach((root) => {
      if (!root || seenRoots.has(root)) return
      seenRoots.add(root)
      root.querySelectorAll(".drop-above, .drop-below").forEach((el) => {
        el.classList.remove("drop-above", "drop-below")
      })
    })

    dropIndicatorRootRef.current = null
  }, [])

  const handleDragStart = (e: React.DragEvent, id: string, node: HTMLDivElement) => {
    const target = e.target as HTMLElement
    if (
      target.closest('button, input, textarea, select, [role="button"], [data-no-row-drag="true"]')
    ) {
      e.preventDefault()
      return
    }

    setDraggedId(id)
    dragNodeRef.current = node
    dropIndicatorRootRef.current = node.getRootNode() as ParentNode
    e.dataTransfer.effectAllowed = "move"
    // 必须调用 setData，部分站点在拖拽冒泡（bubbling）阶段会检测 dataTransfer 为空并取消拖拽
    e.dataTransfer.setData("text/plain", id)
    node.classList.add("dragging")
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"

    if (!draggedId || draggedId === targetId) return

    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const targetRoot = target.getRootNode() as ParentNode

    dropIndicatorRootRef.current = targetRoot
    clearPromptDropIndicators()

    if (e.clientY < midpoint) {
      target.classList.add("drop-above")
    } else {
      target.classList.add("drop-below")
    }
    dropIndicatorRootRef.current = targetRoot
  }

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.classList.remove("dragging")
    }
    clearPromptDropIndicators()
    setDraggedId(null)
    dragNodeRef.current = null
  }

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()

    if (!draggedId || draggedId === targetId) {
      handleDragEnd()
      return
    }

    const allPrompts = manager.getPrompts()
    const draggedIndex = allPrompts.findIndex((p) => p.id === draggedId)
    const targetIndex = allPrompts.findIndex((p) => p.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) {
      handleDragEnd()
      return
    }

    const newOrder = [...allPrompts]
    const [removed] = newOrder.splice(draggedIndex, 1)

    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const insertBefore = e.clientY < rect.top + rect.height / 2

    let insertIndex = allPrompts.findIndex((p) => p.id === targetId)
    if (draggedIndex < insertIndex) {
      insertIndex--
    }
    if (!insertBefore) {
      insertIndex++
    }

    newOrder.splice(insertIndex, 0, removed)

    await manager.updateOrder(newOrder.map((p) => p.id))
    showToast(t("orderUpdated"))
    loadData()
    handleDragEnd()
  }

  const clearChainDropIndicators = useCallback(() => {
    const roots = [
      chainDropIndicatorRootRef.current,
      chainDragNodeRef.current?.getRootNode() as ParentNode | undefined,
      document,
    ]
    const seenRoots = new Set<ParentNode>()

    roots.forEach((root) => {
      if (!root || seenRoots.has(root)) return
      seenRoots.add(root)
      root.querySelectorAll(".drop-above, .drop-below").forEach((el) => {
        el.classList.remove("drop-above", "drop-below")
      })
    })

    chainDropIndicatorRootRef.current = null
  }, [])

  const handleChainDragStart = (e: React.DragEvent, id: string, node: HTMLDivElement) => {
    const target = e.target as HTMLElement
    if (
      target.closest('button, input, textarea, select, [role="button"], [data-no-row-drag="true"]')
    ) {
      e.preventDefault()
      return
    }

    setDraggedChainId(id)
    chainDragNodeRef.current = node
    chainDropIndicatorRootRef.current = node.getRootNode() as ParentNode
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", id)
    node.classList.add("dragging")
  }

  const handleChainDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"

    if (!draggedChainId || draggedChainId === targetId) return

    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const targetRoot = target.getRootNode() as ParentNode

    chainDropIndicatorRootRef.current = targetRoot
    clearChainDropIndicators()

    if (e.clientY < midpoint) {
      target.classList.add("drop-above")
    } else {
      target.classList.add("drop-below")
    }
    chainDropIndicatorRootRef.current = targetRoot
  }

  const handleChainDragEnd = () => {
    if (chainDragNodeRef.current) {
      chainDragNodeRef.current.classList.remove("dragging")
    }
    clearChainDropIndicators()
    setDraggedChainId(null)
    chainDragNodeRef.current = null
  }

  const handleChainDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()

    if (!draggedChainId || draggedChainId === targetId) {
      handleChainDragEnd()
      return
    }

    const draggedIndex = chains.findIndex((chain) => chain.id === draggedChainId)
    const targetIndex = chains.findIndex((chain) => chain.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) {
      handleChainDragEnd()
      return
    }

    const newOrder = [...chains]
    const [removed] = newOrder.splice(draggedIndex, 1)

    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const insertBefore = e.clientY < rect.top + rect.height / 2

    let insertIndex = chains.findIndex((chain) => chain.id === targetId)
    if (draggedIndex < insertIndex) {
      insertIndex--
    }
    if (!insertBefore) {
      insertIndex++
    }

    newOrder.splice(insertIndex, 0, removed)
    updateChainOrder(newOrder.map((chain) => chain.id))
    showToast(t("orderUpdated"))
    handleChainDragEnd()
  }

  const filtered = getFilteredPrompts()

  useEffect(() => {
    const hasPromptDialogs =
      promptInputState.show ||
      confirmState.show ||
      isCategoryModalOpen ||
      isModalOpen ||
      chainEditorState.show ||
      previewModal.show ||
      importDialogState.show ||
      variableDialogState.show

    if (!hasPromptDialogs) {
      return
    }

    const handleEscapeForPromptDialogs = (e: KeyboardEvent) => {
      if (e.key !== "Escape") {
        return
      }

      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation?.()

      if (promptInputState.show) {
        closePromptInputDialog()
        return
      }

      if (confirmState.show) {
        closeConfirmDialog()
        return
      }

      if (variableDialogState.show) {
        closeVariableDialog()
        return
      }

      if (isCategoryModalOpen) {
        closeCategoryModal()
        return
      }

      if (isModalOpen) {
        closeEditModal()
        return
      }

      if (chainEditorState.show) {
        closeChainEditor()
        return
      }

      if (previewModal.show) {
        closePreviewModal()
        return
      }

      if (importDialogState.show) {
        closeImportDialog()
      }
    }

    document.addEventListener("keydown", handleEscapeForPromptDialogs, true)
    return () => {
      document.removeEventListener("keydown", handleEscapeForPromptDialogs, true)
    }
  }, [
    closeCategoryModal,
    closeConfirmDialog,
    closeChainEditor,
    closeEditModal,
    closeImportDialog,
    closePreviewModal,
    closePromptInputDialog,
    closeVariableDialog,
    chainEditorState.show,
    confirmState.show,
    importDialogState.show,
    isCategoryModalOpen,
    isModalOpen,
    previewModal.show,
    promptInputState.show,
    variableDialogState.show,
  ])

  useEffect(() => {
    if (!locatedPromptId) {
      return
    }

    const container = promptListRef.current
    if (!container) {
      return
    }

    const escapedPromptId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(locatedPromptId)
        : locatedPromptId.replace(/["\\]/g, "\\$&")

    const target = container.querySelector<HTMLElement>(
      `.prompt-item[data-prompt-id="${escapedPromptId}"]`,
    )
    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" })

    if (locateHighlightTimerRef.current !== null) {
      window.clearTimeout(locateHighlightTimerRef.current)
    }

    locateHighlightTimerRef.current = window.setTimeout(() => {
      setLocatedPromptId((current) => (current === locatedPromptId ? null : current))
      locateHighlightTimerRef.current = null
    }, 2200)
  }, [activeLibraryView, locatedPromptId, prompts, searchQuery, selectedCategory])

  const renderChainIcon = (iconSvg?: string) => {
    return (
      <SafeSvgMarkup
        className="gh-chain-icon-svg"
        svg={iconSvg}
        fallback={<span className="gh-chain-icon-fallback">C</span>}
      />
    )
  }

  const getChainVariables = (draft: ChainDraft | PromptChain): ParsedVariable[] => {
    const seen = new Set<string>()
    const variables: ParsedVariable[] = []

    draft.steps.forEach((step) => {
      let content = ""

      if (step.mode === "inline" && step.inlineContent) {
        // 内联模式：从 inlineContent 提取变量
        content = step.inlineContent
      } else {
        // Prompt 模式：从已有 prompt 提取变量
        const prompt = prompts.find((item) => item.id === step.promptId)
        if (!prompt) return
        content = prompt.content
      }

      extractVariables(content).forEach((variable) => {
        if (variable.raw === "selection" || variable.raw === "quote" || seen.has(variable.raw)) {
          return
        }
        seen.add(variable.raw)
        variables.push(variable)
      })
    })

    return variables
  }

  const getChainStepTitles = (chain: PromptChain | ChainDraft): string[] =>
    chain.steps.map((step) => {
      if (step.mode === "inline" && step.inlineContent) {
        // 内联模式：截取前 30 个字符作为标题
        const text = step.inlineContent.trim().replace(/\s+/g, " ")
        return text.length > 30 ? `${text.slice(0, 30)}...` : text
      }
      return getPromptTitle(step.promptId)
    })

  const getChainExecutionPreview = (draft: ChainDraft | PromptChain): string[] => {
    const exampleSelection = "Selected text from conversation"
    const exampleQuote = "> Selected text from conversation"
    const exampleValues: Record<string, string> = {
      selection: exampleSelection,
      quote: exampleQuote,
    }

    // 添加自定义变量的示例值
    const variables = getChainVariables(draft)
    variables.forEach((variable) => {
      exampleValues[variable.raw] = `{{${variable.raw}}}`
    })

    return draft.steps.map((step) => {
      let template = ""

      if (step.mode === "inline" && step.inlineContent) {
        template = step.inlineContent
      } else {
        const prompt = prompts.find((item) => item.id === step.promptId)
        template = prompt?.content || ""
      }

      if (!template) return ""

      // 替换变量
      return replaceVariables(template, exampleValues).trim()
    })
  }

  const renderChainQueueGate = (
    placement: "list" | "editor",
    primaryAction: "enable" | "enableAndCreate" = "enable",
  ) => {
    if (promptQueueEnabled) return null

    const shouldCreateAfterEnable = primaryAction === "enableAndCreate"

    return (
      <div className={`gh-chain-queue-gate ${placement}`}>
        <div className="gh-chain-queue-gate-copy">
          <div className="gh-chain-queue-gate-title">{t("chainQueueRequiredTitle")}</div>
          <div className="gh-chain-queue-gate-description">
            {t("chainQueueRequiredDescription")}
          </div>
        </div>
        <div className="gh-chain-queue-gate-actions">
          <Button
            variant="primary"
            size="sm"
            onClick={shouldCreateAfterEnable ? enablePromptQueueAndCreateChain : enablePromptQueue}>
            {shouldCreateAfterEnable ? t("chainQueueEnableAndCreate") : t("chainQueueEnable")}
          </Button>
          <Button variant="ghost" size="sm" onClick={openPromptQueueSettings}>
            {t("chainQueueViewSettings")}
          </Button>
        </div>
      </div>
    )
  }

  const renderChainQuickQuoteGate = (placement: "list" | "editor") => {
    if (quickQuoteEnabled) return null

    return (
      <div className={`gh-chain-queue-gate ${placement}`}>
        <div className="gh-chain-queue-gate-copy">
          <div className="gh-chain-queue-gate-title">{t("chainQuickQuoteRequiredTitle")}</div>
          <div className="gh-chain-queue-gate-description">
            {t("chainQuickQuoteRequiredDescription")}
          </div>
        </div>
        <div className="gh-chain-queue-gate-actions">
          <Button variant="primary" size="sm" onClick={enableQuickQuote}>
            {t("chainQuickQuoteEnable")}
          </Button>
          <Button variant="ghost" size="sm" onClick={openQuickQuoteSettings}>
            {t("chainQuickQuoteViewSettings")}
          </Button>
        </div>
      </div>
    )
  }

  const renderChainsView = () => {
    if (prompts.length === 0) {
      return (
        <div className="gh-chain-empty">
          <div className="gh-chain-empty-title">{t("chainNoPrompts")}</div>
          <div className="gh-chain-empty-description">{t("chainNoPromptsDescription")}</div>
        </div>
      )
    }

    if (filteredChains.length === 0) {
      return (
        <>
          {renderChainQueueGate("list", chains.length === 0 ? "enableAndCreate" : "enable")}
          <div className="gh-chain-empty">
            <div className="gh-chain-empty-title">{t("chainEmpty")}</div>
            <div className="gh-chain-empty-description">{t("chainEmptyDescription")}</div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => openChainEditor()}
              style={{ marginTop: "14px" }}>
              + {t("chainAdd")}
            </Button>
          </div>
        </>
      )
    }

    return (
      <>
        {renderChainQueueGate("list")}
        {renderChainQuickQuoteGate("list")}
        {filteredChains.map((chain) => {
          const showInSelectionPopover = chain.showInSelectionPopover !== false
          const stepTitles = getChainStepTitles(chain)
          const flowText = stepTitles.length > 0 ? stepTitles.join(" → ") : t("chainNoSteps")

          return (
            <div
              key={chain.id}
              className={`gh-chain-card${draggedChainId === chain.id ? " dragging" : ""}`}
              data-disabled={!showInSelectionPopover}
              onClick={() => openChainEditor(chain)}
              draggable
              onDragStart={(e) =>
                handleChainDragStart(e, chain.id, e.currentTarget as HTMLDivElement)
              }
              onDragOver={(e) => handleChainDragOver(e, chain.id)}
              onDragEnd={handleChainDragEnd}
              onDrop={(e) => handleChainDrop(e, chain.id)}>
              <div className="gh-chain-card-main">
                <div className="gh-chain-icon" data-enabled={showInSelectionPopover}>
                  {renderChainIcon(chain.iconSvg)}
                  <span
                    className="gh-chain-icon-status-dot"
                    data-enabled={showInSelectionPopover}
                  />
                </div>
                <div className="gh-chain-body">
                  <div className="gh-chain-title-row">
                    <span className="gh-chain-title">{chain.title}</span>
                  </div>
                  <Tooltip content={flowText}>
                    <div className="gh-chain-flow">
                      <span className="gh-chain-meta-badge">{chain.steps.length}</span>
                      <span className="gh-chain-flow-text">{flowText}</span>
                    </div>
                  </Tooltip>
                </div>
              </div>

              <div className="gh-chain-card-actions">
                <Tooltip
                  content={
                    showInSelectionPopover ? t("chainShownInPopover") : t("chainHiddenInPopover")
                  }>
                  <button
                    className={`prompt-action-btn${showInSelectionPopover ? " active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateChain(chain.id, {
                        showInSelectionPopover: !showInSelectionPopover,
                      })
                    }}>
                    <CheckIcon size={15} />
                  </button>
                </Tooltip>
                <Tooltip content={t("copy")}>
                  <button
                    className="prompt-action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      const copy = duplicateChain(chain.id)
                      if (copy) showToast(t("chainDuplicated"), 1800)
                    }}>
                    <CopyIcon size={15} />
                  </button>
                </Tooltip>
                <Tooltip content={t("delete")}>
                  <button
                    className="prompt-action-btn danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      showConfirm(t("confirmDelete"), t("chainDeleteConfirm"), () => {
                        deleteChain(chain.id)
                        showToast(t("deleted"), 1800)
                      })
                    }}>
                    <DeleteIcon size={15} />
                  </button>
                </Tooltip>
              </div>
            </div>
          )
        })}
      </>
    )
  }

  const renderChainEditorModal = () => {
    if (!chainEditorState.show || !chainEditorState.draft) return null

    const draft = chainEditorState.draft
    const variables = getChainVariables(draft)

    return createPortal(
      <>
        <style>{CHAIN_EDITOR_PORTAL_STYLES}</style>
        <div
          className="prompt-modal gh-interactive"
          {...OPHEL_INTERACTION_LAYER_PROPS}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--gh-overlay-bg, rgba(0, 0, 0, 0.5))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2147483646,
            animation: "fadeIn 0.2s",
          }}>
          <div
            className="prompt-modal-content gh-chain-editor"
            onClick={(e) => e.stopPropagation()}>
            <div className="gh-chain-editor-header">
              <div>
                <div className="gh-chain-editor-title">
                  {draft.id ? t("chainEditorEditTitle") : t("chainEditorNewTitle")}
                </div>
                <div className="gh-chain-editor-subtitle">{t("chainEditorSubtitle")}</div>
              </div>
              <button className="gh-chain-editor-close" onClick={closeChainEditor}>
                <ClearIcon size={18} />
              </button>
            </div>

            <div className="gh-chain-editor-scroll">
              {renderChainQueueGate("editor")}
              {renderChainQuickQuoteGate("editor")}

              <div className="gh-chain-form-grid">
                <label className="gh-chain-field">
                  <span>{t("chainName")}</span>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => updateChainDraft({ title: e.target.value })}
                    placeholder={t("chainNamePlaceholder")}
                  />
                </label>

                <label className="gh-chain-field">
                  <span>{t("chainDescription")}</span>
                  <input
                    type="text"
                    value={draft.description || ""}
                    onChange={(e) => updateChainDraft({ description: e.target.value })}
                    placeholder={t("chainDescriptionPlaceholder")}
                  />
                </label>
              </div>

              <div className="gh-chain-field">
                <div className="gh-chain-icon-header">
                  <span>{t("chainIconSvg")}</span>
                  <label className="gh-chain-visibility-toggle">
                    <input
                      type="checkbox"
                      checked={draft.showInSelectionPopover !== false}
                      onChange={(e) =>
                        updateChainDraft({ showInSelectionPopover: e.target.checked })
                      }
                    />
                    <span className="gh-chain-visibility-switch" aria-hidden="true" />
                    <span className="gh-chain-visibility-toggle-text">
                      {t("chainShowInPopover")}
                    </span>
                  </label>
                </div>
                <div className="gh-chain-icon-control-row">
                  {/* 当前选中的图标预览 */}
                  {draft.iconSvg ? (
                    <div className="gh-chain-icon-preview">
                      <SafeSvgMarkup className="gh-chain-icon-preview-svg" svg={draft.iconSvg} />
                      <span>{t("chainIconSelected")}</span>
                    </div>
                  ) : (
                    <div className="gh-chain-icon-preview empty">{t("chainIconNotSelected")}</div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowChainIconPicker(true)}
                    className="gh-chain-icon-select-btn">
                    {t("chainIconSelect")}
                  </button>
                </div>
              </div>

              <div className="gh-chain-editor-section">
                <div className="gh-chain-section-header">
                  <div>
                    <div className="gh-chain-section-title">{t("chainSteps")}</div>
                    <div className="gh-chain-section-subtitle">{t("chainStepsHelp")}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={addChainStep}>
                    {t("chainAddStep")}
                  </Button>
                </div>

                <div className="gh-chain-step-list">
                  {draft.steps.length === 0 ? (
                    <div className="gh-chain-step-empty">{t("chainNoSteps")}</div>
                  ) : (
                    draft.steps.map((step, index) => (
                      <div
                        key={step.id}
                        className={`gh-chain-step-row${chainEditorState.draggedStepId === step.id ? " dragging" : ""}`}
                        draggable
                        onDragStart={() => handleStepDragStart(step.id)}
                        onDragOver={(e) => handleStepDragOver(e, step.id)}
                        onDragEnd={handleStepDragEnd}>
                        <div className="gh-chain-step-header-row">
                          <div className="gh-chain-step-drag-handle" title={t("drag")}>
                            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                              <circle cx="6" cy="4" r="1.2" />
                              <circle cx="10" cy="4" r="1.2" />
                              <circle cx="6" cy="8" r="1.2" />
                              <circle cx="10" cy="8" r="1.2" />
                              <circle cx="6" cy="12" r="1.2" />
                              <circle cx="10" cy="12" r="1.2" />
                            </svg>
                          </div>
                          <div className="gh-chain-step-index">{index + 1}</div>
                          <div className="gh-chain-step-mode-switch">
                            <button
                              type="button"
                              className={`gh-chain-step-mode-btn${step.mode !== "inline" ? " active" : ""}`}
                              onClick={() =>
                                updateChainStep(step.id, { mode: "prompt", inlineContent: "" })
                              }>
                              {t("chainStepModePrompt")}
                            </button>
                            <button
                              type="button"
                              className={`gh-chain-step-mode-btn${step.mode === "inline" ? " active" : ""}`}
                              onClick={() =>
                                updateChainStep(step.id, { mode: "inline", promptId: "" })
                              }>
                              {t("chainStepModeInline")}
                            </button>
                          </div>
                          <Tooltip content={t("delete")}>
                            <button
                              className="gh-chain-step-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeChainStep(step.id)
                              }}>
                              <DeleteIcon size={14} />
                            </button>
                          </Tooltip>
                        </div>
                        <div className="gh-chain-step-input-row">
                          {step.mode === "inline" ? (
                            <textarea
                              className="gh-chain-step-inline-input"
                              value={step.inlineContent || ""}
                              onChange={(e) =>
                                updateChainStep(step.id, { inlineContent: e.target.value })
                              }
                              placeholder={t("chainStepInlinePlaceholder")}
                              rows={4}
                            />
                          ) : (
                            <select
                              className="gh-chain-step-prompt-select"
                              value={step.promptId}
                              onChange={(e) =>
                                updateChainStep(step.id, { promptId: e.target.value })
                              }>
                              <option value="">{t("chainSelectPrompt")}</option>
                              {prompts.map((prompt) => (
                                <option key={prompt.id} value={prompt.id}>
                                  {prompt.title}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="gh-chain-editor-section">
                <div className="gh-chain-section-title">{t("chainVariablesPreview")}</div>
                <div className="gh-chain-variable-preview">
                  <span className="gh-chain-variable-chip">{`{{selection}}`}</span>
                  <span className="gh-chain-variable-chip">{`{{quote}}`}</span>
                  {variables.length === 0 ? (
                    <span className="gh-chain-variable-muted">{t("chainVariablesNone")}</span>
                  ) : (
                    variables.map((variable) => (
                      <span key={variable.raw} className="gh-chain-variable-chip custom">
                        {`{{${variable.raw}}}`}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {draft.steps.length > 0 && (
                <div className="gh-chain-editor-section gh-chain-preview-section">
                  <div className="gh-chain-section-header" style={{ marginBottom: 0 }}>
                    <div className="gh-chain-section-title">{t("chainExecutionPreview")}</div>
                    <button
                      type="button"
                      className="gh-chain-preview-toggle"
                      onClick={() =>
                        setChainEditorState((state) => ({
                          ...state,
                          showExecutionPreview: !state.showExecutionPreview,
                        }))
                      }>
                      {chainEditorState.showExecutionPreview ? t("collapse") : t("expand")}
                    </button>
                  </div>
                  {chainEditorState.showExecutionPreview && (
                    <>
                      <div className="gh-chain-preview-nav-float">
                        <span className="gh-chain-preview-nav-label">{t("chainSteps")}</span>
                        {draft.steps.map((step, idx) => {
                          const title = getChainStepTitles(draft)[idx] || `Step ${idx + 1}`
                          return (
                            <Tooltip key={step.id} content={title}>
                              <button
                                type="button"
                                className="gh-chain-preview-nav-btn"
                                onClick={() => {
                                  document
                                    .getElementById(`chain-preview-step-${idx}`)
                                    ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
                                }}>
                                <span className="nav-btn-num">{idx + 1}</span>
                                <span className="nav-btn-title">{title}</span>
                              </button>
                            </Tooltip>
                          )
                        })}
                      </div>
                      <div className="gh-chain-preview-content">
                        {getChainExecutionPreview(draft).map((content, index) => (
                          <div
                            key={index}
                            id={`chain-preview-step-${index}`}
                            className="gh-chain-preview-step">
                            <div className="gh-chain-preview-step-header">
                              <span className="gh-chain-preview-step-number">{index + 1}</span>
                              <span className="gh-chain-preview-step-title">
                                {getChainStepTitles(draft)[index] || t("chainStep")}
                              </span>
                            </div>
                            <div
                              className="gh-chain-preview-step-body"
                              dangerouslySetInnerHTML={{
                                __html: content
                                  ? createSafeHTML(renderMarkdown(content))
                                  : createSafeHTML(
                                      `<span class="gh-chain-preview-empty">${t("chainStepContentEmpty")}</span>`,
                                    ),
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="gh-chain-editor-footer">
              <Button
                variant="ghost"
                onClick={closeChainEditor}
                style={{ background: "var(--gh-hover, #f3f4f6)" }}>
                {t("cancel")}
              </Button>
              <Button variant="primary" onClick={saveChainDraft}>
                {draft.id ? t("save") : t("add")}
              </Button>
            </div>
          </div>
        </div>
      </>,
      document.body,
    )
  }

  // 编辑/新增弹窗
  const renderEditModal = () => {
    if (!isModalOpen) return null

    return createPortal(
      <div
        className="prompt-modal gh-interactive"
        {...OPHEL_INTERACTION_LAYER_PROPS}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--gh-overlay-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2147483646,
          animation: "fadeIn 0.2s",
        }}>
        <div
          className="prompt-modal-content"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--gh-bg, white)",
            borderRadius: "12px",
            width: "90%",
            maxWidth: "500px",
            padding: "24px",
            animation: "slideUp 0.3s",
            boxShadow: "var(--gh-shadow, 0 20px 50px rgba(0,0,0,0.3))",
          }}>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "20px",
              color: "var(--gh-text, #1f2937)",
            }}>
            {editingPrompt?.id ? t("editPrompt") : t("addNewPrompt")}
          </div>

          {/* 标题 */}
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--gh-text, #374151)",
                marginBottom: "6px",
              }}>
              {t("title")}
            </label>
            <input
              type="text"
              value={editingPrompt?.title || ""}
              onChange={(e) => setEditingPrompt({ ...editingPrompt, title: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--gh-border, #d1d5db)",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
                background: "var(--gh-bg, #ffffff)",
                color: "var(--gh-text, #1f2937)",
              }}
            />
          </div>

          {/* 分类 */}
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--gh-text, #374151)",
                marginBottom: "6px",
              }}>
              {t("category")}
            </label>
            <input
              type="text"
              value={editingPrompt?.category || ""}
              onChange={(e) => setEditingPrompt({ ...editingPrompt, category: e.target.value })}
              placeholder={t("categoryPlaceholder")}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--gh-border, #d1d5db)",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
                background: "var(--gh-bg, #ffffff)",
                color: "var(--gh-text, #1f2937)",
              }}
            />
            {categories.length > 0 && (
              <div
                style={{
                  marginTop: "6px",
                  display: "flex",
                  gap: "4px",
                  flexWrap: "wrap",
                  userSelect: "none",
                }}>
                {categories.map((cat) => (
                  <span
                    key={cat}
                    onClick={() => setEditingPrompt({ ...editingPrompt, category: cat })}
                    style={{
                      padding: "2px 8px",
                      fontSize: "11px",
                      background:
                        editingPrompt?.category === cat
                          ? "var(--gh-primary, #4285f4)"
                          : "var(--gh-hover, #f3f4f6)",
                      color:
                        editingPrompt?.category === cat
                          ? "var(--gh-text-on-primary, white)"
                          : "var(--gh-text-secondary, #6b7280)",
                      borderRadius: "10px",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}>
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 内容 */}
          <div style={{ marginBottom: "16px" }}>
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                }}>
                <label
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--gh-text, #374151)",
                  }}>
                  {t("content")}
                </label>
                {/* ⭐ 预览开关 */}
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  style={{
                    padding: "2px 8px",
                    fontSize: "12px",
                    background: showPreview
                      ? "var(--gh-primary, #4285f4)"
                      : "var(--gh-hover, #f3f4f6)",
                    color: showPreview ? "white" : "var(--gh-text-secondary, #6b7280)",
                    border: "1px solid var(--gh-border, #d1d5db)",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}>
                  {t("promptMarkdownPreview")}
                </button>
              </div>
              <textarea
                value={editingPrompt?.content || ""}
                onChange={(e) => setEditingPrompt({ ...editingPrompt, content: e.target.value })}
                style={{
                  width: "100%",
                  minHeight: "120px",
                  padding: "8px 12px",
                  border: "1px solid var(--gh-border, #d1d5db)",
                  borderRadius: "6px",
                  fontSize: "14px",
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  background: "var(--gh-bg, #ffffff)",
                  color: "var(--gh-text, #1f2937)",
                  display: showPreview ? "none" : "block",
                }}
              />
              {/* ⭐ Markdown 预览区域 */}
              {showPreview && (
                <>
                  <div
                    className="gh-markdown-preview"
                    style={{
                      width: "100%",
                      minHeight: "120px",
                      maxHeight: "200px",
                      padding: "8px 12px",
                      border: "1px solid var(--gh-border, #d1d5db)",
                      borderRadius: "6px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      background: "var(--gh-bg-secondary, #f9fafb)",
                      color: "var(--gh-text, #1f2937)",
                      overflowY: "auto",
                      lineHeight: 1.6,
                    }}
                    ref={editPreviewRef}
                    onClick={(e) => {
                      // 事件委托处理复制按钮（支持点击 SVG 内部）
                      const target = e.target as HTMLElement
                      const btn = target.closest(".gh-code-copy-btn") as HTMLElement
                      if (btn) {
                        const code = btn.nextElementSibling?.textContent || ""
                        navigator.clipboard.writeText(code).then(() => {
                          showCopySuccess(btn, { size: 14 })
                        })
                      }
                    }}
                    dangerouslySetInnerHTML={{
                      __html: createSafeHTML(renderMarkdown(editingPrompt?.content || "")),
                    }}
                  />
                  <style>{getHighlightStyles()}</style>
                </>
              )}
            </div>
          </div>

          {/* 按钮 */}
          <div
            style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
            <Button
              variant="ghost"
              onClick={closeEditModal}
              style={{ background: "var(--gh-hover, #f3f4f6)" }}>
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={handleSave}>
              {editingPrompt?.id ? t("save") : t("add")}
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  // 分类管理弹窗
  const renderCategoryModal = () => {
    if (!isCategoryModalOpen) return null

    return createPortal(
      <div
        className="prompt-modal gh-interactive"
        {...OPHEL_INTERACTION_LAYER_PROPS}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--gh-overlay-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2147483646,
          animation: "fadeIn 0.2s",
        }}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--gh-bg, white)",
            borderRadius: "12px",
            width: "90%",
            maxWidth: "400px",
            padding: "24px",
            animation: "slideUp 0.3s",
            boxShadow: "var(--gh-shadow-lg, 0 20px 50px rgba(0,0,0,0.3))",
          }}>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "20px",
              color: "var(--gh-text, #1f2937)",
            }}>
            {t("categoryManage")}
          </div>

          <div style={{ maxHeight: "300px", overflowY: "auto" }}>
            {categories.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--gh-text-tertiary, #9ca3af)",
                  padding: "20px",
                }}>
                {t("categoryEmpty")}
              </div>
            ) : (
              categories.map((cat) => {
                const count = prompts.filter((p) => p.category === cat).length
                return (
                  <div
                    key={cat}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--gh-border, #e5e7eb)",
                    }}>
                    <div>
                      <div style={{ fontWeight: 500, color: "var(--gh-text, #374151)" }}>{cat}</div>
                      <div style={{ fontSize: "12px", color: "var(--gh-text-tertiary, #9ca3af)" }}>
                        {count} {t("promptCountSuffix")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Tooltip content={t("rename")}>
                        <Button
                          size="sm"
                          onClick={(e) => handleRenameCategory(cat, e)}
                          style={{ color: "var(--gh-primary, #4285f4)" }}>
                          {t("rename")}
                        </Button>
                      </Tooltip>
                      <Tooltip content={t("delete")}>
                        <Button
                          size="sm"
                          onClick={(e) => handleDeleteCategory(cat, e)}
                          style={{
                            border: "1px solid var(--gh-border-danger, #fecaca)",
                            background: "var(--gh-bg-danger, #fef2f2)",
                            color: "var(--gh-text-danger, #ef4444)",
                          }}>
                          {t("delete")}
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="ghost"
              onClick={closeCategoryModal}
              style={{ background: "var(--gh-hover, #f3f4f6)" }}>
              {t("close")}
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  // 预览弹窗渲染
  const renderPreviewModal = () => {
    if (!previewModal.show || !previewModal.prompt) return null

    return createPortal(
      <div
        className="prompt-preview-modal gh-interactive"
        {...OPHEL_INTERACTION_LAYER_PROPS}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closePreviewModal()
          }
        }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--gh-overlay-bg, rgba(0, 0, 0, 0.5))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10001,
          animation: "fadeIn 0.2s ease-out",
        }}>
        <div
          style={{
            width: "90%",
            maxWidth: "600px",
            maxHeight: "80vh",
            background: "var(--gh-bg, white)",
            borderRadius: "12px",
            boxShadow: "var(--gh-shadow-lg)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            animation: "slideUp 0.3s ease-out",
          }}>
          {/* 标题栏 */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--gh-border, #e5e7eb)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
            <div>
              <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--gh-text, #1f2937)" }}>
                {previewModal.prompt.title}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--gh-text-secondary, #6b7280)",
                  marginTop: "4px",
                }}>
                {previewModal.prompt.category}
              </div>
            </div>
            <button
              onClick={closePreviewModal}
              style={{
                width: "28px",
                height: "28px",
                border: "none",
                background: "var(--gh-hover, #f3f4f6)",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
              <ClearIcon size={16} />
            </button>
          </div>
          {/* 内容区域 */}
          <div
            className="gh-markdown-preview"
            style={{
              flex: 1,
              padding: "20px",
              overflowY: "auto",
            }}
            ref={modalPreviewRef}
            onClick={(e) => {
              // 事件委托处理复制按钮（支持点击 SVG 内部）
              const target = e.target as HTMLElement
              const btn = target.closest(".gh-code-copy-btn") as HTMLElement
              if (btn) {
                const code = btn.nextElementSibling?.textContent || ""
                navigator.clipboard.writeText(code).then(() => {
                  showCopySuccess(btn, { size: 14 })
                })
              }
            }}
            dangerouslySetInnerHTML={{
              __html: createSafeHTML(renderMarkdown(previewModal.prompt.content)),
            }}
          />
          {/* highlight.js 样式 */}
          <style>{getHighlightStyles()}</style>
        </div>
      </div>,
      document.body,
    )
  }

  // 导入确认弹窗渲染
  const renderImportDialog = () => {
    if (!importDialogState.show) return null

    return createPortal(
      <div
        className="import-dialog gh-interactive"
        {...OPHEL_INTERACTION_LAYER_PROPS}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closeImportDialog()
          }
        }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--gh-overlay-bg, rgba(0, 0, 0, 0.5))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10001,
        }}>
        <div
          style={{
            width: "90%",
            maxWidth: "400px",
            background: "var(--gh-bg, white)",
            borderRadius: "12px",
            boxShadow: "var(--gh-shadow-lg)",
            padding: "24px",
          }}>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--gh-text)",
            }}>
            {t("promptImportTitle")}
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "var(--gh-text-secondary)",
              marginBottom: "20px",
              lineHeight: 1.6,
            }}>
            {t("promptImportMessage2").replace(
              "{count}",
              importDialogState.prompts.length.toString(),
            )}
            <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
              <li>{t("promptImportOverwriteDesc")}</li>
              <li>{t("promptImportMergeDesc")}</li>
            </ul>
          </div>
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <Button
              variant="ghost"
              onClick={closeImportDialog}
              style={{ background: "var(--gh-hover, #f3f4f6)" }}>
              {t("cancel")}
            </Button>
            <Button
              variant="ghost"
              onClick={handleImportMerge}
              style={{
                background: "var(--gh-primary-light, #e3f2fd)",
                color: "var(--gh-primary, #4285f4)",
              }}>
              {t("promptMerge")}
            </Button>
            <Button variant="primary" onClick={handleImportOverwrite}>
              {t("promptOverwrite")}
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  return (
    <div
      className="gh-prompts-tab"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 搜索栏 + 操作按钮 */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--gh-border, #e5e7eb)",
          background: "var(--gh-bg-secondary, #f9fafb)",
          display: "flex",
          gap: "6px",
          alignItems: "center",
        }}>
        <div className="gh-prompt-library-switch" role="tablist">
          <button
            type="button"
            className="gh-prompt-library-switch-btn"
            data-active={activeLibraryView === "prompts"}
            onClick={() => setActiveLibraryView("prompts")}>
            {t("promptsViewPrompts")}
          </button>
          <button
            type="button"
            className="gh-prompt-library-switch-btn"
            data-active={activeLibraryView === "chains"}
            onClick={() => setActiveLibraryView("chains")}>
            {t("promptsViewChains")}
          </button>
        </div>
        <input
          type="text"
          className="prompt-search-input"
          placeholder={
            activeLibraryView === "chains" ? t("chainSearchPlaceholder") : t("searchPlaceholder")
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: "1 1 auto",
            minWidth: "120px",
            padding: "6px 10px",
            border: "1px solid var(--gh-border, #d1d5db)",
            borderRadius: "8px",
            fontSize: "14px",
            boxSizing: "border-box",
            background: "var(--gh-bg, #ffffff)",
            color: "var(--gh-text, #1f2937)",
          }}
        />
        {activeLibraryView === "prompts" && (
          <div style={{ position: "relative" }}>
            <Tooltip content={t("promptImport") + " / " + t("promptExport")}>
              <button
                ref={importExportButtonRef}
                onClick={() => setImportExportMenuOpen(!importExportMenuOpen)}
                style={{
                  width: "32px",
                  height: "32px",
                  border: "1px solid var(--gh-border, #d1d5db)",
                  background: "var(--gh-bg, white)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  flexShrink: 0,
                }}>
                <ImportIcon size={16} />
              </button>
            </Tooltip>
            {importExportMenuOpen && (
              <>
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 99,
                  }}
                  onClick={() => setImportExportMenuOpen(false)}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    right: 0,
                    zIndex: 100,
                    minWidth: "140px",
                    background: "var(--gh-bg, #ffffff)",
                    border: "1px solid var(--gh-border, #e5e7eb)",
                    borderRadius: "8px",
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
                    overflow: "hidden",
                  }}>
                  <button
                    onClick={() => {
                      setImportExportMenuOpen(false)
                      handleImport()
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "none",
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "13px",
                      color: "var(--gh-text, #1f2937)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--gh-hover, #f3f4f6)")
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <ImportIcon size={14} />
                    {t("promptImport")}
                  </button>
                  <button
                    onClick={() => {
                      setImportExportMenuOpen(false)
                      handleExport()
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "none",
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "13px",
                      color: "var(--gh-text, #1f2937)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--gh-hover, #f3f4f6)")
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <ExportIcon size={14} />
                    {t("promptExport")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 分类标签栏：左侧可滚动 + 右侧固定 */}
      {activeLibraryView === "prompts" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--gh-bg, white)",
            borderBottom: "1px solid var(--gh-border, #e5e7eb)",
            userSelect: "none",
          }}>
          {/* 左侧可滚动分类列表 */}
          <div
            className="prompt-category-bar"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "6px 0 6px 10px",
              display: "flex",
              gap: "5px",
              flexWrap: "nowrap",
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
            onWheel={(e) => {
              // 将竖向滚轮转为横向滚动（Shadow DOM 内 wheel 事件不自动横滚）
              if (e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY
              }
            }}>
            <span
              onClick={() => setSelectedCategory(VIRTUAL_CATEGORY.ALL)}
              style={{
                padding: "4px 10px",
                background:
                  selectedCategory === VIRTUAL_CATEGORY.ALL
                    ? "var(--gh-primary, #4285f4)"
                    : "var(--gh-hover, #f3f4f6)",
                borderRadius: "12px",
                fontSize: "12px",
                color: selectedCategory === VIRTUAL_CATEGORY.ALL ? "white" : "#4b5563",
                cursor: "pointer",
                flexShrink: 0,
                border:
                  selectedCategory === VIRTUAL_CATEGORY.ALL
                    ? "1px solid var(--gh-primary, #4285f4)"
                    : "1px solid transparent",
              }}>
              {t("allCategory")}
            </span>

            {categories.map((cat) => {
              const colorIndex = getCategoryColorIndex(cat)
              return (
                <Tooltip key={cat} content={cat}>
                  <span
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: "4px 10px",
                      background:
                        selectedCategory === cat
                          ? "var(--gh-primary, #4285f4)"
                          : `var(--gh-category-${colorIndex})`,
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: selectedCategory === cat ? "white" : "#4b5563",
                      cursor: "pointer",
                      flexShrink: 0,
                      border:
                        selectedCategory === cat
                          ? "1px solid var(--gh-primary, #4285f4)"
                          : "1px solid transparent",
                      maxWidth: "80px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                    {cat}
                  </span>
                </Tooltip>
              )
            })}
          </div>

          {/* 右侧固定：最近使用 + 管理（仅图标） */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 8px",
              flexShrink: 0,
              borderLeft: "1px solid var(--gh-border, #e5e7eb)",
            }}>
            {/* ⭐ 最近使用（仅图标） */}
            <Tooltip content={t("promptRecentUsed")}>
              <span
                onClick={() => setSelectedCategory(VIRTUAL_CATEGORY.RECENT)}
                style={{
                  padding: "3px 6px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                  background:
                    selectedCategory === VIRTUAL_CATEGORY.RECENT
                      ? "var(--gh-primary, #4285f4)"
                      : "var(--gh-hover, #f3f4f6)",
                  borderRadius: "10px",
                  color: selectedCategory === VIRTUAL_CATEGORY.RECENT ? "white" : "#4b5563",
                  cursor: "pointer",
                  border:
                    selectedCategory === VIRTUAL_CATEGORY.RECENT
                      ? "1px solid var(--gh-primary, #4285f4)"
                      : "1px solid transparent",
                }}>
                <TimeIcon size={14} />
              </span>
            </Tooltip>
            {categories.length > 0 && (
              <Tooltip content={t("manageCategory")}>
                <button
                  onClick={() => setIsCategoryModalOpen(true)}
                  style={{
                    padding: "3px 6px",
                    background: "transparent",
                    border: "1px dashed var(--gh-border, #d1d5db)",
                    borderRadius: "10px",
                    color: "var(--gh-text-secondary, #9ca3af)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                  <SettingsIcon size={13} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {/* 提示词列表 */}
      <div
        ref={promptListRef}
        style={{ flex: 1, overflowY: "auto", padding: "8px", scrollbarWidth: "none" }}>
        {activeLibraryView === "chains" ? (
          renderChainsView()
        ) : filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "var(--gh-text-tertiary, #9ca3af)",
              fontSize: "14px",
            }}>
            暂无提示词
          </div>
        ) : (
          filtered.map((p) => {
            const isSelected = selectedPromptId === p.id
            const isLocated = locatedPromptId === p.id
            const isHighlighted = isSelected || isLocated

            return (
              <div
                key={p.id}
                data-prompt-id={p.id}
                className={`prompt-item ${isHighlighted ? "selected" : ""} ${isLocated ? "located" : ""} ${draggedId === p.id ? "dragging" : ""}`}
                onClick={() => handlePromptClick(p)}
                onDoubleClick={() => handlePromptDoubleClick(p)}
                draggable
                onDragStart={(e) => handleDragStart(e, p.id, e.currentTarget as HTMLDivElement)}
                onDragOver={(e) => handleDragOver(e, p.id)}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(e, p.id)}
                style={{
                  background: isHighlighted
                    ? "linear-gradient(135deg, #e8f0fe 0%, #f1f8e9 100%)"
                    : "var(--gh-bg, white)",
                  border: isHighlighted
                    ? "1px solid var(--gh-primary, #4285f4)"
                    : "1px solid var(--gh-border, #e5e7eb)",
                  borderRadius: "8px",
                  padding: "12px",
                  marginBottom: "8px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  position: "relative",
                  userSelect: "none",
                }}>
                {/* 头部 */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "8px",
                  }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "14px",
                      color: "var(--gh-text, #1f2937)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: "8px",
                    }}>
                    {p.title}
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 6px",
                      background: "var(--gh-hover, #f3f4f6)",
                      borderRadius: "4px",
                      color: "var(--gh-text-secondary, #6b7280)",
                      flexShrink: 0,
                    }}>
                    {p.category || t("uncategorized")}
                  </span>
                </div>

                {/* 内容预览 */}
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--gh-text-secondary, #6b7280)",
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                  {p.content}
                </div>

                {/* 悬浮操作按钮 */}
                <div
                  className="prompt-item-actions"
                  style={{ position: "absolute", top: "8px", right: "8px", gap: "2px" }}>
                  {/* ⭐ 置顶按钮 */}
                  <Tooltip content={p.pinned ? t("promptUnpin") : t("promptPin")}>
                    <button
                      onClick={(e) => handleTogglePin(p.id, e)}
                      className={`prompt-action-btn${p.pinned ? " active" : ""}`}>
                      <PinIcon size={16} filled={p.pinned} />
                    </button>
                  </Tooltip>
                  {/* ⭐ 预览按钮 */}
                  <Tooltip content={t("promptMarkdownPreview")}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setPreviewModal({ show: true, prompt: p })
                      }}
                      className="prompt-action-btn">
                      <EyeIcon size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content={t("copy")}>
                    <button onClick={(e) => handleCopy(p.content, e)} className="prompt-action-btn">
                      <CopyIcon size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content={t("more")}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setPromptActionMenu({ prompt: p, anchorEl: e.currentTarget })
                      }}
                      className="prompt-action-btn">
                      <MoreHorizontalIcon size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content={t("edit")}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        openEditModal(p)
                      }}
                      className="prompt-action-btn">
                      <EditIcon size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content={t("delete")}>
                    <button
                      onClick={(e) => handleDelete(p.id, e)}
                      className="prompt-action-btn danger">
                      <DeleteIcon size={16} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 添加按钮 */}
      <div style={{ padding: "12px" }}>
        <button
          onClick={() => {
            if (activeLibraryView === "chains") {
              openChainEditor()
              return
            }
            openEditModal()
          }}
          style={{
            width: "100%",
            padding: "10px",
            background: "var(--gh-header-bg)",
            color: "var(--gh-footer-text, var(--gh-text-on-primary, white))",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            boxShadow: "var(--gh-btn-shadow)",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)"
            e.currentTarget.style.boxShadow = "var(--gh-btn-shadow-hover)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)"
            e.currentTarget.style.boxShadow = "var(--gh-btn-shadow)"
          }}>
          <span>+</span>
          <span>{activeLibraryView === "chains" ? t("chainAdd") : t("addPrompt")}</span>
        </button>
      </div>

      {/* 弹窗 */}
      {renderEditModal()}
      {renderCategoryModal()}
      {renderPreviewModal()}
      {renderImportDialog()}
      {renderChainEditorModal()}

      {/* 公共对话框组件 */}
      {confirmState.show && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          danger
          closeOnOverlayClick={false}
          onConfirm={() => {
            closeConfirmDialog()
            confirmState.onConfirm()
          }}
          onCancel={closeConfirmDialog}
        />
      )}
      {promptInputState.show && (
        <InputDialog
          title={promptInputState.title}
          defaultValue={promptInputState.defaultValue}
          closeOnOverlayClick={false}
          onConfirm={(value) => {
            closePromptInputDialog()
            promptInputState.onConfirm(value)
          }}
          onCancel={closePromptInputDialog}
        />
      )}

      {/* ⭐ 变量输入弹窗 */}
      {variableDialogState.show && (
        <VariableInputDialog
          variables={variableDialogState.variables}
          onConfirm={handleVariableConfirm}
          onCancel={closeVariableDialog}
        />
      )}
      {promptActionMenu && (
        <ContextMenu anchorEl={promptActionMenu.anchorEl} onClose={closePromptActionMenu}>
          <MenuButton
            onClick={() => {
              doEnqueuePrompt(promptActionMenu.prompt)
              closePromptActionMenu()
            }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <AddToQueueIcon size={14} />
              <span>{t("promptAddToQueue")}</span>
            </span>
          </MenuButton>
          <MenuButton
            onClick={() => {
              doEnqueuePrompt(promptActionMenu.prompt, true)
              closePromptActionMenu()
            }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <SplitLinesToQueueIcon size={14} />
              <span>{t("promptSplitLinesToQueue")}</span>
            </span>
          </MenuButton>
        </ContextMenu>
      )}

      {/* 图标选择器弹窗 */}
      {showChainIconPicker &&
        chainEditorState.draft &&
        createPortal(
          <div
            className="prompt-modal gh-interactive"
            {...OPHEL_INTERACTION_LAYER_PROPS}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2147483647,
            }}
            onClick={() => setShowChainIconPicker(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <ChainIconPicker
                value={chainEditorState.draft.iconSvg}
                onChange={(_iconId, svg) => {
                  updateChainDraft({ iconSvg: svg })
                  setShowChainIconPicker(false)
                }}
                onClose={() => setShowChainIconPicker(false)}
              />
            </div>
          </div>,
          document.body,
        )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  )
}
