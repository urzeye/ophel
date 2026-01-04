/**
 * 主题类型定义
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
  "--gh-text-tertiary": string
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
  "--gh-input-focus-border": string
  "--gh-input-focus-shadow": string

  // 阴影
  "--gh-shadow": string
  "--gh-shadow-sm": string
  "--gh-shadow-lg": string
  "--gh-shadow-brand": string

  // 品牌色
  "--gh-primary": string
  "--gh-secondary": string
  "--gh-danger": string

  // 语义化组件变量
  "--gh-header-bg": string
  "--gh-tag-active-bg": string
  "--gh-checkbox-bg": string

  // 徽章样式
  "--gh-badge-text": string
  "--gh-badge-bg": string
  "--gh-badge-border": string
  "--gh-badge-shadow": string

  // 选中项渐变背景
  "--gh-selected-gradient": string

  // 文件夹预设背景色
  "--gh-folder-bg-default": string
  "--gh-folder-bg-expanded": string
  "--gh-folder-bg-0": string
  "--gh-folder-bg-1": string
  "--gh-folder-bg-2": string
  "--gh-folder-bg-3": string
  "--gh-folder-bg-4": string
  "--gh-folder-bg-5": string
  "--gh-folder-bg-6": string
  "--gh-folder-bg-7": string

  // 大纲高亮色
  "--gh-outline-locate-bg": string
  "--gh-outline-locate-border": string
  "--gh-outline-locate-shadow": string
  "--gh-outline-sync-bg": string
  "--gh-outline-sync-border": string

  // 用户提问节点
  "--gh-user-query-bg": string
  "--gh-user-query-hover-bg": string

  // 危险操作
  "--gh-bg-danger": string
  "--gh-text-danger": string
  "--gh-bg-danger-hover": string

  // 品牌色渐变
  "--gh-brand-gradient": string
  "--gh-brand-border": string

  // 玻璃拟态
  "--gh-glass-bg": string
  "--gh-glass-bg-hover": string
  "--gh-glass-text": string

  // 设置卡片样式
  "--gh-card-bg": string
  "--gh-card-border": string

  // 遮罩层
  "--gh-overlay-bg": string

  // 按钮阴影
  "--gh-btn-shadow": string
  "--gh-btn-shadow-hover": string

  // 搜索高亮
  "--gh-search-highlight-bg": string

  // Emoji 选中背景
  "--gh-emoji-selected-bg": string

  // 动画高亮色
  "--gh-highlight-pulse": string

  // 滑块圆点颜色
  "--gh-slider-dot-bg": string

  // 背景纹理图 (可选)
  "--gh-bg-image"?: string
  // 背景动画 (可选)
  "--gh-bg-animation"?: string
}

// 主题预置定义
export interface ThemePreset {
  id: string
  name: string
  description?: string
  variables: ThemeVariables
}
