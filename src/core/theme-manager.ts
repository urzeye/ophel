/**
 * 主题管理器
 * 负责两类主题同步：
 * 1. 宿主页（host page）的亮/暗模式联动、监听与必要 fallback
 * 2. Ophel 面板 / Shadow DOM 的主题变量注入与切换动画
 */

import type { SiteAdapter } from "~adapters/base"
import { SITE_IDS } from "~constants/defaults"
import { DOMToolkit } from "~utils/dom-toolkit"
import type { CustomStyle } from "~utils/storage"
import {
  getPreset,
  themeVariablesToCSS,
  type ThemePreset,
  type ThemeVariables,
} from "~utils/themes"

export type ThemeMode = "light" | "dark"
export type ThemePreference = "light" | "dark" | "system"
export type ThemeTransitionOrigin = Pick<MouseEvent, "clientX" | "clientY">

// Extend Document interface for View Transitions API
declare global {
  interface Document {
    startViewTransition(callback?: any): any
  }
}

// 主题变化回调类型
export type ThemeModeChangeCallback = (mode: ThemeMode, preference: ThemePreference) => void

// 订阅者类型
type Listener = () => void

const DEFAULT_LIGHT_PRESET_ID = "google-gradient"
const DEFAULT_DARK_PRESET_ID = "classic-dark"
const HOST_THEME_OVERRIDE_STYLE_ID = "ophel-native-adaptive-style"

export interface GlobalThemeManagerOptions {
  mode: ThemePreference | string
  onModeChange?: ThemeModeChangeCallback
  adapter?: SiteAdapter | null
  lightPresetId?: string
  darkPresetId?: string
  // 沿用 settings 里的历史字段名；在 ThemeManager 内部统一称为 host theme sync。
  syncNativePageTheme?: boolean
  apply?: boolean
}

export class ThemeManager {
  private mode: ThemeMode
  private preference: ThemePreference
  private lightPresetId: string
  private darkPresetId: string
  private hostThemeObserver: MutationObserver | null = null
  private onModeChange?: ThemeModeChangeCallback
  private adapter?: SiteAdapter | null
  private hostThemeSyncEnabled: boolean
  private customStyles: CustomStyle[] = [] // 存储自定义样式列表
  private skipNextDetection = false // 标志：跳过下一次主题检测，避免 toggle 后被 observer 立即反写
  private listeners: Set<Listener> = new Set() // 订阅者集合
  private systemMediaQuery: MediaQueryList | null = null
  private handleSystemChange = (event: MediaQueryListEvent) => {
    if (this.preference !== "system") return
    const nextMode: ThemeMode = event.matches ? "dark" : "light"
    if (this.mode === nextMode) return
    this.mode = nextMode
    this.emitChange()
    this.syncHostTheme(nextMode, "system")
    if (this.onModeChange) {
      this.onModeChange(nextMode, this.preference)
    }
  }

  constructor(
    mode: ThemePreference | string,
    onModeChange?: ThemeModeChangeCallback,
    adapter?: SiteAdapter | null,
    lightPresetId: string = "google-gradient",
    darkPresetId: string = "classic-dark",
    syncNativePageTheme: boolean = true,
  ) {
    const normalizedPreference: ThemePreference =
      mode === "system" ? "system" : mode === "dark" ? "dark" : "light"
    this.preference = normalizedPreference
    this.mode = this.resolveMode(normalizedPreference)
    this.lightPresetId = lightPresetId
    this.darkPresetId = darkPresetId
    this.onModeChange = onModeChange
    this.adapter = adapter
    this.hostThemeSyncEnabled = syncNativePageTheme

    // 注入全局动画样式 (View Transitions 需要在主文档生效)
    this.injectGlobalStyles()
    this.ensureSystemListener()
  }

  private ensureSystemListener() {
    if (this.systemMediaQuery || typeof window === "undefined" || !window.matchMedia) {
      return
    }
    this.systemMediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    if (typeof this.systemMediaQuery.addEventListener === "function") {
      this.systemMediaQuery.addEventListener("change", this.handleSystemChange)
    } else if (typeof this.systemMediaQuery.addListener === "function") {
      this.systemMediaQuery.addListener(this.handleSystemChange)
    }
  }

