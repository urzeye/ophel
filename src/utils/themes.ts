/**
 * 主题预置系统
 *
 * 定义所有可用的主题预置，包括亮色和暗色模式
 * 用户可以选择预置主题或自定义颜色
 */

// CSS 变量键名定义
export interface ThemeVariables {
  // 基础背景色
  "--gh-bg": string
  "--gh-bg-secondary": string
  "--gh-bg-tertiary": string

  // 文字颜色
  "--gh-text": string
  "--gh-text-secondary": string
  "--gh-text-on-primary": string

  // 边框
  "--gh-border": string
  "--gh-border-active": string

  // 交互状态
  "--gh-hover": string
  "--gh-active-bg": string

  // 输入框
  "--gh-input-bg": string
  "--gh-input-border": string

  // 阴影
  "--gh-shadow": string

  // 语义化组件变量
  "--gh-header-bg": string
  "--gh-primary": string

  // 徽章样式
  "--gh-badge-text": string
  "--gh-badge-bg": string
  "--gh-badge-border": string
  "--gh-badge-shadow": string

  // 选中项渐变背景
  "--gh-selected-gradient": string
}

// 主题预置定义
export interface ThemePreset {
  id: string
  name: string
  description?: string
  variables: ThemeVariables
}

// ==================== 浅色模式预置 ====================

export const lightPresets: ThemePreset[] = [
  {
    id: "google-gradient",
    name: "Google 渐变",
    description: "默认主题，蓝绿渐变 Header",
    variables: {
      "--gh-bg": "#ffffff",
      "--gh-bg-secondary": "#f9fafb",
      "--gh-bg-tertiary": "#f3f4f6",
      "--gh-text": "#1f2937",
      "--gh-text-secondary": "#6b7280",
      "--gh-text-on-primary": "#ffffff",
      "--gh-border": "#e5e7eb",
      "--gh-border-active": "#4285f4",
      "--gh-hover": "#f3f4f6",
      "--gh-active-bg": "#e5e7eb",
      "--gh-input-bg": "#ffffff",
      "--gh-input-border": "#d1d5db",
      "--gh-shadow": "0 10px 40px rgba(0, 0, 0, 0.15)",
      "--gh-header-bg": "linear-gradient(135deg, #4285f4 0%, #34a853 100%)",
      "--gh-primary": "#4285f4",
      "--gh-badge-text": "#4b5563",
      "--gh-badge-bg": "#ffffff",
      "--gh-badge-border": "#e5e7eb",
      "--gh-badge-shadow": "#ffffff",
      "--gh-selected-gradient":
        "linear-gradient(135deg, rgba(66, 133, 244, 0.1) 0%, rgba(52, 211, 153, 0.1) 100%)",
    },
  },
  {
    id: "purple",
    name: "紫罗兰",
    description: "优雅紫色主题",
    variables: {
      "--gh-bg": "#ffffff",
      "--gh-bg-secondary": "#faf5ff",
      "--gh-bg-tertiary": "#f3e8ff",
      "--gh-text": "#1f2937",
      "--gh-text-secondary": "#6b7280",
      "--gh-text-on-primary": "#ffffff",
      "--gh-border": "#e9d5ff",
      "--gh-border-active": "#8b5cf6",
      "--gh-hover": "#f3e8ff",
      "--gh-active-bg": "#e9d5ff",
      "--gh-input-bg": "#ffffff",
      "--gh-input-border": "#d8b4fe",
      "--gh-shadow": "0 10px 40px rgba(139, 92, 246, 0.15)",
      "--gh-header-bg": "linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)",
      "--gh-primary": "#8b5cf6",
      "--gh-badge-text": "#4b5563",
      "--gh-badge-bg": "#ffffff",
      "--gh-badge-border": "#e9d5ff",
      "--gh-badge-shadow": "#ffffff",
      "--gh-selected-gradient":
        "linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)",
    },
  },
  {
    id: "ocean",
    name: "海洋蓝",
    description: "清新海洋主题",
    variables: {
      "--gh-bg": "#ffffff",
      "--gh-bg-secondary": "#f0f9ff",
      "--gh-bg-tertiary": "#e0f2fe",
      "--gh-text": "#1f2937",
      "--gh-text-secondary": "#6b7280",
      "--gh-text-on-primary": "#ffffff",
      "--gh-border": "#bae6fd",
      "--gh-border-active": "#0ea5e9",
      "--gh-hover": "#e0f2fe",
      "--gh-active-bg": "#bae6fd",
      "--gh-input-bg": "#ffffff",
      "--gh-input-border": "#7dd3fc",
      "--gh-shadow": "0 10px 40px rgba(14, 165, 233, 0.15)",
      "--gh-header-bg": "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)",
      "--gh-primary": "#0ea5e9",
      "--gh-badge-text": "#4b5563",
      "--gh-badge-bg": "#ffffff",
      "--gh-badge-border": "#bae6fd",
      "--gh-badge-shadow": "#ffffff",
      "--gh-selected-gradient":
        "linear-gradient(135deg, rgba(14, 165, 233, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)",
    },
  },
]

