/**
 * Claude 主题切换检测脚本
 *
 * 用法：在 Claude 页面 (claude.ai) 打开浏览器控制台，粘贴此脚本运行。
 * 然后操作 Ophel 主题切换按钮，观察输出日志。
 *
 * 监控内容：
 *   1. document.body.classList 变化
 *   2. document.documentElement class/attribute 变化
 *   3. localStorage LSS-userThemeMode 变化
 *   4. body.dataset.ghMode 变化
 *   5. body.style.colorScheme 变化
 *   6. html style 属性（--theme-x, --theme-y）变化
 */

;(function detectClaudeTheme() {
  "use strict"

  var LS_KEY = "LSS-userThemeMode"
  var PREFIX = "[🔍 ThemeDetect]"
  var changeCount = 0

  function log(label, detail, isImportant) {
    var n = ++changeCount
    var style = isImportant ? "color: #ff6b35; font-weight: bold;" : "color: #4ecdc4;"
    console.log("%c" + PREFIX + " #" + n + " " + label, style, detail)
  }

  // ─── 1. 打印初始状态 ────────────────────────────────
  function snapshot() {
    console.group(PREFIX + " 初始快照")
    console.log("location.href:", window.location.href)
    console.log("location.pathname:", window.location.pathname)
    console.log("body.className:", document.body.className)
    console.log("html.className:", document.documentElement.className)
    console.log("body.dataset.ghMode:", document.body.dataset.ghMode)
    console.log("body.style.colorScheme:", document.body.style.colorScheme)
    console.log("html.style.colorScheme:", document.documentElement.style.colorScheme)
    console.log("html.dataset.theme:", document.documentElement.dataset.theme)
    console.log("body.dataset.theme:", document.body.dataset.theme)

    var bodyClasses = []
    document.body.classList.forEach(function (c) {
      bodyClasses.push(c)
    })
    console.log("body.classList:", bodyClasses)

    var htmlClasses = []
    document.documentElement.classList.forEach(function (c) {
      htmlClasses.push(c)
    })
    console.log("html.classList:", htmlClasses)

    var raw = localStorage.getItem(LS_KEY)
    console.log("localStorage[" + LS_KEY + "]:", raw)
    if (raw) {
      try {
        console.log("  → parsed:", JSON.parse(raw))
      } catch (e) {
        console.log("  → parse error:", e)
      }
    }

    var colorSchemeMeta = document.querySelector('meta[name="color-scheme"]')
    console.log(
      'meta[name="color-scheme"]:',
      colorSchemeMeta ? colorSchemeMeta.getAttribute("content") : "不存在",
    )

    var plasmoCsui = document.querySelector("plasmo-csui")
    var userscriptRoot = document.getElementById("ophel-userscript-root")
    console.log("plasmo-csui:", plasmoCsui ? "✅ 存在" : "❌ 不存在")
    console.log("ophel-userscript-root:", userscriptRoot ? "✅ 存在" : "❌ 不存在")

    console.groupEnd()
  }

  // ─── 2. 监听 body class 变化 ──────────────────────────
  var bodyClassObserver = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i]
      if (m.type === "attributes" && m.attributeName === "class") {
        log(
          "body.className 变化",
          {
            oldValue: m.oldValue,
            newValue: m.target.className,
          },
          true,
        )
      }
      if (m.type === "attributes" && m.attributeName === "style") {
        var style = m.target.style.cssText
        if (style) {
          log("body.style 变化", { cssText: style })
        }
      }
      if (m.type === "attributes" && m.attributeName && m.attributeName.startsWith("data-")) {
        log("body[" + m.attributeName + "] 变化", {
          oldValue: m.oldValue,
          newValue: m.target.getAttribute(m.attributeName),
        })
      }
    }
  })
  bodyClassObserver.observe(document.body, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ["class", "style", "data-gh-mode", "data-theme"],
  })

  // ─── 3. 监听 html 元素变化 ─────────────────────────────
  var htmlObserver = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i]
      if (m.type === "attributes" && m.attributeName === "class") {
        log(
          "html.className 变化",
          {
            oldValue: m.oldValue,
            newValue: m.target.className,
          },
          true,
        )
      }
      if (m.type === "attributes" && m.attributeName === "style") {
        var htmlEl = m.target
        var themeX = htmlEl.style.getPropertyValue("--theme-x")
        var themeY = htmlEl.style.getPropertyValue("--theme-y")
        log("html.style 变化", {
          "--theme-x": themeX,
          "--theme-y": themeY,
          colorScheme: htmlEl.style.colorScheme,
        })
      }
      if (m.type === "attributes" && m.attributeName && m.attributeName.startsWith("data-")) {
        log("html[" + m.attributeName + "] 变化", {
          oldValue: m.oldValue,
          newValue: m.target.getAttribute(m.attributeName),
        })
      }
    }
  })
  htmlObserver.observe(document.documentElement, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ["class", "style", "data-theme", "yb-theme-mode"],
  })

  // ─── 4. 拦截 localStorage LSS-userThemeMode ────────────
  var originalSetItem = localStorage.setItem.bind(localStorage)
  var originalRemoveItem = localStorage.removeItem.bind(localStorage)

  localStorage.setItem = function (key, value) {
    if (key === LS_KEY) {
      var parsed = null
      try {
        parsed = JSON.parse(value)
      } catch (e) {
        parsed = value
      }
      log(
        'localStorage.setItem("' + LS_KEY + '", ...)',
        {
          value: value,
          parsed: parsed,
          stack: new Error().stack
            ? new Error().stack.split("\n").slice(2, 6).join("\n")
            : "无堆栈",
        },
        true,
      )
    }
    return originalSetItem(key, value)
  }

  localStorage.removeItem = function (key) {
    if (key === LS_KEY) {
      log(
        'localStorage.removeItem("' + LS_KEY + '")',
        {
          stack: new Error().stack
            ? new Error().stack.split("\n").slice(2, 5).join("\n")
            : "无堆栈",
        },
        true,
      )
    }
    originalRemoveItem(key)
  }

  // ─── 5. 监听 storage 事件 ──────────────────────────────
  window.addEventListener("storage", function (e) {
    if (e.key === LS_KEY) {
      var parsedNew = null
      try {
        parsedNew = e.newValue ? JSON.parse(e.newValue) : null
      } catch (ex) {
        parsedNew = e.newValue
      }
      log(
        'storage 事件 (key="' + LS_KEY + '")',
        {
          oldValue: e.oldValue,
          newValue: e.newValue,
          parsed: parsedNew,
        },
        true,
      )
    }
    // 监控所有与 theme 相关的 storage key
    if (
      e.key &&
      (e.key.toLowerCase().includes("theme") ||
        e.key.toLowerCase().includes("color") ||
        e.key.toLowerCase().includes("dark") ||
        e.key.toLowerCase().includes("light") ||
        e.key.toLowerCase().includes("mode"))
    ) {
      log('🔎 storage 事件 (key="' + e.key + '")', {
        oldValue: e.oldValue,
        newValue: e.newValue,
      })
    }
  })

  // ─── 5b. 扫描所有 localStorage 中可能的主题相关 key ─────
  function scanThemeKeys() {
    console.group(PREFIX + " 扫描 localStorage 中的主题相关 key")
    var found = []
    var suspiciousPatterns = [
      "theme",
      "color",
      "dark",
      "light",
      "mode",
      "appearance",
      "display",
      "LSS",
      "claude",
      "anthropic",
      "pref",
    ]
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i)
      if (!key) continue
      var lower = key.toLowerCase()
      for (var j = 0; j < suspiciousPatterns.length; j++) {
        if (lower.indexOf(suspiciousPatterns[j]) !== -1) {
          var val = localStorage.getItem(key)
          var truncated = val && val.length > 200 ? val.slice(0, 200) + "..." : val
          found.push({ key: key, value: truncated })
          break
        }
      }
    }
    if (found.length === 0) {
      console.log("  未找到主题相关 key")
    } else {
      console.table(found)
    }
    console.groupEnd()
    return found
  }

  // ─── 5c. 手动设置主题的测试函数 ──────────────────────────
  function testSetTheme(value) {
    console.group(PREFIX + ' 手动测试：写入 value="' + value + '"')
    var currentRaw = localStorage.getItem(LS_KEY)
    var currentData = null
    try {
      currentData = currentRaw ? JSON.parse(currentRaw) : {}
    } catch (e) {
      currentData = {}
    }
    var testData = {
      value: value,
      tabId: currentData.tabId || "test-manual",
      timestamp: Date.now(),
    }
    console.log("写入前 body.className:", document.body.className)
    console.log("写入前 html.className:", document.documentElement.className)
    console.log("写入数据:", testData)

    localStorage.setItem(LS_KEY, JSON.stringify(testData))
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: LS_KEY,
        newValue: JSON.stringify(testData),
        storageArea: localStorage,
      }),
    )

    // 等待 500ms 后检查结果
    setTimeout(function () {
      console.log("--- 500ms 后 ---")
      console.log("写入后 body.className:", document.body.className)
      console.log("写入后 html.className:", document.documentElement.className)
      console.log("localStorage[" + LS_KEY + "]:", localStorage.getItem(LS_KEY))
      var bodyBgClass = ""
      document.body.classList.forEach(function (c) {
        if (c.indexOf("bg-") === 0) bodyBgClass += c + " "
      })
      console.log("body 背景色 class:", bodyBgClass || "(无)")
      console.groupEnd()
    }, 500)
  }

  // ─── 6. 监控 prefers-color-scheme ──────────────────────
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)")
    log("系统配色方案", {
      "prefers-color-scheme: dark": mq.matches ? "dark" : "light",
    })
    mq.addEventListener("change", function (e) {
      log("🖥️ 系统配色方案变化", { matches: e.matches ? "dark" : "light" }, true)
    })
  }

  // ─── 7. 打印快照 ──────────────────────────────────────
  snapshot()

  console.log(
    "%c" + PREFIX + " 监控已启动！现在操作 Ophel 主题切换，观察上方日志",
    "color: #ffd700; font-size: 14px; font-weight: bold;",
  )
  console.log("%c" + PREFIX + " 可用命令：", "color: #ffd700;")
  console.log("  detectClaudeTheme.snapshot()            — 重新打印当前状态")
  console.log("  detectClaudeTheme.scanThemeKeys()      — 扫描所有主题相关 localStorage key")
  console.log("  detectClaudeTheme.testSetTheme('light') — 手动测试写入 light")
  console.log("  detectClaudeTheme.testSetTheme('dark')  — 手动测试写入 dark")
  console.log("  detectClaudeTheme.testSetTheme('auto')  — 手动测试写入 auto")
  console.log("  detectClaudeTheme.stop()               — 停止监控")

  // ─── 8. 停止方法 ──────────────────────────────────────
  return {
    stop: function () {
      bodyClassObserver.disconnect()
      htmlObserver.disconnect()
      localStorage.setItem = originalSetItem
      localStorage.removeItem = originalRemoveItem
      console.log("%c" + PREFIX + " 监控已停止", "color: #ff6b35;")
    },
    snapshot: snapshot,
    scanThemeKeys: scanThemeKeys,
    testSetTheme: testSetTheme,
  }
})()