  private getSystemMode(): ThemeMode {
    if (typeof window === "undefined" || !window.matchMedia) {
      return "light"
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  private resolveMode(preference: ThemePreference): ThemeMode {
    if (preference === "system") {
      return this.getSystemMode()
    }
    return preference
  }

  /**
   * 将 Ophel 的主题偏好同步到宿主页。
   * 这一步可能调用站点 adapter 的原生切换逻辑，也可能退回到通用 DOM fallback。
   */
  private syncHostTheme(targetMode: ThemeMode, preference: ThemePreference = targetMode) {
    if (!this.hostThemeSyncEnabled) {
      this.applyTheme(targetMode)
      return
    }

    if (preference === "system") {
      const handled = this.applySystemPreferenceToHost(targetMode)
      if (!handled && this.adapter && typeof this.adapter.toggleTheme === "function") {
        this.adapter.toggleTheme(targetMode).catch(() => {})
      }
    } else if (this.adapter && typeof this.adapter.toggleTheme === "function") {
      this.adapter.toggleTheme(preference).catch(() => {})
    }
    this.applyTheme(targetMode)
  }

  /**
   * 站点处于“跟随系统”偏好时，尝试把宿主页切到对应的实际明暗模式。
   * 返回 true 表示该站点已由此分支完整处理。
   */
  private applySystemPreferenceToHost(targetMode: ThemeMode): boolean {
    if (!this.adapter) return false
    const siteId = this.adapter.getSiteId()
    try {
      switch (siteId) {
        case SITE_IDS.CHATGPT: {
          localStorage.setItem("theme", "system")
          document.documentElement.className = targetMode
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "theme",
              newValue: "system",
              storageArea: localStorage,
            }),
          )
          return true
        }
        case SITE_IDS.ZAI: {
          localStorage.setItem("theme", "system")
          document.documentElement.classList.remove("light", "dark")
          document.documentElement.classList.add(targetMode)
          document.documentElement.style.colorScheme = targetMode
          document.body.style.colorScheme = targetMode
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "theme",
              newValue: "system",
              storageArea: localStorage,
            }),
          )
          return true
        }
        case SITE_IDS.GROK: {
          localStorage.setItem("theme", "system")
          document.documentElement.classList.remove("light", "dark")
          document.documentElement.classList.add(targetMode)
          document.documentElement.style.colorScheme = targetMode
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "theme",
              newValue: "system",
              storageArea: localStorage,
            }),
          )
          return true
        }
        case SITE_IDS.QWENAI: {
          const previousTheme = localStorage.getItem("theme")
          localStorage.setItem("theme", "system")
          document.documentElement.classList.remove("light", "dark")
          document.documentElement.classList.add(targetMode)
          document.documentElement.setAttribute("data-theme", targetMode)
          document.documentElement.style.colorScheme = targetMode
          if (document.body) {
            document.body.setAttribute("data-theme", targetMode)
            document.body.style.colorScheme = targetMode
          }
          const meta = document.querySelector('meta[name="color-scheme"]')
          if (meta) {
            meta.setAttribute("content", targetMode)
          }

          if (previousTheme !== "system" && this.adapter?.toggleTheme) {
            ;(
              this.adapter as SiteAdapter & {
                toggleTheme: (targetMode: "light" | "dark" | "system") => Promise<boolean>
              }
            )
              .toggleTheme("system")
              .catch(() => {})
          } else {
            window.dispatchEvent(
              new StorageEvent("storage", {
                key: "theme",
                newValue: "system",
                storageArea: localStorage,
              }),
            )
          }
          return true
        }
        case SITE_IDS.AISTUDIO: {
          const prefStr = localStorage.getItem("aiStudioUserPreference") || "{}"
          let pref: Record<string, unknown> = {}
          try {
            pref = JSON.parse(prefStr)
          } catch {
            pref = {}
          }
          pref.theme = "system"
          const nextValue = JSON.stringify(pref)
          localStorage.setItem("aiStudioUserPreference", nextValue)

          const body = document.body
          if (targetMode === "dark") {
            body.classList.add("dark-theme")
            body.classList.remove("light-theme")
          } else {
            body.classList.remove("dark-theme")
            body.classList.add("light-theme")
          }
          body.style.colorScheme = targetMode

          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "aiStudioUserPreference",
              newValue: nextValue,
              storageArea: localStorage,
            }),
          )

          const appRoot = document.querySelector("app-root, ms-app, body")
          if (appRoot) {
            appRoot.dispatchEvent(new CustomEvent("themechange", { detail: { theme: targetMode } }))
          }
          return true
        }
        case SITE_IDS.DEEPSEEK: {
          if (this.adapter && typeof this.adapter.toggleTheme === "function") {
            ;(
              this.adapter as SiteAdapter & {
                toggleTheme: (targetMode: "light" | "dark" | "system") => Promise<boolean>
              }
            )
              .toggleTheme("system")
              .catch(() => {})
            return true
          }
          return false
        }
        case SITE_IDS.CHATGLM: {
          if (this.adapter && typeof this.adapter.toggleTheme === "function") {
            ;(
              this.adapter as SiteAdapter & {
                toggleTheme: (targetMode: "light" | "dark" | "system") => Promise<boolean>
              }
            )
              .toggleTheme("system")
              .catch(() => {})
            return true
          }
          return false
        }
        case SITE_IDS.GEMINI: {
          localStorage.removeItem("Bard-Color-Theme")
          if (targetMode === "dark") {
            document.body.classList.add("dark-theme")
            document.body.classList.remove("light-theme")
          } else {
            document.body.classList.remove("dark-theme")
            document.body.classList.add("light-theme")
          }
          document.body.style.colorScheme = targetMode
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "Bard-Color-Theme",
              newValue: null,
              storageArea: localStorage,
            }),
          )
          return true
        }
        case SITE_IDS.CLAUDE: {
          const themeData = {
            value: "auto",
            tabId: crypto.randomUUID(),
            timestamp: Date.now(),
          }
          const nextValue = JSON.stringify(themeData)
          localStorage.setItem("LSS-userThemeMode", nextValue)
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "LSS-userThemeMode",
              newValue: nextValue,
            }),
          )
          return true
        }
        case SITE_IDS.GEMINI_ENTERPRISE: {
          if (this.adapter && typeof this.adapter.toggleTheme === "function") {
            ;(
              this.adapter as SiteAdapter & {
                toggleTheme: (targetMode: "light" | "dark" | "system") => Promise<boolean>
              }
            )
              .toggleTheme("system")
              .catch(() => {})
            return true
          }
          return false
        }
        case SITE_IDS.DOUBAO:
          // 豆包不支持深色模式
          return false
        case SITE_IDS.YUANBAO: {
          localStorage.setItem("yb_web_theme_mode", "system")
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "yb_web_theme_mode",
              newValue: "system",
              storageArea: localStorage,
            }),
          )
          // 清除之前 toggleTheme 写入的 colorScheme，让浏览器跟随系统
          document.documentElement.style.colorScheme = ""
          return true
        }
        default:
          return false
      }
    } catch {
      return false
    }
  }

  /**
   * 注入全局样式到主文档 head
   * 主要是 View Transitions 相关的样式，因为它们必须在 document context 下才生效
   */
  private injectGlobalStyles() {
    if (document.getElementById("gh-global-styles")) return

    const style = document.createElement("style")
    style.id = "gh-global-styles"
    style.textContent = `
      ::view-transition-old(root),
      ::view-transition-new(root) {
        animation: none;
        mix-blend-mode: normal;
      }

      ::view-transition-new(root) {
        clip-path: circle(0px at var(--theme-x, 50%) var(--theme-y, 50%));
      }
    `
    document.head.appendChild(style)
  }

  /**
   * 注入站点声明的宿主页主题覆盖 CSS。
   * 由各站点 adapter 自行声明，初始化时一次性挂载。
   */
  private injectNativeThemeOverrideCss() {
    if (!this.adapter || !this.hostThemeSyncEnabled) return

    // 如果 adapter 未声明覆盖样式或已注入，则跳过
    const cssContent = this.adapter.getNativeThemeCss()
    if (!cssContent || document.getElementById(HOST_THEME_OVERRIDE_STYLE_ID)) return

    const styleEl = document.createElement("style")
    styleEl.id = HOST_THEME_OVERRIDE_STYLE_ID
    styleEl.textContent = cssContent

    // 添加到宿主页 head 中，对站点原生变量/组件形成覆盖
    document.head.appendChild(styleEl)
  }

  private removeNativeThemeOverrideCss() {
    document.getElementById(HOST_THEME_OVERRIDE_STYLE_ID)?.remove()
  }

  private syncNativeThemeOverrideCssState() {
    if (!this.hostThemeSyncEnabled) {
      this.removeNativeThemeOverrideCss()
      return
    }
    this.injectNativeThemeOverrideCss()
  }

  /**
   * 设置当前站点适配器，并同步站点声明的主题覆盖 CSS。
   */
  setAdapter(adapter: SiteAdapter | null) {
    this.adapter = adapter
    this.syncNativeThemeOverrideCssState()
  }

  /**
   * 动态设置主题变化回调（用于 React 组件动态注册）
   * 这使得单一 ThemeManager 实例可以在 main.ts 创建后，由 App.tsx 动态注册回调
   */
  setOnModeChange(callback: ThemeModeChangeCallback | undefined) {
    this.onModeChange = callback
  }

  /**
   * 控制是否启用宿主页主题联动。
   * 开启后会同步宿主页主题、启动监听，并按需注入站点声明的覆盖 CSS。
   */
  setHostThemeSyncEnabled(enabled: boolean) {
    const nextEnabled = enabled !== false
    const hasChanged = this.hostThemeSyncEnabled !== nextEnabled

    this.hostThemeSyncEnabled = nextEnabled
    this.syncNativeThemeOverrideCssState()

    if (!hasChanged) {
      return
    }

    if (!nextEnabled) {
      this.stopThemeMonitoring()
      this.syncPluginUiTheme(this.mode)
      return
    }

    this.syncHostTheme(this.mode, this.preference)
    this.startThemeMonitoring()
  }

  /**
   * 直接用给定偏好刷新内部状态，并立即应用到宿主页 / 插件 UI。
   * 主要用于 hydration 或外部状态回放，不带显式用户交互语义。
   */
  applyModePreference(mode: ThemePreference | string) {
    const normalizedPreference: ThemePreference =
      mode === "system" ? "system" : mode === "dark" ? "dark" : "light"
    this.preference = normalizedPreference
    this.mode = this.resolveMode(normalizedPreference)
    this.emitChange()
    if (this.preference === "system") {
      this.syncHostTheme(this.mode, "system")
      return
    }
    this.applyTheme(this.mode)
  }

  /**
   * 通用宿主页 fallback。
   * 仅用于未提供站点自定义 toggleTheme() 的场景，直接改 body class / color-scheme。
   */
  private applyGenericHostThemeFallback(mode: ThemeMode) {
    const isGeminiStandard = this.adapter?.getSiteId() === SITE_IDS.GEMINI

    if (mode === "dark") {
      document.body.classList.add("dark-theme")
      document.body.classList.remove("light-theme")
      document.body.style.colorScheme = "dark"
      return
    }

    document.body.classList.remove("dark-theme")
    document.body.style.colorScheme = "light"
    if (isGeminiStandard) {
      document.body.classList.add("light-theme")
    } else {
      document.body.classList.remove("light-theme")
    }
  }

  /**
   * 检测当前宿主页实际呈现出的亮/暗模式。
   * 优先级：html[yb-theme-mode]（值为 system 时按当前系统偏好解析） > html Class (ChatGPT) > body Class (Gemini) > Data Attribute > Style (colorScheme)
   */
  private detectHostThemeMode(): ThemeMode {
    // 0. html[yb-theme-mode] 属性（元宝使用自定义属性而非 class；system 需解析为当前实际模式）
    const ybThemeMode = document.documentElement.getAttribute("yb-theme-mode")
    if (ybThemeMode === "dark") return "dark"
    if (ybThemeMode === "light") return "light"
    if (ybThemeMode === "system") return this.getSystemMode()

    // 1. html 元素的 class（ChatGPT 使用 html.dark / html.light）
    const htmlClass = document.documentElement.className
    if (/\bdark\b/i.test(htmlClass)) {
      return "dark"
    } else if (/\blight\b/i.test(htmlClass)) {
      return "light"
    }

    // 2. body 元素的 class（Gemini 标准版使用 body.dark-theme）
    const bodyClass = document.body.className
    if (/\bdark-theme\b/i.test(bodyClass)) {
      return "dark"
    } else if (/\blight-theme\b/i.test(bodyClass)) {
      return "light"
    }

    // 3. Data 属性
    const dataTheme = document.body.dataset.theme || document.documentElement.dataset.theme
    if (dataTheme === "dark") {
      return "dark"
    } else if (dataTheme === "light") {
      return "light"
    }

    // 4. Style colorScheme (Gemini Enterprise 使用这种方式)
    if (document.body.style.colorScheme === "dark") {
      return "dark"
    }

    return "light"
  }

  /**
   * 从宿主页持久化状态中推断主题偏好（light / dark / system）。
   */
  private detectHostThemePreference(): ThemePreference | null {
    if (!this.adapter) return null
    const siteId = this.adapter.getSiteId()
    try {
      switch (siteId) {
        case SITE_IDS.CHATGPT:
        case SITE_IDS.GROK:
        case SITE_IDS.ZAI:
        case SITE_IDS.QWENAI: {
          const storedTheme = localStorage.getItem("theme")
          if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
            return storedTheme
          }
          return null
        }
        case SITE_IDS.AISTUDIO: {
          const prefStr = localStorage.getItem("aiStudioUserPreference")
          if (!prefStr) return null
          let pref: Record<string, unknown> = {}
          try {
            pref = JSON.parse(prefStr)
          } catch {
            pref = {}
          }
          const theme = pref.theme
          if (theme === "light" || theme === "dark" || theme === "system") {
            return theme
          }
          return null
        }
        case SITE_IDS.DEEPSEEK: {
          const raw = localStorage.getItem("__appKit_@deepseek/chat_themePreference")
          if (!raw) return null
          let data: Record<string, unknown> = {}
          try {
            data = JSON.parse(raw)
          } catch {
            data = {}
          }
          const value = data.value
          if (value === "light" || value === "dark" || value === "system") {
            return value
          }
          return null
        }
        case SITE_IDS.CHATGLM: {
          const storedMode = localStorage.getItem("SKIN_MODE")
          if (storedMode === "1") return "light"
          if (storedMode === "2") return "dark"
          if (storedMode === "3") return "system"
          return null
        }
        case SITE_IDS.GEMINI: {
          const storedTheme = localStorage.getItem("Bard-Color-Theme")
          if (!storedTheme) return "system"
          if (/dark/i.test(storedTheme)) return "dark"
          if (/light/i.test(storedTheme)) return "light"
          return null
        }
        case SITE_IDS.CLAUDE: {
          const raw = localStorage.getItem("LSS-userThemeMode")
          if (!raw) return null
          let data: Record<string, unknown> = {}
          try {
            data = JSON.parse(raw)
          } catch {
            data = {}
          }
          const value = data.value
          if (value === "auto" || value === "system") return "system"
          if (value === "dark" || value === "light") return value
          return null
        }
        case SITE_IDS.GEMINI_ENTERPRISE: {
          const tabs = DOMToolkit.query("md-primary-tab", { all: true, shadow: true }) as Element[]
          if (!tabs || tabs.length === 0) return null
          type Candidate = { icon: "computer" | "light_mode" | "dark_mode"; selected: boolean }
          const candidates: Candidate[] = []
          for (const tab of tabs) {
            let iconEl = tab.querySelector("md-icon")
            if (!iconEl) {
              iconEl = DOMToolkit.query("md-icon", { parent: tab, shadow: true }) as Element | null
            }
            const icon = iconEl?.textContent?.trim()
            if (icon !== "computer" && icon !== "light_mode" && icon !== "dark_mode") {
              continue
            }
            const tabElement = tab as HTMLElement & { selected?: boolean; active?: boolean }
            const selected = Boolean(
              tabElement.selected || tabElement.active || tabElement.tabIndex === 0,
            )
            candidates.push({ icon, selected } as Candidate)
          }
          const selected = candidates.find((item) => item.selected)
          if (!selected) return null
          if (selected.icon === "computer") return "system"
          if (selected.icon === "dark_mode") return "dark"
          return "light"
        }
        case SITE_IDS.DOUBAO:
          return "light"
        case SITE_IDS.YUANBAO: {
          const storedTheme = localStorage.getItem("yb_web_theme_mode")
          if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
            return storedTheme
          }
          return null
        }
        default:
          return null
      }
    } catch {
      return null
    }
  }

  /**
   * 应用当前主题状态。
   * 这一步会先按需处理宿主页 fallback，再同步 Ophel 面板 / Shadow DOM 的主题变量。
   */
  applyTheme(targetMode?: ThemeMode) {
    const mode = targetMode || this.mode

    if (this.hostThemeSyncEnabled && (!this.adapter || !this.adapter.hasCustomToggleTheme())) {
      this.applyGenericHostThemeFallback(mode)
    }

    // 同步插件 UI 主题
    this.syncPluginUiTheme(mode)
  }

  /**
   * 获取当前主题预置
   */
  private getCurrentPreset(): ThemePreset {
    const presetId = this.mode === "dark" ? this.darkPresetId : this.lightPresetId
    return getPreset(presetId, this.mode)
  }

  /**
   * 更新主题预置 ID
   */
  setPresets(lightPresetId: string, darkPresetId: string) {
    this.lightPresetId = lightPresetId
    this.darkPresetId = darkPresetId
    this.syncPluginUiTheme()
  }

  /**
   * 设置自定义样式列表
   */
  setCustomStyles(styles: CustomStyle[]) {
    this.customStyles = styles || []
    // 如果当前正在使用自定义样式，需要立即刷新
    const currentId = this.mode === "dark" ? this.darkPresetId : this.lightPresetId
    const isUsingCustom = this.customStyles.some((s) => s.id === currentId)
    if (isUsingCustom) {
      this.syncPluginUiTheme()
    }
  }

  /**
   * 同步插件 UI 的主题状态
   * 从主题预置读取 CSS 变量值，注入到 Shadow DOM
   * 会临时断开宿主页 observer，避免自身 DOM 写入被误判为页面主题变化。
   */
  private syncPluginUiTheme(mode?: ThemeMode) {
    const currentMode = mode || this.mode
    const root = document.documentElement

    // 从预置系统获取当前主题的 CSS 变量
    const presetId = currentMode === "dark" ? this.darkPresetId : this.lightPresetId

    // 尝试在自定义样式中查找
    const customStyle = this.customStyles.find((s) => s.id === presetId)

    // 预置变量（如果不是自定义样式）
    let vars: ThemeVariables | null = null

    if (customStyle) {
      // 如果是自定义样式，直接使用其 CSS
      // 不需要获取 vars，因为我们会直接注入 CSS
    } else {
      // 否则从预置系统获取
      try {
        const preset = getPreset(presetId, currentMode)
        vars = preset.variables
      } catch (e) {
        console.error("[ThemeManager] getPreset FAILED:", e)
        return
      }
    }

    // 暂时断开 MutationObserver，避免循环触发
    // 因为下面的 DOM 修改会触发 observer，导致 onModeChange 被意外调用
    const wasObserving = this.hostThemeObserver !== null
    if (wasObserving) {
      this.hostThemeObserver?.disconnect()
    }

    // 设置 body 属性，供插件自身样式选择器使用
    if (currentMode === "dark") {
      document.body.dataset.ghMode = "dark"
    } else {
      delete document.body.dataset.ghMode
    }

    // 在 :root 上设置变量（仅对预置主题有效）
    // 自定义样式通常包含选择器，可能直接覆盖 :root 这里的变量，或者通过 CSS 规则生效
    if (vars) {
      for (const [key, value] of Object.entries(vars)) {
        root.style.setProperty(key, value)
      }
    }

    // 提前构建主题 CSS 字符串（供注入和缓存复用）
    let themeCSS = ""
    if (customStyle) {
      themeCSS = customStyle.css
    } else if (vars) {
      const cssVars = themeVariablesToCSS(vars)
      themeCSS = `:host {
${cssVars}
color-scheme: ${currentMode};
}

:host([data-theme="dark"]),
:host .gh-root[data-theme="dark"] {
${cssVars}
}
`
    }

    // 查找 Shadow Host：支持 Plasmo 扩展 (plasmo-csui) 和油猴脚本 (#ophel-userscript-root)
    const shadowHosts = document.querySelectorAll("plasmo-csui, #ophel-userscript-root")

    shadowHosts.forEach((host) => {
      const shadowRoot = host.shadowRoot
      if (shadowRoot) {
        // 在 Shadow Root 内查找 style 标签或创建一个
        let styleEl = shadowRoot.querySelector("#gh-theme-vars") as HTMLStyleElement
        if (!styleEl) {
          styleEl = document.createElement("style")
          styleEl.id = "gh-theme-vars"
        }

        if (themeCSS) {
          styleEl.textContent = themeCSS
        }

        // 设置 host 元素的 data-theme 属性
        ;(host as HTMLElement).dataset.theme = currentMode

        // 始终将样式标签移动/追加到 Shadow Root 末尾
        // 这样可以覆盖 Plasmo 静态注入的默认浅色主题变量
        shadowRoot.append(styleEl)
      }
    })

    // 将主题 CSS 缓存到 localStorage，供 getStyle() 预注入，消除下次页面刷新时的主题闪烁
    // 浏览器扩展与油猴脚本使用不同的 key，避免同时启用时互相覆盖
    if (themeCSS) {
      try {
        const cacheKey =
          typeof chrome !== "undefined" && chrome.runtime?.id
            ? "ophel_ext_theme_cache"
            : "ophel_us_theme_cache"
        localStorage.setItem(cacheKey, themeCSS)
      } catch {}
    }

    // 恢复 MutationObserver
    if (wasObserving && this.hostThemeObserver) {
      // 重新观察 body 和 html 元素
      this.hostThemeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
      })
      // 同时监听 html 元素的 class、data-theme、yb-theme-mode 属性
      // yb-theme-mode 是元宝新版使用的自定义主题属性
      this.hostThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "yb-theme-mode"],
      })
    }
  }

  /**
   * 启动宿主页主题监听。
   * 当站点自身主题变化时，会把变化同步回 Ophel 的内部主题状态。
   */
  startThemeMonitoring() {
    if (!this.hostThemeSyncEnabled) {
      this.stopThemeMonitoring()
      this.syncPluginUiTheme(this.mode)
      return
    }

    const reconcileObservedTheme = () => {
      // 如果是 toggle() 主动触发后的首次恢复，跳过检测以避免覆盖用户意图
      if (this.skipNextDetection) {
        this.skipNextDetection = false
        return
      }

      const detectedMode = this.detectHostThemeMode()
      const detectedPreference = this.detectHostThemePreference()
      const nextPreference: ThemePreference = detectedPreference ?? detectedMode
      const nextMode: ThemeMode =
        nextPreference === "system" ? this.getSystemMode() : nextPreference

      if (nextPreference === "system") {
        this.ensureSystemListener()
        if (detectedMode !== nextMode) {
          this.syncHostTheme(nextMode, "system")
        } else {
          this.syncPluginUiTheme(nextMode)
        }
      } else {
        // 同步到插件 UI (ghMode)
        this.syncPluginUiTheme(nextMode)
      }

      // 如果检测到的模式或偏好发生变化，更新并触发回调
      if (this.mode !== nextMode || this.preference !== nextPreference) {
        this.mode = nextMode
        this.preference = nextPreference
        this.emitChange()
        if (this.onModeChange) {
          this.onModeChange(nextMode, nextPreference)
        }
      }
    }

    // 首次检查
    reconcileObservedTheme()

    // 如果已有 Observer，不重复创建
    if (!this.hostThemeObserver) {
      this.hostThemeObserver = new MutationObserver(() => {
        reconcileObservedTheme()
      })

      // 监听 body 的 class、data-theme、style 属性变化
      this.hostThemeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
      })

      // 同时监听 html 元素的 class、data-theme、yb-theme-mode 属性
      // yb-theme-mode 是元宝新版使用的自定义主题属性
      this.hostThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "yb-theme-mode"],
      })
    }
  }

  /**
   * 停止宿主页主题监听
   */
  stopThemeMonitoring() {
    if (this.hostThemeObserver) {
      this.hostThemeObserver.disconnect()
      this.hostThemeObserver = null
    }
  }

  private getTransitionOrigin(event?: ThemeTransitionOrigin) {
    let x = 95
    let y = 5
    if (event && event.clientX !== undefined) {
      x = (event.clientX / window.innerWidth) * 100
      y = (event.clientY / window.innerHeight) * 100
      return { x, y }
    }

    const themeBtn =
      document.getElementById("theme-toggle-btn") || document.getElementById("quick-theme-btn")
    if (themeBtn) {
      const rect = themeBtn.getBoundingClientRect()
      x = ((rect.left + rect.width / 2) / window.innerWidth) * 100
      y = ((rect.top + rect.height / 2) / window.innerHeight) * 100
    }
    return { x, y }
  }

  private async applyWithTransition(
    action: () => void,
    event?: ThemeTransitionOrigin,
  ): Promise<boolean> {
    const { x, y } = this.getTransitionOrigin(event)

    document.documentElement.style.setProperty("--theme-x", `${x}%`)
    document.documentElement.style.setProperty("--theme-y", `${y}%`)

    this.stopThemeMonitoring()

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!document.startViewTransition || prefersReducedMotion) {
      try {
        action()
      } finally {
        this.startThemeMonitoring()
      }
      return false
    }

    try {
      const transition = document.startViewTransition(() => {
        action()
      })

      transition.ready.then(() => {
        const right = window.innerWidth - (x / 100) * window.innerWidth
        const bottom = window.innerHeight - (y / 100) * window.innerHeight
        const maxRadius = Math.hypot(
          Math.max((x / 100) * window.innerWidth, right),
          Math.max((y / 100) * window.innerHeight, bottom),
        )

        const clipPath = [`circle(0px at ${x}% ${y}%)`, `circle(${maxRadius}px at ${x}% ${y}%)`]

        document.documentElement.animate(
          {
            clipPath: clipPath,
          },
          {
            duration: 500,
            easing: "ease-in",
            pseudoElement: "::view-transition-new(root)",
            fill: "forwards",
          },
        )
      })

      await transition.finished.catch(() => {
        // 忽略动画错误
      })
    } catch {
      action()
      this.startThemeMonitoring()
      return false
    }

    this.skipNextDetection = true
    this.startThemeMonitoring()
    return true
  }

  /**
   * 切换主题（User Action）- 带圆形扩散动画
   * @param event 可选的鼠标事件，用于确定动画中心
   */
  async toggle(event?: ThemeTransitionOrigin): Promise<ThemeMode> {
    // 使用 detectHostThemeMode 统一检测当前宿主页状态
    const currentMode =
      this.preference === "system" || !this.hostThemeSyncEnabled
        ? this.mode
        : this.detectHostThemeMode()
    const nextMode: ThemeMode = currentMode === "dark" ? "light" : "dark"
    this.preference = nextMode

    // 计算动画起点坐标（从点击位置或默认右上角）
    let x = 95
    let y = 5
    if (event && event.clientX !== undefined) {
      x = (event.clientX / window.innerWidth) * 100
      y = (event.clientY / window.innerHeight) * 100
    } else {
      // 尝试从主题按钮位置获取
      const themeBtn =
        document.getElementById("theme-toggle-btn") || document.getElementById("quick-theme-btn")
      if (themeBtn) {
        const rect = themeBtn.getBoundingClientRect()
        x = ((rect.left + rect.width / 2) / window.innerWidth) * 100
        y = ((rect.top + rect.height / 2) / window.innerHeight) * 100
      }
    }

    // 设置 CSS 变量
    document.documentElement.style.setProperty("--theme-x", `${x}%`)
    document.documentElement.style.setProperty("--theme-y", `${y}%`)

    // 暂停 MutationObserver，防止在 View Transition 期间触发额外的 DOM 修改
    this.stopThemeMonitoring()

    // 执行主题切换的核心逻辑
    const doToggle = () => {
      // 优先使用适配器的原生切换逻辑 (针对 Gemini Enterprise)
      if (this.adapter && typeof this.adapter.toggleTheme === "function") {
        this.adapter.toggleTheme(nextMode).catch(() => {})
      }
      // 同步应用主题（包括 Shadow DOM）
      this.applyTheme(nextMode)
    }

    // 检查是否支持 View Transitions API
    if (
      !document.startViewTransition ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      doToggle()
      this.mode = nextMode
      this.emitChange()
      // 无条件启动监听（确保网页主题变化能被检测）
      this.startThemeMonitoring()
      return nextMode
    }

    // 执行动画切换
    const transition = document.startViewTransition(() => {
      doToggle()
    })

    // 等待伪元素创建后，执行自定义动画
    transition.ready.then(() => {
      // 获取点击位置距离最远角落的距离（作为圆的半径）
      const right = window.innerWidth - (x / 100) * window.innerWidth
      const bottom = window.innerHeight - (y / 100) * window.innerHeight
      const maxRadius = Math.hypot(
        Math.max((x / 100) * window.innerWidth, right),
        Math.max((y / 100) * window.innerHeight, bottom),
      )

      // 定义圆形扩散动画
      const clipPath = [`circle(0px at ${x}% ${y}%)`, `circle(${maxRadius}px at ${x}% ${y}%)`]

      // 统一使用扩散动画：新视图从中点扩散覆盖旧视图
      // 配合 CSS 中 ::view-transition-new(root) 的初始 clip-path: circle(0px) 设置
      document.documentElement.animate(
        {
          clipPath: clipPath,
        },
        {
          duration: 500,
          easing: "ease-in",
          pseudoElement: "::view-transition-new(root)",
          fill: "forwards",
        },
      )
    })

    // 使用 finally 确保 MutationObserver 一定会恢复（即使动画失败）
    // 等待动画完成后再返回，确保调用方等待动画真正完成
    await transition.finished.catch(() => {
      // 忽略动画错误
    })

    // 标记跳过下一次检测，防止 observer 立即根据中间态把结果回写掉
    this.skipNextDetection = true
    // 触发回调通知 React 更新状态（动画完成后）
    if (this.onModeChange) {
      this.onModeChange(nextMode, this.preference)
    }
    // 无条件启动监听（确保网页主题变化能被检测）
    this.startThemeMonitoring()

    // 更新内部状态
    this.mode = nextMode
    this.emitChange()
    return nextMode
  }

  /**
   * 设置主题模式（绝对操作）
   * 与 toggle() 不同，此方法明确指定目标模式，无论调用多少次结果都是确定的
   * 如果当前已是目标模式，则不做任何操作
   * @param targetMode 目标模式
   * @param event 可选的鼠标事件，用于确定动画中心
   * @returns 包含最终模式和是否触发了动画
   */
  async setMode(
    targetMode: ThemePreference,
    event?: ThemeTransitionOrigin,
  ): Promise<{ mode: ThemeMode; animated: boolean }> {
    const normalizedPreference: ThemePreference =
      targetMode === "system" ? "system" : targetMode === "dark" ? "dark" : "light"

    if (normalizedPreference === "system") {
      this.preference = "system"
      this.ensureSystemListener()
      const resolved = this.getSystemMode()
      const modeChanged = this.mode !== resolved
      const shouldAnimate = Boolean(event) && modeChanged
      let animated = false
      if (shouldAnimate) {
        animated = await this.applyWithTransition(() => {
          this.syncHostTheme(resolved, "system")
        }, event)
      } else {
        this.syncHostTheme(resolved, "system")
      }
      if (modeChanged) {
        this.mode = resolved
        this.emitChange()
      }
      if (this.onModeChange) {
        this.onModeChange(resolved, this.preference)
      }
      return { mode: resolved, animated }
    }

    const currentMode = this.hostThemeSyncEnabled ? this.detectHostThemeMode() : this.mode

    // 如果已经是目标模式，仅更新偏好
    if (currentMode === normalizedPreference) {
      this.preference = normalizedPreference
      this.syncHostTheme(normalizedPreference, normalizedPreference)
      if (this.onModeChange) {
        this.onModeChange(normalizedPreference, this.preference)
      }
      return { mode: normalizedPreference, animated: false }
    }

    // 否则执行切换动画
    const resultMode = await this.toggle(event)
    return { mode: resultMode, animated: true }
  }

  /**
   * 获取当前模式
   */
  getMode(): ThemeMode {
    return this.mode
  }

  /**
   * 获取当前主题偏好（light/dark/system）
   */
  getPreference(): ThemePreference {
    return this.preference
  }

  /**
   * 获取当前模式快照（用于 useSyncExternalStore）
   */
  getSnapshot = (): ThemeMode => {
    return this.mode
  }

  /**
   * 订阅模式变化（用于 useSyncExternalStore）
   * @returns 取消订阅函数
   */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 通知所有订阅者模式已变化
   */
  private emitChange() {
    for (const listener of this.listeners) {
      listener()
    }
  }

  /**
   * 销毁，清理资源
   */
  destroy() {
    this.stopThemeMonitoring()
    this.listeners.clear()
  }
}

