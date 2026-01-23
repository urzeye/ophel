/**
 * 主题管理器
 * 处理亮/暗模式切换，支持主题预置系统
 * 通过动态注入 CSS 变量实现 Shadow DOM 内的主题切换
 */

import type { SiteAdapter } from "~adapters/base"
import { SITE_IDS } from "~constants/defaults"
import type { CustomStyle } from "~utils/storage"
import {
  getPreset,
  themeVariablesToCSS,
  type ThemePreset,
  type ThemeVariables,
} from "~utils/themes"

export type ThemeMode = "light" | "dark"

// Extend Document interface for View Transitions API
declare global {
  interface Document {
    startViewTransition(callback?: any): any
  }
}

// 主题变化回调类型
export type ThemeModeChangeCallback = (mode: ThemeMode) => void

// 订阅者类型
type Listener = () => void

export class ThemeManager {
  private mode: ThemeMode
  private lightPresetId: string
  private darkPresetId: string
  private cleanPresetId: string // Purely for debugging or tracking
  private themeObserver: MutationObserver | null = null
  private onModeChange?: ThemeModeChangeCallback
  private adapter?: SiteAdapter | null
  private customStyles: CustomStyle[] = [] // 存储自定义样式列表
  private skipNextDetection = false // 标志：跳过下一次主题检测（用于 toggle 后避免被 monitorTheme 反悔）
  private listeners: Set<Listener> = new Set() // 订阅者集合

  constructor(
    mode: ThemeMode | string,
    onModeChange?: ThemeModeChangeCallback,
    adapter?: SiteAdapter | null,
    lightPresetId: string = "google-gradient",
    darkPresetId: string = "classic-dark",
  ) {
    this.mode = mode === "dark" ? "dark" : "light"
    this.lightPresetId = lightPresetId
    this.darkPresetId = darkPresetId
    this.onModeChange = onModeChange
    this.adapter = adapter

    // 注入全局动画样式 (View Transitions 需要在主文档生效)
    this.injectGlobalStyles()
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
   * 设置适配器引用（用于调用适配器的 toggleTheme 方法）
   */
  setAdapter(adapter: SiteAdapter | null) {
    this.adapter = adapter
  }

  /**
   * 动态设置主题变化回调（用于 React 组件动态注册）
   * 这使得单一 ThemeManager 实例可以在 main.ts 创建后，由 App.tsx 动态注册回调
   */
  setOnModeChange(callback: ThemeModeChangeCallback | undefined) {
    this.onModeChange = callback
  }

  /**
   * 更新模式并应用
   */
  updateMode(mode: ThemeMode | string) {
    this.mode = mode === "dark" ? "dark" : "light"
    this.emitChange()
    this.apply()
  }

  /**
   * 检测当前页面的实际主题状态
   * 优先级：html Class (ChatGPT) > body Class (Gemini) > Data Attribute > Style (colorScheme)
   */
  private detectCurrentTheme(): ThemeMode {
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
   * 应用主题到网页
   */
  apply(targetMode?: ThemeMode) {
    const mode = targetMode || this.mode
    const isGeminiStandard = this.adapter.getSiteId() === SITE_IDS.GEMINI

    if (mode === "dark") {
      document.body.classList.add("dark-theme")
      document.body.classList.remove("light-theme")
      document.body.style.colorScheme = "dark"
    } else {
      document.body.classList.remove("dark-theme")
      document.body.style.colorScheme = "light"
      if (isGeminiStandard) {
        document.body.classList.add("light-theme")
      }
    }

    // 同步插件 UI 主题
    this.syncPluginUITheme(mode)
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
    this.syncPluginUITheme()
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
      this.syncPluginUITheme()
    }
  }

  /**
   * 同步插件 UI 的主题状态
   * 从主题预置读取 CSS 变量值，注入到 Shadow DOM
   * ⭐ 暂停 MutationObserver 以避免循环触发
   */
  private syncPluginUITheme(mode?: ThemeMode) {
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
    const wasObserving = this.themeObserver !== null
    if (wasObserving) {
      this.themeObserver?.disconnect()
    }

    // 设置 body 属性
    if (currentMode === "dark") {
      document.body.dataset.ghMode = "dark"
      document.body.style.colorScheme = "dark"
    } else {
      delete document.body.dataset.ghMode
      document.body.style.colorScheme = "light"
    }

    // 在 :root 上设置变量（仅对预置主题有效）
    // 自定义样式通常包含选择器，可能直接覆盖 :root 这里的变量，或者通过 CSS 规则生效
    if (vars) {
      for (const [key, value] of Object.entries(vars)) {
        root.style.setProperty(key, value)
      }
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

        if (customStyle) {
          // 自定义样式：直接注入 CSS
          styleEl.textContent = customStyle.css
        } else if (vars) {
          // 预置主题：生成变量定义
          const cssVars = themeVariablesToCSS(vars)

          // 同时设置 data-theme 属性以便 CSS 选择器使用
          // 并添加强制覆盖的样式
          styleEl.textContent = `:host {
${cssVars}
color-scheme: ${currentMode};
}

:host([data-theme="dark"]),
:host .gh-root[data-theme="dark"] {
${cssVars}
}
`
        }
        // 设置 host 元素的 data-theme 属性
        ;(host as HTMLElement).dataset.theme = currentMode

        // 始终将样式标签移动/追加到 Shadow Root 末尾
        // 这样可以覆盖 Plasmo 静态注入的默认浅色主题变量
        shadowRoot.append(styleEl)
      }
    })