// ==================== 深色模式预置 ====================

export const darkPresets: ThemePreset[] = [
  {
    id: "classic-dark",
    name: "经典深黑",
    description: "默认深色主题",
    variables: {
      "--gh-bg": "#1e1e1e",
      "--gh-bg-secondary": "#0b0b0b",
      "--gh-bg-tertiary": "#262626",
      "--gh-text": "#e3e3e3",
      "--gh-text-secondary": "#a0a0a0",
      "--gh-text-on-primary": "#ffffff",
      "--gh-border": "#333333",
      "--gh-border-active": "#818cf8",
      "--gh-hover": "#262626",
      "--gh-active-bg": "#333333",
      "--gh-input-bg": "#262626",
      "--gh-input-border": "#404040",
      "--gh-shadow": "0 10px 40px rgba(0, 0, 0, 0.6)",
      "--gh-header-bg": "#1e1e1e",
      "--gh-primary": "#818cf8",
      "--gh-badge-text": "#e5e7eb",
      "--gh-badge-bg": "#374151",
      "--gh-badge-border": "#4b5563",
      "--gh-badge-shadow": "#1f2937",
      "--gh-selected-gradient":
        "linear-gradient(135deg, rgba(129, 140, 248, 0.25) 0%, rgba(99, 102, 241, 0.15) 100%)",
    },
  },
  {
    id: "midnight-blue",
    name: "午夜蓝",
    description: "深邃蓝色主题",
    variables: {
      "--gh-bg": "#0f172a",
      "--gh-bg-secondary": "#020617",
      "--gh-bg-tertiary": "#1e293b",
      "--gh-text": "#e2e8f0",
      "--gh-text-secondary": "#94a3b8",
      "--gh-text-on-primary": "#ffffff",
      "--gh-border": "#334155",
      "--gh-border-active": "#60a5fa",
      "--gh-hover": "#1e293b",
      "--gh-active-bg": "#334155",
      "--gh-input-bg": "#1e293b",
      "--gh-input-border": "#475569",
      "--gh-shadow": "0 10px 40px rgba(0, 0, 0, 0.7)",
      "--gh-header-bg": "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
      "--gh-primary": "#60a5fa",
      "--gh-badge-text": "#e2e8f0",
      "--gh-badge-bg": "#334155",
      "--gh-badge-border": "#475569",
      "--gh-badge-shadow": "#1e293b",
      "--gh-selected-gradient":
        "linear-gradient(135deg, rgba(96, 165, 250, 0.25) 0%, rgba(59, 130, 246, 0.15) 100%)",
    },
  },
  {
    id: "forest",
    name: "暗夜森林",
    description: "深绿色主题",
    variables: {
      "--gh-bg": "#0f1a14",
      "--gh-bg-secondary": "#050a07",
      "--gh-bg-tertiary": "#14261c",
      "--gh-text": "#d1fae5",
      "--gh-text-secondary": "#86efac",
      "--gh-text-on-primary": "#ffffff",
      "--gh-border": "#1f3d2b",
      "--gh-border-active": "#34d399",
      "--gh-hover": "#14261c",
      "--gh-active-bg": "#1f3d2b",
      "--gh-input-bg": "#14261c",
      "--gh-input-border": "#2a5a3d",
      "--gh-shadow": "0 10px 40px rgba(0, 0, 0, 0.7)",
      "--gh-header-bg": "linear-gradient(135deg, #065f46 0%, #10b981 100%)",
      "--gh-primary": "#34d399",
      "--gh-badge-text": "#d1fae5",
      "--gh-badge-bg": "#1f3d2b",
      "--gh-badge-border": "#2a5a3d",
      "--gh-badge-shadow": "#14261c",
      "--gh-selected-gradient":
        "linear-gradient(135deg, rgba(52, 211, 153, 0.25) 0%, rgba(16, 185, 129, 0.15) 100%)",
    },
  },
]

// 获取默认的浅色主题
export const getDefaultLightPreset = (): ThemePreset => lightPresets[0]

// 获取默认的深色主题
export const getDefaultDarkPreset = (): ThemePreset => darkPresets[0]

// 根据 ID 查找主题
export const findPreset = (id: string, mode: "light" | "dark"): ThemePreset | undefined => {
  const presets = mode === "light" ? lightPresets : darkPresets
  return presets.find((p) => p.id === id)
}

// 获取当前模式的主题
export const getPreset = (presetId: string, mode: "light" | "dark"): ThemePreset => {
  const found = findPreset(presetId, mode)
  return found || (mode === "light" ? getDefaultLightPreset() : getDefaultDarkPreset())
}

// 将主题变量转换为 CSS 字符串
export const themeVariablesToCSS = (variables: ThemeVariables): string => {
  return Object.entries(variables)
    .map(([key, value]) => `${key}: ${value};`)
    .join("\n  ")
}
