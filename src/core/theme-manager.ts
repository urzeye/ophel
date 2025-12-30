/**
 * 主题管理器
 * 处理亮/暗模式切换 - 通过操作网页本身的主题类来实现
 * 支持自动监听浏览器/页面主题变化并同步到面板
 */

import type { SiteAdapter } from "~adapters/base"
import type { Settings } from "~utils/storage"

export type ThemeMode = "light" | "dark"

// 主题变化回调类型
export type ThemeModeChangeCallback = (mode: ThemeMode) => void

export class ThemeManager {
  private mode: ThemeMode
  private themeObserver: MutationObserver | null = null
  private onModeChange?: ThemeModeChangeCallback
  private adapter?: SiteAdapter | null

  constructor(
    mode: Settings["themeMode"],
    onModeChange?: ThemeModeChangeCallback,
    adapter?: SiteAdapter | null,
  ) {
    // 强制转换为 light 或 dark，不再支持 auto
    this.mode = mode === "dark" ? "dark" : "light"
    this.onModeChange = onModeChange
    this.adapter = adapter
  }

  /**
   * 设置适配器引用（用于调用适配器的 toggleTheme 方法）
   */
  setAdapter(adapter: SiteAdapter | null) {
    this.adapter = adapter
  }

  /**
   * 更新模式并应用
   */
  updateMode(mode: Settings["themeMode"]) {
    this.mode = mode === "dark" ? "dark" : "light"
    this.apply()
  }

  /**
   * 检测当前页面的实际主题状态
   * 优先级：Class > Data Attribute > Style (colorScheme)
   */
  private detectCurrentTheme(): ThemeMode {
    const bodyClass = document.body.className
    const hasDarkClass = /\bdark-theme\b/i.test(bodyClass)
    const hasLightClass = /\blight-theme\b/i.test(bodyClass)

    // 1. 显式 Class (Gemini 标准版使用这种方式)
    if (hasDarkClass) {
      return "dark"
    } else if (hasLightClass) {
      return "light"
    }

    // 2. Data 属性
    const dataTheme = document.body.dataset.theme || document.documentElement.dataset.theme
    if (dataTheme === "dark") {
      return "dark"
    } else if (dataTheme === "light") {
      return "light"
    }

    // 3. Style colorScheme (Gemini Business 使用这种方式)
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
    const isGeminiStandard = window.location.host === "gemini.google.com"

    if (mode === "dark") {
      document.body.classList.add("dark-theme")
      document.body.classList.remove("light-theme")
      document.body.style.colorScheme = "dark" // 确保 Business 版本一致
    } else {
      document.body.classList.remove("dark-theme")
      document.body.style.colorScheme = "light" // 确保 Business 版本一致
      // Gemini 标准版使用 light-theme 类，Business 版本使用空 class
      if (isGeminiStandard) {
        document.body.classList.add("light-theme")
      }
    }

    // 同步插件 UI 主题
    this.syncPluginUITheme(mode)
  }

  /**
   * 同步插件 UI 的主题状态（data-gh-mode 属性）
   */
  private syncPluginUITheme(mode?: ThemeMode) {
    const currentMode = mode || this.mode
    if (currentMode === "dark") {
      document.body.dataset.ghMode = "dark"
      // 同步 color-scheme，确保原生控件（如 checkbox）颜色一致
      document.body.style.colorScheme = "dark"
    } else {
      delete document.body.dataset.ghMode
      // 同步 color-scheme，确保原生控件（如 checkbox）颜色一致
      document.body.style.colorScheme = "light"
    }
  }

  /**
   * 启动主题监听器 (Auto Dark Mode)
   * 监听页面主题变化，自动同步到面板
   */
  monitorTheme() {
    const checkTheme = () => {
      const detectedMode = this.detectCurrentTheme()

      // 同步到插件 UI (ghMode)
      this.syncPluginUITheme(detectedMode)

      // 如果检测到的模式与当前模式不同，更新并触发回调
      if (this.mode !== detectedMode) {
        this.mode = detectedMode
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

      // 同时监听 html 元素的 data-theme 属性
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
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
    const bodyClass = document.body.className
    // 同时检查 style，确保健壮性
    const isDark = /\bdark-theme\b/i.test(bodyClass) || document.body.style.colorScheme === "dark"
    const nextMode: ThemeMode = isDark ? "light" : "dark"

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

    // 执行主题切换的核心逻辑
    const doToggle = async () => {
      // 优先使用适配器的原生切换逻辑 (针对 Gemini Business)
      if (this.adapter && typeof this.adapter.toggleTheme === "function") {
        try {
          const success = await this.adapter.toggleTheme(nextMode)
          if (!success) {
            console.warn("[ThemeManager] 适配器切换主题失败，回退到手动切换")
            this.apply(nextMode)
          }
        } catch (err) {
          console.error("[ThemeManager] 适配器切换主题出错:", err)
          this.apply(nextMode)
        }
      } else {
        // 没有适配器或适配器不支持，直接应用
        this.apply(nextMode)
      }
    }

    // 使用 View Transitions API（如果浏览器支持）
    if (typeof (document as any).startViewTransition === "function") {
      const transition = (document as any).startViewTransition(() => {
        doToggle()
      })

      try {
        // 应用自定义动画
        await transition.ready
        document.documentElement.animate(
          {
            clipPath: isDark
              ? [
                  "circle(0% at var(--theme-x) var(--theme-y))",
                  "circle(150% at var(--theme-x) var(--theme-y))",
                ]
              : [
                  "circle(150% at var(--theme-x) var(--theme-y))",
                  "circle(0% at var(--theme-x) var(--theme-y))",
                ],
          },
          {
            duration: 800,
            easing: "ease-in-out",
            pseudoElement: isDark ? "::view-transition-new(root)" : "::view-transition-old(root)",
          },
        )
      } catch {
        // 动画失败不影响切换
      }
    } else {
      // 降级：直接切换
      await doToggle()
    }

    // 更新内部状态
    this.mode = nextMode
    return nextMode
  }

  /**
   * 获取当前模式
   */
  getMode(): ThemeMode {
    return this.mode
  }

  /**
   * 销毁，清理资源
   */
  destroy() {
    this.stopMonitoring()
  }
}