    // 恢复 MutationObserver
    if (wasObserving && this.themeObserver) {
      // 重新观察 body 和 html 元素
      this.themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
      })
      // 同时监听 html 元素的 class 和 data-theme 属性（ChatGPT 使用 html.dark/light）
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      })
    }
  }

  /**
   * 启动主题监听器 (Auto Dark Mode)
   * 监听页面主题变化，自动同步到面板
   */
  monitorTheme() {
    const checkTheme = () => {
      // 如果是 toggle() 主动触发后的首次恢复，跳过检测以避免覆盖用户意图
      if (this.skipNextDetection) {
        this.skipNextDetection = false
        return
      }

      const detectedMode = this.detectCurrentTheme()

      // 同步到插件 UI (ghMode)
      this.syncPluginUITheme(detectedMode)

      // 如果检测到的模式与当前模式不同，更新并触发回调
      if (this.mode !== detectedMode) {
        this.mode = detectedMode
        this.emitChange()
        // 触发变化回调，通知 React 组件更新
        if (this.onModeChange) {
          this.onModeChange(detectedMode)
        }
      }
    }

    // 首次检查
    checkTheme()

    // 如果已有 Observer，不重复创建
    if (!this.themeObserver) {
      this.themeObserver = new MutationObserver(() => {
        checkTheme()
      })

      // 监听 body 的 class、data-theme、style 属性变化
      this.themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
      })

      // 同时监听 html 元素的 class 和 data-theme 属性（ChatGPT 使用 html.dark/light）
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      })
    }
  }

  /**
   * 停止主题监听
   */
  stopMonitoring() {
    if (this.themeObserver) {
      this.themeObserver.disconnect()
      this.themeObserver = null
    }
  }

  /**
   * 切换主题（User Action）- 带圆形扩散动画
   * @param event 可选的鼠标事件，用于确定动画中心
   */
  async toggle(event?: MouseEvent): Promise<ThemeMode> {
    // 使用 detectCurrentTheme 统一检测当前主题
    const currentMode = this.detectCurrentTheme()
    const nextMode: ThemeMode = currentMode === "dark" ? "light" : "dark"

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
    this.stopMonitoring()

    // 执行主题切换的核心逻辑
    const doToggle = () => {
      // 优先使用适配器的原生切换逻辑 (针对 Gemini Enterprise)
      if (this.adapter && typeof this.adapter.toggleTheme === "function") {
        this.adapter.toggleTheme(nextMode).catch(() => {})
      }
      // 同步应用主题（包括 Shadow DOM）
      this.apply(nextMode)
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
      this.monitorTheme()
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

    // 标记跳过下一次检测，防止 monitorTheme 检测到错误的页面状态而覆盖用户意图
    this.skipNextDetection = true
    // 触发回调通知 React 更新状态（动画完成后）
    if (this.onModeChange) {
      this.onModeChange(nextMode)
    }
    // 无条件启动监听（确保网页主题变化能被检测）
    this.monitorTheme()

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
    targetMode: ThemeMode,
    event?: MouseEvent,
  ): Promise<{ mode: ThemeMode; animated: boolean }> {
    const currentMode = this.detectCurrentTheme()

    // 如果已经是目标模式，不做任何操作
    if (currentMode === targetMode) {
      // 仍然需要同步插件 UI 主题（确保样式变量正确应用）
      this.syncPluginUITheme(targetMode)
      return { mode: targetMode, animated: false }
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
    this.stopMonitoring()
    this.listeners.clear()
  }
}
