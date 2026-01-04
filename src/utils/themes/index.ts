/**
 * 主题预置系统
 *
 * 定义所有可用的主题预置，包括亮色和暗色模式
 * 用户可以选择预置主题或自定义颜色
 */

// 类型导出
export type { ThemeVariables, ThemePreset } from "./types"

// 预置主题导出
export { lightPresets } from "./light"
export { darkPresets } from "./dark"

// 工具函数导出
export {
  getDefaultLightPreset,
  getDefaultDarkPreset,
  findPreset,
  getPreset,
  themeVariablesToCSS,
} from "./helpers"
