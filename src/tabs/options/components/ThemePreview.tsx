import React from "react"

import type { ThemePreset } from "~utils/themes"

interface ThemePreviewProps {
  preset: ThemePreset
}

export const ThemePreview: React.FC<ThemePreviewProps> = ({ preset }) => {
  const vars = preset.variables

  const previewVars = {
    "--preview-bg-rgb": vars["--gh-bg-rgb"],
    "--preview-surface-rgb": vars["--gh-surface-rgb"],
    "--preview-primary-rgb": vars["--gh-primary-rgb"],
    "--preview-bg": vars["--gh-bg"],
    "--preview-shell-bg": vars["--gh-shell-bg"],
    "--preview-shell-surface": vars["--gh-shell-surface"],
    "--preview-shell-border": vars["--gh-shell-border"],
    "--preview-header-bg": vars["--gh-header-bg"],
    "--preview-tab-bg": vars["--gh-tab-bg"],
    "--preview-tab-active-bg": vars["--gh-tab-active-bg"],
    "--preview-tab-active-text": vars["--gh-tab-active-text"],
    "--preview-tab-active-indicator": vars["--gh-tab-active-indicator"],
    "--preview-control-bg": vars["--gh-control-bg"],
    "--preview-control-border": vars["--gh-control-active-border"],
    "--preview-list-selected-bg": vars["--gh-list-item-selected-bg"],
    "--preview-list-selected-border": vars["--gh-list-item-selected-border"],
    "--preview-text": vars["--gh-text"],
    "--preview-text-secondary": vars["--gh-text-secondary"],
    "--preview-glass-blur": vars["--gh-glass-blur"],
    "--preview-glass-opacity": vars["--gh-glass-opacity"],
    "--preview-glow-shadow": vars["--gh-glow-shadow"],
    "--preview-radius-factor": vars["--gh-radius-factor"],
    "--preview-texture": vars["--gh-surface-texture"],
  } as React.CSSProperties

  return (
    <div className="theme-preview-layout" style={previewVars}>
      <div className="theme-preview-header">
        <div className="theme-preview-brand" />
        <div className="theme-preview-header-line" />
        <div className="theme-preview-header-action" />
      </div>
      <div className="theme-preview-tabs">
        <div className="theme-preview-tab active" />
        <div className="theme-preview-tab" />
        <div className="theme-preview-tab" />
      </div>
      <div className="theme-preview-body">
        <div className="theme-preview-list">
          <div className="theme-preview-item" />
          <div className="theme-preview-item selected">
            <span />
          </div>
          <div className="theme-preview-item short" />
        </div>
        <div className="theme-preview-content">
          <div className="theme-preview-surface" />
          <div className="theme-preview-row">
            <div className="theme-preview-avatar" />
            <div className="theme-preview-copy">
              <div className="theme-preview-line" />
              <div className="theme-preview-line short" />
            </div>
          </div>
          <div className="theme-preview-button" />
        </div>
      </div>
    </div>
  )
}
