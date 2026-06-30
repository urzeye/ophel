import type { ThemeVariables } from "./types"

export type AuraTokenKey =
  | "--gh-bg-rgb"
  | "--gh-surface-rgb"
  | "--gh-primary-rgb"
  | "--gh-glass-blur"
  | "--gh-glass-opacity"
  | "--gh-glass-border-opacity"
  | "--gh-glow-shadow"
  | "--gh-surface-texture"
  | "--gh-radius-factor"
  | "--gh-shell-bg"
  | "--gh-shell-surface"
  | "--gh-shell-surface-raised"
  | "--gh-shell-border"
  | "--gh-shell-shadow"
  | "--gh-tab-bg"
  | "--gh-tab-hover-bg"
  | "--gh-tab-active-bg"
  | "--gh-tab-active-text"
  | "--gh-tab-active-indicator"
  | "--gh-control-bg"
  | "--gh-control-hover-bg"
  | "--gh-control-active-bg"
  | "--gh-control-border"
  | "--gh-control-active-border"
  | "--gh-list-item-hover-bg"
  | "--gh-list-item-selected-bg"
  | "--gh-list-item-selected-border"
  | "--gh-list-item-current-bg"
  | "--gh-list-item-current-border"
  | "--gh-focus-ring"
  | "--gh-success"
  | "--gh-warning"
  | "--gh-error"
  | "--gh-transition-fast"
  | "--gh-transition-smooth"
  | "--gh-transition-spring"

export type LegacyThemeVariables = Omit<ThemeVariables, AuraTokenKey> &
  Partial<Pick<ThemeVariables, AuraTokenKey>>

type AuraMaterialTokens = Pick<
  ThemeVariables,
  | "--gh-glass-blur"
  | "--gh-glass-opacity"
  | "--gh-glass-border-opacity"
  | "--gh-glow-shadow"
  | "--gh-surface-texture"
  | "--gh-radius-factor"
>

const PROFESSIONAL_GLOW = "none"
const EXPRESSIVE_GLOW = "0 0 12px rgba(var(--gh-primary-rgb), 0.15)"
const HIGH_CONTRAST_GLOW = "0 0 8px rgba(var(--gh-primary-rgb), 0.32)"
const MATERIAL_GLOW = "0 4px 10px rgba(0, 0, 0, 0.06)"
const PAPER_TEXTURE =
  "radial-gradient(circle at 1px 1px, rgba(var(--gh-primary-rgb), 0.08) 1px, transparent 0)"

const materialTokensByPresetId: Record<string, AuraMaterialTokens> = {
  "google-gradient": material("2px", "0.99", "0.12", PROFESSIONAL_GLOW),
  purple: material("10px", "0.94", "0.18", EXPRESSIVE_GLOW, "1.05"),
  ocean: material("8px", "0.95", "0.16", EXPRESSIVE_GLOW),
  sakura: material("8px", "0.96", "0.16", EXPRESSIVE_GLOW, "1.08"),
  mint: material("6px", "0.96", "0.14", EXPRESSIVE_GLOW),
  nordic: material("0px", "1", "0.1", PROFESSIONAL_GLOW, "0.95"),
  "lemon-soda": material("8px", "0.95", "0.16", EXPRESSIVE_GLOW),
  "ancient-scroll": material("0px", "1", "0.14", MATERIAL_GLOW, "1", PAPER_TEXTURE),
  "mono-pro": material("0px", "1", "0.1", PROFESSIONAL_GLOW, "0.85"),
  porcelain: material("0px", "1", "0.14", MATERIAL_GLOW, "1.08"),
  shortbread: material("0px", "1", "0.14", MATERIAL_GLOW, "1.06", PAPER_TEXTURE),
  "unicorn-dream": material("14px", "0.9", "0.22", EXPRESSIVE_GLOW, "1.12"),
  "classic-dark": material("2px", "0.99", "0.14", PROFESSIONAL_GLOW),
  "midnight-blue": material("4px", "0.98", "0.16", PROFESSIONAL_GLOW),
  forest: material("6px", "0.96", "0.16", EXPRESSIVE_GLOW),
  cyberpunk: material("0px", "0.94", "0.3", HIGH_CONTRAST_GLOW, "0.9"),
  coffee: material("0px", "1", "0.16", MATERIAL_GLOW, "1.08"),
  sunset: material("12px", "0.92", "0.2", EXPRESSIVE_GLOW, "1.08"),
  dracula: material("2px", "0.96", "0.2", HIGH_CONTRAST_GLOW),
  "deep-abyss": material("8px", "0.95", "0.18", EXPRESSIVE_GLOW),
  "crimson-moon": material("2px", "0.96", "0.22", HIGH_CONTRAST_GLOW),
  "retro-terminal": material("0px", "0.98", "0.26", HIGH_CONTRAST_GLOW, "0.8"),
  "eva-unit-01": material("0px", "0.94", "0.3", HIGH_CONTRAST_GLOW, "0.9"),
  aurora: material("14px", "0.9", "0.22", EXPRESSIVE_GLOW, "1.1"),
}

