/**
 * AI Studio 预加载脚本
 *
 * 在 document_start 阶段执行，早于 Angular 读取 localStorage
 * 用于将 Ophel 的 AI Studio 设置预先写入 localStorage
 */

import type { PlasmoCSConfig } from "plasmo"

import { WATERMARK_BLOCKER_CODE } from "~constants/scripts"

// 配置：仅匹配 AI Studio，在 document_start 阶段执行
export const config: PlasmoCSConfig = {
  matches: ["https://aistudio.google.com/*"],
  run_at: "document_start",
}

// 立即执行
;(async () => {
  try {
    // Zustand 使用 chrome.storage.local，key 为 "settings"
    const result = await chrome.storage.local.get("settings")
    const allData = result as Record<string, any>

    // 读取 aistudio 设置
    // Zustand persist 格式: { state: { settings: { aistudio: {...} } }, version: 0 }
    // chrome.storage 存储的是 JSON 字符串
    let settingsObj = allData.settings
    if (typeof settingsObj === "string") {
      try {
        settingsObj = JSON.parse(settingsObj)
      } catch (e) {
        console.error("[Ophel] Failed to parse settings:", e)
        return
      }
    }

    // 从 Zustand persist 格式中提取 aistudio 设置
    const aistudioSettings = settingsObj?.state?.settings?.aistudio || settingsObj?.aistudio

    // 如果没有 AI Studio 设置，直接返回
    if (!aistudioSettings) {
      return
    }

    // 注入去水印脚本 (如果启用)
    // 需在 Main World 执行以劫持原生 API
    if (aistudioSettings.removeWatermark) {
      const script = document.createElement("script")
      script.textContent = WATERMARK_BLOCKER_CODE
      try {
        ;(document.head || document.documentElement).appendChild(script)
        script.remove()
        console.warn("[Ophel] Watermark blocker injected")
      } catch (e) {
        console.error("[Ophel] Failed to inject watermark blocker:", e)
      }
    }

    // 读取现有的 AI Studio 用户偏好
    const prefStr = localStorage.getItem("aiStudioUserPreference") || "{}"
    const pref = JSON.parse(prefStr)

    let hasChanges = false

    // 应用侧边栏折叠设置
    // collapseNavbar: true 表示用户希望折叠侧边栏，对应 isNavbarExpanded: false
    if (aistudioSettings.collapseNavbar !== undefined) {
      const shouldExpand = !aistudioSettings.collapseNavbar
      if (pref.isNavbarExpanded !== shouldExpand) {
        pref.isNavbarExpanded = shouldExpand
        hasChanges = true
      }
    }

    // 应用工具面板折叠设置
    if (aistudioSettings.collapseTools !== undefined) {
      const shouldOpen = !aistudioSettings.collapseTools
      if (pref.areToolsOpen !== shouldOpen) {
        pref.areToolsOpen = shouldOpen
        hasChanges = true
      }
    }

    // 应用高级设置折叠
    if (aistudioSettings.collapseAdvanced !== undefined) {
      const shouldOpen = !aistudioSettings.collapseAdvanced
      if (pref.isAdvancedOpen !== shouldOpen) {
        pref.isAdvancedOpen = shouldOpen
        hasChanges = true
      }
    }

    // 应用搜索工具开关
    if (aistudioSettings.enableSearch !== undefined) {
      if (pref.enableSearchAsATool !== aistudioSettings.enableSearch) {
        pref.enableSearchAsATool = aistudioSettings.enableSearch
        hasChanges = true
      }
    }

    // 应用默认模型
    if (aistudioSettings.defaultModel && aistudioSettings.defaultModel.trim() !== "") {
      const modelId = aistudioSettings.defaultModel.trim()
      if (pref.promptModel !== modelId) {
        pref.promptModel = modelId
        pref._promptModelOverride = modelId
        hasChanges = true
      }
    }

    // 仅当有变化时写入 localStorage
    if (hasChanges) {
      localStorage.setItem("aiStudioUserPreference", JSON.stringify(pref))
    }

    // 检查是否开启了模型锁定
    // 如果开启了模型锁定，则暂不收起运行设置面板（因为锁定模型需要操作面板）
    // 同时也暂不操作工具栏（collapseTools），以免影响面板展开
    const modelLockSettings = settingsObj?.state?.settings?.modelLock || settingsObj?.modelLock
    const isModelLockEnabled =
      modelLockSettings && modelLockSettings["ai-studio"] && modelLockSettings["ai-studio"].enabled

    // 如果需要收起运行设置面板，且未开启模型锁定，则执行收起
    // (如果开启了模型锁定，收起操作将由 AIStudioAdapter 在锁定完成后执行)
    if (aistudioSettings.collapseRunSettings && !isModelLockEnabled) {
      waitForButtonAndClick('button[aria-label="Close run settings panel"]')
    }
  } catch (error) {
    console.error("[Ophel] AI Studio preload error:", error)
  }
})()

/**
 * 等待按钮出现并点击
 * 使用 MutationObserver 监听 DOM 变化，检测到按钮后延迟点击
 */
function waitForButtonAndClick(selector: string) {
  const CLICK_DELAY = 600 // 延迟时间（毫秒）
  let hasClicked = false
  let observer: MutationObserver | null = null
  let timeoutId: number | null = null

  function tryClick() {
    if (hasClicked) return

    const button = document.querySelector<HTMLButtonElement>(selector)
    if (
      button &&
      document.body.contains(button) &&
      button.offsetParent !== null &&
      !button.disabled
    ) {
      // 延迟点击，等待 UI 稳定
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        // 再次检查按钮状态
        if (
          button &&
          document.body.contains(button) &&
          button.offsetParent !== null &&
          !button.disabled
        ) {
          try {
            const event = new MouseEvent("click", { bubbles: true, cancelable: true })
            button.dispatchEvent(event)
            hasClicked = true
            console.warn("[Ophel] Run settings panel closed")
            cleanup()
          } catch (e) {
            console.error("[Ophel] Failed to click button:", e)
          }
        }
      }, CLICK_DELAY)
    }
  }

  function cleanup() {
    if (observer) {
      observer.disconnect()
      observer = null
    }
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  // 初始化
  function initialize() {
    if (!document.body) {
      requestAnimationFrame(initialize)
      return
    }

    // 首次检查
    tryClick()

    // 设置 MutationObserver
    observer = new MutationObserver(() => {
      if (!hasClicked) tryClick()
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "class", "style"],
    })

    // 超时清理（30秒后停止监听）
    setTimeout(() => {
      if (!hasClicked) {
        cleanup()
      }
    }, 30000)
  }

  // 启动
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize)
  } else {
    initialize()
  }

  // 页面卸载时清理
  window.addEventListener("unload", cleanup)
}