/**
 * 确保 window 上始终只有一个 ThemeManager 实例
 * userscript 场景下，App 可能会比核心模块更早渲染，
 * 这里统一复用同一个实例，避免 fallback、observer 与正式实例互相打架。
 */
export function ensureGlobalThemeManager(options: GlobalThemeManagerOptions): ThemeManager {
  const {
    mode,
    onModeChange,
    adapter,
    lightPresetId = DEFAULT_LIGHT_PRESET_ID,
    darkPresetId = DEFAULT_DARK_PRESET_ID,
    syncNativePageTheme = true,
    apply = false,
  } = options

  const themeManager =
    window.__ophelThemeManager ||
    new ThemeManager(mode, onModeChange, adapter, lightPresetId, darkPresetId, syncNativePageTheme)

  if (!window.__ophelThemeManager) {
    window.__ophelThemeManager = themeManager
  }

  themeManager.setAdapter(adapter ?? null)
  themeManager.setHostThemeSyncEnabled(syncNativePageTheme)
  themeManager.setPresets(lightPresetId, darkPresetId)

  if (onModeChange !== undefined) {
    themeManager.setOnModeChange(onModeChange)
  }

  const normalizedPreference: ThemePreference =
    mode === "system" ? "system" : mode === "dark" ? "dark" : "light"

  if (themeManager.getPreference() !== normalizedPreference) {
    themeManager.applyModePreference(normalizedPreference)
  } else if (apply) {
    themeManager.applyTheme()
  }

  return themeManager
}