function material(
  blur: string,
  opacity: string,
  borderOpacity: string,
  glow: string,
  radiusFactor = "1",
  texture = "none",
): AuraMaterialTokens {
  return {
    "--gh-glass-blur": blur,
    "--gh-glass-opacity": opacity,
    "--gh-glass-border-opacity": borderOpacity,
    "--gh-glow-shadow": glow,
    "--gh-surface-texture": texture,
    "--gh-radius-factor": radiusFactor,
  }
}

function hexToRgb(value: string | undefined, fallback: string): string {
  if (!value) return fallback

  const normalized = value.trim()
  const shortHex = /^#([\da-f])([\da-f])([\da-f])$/i.exec(normalized)
  if (shortHex) {
    return shortHex
      .slice(1)
      .map((part) => parseInt(part + part, 16))
      .join(", ")
  }

  const fullHex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(normalized)
  if (!fullHex) return fallback

  return fullHex
    .slice(1)
    .map((part) => parseInt(part, 16))
    .join(", ")
}

export function withAuraTokens(presetId: string, variables: LegacyThemeVariables): ThemeVariables {
  const bgRgb = hexToRgb(variables["--gh-bg"], "255, 255, 255")
  const surfaceRgb = hexToRgb(variables["--gh-card-bg"] || variables["--gh-bg"], bgRgb)
  const primaryRgb = hexToRgb(variables["--gh-primary"], "66, 133, 244")
  const materialTokens = materialTokensByPresetId[presetId] ?? material("0px", "1", "0.12", "none")

  return {
    ...variables,
    "--gh-bg-rgb": bgRgb,
    "--gh-surface-rgb": surfaceRgb,
    "--gh-primary-rgb": primaryRgb,
    ...materialTokens,
    "--gh-shell-bg": "rgba(var(--gh-bg-rgb), var(--gh-glass-opacity))",
    "--gh-shell-surface": "var(--gh-bg-secondary)",
    "--gh-shell-surface-raised": "var(--gh-card-bg)",
    "--gh-shell-border": "var(--gh-border)",
    "--gh-shell-shadow": "var(--gh-shadow), var(--gh-glow-shadow)",
    "--gh-tab-bg": "var(--gh-bg-secondary)",
    "--gh-tab-hover-bg": "var(--gh-hover)",
    "--gh-tab-active-bg": "var(--gh-bg)",
    "--gh-tab-active-text": "var(--gh-primary)",
    "--gh-tab-active-indicator": "var(--gh-primary)",
    "--gh-control-bg": "var(--gh-bg)",
    "--gh-control-hover-bg": "var(--gh-hover)",
    "--gh-control-active-bg": "var(--gh-active-bg)",
    "--gh-control-border": "var(--gh-input-border)",
    "--gh-control-active-border": "var(--gh-primary)",
    "--gh-list-item-hover-bg": "var(--gh-hover)",
    "--gh-list-item-selected-bg": "var(--gh-selected-gradient)",
    "--gh-list-item-selected-border": "var(--gh-primary)",
    "--gh-list-item-current-bg": "var(--gh-outline-sync-bg)",
    "--gh-list-item-current-border": "var(--gh-outline-sync-border)",
    "--gh-focus-ring": "0 0 0 2px rgba(var(--gh-primary-rgb), 0.28)",
    "--gh-success": "#10b981",
    "--gh-warning": "#f59e0b",
    "--gh-error": "var(--gh-danger)",
    "--gh-transition-fast": "120ms ease-out",
    "--gh-transition-smooth": "180ms ease-out",
    "--gh-transition-spring": "220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  }
}
