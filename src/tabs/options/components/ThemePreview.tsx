import React from "react"

import type { ThemePreset } from "~utils/themes"

interface ThemePreviewProps {
  preset: ThemePreset
}

export const ThemePreview: React.FC<ThemePreviewProps> = ({ preset }) => {
  const vars = preset.variables

  const bg = vars["--gh-bg"] || "#ffffff"
  const headerBg = vars["--gh-header-bg"] || vars["--gh-primary"] || "#4285f4"
  const borderColor = vars["--gh-border"] || "#e5e7eb"
  const primary = vars["--gh-primary"] || "#4285f4"
  const text = vars["--gh-text"] || "#374151"
  const textSecondary = vars["--gh-text-secondary"] || "#9ca3af"
  const sidebarBg = vars["--gh-bg-secondary"] || "#f3f4f6"
  const tertiaryBg = vars["--gh-bg-tertiary"] || vars["--gh-hover"] || "#f3f4f6"
  const selectedGradient = vars["--gh-selected-gradient"] || primary
  const bgTexture = vars["--gh-bg-image"]
  const textOnPrimary = vars["--gh-text-on-primary"] || "#ffffff"

  return (
    <div
      className="theme-preview-layout"
      style={{
        background: bg,
        borderColor: borderColor,
      }}>
      {bgTexture ? (
        <div className="theme-preview-texture" style={{ backgroundImage: bgTexture }} />
      ) : null}

      <div
        className="theme-preview-header"
        style={{
          background: headerBg,
          borderBottomColor: borderColor,
        }}>
        <div className="theme-preview-window-chrome">
          <div className="theme-preview-dot" />
          <div className="theme-preview-dot delay-1" />
          <div className="theme-preview-dot delay-2" />
        </div>
        <div
          className="theme-preview-header-pill"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.18)",
            color: textOnPrimary,
          }}
        />
      </div>

      <div className="theme-preview-body">
        <div
          className="theme-preview-sidebar"
          style={{
            backgroundColor: sidebarBg,
            borderColor: borderColor,
          }}>
          <div
            className="theme-preview-sidebar-chip"
            style={{
              background: selectedGradient,
            }}
          />
          <div
            className="theme-preview-line short"
            style={{ backgroundColor: textSecondary, opacity: 0.3 }}
          />
          <div
            className="theme-preview-line"
            style={{ backgroundColor: textSecondary, opacity: 0.3 }}
          />
          <div
            className="theme-preview-line"
            style={{ backgroundColor: textSecondary, opacity: 0.3 }}
          />

          {/* Active Item */}
          <div
            className="theme-preview-active-item"
            style={{
              background: selectedGradient,
            }}
          />
        </div>

        <div className="theme-preview-content">
          <div
            className="theme-preview-hero"
            style={{
              background: selectedGradient,
            }}
          />

          <div
            className="theme-preview-card"
            style={{
              backgroundColor: tertiaryBg,
              borderColor: borderColor,
            }}>
            <div
              className="theme-preview-line medium"
              style={{ backgroundColor: text, opacity: 0.68 }}
            />
            <div
              className="theme-preview-line short"
              style={{ backgroundColor: textSecondary, opacity: 0.42 }}
            />
          </div>

          <div className="theme-preview-row">
            <div
              className="theme-preview-avatar"
              style={{ backgroundColor: textSecondary, opacity: 0.2 }}
            />
            <div style={{ flex: 1 }}>
              <div
                className="theme-preview-line"
                style={{ backgroundColor: text, opacity: 0.6, marginBottom: 4 }}
              />
              <div
                className="theme-preview-line short"
                style={{ backgroundColor: textSecondary, opacity: 0.4 }}
              />
            </div>
          </div>

          <div className="theme-preview-row compact">
            <div
              className="theme-preview-card compact"
              style={{
                backgroundColor: tertiaryBg,
                borderColor: borderColor,
              }}>
              <div
                className="theme-preview-line short"
                style={{ backgroundColor: textSecondary, opacity: 0.46 }}
              />
            </div>
            <div className="theme-preview-button" style={{ background: headerBg }}></div>
          </div>
        </div>
      </div>
    </div>
  )
}
