# Chat Helper Extension 疑难杂症排查手册

> 记录浏览器扩展开发过程中遇到的问题及其解决方案，供后续参考。

---

## 📋 目录

1. [Plasmo CSUI Shadow DOM 样式隔离](#1-plasmo-csui-shadow-dom-样式隔离)
2. [Plasmo Shadow DOM 样式注入顺序与 CSS 优先级冲突](#2-plasmo-shadow-dom-样式注入顺序与-css-优先级冲突)
3. [滚动锁定功能失效：隔离世界与 CSP 问题](#3-滚动锁定功能失效隔离世界与-csp-问题)
4. [桌面通知不生效：document.hidden 始终返回 false](#4-桌面通知不生效documenthidden-始终返回-false)
5. [图片去水印跨域 (CORS) 与 403 Forbidden 错误](#5-图片去水印跨域-cors-与-403-forbidden-错误)
6. [边缘吸附状态下打开菜单/对话框时面板意外隐藏](#6-边缘吸附状态下打开菜单对话框时面板意外隐藏)
7. [Gemini Business 主题切换后面板不同步更新](#7-gemini-business-主题切换后面板不同步更新)
8. [WebDAV 恢复后主题同步失效与数据覆盖问题](#8-webdav-恢复后主题同步失效与数据覆盖问题)

---

## 1. Plasmo CSUI Shadow DOM 样式隔离

**日期**: 2025-12-31

### 症状

- 在 `ConversationsTab.tsx` 中通过 `import "~styles/conversations.css"` 导入的 CSS 样式完全不生效
- 会话 Tab 的 UI 布局混乱，元素没有应用预期的样式
- 其他在 `style.css` 中定义的样式正常工作

### 背景

项目使用 Plasmo 框架开发浏览器扩展。Plasmo 的 Content Script UI (CSUI) 功能会将 React 组件渲染到页面中，用于实现悬浮面板等 UI。

相关代码结构：

```
src/
├── contents/
│   └── ui-entry.tsx     # CSUI 入口文件
├── style.css            # 主样式文件
├── styles/
│   └── conversations.css # 会话 Tab 专用样式
└── components/
    └── ConversationsTab.tsx # 会话 Tab 组件
```

`ui-entry.tsx` 中的样式注入逻辑：

```tsx
import cssText from "data-text:~style.css"

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}
```

### 根因

**Plasmo CSUI 将组件渲染在 Shadow DOM 内，普通的 CSS `import` 无法穿透 Shadow DOM。**

Shadow DOM 的样式隔离机制：

- Shadow DOM 内部的元素只能被 Shadow DOM 内部的样式影响
- 外部样式表（包括通过 `import` 导入的 CSS 模块）无法穿透 Shadow DOM 边界
- 只有通过 `getStyle()` 函数返回的样式才会被 Plasmo 注入到 Shadow DOM 内

```
样式注入流程：
1. Plasmo 调用 getStyle() 获取样式
2. getStyle() 返回包含 cssText 的 <style> 元素
3. Plasmo 将该 <style> 元素插入到 Shadow DOM 内
4. Shadow DOM 内的组件应用这些样式

问题：
- style.css 通过 data-text: 导入 → 在 getStyle() 中被注入 → ✅ 生效
- conversations.css 通过普通 import 导入 → 只存在于 JS bundle 中 → ❌ 无法穿透 Shadow DOM
```

### 修复方案

在 `ui-entry.tsx` 中添加 `conversations.css` 的导入，并合并到 `getStyle()` 返回的样式中：

```tsx
import cssText from "data-text:~style.css"
import conversationsCssText from "data-text:~styles/conversations.css"
import type { PlasmoCSConfig } from "plasmo"
import React from "react"

import { App } from "~components/App"

export const config: PlasmoCSConfig = {
  matches: [
    "https://gemini.google.com/*",
    "https://business.gemini.google/*",
    // ... other matches
  ],
}

export const getStyle = () => {
  const style = document.createElement("style")
  // 合并所有 CSS 样式
  style.textContent = cssText + "\n" + conversationsCssText
  return style
}

const PlasmoApp = () => {
  return <App />
}

export default PlasmoApp
```

关键变化：

1. 使用 `data-text:` 前缀导入 CSS 文件为文本
2. 在 `getStyle()` 中将多个 CSS 文本合并
3. 返回包含所有样式的 `<style>` 元素

### 经验总结

| 教训                      | 说明                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| **Shadow DOM 样式隔离**   | Plasmo CSUI 使用 Shadow DOM，普通 CSS import 无法穿透 Shadow DOM 边界 |
| **data-text: 导入方式**   | Plasmo 提供 `data-text:` 前缀将文件内容作为字符串导入，用于样式注入   |
| **getStyle() 是关键入口** | 所有需要在 CSUI 中生效的样式都必须通过 `getStyle()` 返回              |
| **多个 CSS 文件合并**     | 可以导入多个 CSS 文件并在 `getStyle()` 中拼接，保持样式文件的模块化   |

### 扩展：添加新的样式文件

如果将来需要添加更多样式文件（如 `prompts.css`、`outline.css` 等），遵循相同模式：

```tsx
import cssText from "data-text:~style.css"
import conversationsCssText from "data-text:~styles/conversations.css"
import promptsCssText from "data-text:~styles/prompts.css" // 新增

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = [
    cssText,
    conversationsCssText,
    promptsCssText, // 新增
  ].join("\n")
  return style
}
```

---

## 2. Plasmo Shadow DOM 样式注入顺序与 CSS 优先级冲突

**日期**: 2026-01-01

### 症状

- 插件的深色模式切换不生效，UI 始终保持浅色样式（或仅部分生效）
- 在 `theme-variables.css` 中定义的深色主题 CSS 变量（例如 `:host { --gh-bg: #1e1e1e; }`）被忽略，浏览器计算样式显示其值为浅色默认值（`#fff`）

### 背景

项目使用 `ThemeManager` 动态管理主题，通过在 Shadow Root 中动态插入包含 CSS 变量的 `<style>` 标签来实现主题切换。

- `ThemeManager.ts`: 负责监听主题变化并动态插入 `<style id="gh-theme-vars">`
- `ui-entry.tsx`: Plasmo 的入口文件，通过 `getStyle()` 静态注入主样式表（包含默认 CSS 变量）

### 根因

**Plasmo 静态注入的 CSS 样式表优先级高于动态插入的主题样式表，导致 CSS 变量被覆盖。**

1. `ThemeManager` 初始化时，使用 `shadowRoot.prepend(styleEl)` 将动态样式插入到 Shadow Root 的**最前面**。
2. Plasmo 随后通过 `getStyle()` 将主样式表注入到 Shadow Root 中（通常在动态样式之后）。
3. 两者都使用 `:host` 选择器定义了相同的 CSS 变量（如 `--gh-bg`）。
4. 由于具有相同的 CSS 特异性（Specificity），**后出现的样式规则会覆盖先出现的**。
5. 因此，Plasmo 静态注入的浅色默认变量覆盖了动态注入的深色变量。

此外，代码中尝试使用 `:host-context(body[data-gh-mode="dark"])` 来解决问题，但该选择器已被浏览器弃用，无法稳定工作。

### 修复方案

**1. 调整动态样式的插入位置**

修改 `ThemeManager.ts`，将 `prepend` 改为 `append`，并确保每次更新样式时都将其移动到 Shadow Root 的**末尾**：

```typescript
// 修改前
shadowRoot.prepend(styleEl)

// 修改后
// 始终将样式标签移动/追加到 Shadow Root 末尾
// 这样可以覆盖 Plasmo 静态注入的默认浅色主题变量
shadowRoot.append(styleEl)
```

**2. 废弃无效的 CSS 选择器**

移除所有 `:host-context()` 选择器，完全依赖 JS 动态注入的 CSS 变量。

**3. 补充缺失的 CSS 变量**

将部分硬编码的颜色值（如徽章背景、阴影等）提取为 CSS 变量，确保它们也能响应主题切换。

### 经验总结

| 教训                    | 说明                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| **Shadow DOM 样式顺序** | 在 Shadow DOM 中，后插入的 `<style>` 标签优先级更高（当特异性相同时）。                     |
| **动态 vs 静态样式**    | 动态注入的样式若要覆盖静态样式，必须确保其插入位置在静态样式之后，或使用更高的 CSS 特异性。 |
| **避免弃用特性**        | 不要依赖 `:host-context()` 等已弃用的选择器，应寻找替代方案（如 CSS 变量）。                |
| **全面使用 CSS 变量**   | 所有涉及颜色的样式都应尽可能使用 CSS 变量，避免硬编码，以便于主题化。                       |

---

### 2.1 补充：View Transitions 动画闪烁与作用域问题

**症状**：在切换主题时，页面会先瞬间变成目标主题的颜色，然后再执行扩散动画。

**原因**：

1. **初始状态缺失**：`::view-transition-new`（新视图）默认覆盖在旧视图之上。如果 CSS 中没有将其初始 `clip-path` 设置为 `0`，它会立即完整显示，导致"瞬间变色"。
2. **作用域冲突（关键）**：我们最初尝试在 `style.css` 中添加 `clip-path` 样式。但由于 `style.css` 被注入到 Plasmo 组件的 **Shadow DOM** 中，而 `::view-transition-*` 伪元素是挂载在 **Document Root** 上的。**Shadow DOM 内的样式无法影响文档根部的伪元素**。因此，`style.css` 中的定义无效。

**修复**：

1. **注入全局样式**：
   修改 `ThemeManager.ts`，在初始化时动态向主文档的 `<head>` 中插入一个 `<style>` 标签，专门用于定义 View Transitions 的全局样式。

   ```typescript
   // ThemeManager.ts
   private injectGlobalStyles() {
     const style = document.createElement("style")
     style.textContent = `
       ::view-transition-new(root) {
         clip-path: circle(0px at var(--theme-x) var(--theme-y)); /* 初始不可见 */
       }
       /* ...其他样式... */
     `
     document.head.appendChild(style)
   }
   ```

2. **简化动画逻辑**：
   统一使用"扩散"动画逻辑，不再区分 Light/Dark 方向，确保视觉效果连贯。

---

### 2.2 补充：动画结束时的闪烁问题（fill-mode）

**症状**：动画播放完成后，页面会再次明显闪烁（通常是闪回旧界面一瞬间）。

**原因**：
JavaScript 的 `animate()` 方法默认 `fill` 模式为 `auto` (通常表现为 `none`)。这意味着当动画时间结束时，动画效果会立即移除，元素的样式会回退到动画开始前的状态。
在我们的场景中，动画开始前我们将 `::view-transition-new` 的 `clip-path` 设置为 `circle(0px)`（不可见）。因此，当动画播放完毕（全屏覆盖）的一瞬间，样式回退到 `circle(0px)`，导致新视图瞬间消失，露出了底层的旧视图或背景，随后 View Transition 结束，新视图才再次出现。

**修复**：
在 `animate()` 的配置对象中添加 `fill: "forwards"`，确保动画结束后保持在最终状态（全屏可见），直到 View Transition 系统销毁伪元素。

```typescript
document.documentElement.animate(
  { clipPath: [...] },
  {
    duration: 500,
    easing: "ease-in",
    pseudoElement: "::view-transition-new(root)",
    fill: "forwards" // 关键修复
  }
)
```

---

## 3. 滚动锁定功能失效：隔离世界与 CSP 问题

**日期**: 2026-01-02

### 症状

- "防止自动滚动"功能完全无效
- `ScrollLockManager` 初始化成功，控制台显示 "APIs hijacked" 日志
- 劫持了三个 API：`scrollIntoView`、`window.scrollTo`、`scrollTop setter`
- 但在 AI 生成回复时，完全没有任何 "Blocked" 或滚动相关的日志
- 页面滚动行为不受任何影响

### 背景

项目从油猴脚本迁移到浏览器扩展。油猴脚本的滚动锁定实现：

1. 劫持三个 API 阻止程序触发的滚动
2. 使用 `MutationObserver` 检测 DOM 变化
3. 使用定时器周期性检查滚动位置，发现异常跳变时回滚

扩展初版实现只包含了 API 劫持部分，且运行在 Content Script 中。

### 调试过程

#### 第一轮调试：发现隔离世界问题

使用浏览器自动化工具在 Gemini 页面执行检查：

```javascript
// 检查 API 是否被劫持
Element.prototype.scrollIntoView.toString()
// 返回: "function scrollIntoView() { [native code] }"

window.__chatHelperScrollLockEnabled
// 返回: undefined
```

**发现**：API 仍然是原生代码，扩展的劫持对页面脚本无效！

**原因**：Plasmo Content Script 默认运行在"隔离世界（Isolated World）"。这意味着：

- Content Script 和页面脚本拥有**独立的 JavaScript 执行环境**
- Content Script 中修改 `Element.prototype.scrollIntoView` 只影响 Content Script 自己
- 页面脚本（Gemini 的代码）仍然看到并使用原生 API

```
┌─────────────────────────────────────────────────────────────┐
│                        浏览器标签页                          │
├──────────────────────────┬──────────────────────────────────┤
│     隔离世界 (Isolated)   │         主世界 (Main)            │
│                          │                                  │
│  Content Script 运行在此  │    页面脚本（Gemini）运行在此     │
│                          │                                  │
│  Element.prototype        │    Element.prototype             │
│    .scrollIntoView        │      .scrollIntoView             │
│    = 劫持后的函数 ✓       │      = 原生函数 ✗                │
│                          │                                  │
│  ❌ 劫持对页面无效        │    ✅ Gemini 使用原生 API        │
└──────────────────────────┴──────────────────────────────────┘
```

#### 尝试修复：内联脚本注入

尝试通过 `<script>` 标签注入代码到主世界：

```typescript
const script = document.createElement("script")
script.textContent = `
  // 劫持代码...
  Element.prototype.scrollIntoView = function() { ... }
`
document.head.appendChild(script)
```

#### 第二轮调试：发现 CSP 拦截问题

验证发现内联脚本注入失败：

```
控制台错误:
Refused to execute inline script because it violates the following
Content Security Policy directive: "script-src 'self' ..."
```

**原因**：Gemini 网站有严格的 **Content Security Policy (CSP)**，禁止执行内联脚本。

#### 额外发现：API 劫持的局限性

即使成功劫持 API，某些滚动行为仍无法拦截：

```javascript
// 调用 element.focus() 会触发浏览器原生滚动
// 这种滚动不经过 scrollIntoView 等 JS API
element.focus() // → 浏览器自动将元素滚动到可视区域
```

这解释了为什么油猴脚本还需要 `MutationObserver` 回滚机制。

### 根因

1. **隔离世界问题**：Content Script 的 API 劫持对页面脚本无效
2. **CSP 拦截**：无法通过 `<script>` 标签注入代码到主世界
3. **API 局限性**：`focus()` 等操作触发的浏览器原生滚动无法被 JS 劫持

### 修复方案

**使用 Plasmo 的 `world: "MAIN"` 配置**

Plasmo 支持将 Content Script 直接运行在主世界，绕过隔离世界和 CSP 限制。

#### 1. 创建主世界脚本 `src/contents/scroll-lock-main.ts`

```typescript
import type { PlasmoCSConfig } from "plasmo"

// 关键配置：运行在主世界
export const config: PlasmoCSConfig = {
  matches: ["https://gemini.google.com/*", "https://business.gemini.google/*"],
  world: "MAIN", // 主世界
  run_at: "document_start", // 尽早运行
}

// 防止重复初始化
if (!(window as any).__chatHelperScrollLockInitialized) {
  ;(window as any).__chatHelperScrollLockInitialized = true

  // 保存原始 API
  const originalApis =
    ({
      scrollIntoView: Element.prototype.scrollIntoView,
      scrollTo: window.scrollTo.bind(window),
      scrollTopDescriptor: Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop"),
    }(window as any).__chatHelperOriginalApis =
    originalApis(window as any).__chatHelperScrollLockEnabled =
      false) // 默认禁用

  // 1. 劫持 scrollIntoView
  Element.prototype.scrollIntoView = function (options) {
    if (!(window as any).__chatHelperScrollLockEnabled) {
      return originalApis.scrollIntoView.call(this, options)
    }
    const shouldBypass = options?.__bypassLock
    if (!shouldBypass) {
      console.log("[Chat Helper] Blocked scrollIntoView (Main World)")
      return
    }
    return originalApis.scrollIntoView.call(this, options)
  }

  // 2. 劫持 window.scrollTo
  // 3. 劫持 scrollTop setter
  // ... 类似逻辑 ...

  // 监听来自 Content Script 的消息
  window.addEventListener("message", (event) => {
    if (event.data?.type === "CHAT_HELPER_SCROLL_LOCK_TOGGLE") {
      ;(window as any).__chatHelperScrollLockEnabled = event.data.enabled
    }
  })
}
```

#### 2. 简化管理器 `src/core/scroll-lock-manager.ts`

```typescript
export class ScrollLockManager {
  private enable() {
    // 通过 postMessage 通知主世界脚本启用
    window.postMessage({ type: "CHAT_HELPER_SCROLL_LOCK_TOGGLE", enabled: true }, "*")

    // 启动 MutationObserver 回滚机制（保底）
    this.startObserver()
  }

  private startObserver() {
    this.observer = new MutationObserver((mutations) => {
      // 检测新内容插入
      // 如果发现滚动位置异常跳变，强制回滚
      const container = this.adapter.getScrollContainer()
      if (container.scrollTop > this.lastScrollTop + 100) {
        container.scrollTop = this.lastScrollTop
      }
    })
    this.observer.observe(document.body, { childList: true, subtree: true })
  }
}
```

### 验证结果

```javascript
// 验证主世界脚本加载
window.__chatHelperScrollLockEnabled // true ✓
window.__chatHelperOriginalApis // {scrollIntoView: ƒ, ...} ✓

// 验证 API 劫持
Element.prototype.scrollIntoView.toString()
// 不再是 "[native code]"，而是劫持后的函数代码 ✓

// 控制台日志
// [Chat Helper] Blocked scrollTop setter (Main World), value: 3106 current: 0
// [Chat Helper] Blocked scrollIntoView (Main World)
```

在 AI 生成长回复期间，手动向上滚动后页面位置保持稳定，功能恢复正常。

### 经验总结

| 教训                        | 说明                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| **Content Script 隔离世界** | Plasmo 默认将 Content Script 运行在隔离世界，无法直接劫持页面脚本使用的 API          |
| **world: "MAIN" 配置**      | Plasmo 支持 `world: "MAIN"` 让脚本运行在主世界，可以直接修改页面的全局对象           |
| **CSP 限制**                | 严格 CSP 的网站会拦截内联脚本注入，但 `world: "MAIN"` 可以绕过这一限制               |
| **多重机制保障**            | 仅靠 API 劫持不够，还需要 MutationObserver 回滚机制来处理 `focus()` 等绕过劫持的滚动 |
| **postMessage 跨世界通信**  | 隔离世界和主世界之间可以通过 `window.postMessage` 进行通信                           |

### 文件变更

| 文件                               | 变更                                              |
| ---------------------------------- | ------------------------------------------------- |
| `src/contents/scroll-lock-main.ts` | **新增** - 主世界脚本，负责 API 劫持              |
| `src/core/scroll-lock-manager.ts`  | **重写** - 简化为通过 postMessage 控制 + 回滚保底 |

---

## 4. 桌面通知不生效：document.hidden 始终返回 false

**日期**: 2026-01-02

### 症状

- 开启通知功能后，当用户切换到其他标签页，AI 生成完成时桌面通知不显示
- 排查发现 `document.hidden` 始终返回 `false`，即使用户已经切换到其他标签页
- 通知声音和自动窗口置顶功能也受影响

### 背景

项目使用 `TabManager` 在 AI 任务完成时发送桌面通知。通知逻辑中使用 `document.hidden` 来判断用户是否在后台：

```typescript
const shouldNotify =
  wasGenerating && !this.userSawCompletion && (document.hidden || notifyWhenFocused)
```

问题是 `document.hidden` 在某些浏览器配置下始终返回 `false`。

### 调试过程

#### 第一轮调试：排除 Shadow DOM 影响

考虑到 Plasmo 使用 Shadow DOM 渲染 UI，怀疑 `document` 引用可能出问题。验证后发现：

- `TabManager` 运行在 Content Script 中，访问的是宿主页面的 `document`
- `plasmo-csui` 的 `shadowRoot.ownerDocument === document`，确认是同一个 document
- `document.hidden` 属性是原生 getter，未被劫持

```javascript
// 验证 Shadow DOM 的 document 引用
const csui = document.querySelector("plasmo-csui")
csui.shadowRoot.ownerDocument === document // true
csui.shadowRoot.ownerDocument.hidden // false (与全局 document 一致)
```

#### 第二轮调试：排除属性劫持

检查 `document.hidden` 是否被 Gemini 页面或扩展代码劫持：

```javascript
// 检查属性描述符
Object.getOwnPropertyDescriptor(Document.prototype, "hidden")
// { get: [native code], configurable: true, enumerable: true }

// 文档实例上没有自定义属性
document.hasOwnProperty("hidden") // false
```

确认属性是原生的，未被修改。

#### 第三轮调试：发现问题根源

测试发现 `visibilitychange` 事件能正常触发，`TabManager` 也能正确响应：

```
[TabManager] visibilitychange 事件: {hidden: false, visibilityState: visible, aiState: idle}
```

但 `document.hidden` 在事件触发时仍然是 `false`。进一步测试发现：

1. **在 Main World 修改 `document.hidden` 不影响 Isolated World**
2. **窗口最小化但标签页在前台时，`document.hidden` 可能不变**
3. **某些浏览器配置下（如多显示器、虚拟桌面），行为可能不一致**

### 根因

**`document.hidden` API 的局限性**：

1. `document.hidden` 仅在标签页完全不可见时才返回 `true`
2. 以下场景可能不会触发 `hidden = true`：
   - 窗口被其他窗口遮挡
   - 用户在同一窗口的不同标签页
   - 窗口在另一个虚拟桌面 (macOS Spaces / Windows Virtual Desktop)
   - 多显示器设置下窗口在非活动显示器
3. 某些浏览器自动化环境下，页面可能始终被视为"可见"

### 修复方案

**使用 `document.hasFocus()` 作为补充检测方式**

`document.hasFocus()` 检查文档是否获得焦点，比 `document.hidden` 更可靠地判断用户是否在与页面交互。

#### 1. 添加 `isUserAway()` 辅助方法

```typescript
/**
 * 判断用户是否「离开」当前页面
 * 综合使用多种检测方式，因为 document.hidden 在某些情况下可能始终返回 false
 */
private isUserAway(): boolean {
  // 方式1: document.hidden - 标准的 Page Visibility API
  const hidden = document.hidden
  // 方式2: document.hasFocus() - 检查文档是否获得焦点
  const hasFocus = document.hasFocus()
  // 方式3: document.visibilityState - 更详细的可见性状态
  const notVisible = document.visibilityState !== "visible"

  // 如果任一条件表明用户不在当前页面，则认为用户已离开
  return hidden || !hasFocus || notVisible
}
```

#### 2. 添加 `blur/focus` 事件监听

作为 `visibilitychange` 的补充，这些事件在用户切换焦点时更可靠：

```typescript
window.addEventListener("focus", this.boundFocusHandler)
window.addEventListener("blur", this.boundBlurHandler)
```

#### 3. 更新通知判断逻辑

```typescript
// 修改前
const shouldNotify = wasGenerating && !this.userSawCompletion && (document.hidden || notifyWhenFocused)

// 修改后
const isAway = this.isUserAway()
const shouldNotify = wasGenerating && !this.userSawCompletion && (isAway || notifyWhenFocused)
```

### 验证结果

修改后的日志输出：

```
[TabManager] visibilitychange 事件: {
  hidden: false,
  hasFocus: false,      // 新增：更可靠的离开检测
  visibilityState: visible,
  isUserAway: true,     // 新增：综合判断结果
  aiState: generating
}

[TabManager] onAiComplete: {
  wasGenerating: true,
  isUserAway: true,     // 即使 hidden=false，也能正确判断用户已离开
  shouldNotify: true    // 通知将正确触发
}
```

### 经验总结

| 教训                         | 说明                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| **Page Visibility API 局限** | `document.hidden` 仅检测标签页可见性，不检测焦点状态，不适用于所有"用户离开"场景           |
| **使用多种检测方式**         | 综合 `document.hidden`、`document.hasFocus()`、`document.visibilityState` 获得更可靠的判断 |
| **添加 blur/focus 事件**     | 作为 `visibilitychange` 的补充，在用户切换窗口/应用时更可靠触发                            |
| **Shadow DOM 无影响**        | 本问题与 Plasmo 的 Shadow DOM 无关，Content Script 访问的是正确的宿主 document             |

### 文件变更

| 文件                      | 变更                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `src/core/tab-manager.ts` | **修改** - 添加 `isUserAway()` 方法，添加 blur/focus 事件监听 |

---

## 5. 图片去水印跨域 (CORS) 与 403 Forbidden 错误

**日期**: 2026-01-02

### 症状

- 去水印功能对某些 Gemini 生成的图片失效，图片一直处于 "processing" 状态或直接报错。
- 控制台报错：
  1. `403 Forbidden`: 获取 `lh3.googleusercontent.com` 图片时。
  2. CORS 错误: `No 'Access-Control-Allow-Origin' header is present`.
  3. 重定向错误: `fetch` 请求 `googleusercontent.com` 被重定向到 `lh3.google.com`，导致 Origin 不匹配。

### 背景

Gemini 生成的图片通常托管在 `googleusercontent.com`，但也可能重定向到 `google.com` 子域。原油猴脚本通过 `GM_xmlhttpRequest` 伪造 `Referer` 和 `Origin` 来获取图片。迁移到扩展后，直接在 Content Script 中使用 `fetch` 遇到了浏览器严格的安全限制。

### 根因

1. **需要认证**: 图片资源需要 Cookie 才能访问，普通 `fetch` 会报 403。
2. **CORS 限制**: 只有当请求头包含正确的 `Origin` / `Referer` (`https://gemini.google.com`) 时，服务器才允许访问。
3. **浏览器安全策略**: 带有 `credentials: 'include'` 的请求，浏览器要求服务器返回的 `Access-Control-Allow-Origin` 精确匹配请求源，不能是 `*`。
4. **重定向陷阱**: 请求 `*.googleusercontent.com` 时被重定向到 `*.google.com`。即使第一跳的规则设置正确，浏览器也会对重定向后的请求重新进行 CORS 检查，导致失败。

### 尝试过的方案

- **尝试 1 (直接 Fetch)**: 失败，因 CORS/CORB 阻止跨域图片数据读取。
- **尝试 2 (后台代理 + 手动 Headers)**: 尝试在 `fetch` 中手动设置 `Referer`/`Origin`，失败，因为这些是“不安全请求头”，会被浏览器剥离。
- **尝试 3 (DNR + 直接 Fetch)**: 使用 DNR 修改响应头。失败，因为重定向后的域名 (`lh3.google.com`) 未包含在 Host Permissions 或 DNR 规则中。

### 最终解决方案 (Plan G)

**策略**: 后台代理 (Background Proxy) + 动态 DNR 规则 (Dynamic Rules)

1. **权限**: 在 `package.json` 中添加 `https://*.google.com/*` 和 `https://*.googleusercontent.com/*` 到 `host_permissions`。
2. **后台代理**:
    - Content Script 不直接 fetch，而是发送 `MSG_PROXY_FETCH` 消息给 Background Script。
    - 由 Background Script 发起请求。
3. **动态规则 (DNR)**:
    - 在 `background.ts` 中配置动态规则。
    - **范围**: 仅针对扩展发起的请求 (`initiatorSchemes: ['chrome-extension']` 或通过 exclusion 排除页面请求)。
    - **动作**:
      - **欺骗服务器**: 强制设置请求头 `Origin` 和 `Referer` 为 `https://gemini.google.com`。
      - **欺骗浏览器**: 强制设置响应头 `Access-Control-Allow-Origin` 为扩展的 Origin。
      - **覆盖重定向**: 规则同时覆盖 `*.googleusercontent.com` 和 `*.google.com`，完美处理重定向链。

### 经验总结

| 教训                 | 说明                                                                                            |
| :------------------- | :---------------------------------------------------------------------------------------------- |
| **CORS 与重定向**    | 如果请求发生跨域重定向，CORS 检查会对每一跳进行，必须确保权限和规则覆盖重定向后的最终域名。     |
| **Credentials 限制** | 携带凭证的请求对 `Access-Control-Allow-Origin` 要求极严，不能使用通配符 `*`。                   |
| **扩展伪装**         | 通过 Background Script + DNR 修改 Headers，可以完美模拟同源请求，是解决复杂跨域问题的终极手段。 |

---

## 6. 边缘吸附状态下打开菜单/对话框时面板意外隐藏

**日期**: 2026-01-03

### 症状

- 面板在边缘吸附（Edge Snap）隐藏状态下，用户悬停显示面板后打开菜单或对话框
- 鼠标从面板区域移到菜单/对话框上时，面板立即自动缩回隐藏
- 严重影响用户体验，无法正常操作弹出的菜单和对话框

### 背景

项目实现了"边缘吸附隐藏"功能：

1. 用户可以将面板拖到屏幕边缘，面板会自动吸附并隐藏
2. 当鼠标悬停在面板区域时，面板通过 CSS `:hover` 或 `.edge-peek` 类显示
3. 菜单和对话框通过 React Portal 渲染到 `document.body`，不在面板 DOM 内部

相关代码结构：

```
src/components/
├── App.tsx              # 主组件，管理边缘吸附状态
├── MainPanel.tsx        # 面板组件，应用 edge-snapped 类
├── ConversationMenus.tsx # 菜单组件，使用 createPortal
└── ConversationDialogs.tsx # 对话框组件，使用 createPortal
```

边缘吸附的 CSS 实现：

```css
/* 面板吸附到右边缘时隐藏 */
.gh-main-panel.edge-snapped-right {
  right: -310px !important;
  transition: right 0.3s ease;
}

/* 悬停或 peek 状态时显示 */
.gh-main-panel.edge-snapped-right:hover,
.gh-main-panel.edge-snapped-right.edge-peek {
  right: 0 !important;
}
```

### 调试过程

#### 第一轮调试：排查 onMouseLeave 逻辑

最初怀疑是 `onMouseLeave` 回调中的隐藏逻辑问题。添加调试日志后发现：

```javascript
// 日志输出
[GH Debug] onMouseLeave check: {interactionActive: true, hasPortal: true, portalCount: 1}
[GH Debug] Keeping panel visible due to active interaction or portal
```

**发现**：`onMouseLeave` 逻辑正确检测到了 Portal 元素并阻止了隐藏。

但用户报告：打开某些对话框（如标签管理对话框）时，**根本没有调试日志输出**，面板却立即隐藏了。

#### 第二轮调试：排查 autoHidePanel 逻辑

检查了"点击外部关闭面板"的逻辑，发现 Portal 元素被视为"外部点击"，但这只会在用户**点击**对话框时触发。

用户明确说只是鼠标**移出**面板就隐藏了，还没有点击任何东西。

#### 第三轮调试：发现 CSS :hover 失效

关键发现：**`onMouseLeave` 事件根本没有触发**！

这意味着面板不是通过 React 状态变化隐藏的，而是 **CSS 样式变化**导致的。

分析对话框的渲染方式：

```tsx
// DialogOverlay 组件
const dialogContent = (
  <div className="conversations-dialog-overlay" onClick={onClose}>
    {/* 全屏覆盖层，z-index: 1000003 */}
    <div className="conversations-dialog">{children}</div>
  </div>
)

return createPortal(dialogContent, document.body)
```

**根因**：

1. 对话框覆盖层是一个全屏 `fixed` 定位元素，`z-index: 1000003`
2. 面板的 `z-index: 9999`
3. 当对话框渲染时，它**覆盖在面板前面**
4. 鼠标虽然在屏幕上没有移动，但从浏览器的角度看，鼠标现在**在覆盖层上**，不再在面板上
5. 面板的 CSS `:hover` 伪类**立即失效**
6. 面板样式立即变回 `right: -310px`，隐藏到屏幕外

```
时间线：
1. 用户悬停在面板上 → :hover 生效 → 面板显示
2. 用户点击"标签管理" → 对话框覆盖层渲染到 body
3. 覆盖层出现在面板前面 → 鼠标"离开"面板（从 CSS 角度）
4. :hover 失效 → 面板立即隐藏
5. onMouseLeave 事件来不及触发（面板 DOM 都隐藏了）
```

### 根因

**Portal 元素的 z-index 高于面板，导致 CSS `:hover` 伪类失效，面板依赖的悬停显示机制被破坏。**

这是一个纯 CSS 层级问题，与 JavaScript 逻辑无关。

### 修复方案

**使用 MutationObserver 监听 Portal 元素，在 Portal 出现时强制添加 `.edge-peek` 类**

核心思路：不依赖不可靠的 `:hover` 伪类，而是通过 JavaScript 主动检测 Portal 元素并控制面板显示状态。

#### 1. 添加 MutationObserver 监听

```typescript
// App.tsx
useEffect(() => {
  if (!edgeSnapState || !settings?.edgeSnapHide) return

  const portalSelector =
    ".conversations-dialog-overlay, .conversations-folder-menu, .conversations-tag-filter-menu, .prompt-modal"

  const checkPortalExists = () => {
    return document.body.querySelectorAll(portalSelector).length > 0
  }

  let prevHasPortal = checkPortalExists()

  const observer = new MutationObserver(() => {
    const hasPortal = checkPortalExists()

    if (hasPortal && !prevHasPortal) {
      // Portal 刚出现，强制保持面板显示
      setIsEdgePeeking(true)
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    } else if (!hasPortal && prevHasPortal) {
      // Portal 刚消失，延迟后隐藏面板
      hideTimerRef.current = setTimeout(() => {
        if (!checkPortalExists() && !isInteractionActiveRef.current) {
          setIsEdgePeeking(false)
        }
      }, 500) // 500ms 延迟，给用户时间继续操作
    }

    prevHasPortal = hasPortal
  })

  observer.observe(document.body, { childList: true, subtree: false })

  return () => observer.disconnect()
}, [edgeSnapState, settings?.edgeSnapHide])
```

#### 2. 修复 autoHidePanel 的点击检测

```typescript
// 排除 Portal 元素，避免点击对话框时关闭面板
const isInsidePanelOrPortal = path.some((el) => {
  if (!(el instanceof Element)) return false
  if (el.closest?.(".gh-main-panel")) return true
  if (el.closest?.(".gh-quick-buttons")) return true
  // 新增：排除 Portal 元素
  if (el.closest?.(".conversations-dialog-overlay")) return true
  if (el.closest?.(".conversations-folder-menu")) return true
  if (el.closest?.(".conversations-tag-filter-menu")) return true
  if (el.closest?.(".prompt-modal")) return true
  return false
})
```

#### 3. 修复 useDraggable 的 React 警告

原代码在 `setDragState` 回调内部调用 `onEdgeSnap`，违反了 React 的渲染规则：

```typescript
// 修复前（有警告）
setDragState((prev) => {
  // ...
  onEdgeSnap?.("left") // ❌ 在状态更新期间触发父组件状态更新
  return { ...prev, isDragging: false }
})

// 修复后（无警告）
setDragState((prev) => {
  return { ...prev, isDragging: false }
})

// 在 setDragState 之后执行
if (edgeSnapHide && hasMoved && panel) {
  setTimeout(() => {
    const rect = panel.getBoundingClientRect()
    if (rect.left < snapThreshold) {
      onEdgeSnap?.("left")
    }
  }, 0)
}
```

### 验证结果

修复后的行为：

1. 面板边缘吸附隐藏 ✓
2. 悬停显示面板 ✓
3. 打开菜单/对话框 → 面板保持显示 ✓
4. 鼠标移到对话框上操作 → 面板保持显示 ✓
5. 关闭对话框 → 500ms 后面板自动隐藏 ✓

### 经验总结

| 教训                   | 说明                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **CSS :hover 不可靠**  | 当有高 z-index 元素覆盖时，`:hover` 会立即失效，不能依赖它实现关键功能              |
| **Portal 的层级影响**  | Portal 渲染到 body 的元素会影响原有 DOM 的鼠标事件和 CSS 伪类                       |
| **MutationObserver**   | 监听 Portal 元素的增删是检测弹窗状态的可靠方式                                      |
| **延迟隐藏的 UX 价值** | 弹窗关闭后延迟 500ms 再隐藏面板，给用户缓冲时间，避免突然隐藏造成的视觉跳跃         |
| **React 渲染期间禁忌** | 不要在 `setState` 回调内部触发其他组件的状态更新，改用 `setTimeout(fn, 0)` 延迟执行 |

### 文件变更

| 文件                        | 变更                                               |
| --------------------------- | -------------------------------------------------- |
| `src/components/App.tsx`    | **修改** - 添加 MutationObserver，修复点击检测逻辑 |
| `src/hooks/useDraggable.ts` | **修改** - 修复 React 渲染警告                     |

---

## 7. Gemini Business 主题切换后面板不同步更新

**日期**: 2026-01-04

### 症状

- 在 Gemini Business 网页切换主题（浅色/深色）后，扩展面板没有跟随更新
- 页面背景颜色已变化，但面板仍保持原来的主题样式
- 该功能在油猴脚本版本中正常工作

### 背景

项目使用 `ThemeManager` 管理主题切换：

1. 使用 `MutationObserver` 监听 `document.body` 的 `class`、`data-theme`、`style` 属性变化
2. 通过 `detectCurrentTheme()` 检测当前页面主题（检查 `dark-theme` 类、`data-theme` 属性、`colorScheme` 样式）
3. 通过 `syncPluginUITheme()` 将主题 CSS 变量注入到 Plasmo 的 Shadow DOM (`plasmo-csui`)

面板使用 Plasmo 框架渲染，运行在 Shadow DOM 内，与页面样式隔离。

### 调试过程

#### 第一轮调试：验证主题检测

在浏览器中进行实地测试，添加调试日志后确认：

```
[ThemeManager] body.class changed: dark-theme
[ThemeManager] Theme changed: light -> dark
```

**发现**：`MutationObserver` 正确触发，主题变化被正确检测。

#### 第二轮调试：验证样式同步

继续测试发现：

- `syncPluginUITheme()` 被正确调用
- 但 Shadow DOM 内的样式没有更新
- 面板按钮的计算样式显示仍使用浅色变量

检查 Shadow Host：

```javascript
const host = document.querySelector("plasmo-csui")
host.className // ""  - 没有任何类
host.shadowRoot.querySelector("#gh-theme-vars") // 样式标签存在但未生效
```

### 根因

**CSS 变量注入到 Shadow DOM 的机制不完整**：

1. `syncPluginUITheme()` 正确创建了 `<style id="gh-theme-vars">` 标签
2. 样式内容使用 `:host { --gh-bg: #1e1e1e; ... }` 格式
3. 但 Shadow DOM 可能存在样式优先级问题，或 CSS 变量未正确继承
4. 原实现没有设置 `color-scheme` 属性和 `data-theme` 属性，导致某些基于属性选择器的样式失效

```
问题分析：
1. Plasmo 静态注入的样式在 Shadow DOM 中可能覆盖动态注入的变量
2. 仅设置 CSS 变量不够，还需要设置 host 的 data-theme 属性
3. 没有强制设置 color-scheme 导致浏览器默认样式不一致
```

### 修复方案

**增强 `syncPluginUITheme()` 方法，添加 `data-theme` 属性和 `color-scheme` 样式**

#### 修改 `src/core/theme-manager.ts`

```typescript
private syncPluginUITheme(mode?: ThemeMode) {
  const currentMode = mode || this.mode
  const root = document.documentElement

  // 从预置系统获取当前主题的 CSS 变量
  const presetId = currentMode === "dark" ? this.darkPresetId : this.lightPresetId
  const preset = getPreset(presetId, currentMode)
  const vars = preset.variables

  // 设置 body 属性
  if (currentMode === "dark") {
    document.body.dataset.ghMode = "dark"
    document.body.style.colorScheme = "dark"
  } else {
    delete document.body.dataset.ghMode
    document.body.style.colorScheme = "light"
  }

  // 在 :root 上设置变量
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }

  // 查找 Plasmo 的 Shadow Host 并在其上设置变量
  const shadowHosts = document.querySelectorAll("plasmo-csui")

  shadowHosts.forEach((host) => {
    const shadowRoot = host.shadowRoot
    if (shadowRoot) {
      let styleEl = shadowRoot.querySelector("#gh-theme-vars") as HTMLStyleElement
      if (!styleEl) {
        styleEl = document.createElement("style")
        styleEl.id = "gh-theme-vars"
      }

      const cssVars = themeVariablesToCSS(vars)

      // ⭐ 关键修复：添加 color-scheme 和 data-theme 选择器
      styleEl.textContent = `:host {
  ${cssVars}
  color-scheme: ${currentMode};
}

:host([data-theme="dark"]),
:host .gh-root[data-theme="dark"] {
  ${cssVars}
}
`
      // ⭐ 关键修复：设置 host 元素的 data-theme 属性
      ;(host as HTMLElement).dataset.theme = currentMode

      // 将样式标签追加到 Shadow Root 末尾以获得最高优先级
      shadowRoot.append(styleEl)
    }
  })
}
```

关键变化：

1. **设置 `data-theme` 属性**：在 Shadow Host (`plasmo-csui`) 上设置 `data-theme="light/dark"`
2. **添加 `color-scheme`**：确保浏览器使用正确的默认颜色方案
3. **增强 CSS 选择器**：添加 `:host([data-theme="dark"])` 选择器，确保样式在所有情况下生效
4. **保持 `shadowRoot.append()`**：将动态样式放在最后以覆盖静态样式

### 验证结果

修复后的浏览器测试：

```
[页面切换到深色模式]
- body.className: "dark-theme"
- plasmo-csui[data-theme]: "dark"
- 面板背景: 深蓝色/黑色 ✓

[页面切换到浅色模式]
- body.className: ""
- plasmo-csui[data-theme]: "light"
- 面板背景: 浅色 ✓
```

主题切换后面板在 1 秒内自动响应，与页面主题保持同步。

### 经验总结

| 教训                                   | 说明                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| **Shadow DOM 样式隔离**                | Shadow DOM 内的样式需要显式注入，不能依赖外部选择器（如 `body.dark-theme`）  |
| **data-theme 属性的重要性**            | 某些 CSS 框架和组件依赖 `data-theme` 属性选择器，仅靠 CSS 变量可能不够       |
| **color-scheme 属性**                  | 设置 `color-scheme` 可以影响浏览器默认 UI（如滚动条、输入框）的颜色          |
| **MutationObserver 监听正确**          | 问题不在检测，而在同步机制——要区分\"检测到变化\"和\"应用变化\"两个阶段的问题 |
| **Gemini Business 使用 dark-theme 类** | 不同于某些网站使用 `data-theme` 属性，Gemini Business 使用 body 的 CSS 类    |

### 文件变更

| 文件                        | 变更                                                 |
| --------------------------- | ---------------------------------------------------- |
| `src/core/theme-manager.ts` | **修改** - 增强 `syncPluginUITheme()` 方法的同步机制 |

---

## 8. WebDAV 恢复后主题同步失效与数据覆盖问题

**日期**: 2026-01-04

### 症状

- 用户执行 WebDAV 恢复后，页面刷新，但主题模式和配色方案（预置）未能正确恢复，被重置为默认值或错误值。
- 控制台日志显示：恢复时数据写入成功，但页面刷新后 `App` 初始化时又读取到了旧值。
- "清除全部数据"后执行备份，生成的备份文件中缺失 `language`、`themeMode`、`themePresets` 等关键设置。
- WebDAV 测试连接时，Manager 读取不到用户刚刚填写的配置。

### 背景

项目使用 Plasmo 的 `useStorage` Hook 管理设置，结合 `WebDAVSyncManager` 进行云端备份恢复。`ThemeManager` 负责应用主题。恢复流程涉及：下载备份 -> 写入 Storage -> 刷新页面 -> 重新初始化。

### 调试过程

#### 第一轮调试：发现数据覆盖

日志分析：

1. 恢复操作日志显示 `themePresets` 已正确写入 Storage：`{ light: 'A', dark: 'B' }`。
2. 页面刷新后，`main.ts` 正确读取并应用了 `{ light: 'A', dark: 'B' }`。
3. 紧接着，`App.tsx` 中的 `useStorage` 触发更新，日志显示它读取到了 **旧值** `{ light: 'default', dark: 'default' }`。
4. `App.tsx` 调用 `setPresets` 将旧值再次写入 Storage，导致数据被覆盖。

**根因 1**：**Plasmo `useStorage` 的缓存机制**。在页面刷新后的短时间内，`useStorage` 可能会先返回缓存的旧值，然后才从底层 Storage 读取新值。这导致组件在初始化阶段错误地用旧缓存覆盖了 `main.ts` 正确初始化的设置。

#### 第二轮调试：发现备份不完整

用户反馈执行"清除全部数据"后备份，恢复时还是有问题。检查备份文件内容发现 `settings` 对象只包含 `webdav` 字段，其他字段均为 `undefined`。

**根因 2**：**内存状态与 Storage 不同步**。清除数据后，Storage 为空。用户在 UI 上操作时，React 状态（内存）使用了默认值，但并未写入 Storage（除非用户显式修改）。WebDAV 备份时直接读取 Storage，因此只备份了被修改过的 `webdav` 配置，丢失了内存中的默认/当前设置。

#### 第三轮调试：配置读取延迟

用户反馈填写配置后立即点"测试连接"或"备份"失败。

**根因 3**：**Storage 写入异步延迟**。用户输入配置 -> `setSettings` 写入 Storage（异步） -> 用户点击按钮 -> Manager 读取 Storage。如果写入尚未完成，Manager 读到空配置。

### 修复方案

#### 1. 解决数据覆盖（Race Condition）

在 `App.tsx` 中引入**启动保护期**：

```typescript
const pageLoadTime = useRef(Date.now())
const hasInitializedPresets = useRef(false)

useEffect(() => {
  const timeSinceLoad = Date.now() - pageLoadTime.current
  
  // 关键修复：跳过页面加载后 3 秒内的所有 setPresets 调用
  // 1. main.ts 已经在启动时同步读取 Storage 并应用了正确主题
  // 2. 避免 Plasmo useStorage 在初始化阶段用缓存的旧值覆盖正确设置
  if (timeSinceLoad < 3000) {
    return
  }
  
  // ... 正常逻辑
}, [...])
```

#### 2. 确保备份完整性

在 `SettingsTab.tsx` 执行备份前，强制将当前内存中的完整 `settings` 对象写入 Storage：

```typescript
// 备份前
await new Promise<void>((resolve, reject) =>
  chrome.storage.local.set(
    { settings: JSON.stringify(settings) }, // 强制写入完整 settings
    () => resolve()
  )
)
// ... 执行上传
```

#### 3. 实时同步 WebDAV 配置

在测试连接、备份、恢复操作前，显式调用 `manager.saveConfig()` 将当前 UI 状态同步给 Manager，不完全依赖 Storage 读取。

#### 4. 彻底的数据清理

修改"清除全部数据"逻辑，同时清除 `chrome.storage.local` 和 `chrome.storage.sync`：

```typescript
await Promise.all([
  chrome.storage.local.clear(),
  chrome.storage.sync.clear()
])
```

### 经验总结

| 教训| 说明|
| :---| :---|
| **Storage Hook 缓存陷阱** | 封装良好的 Storage Hooks（如 Plasmo useStorage）通常有缓存策略。在跨组件/跨进程（Extension vs Web Page）同步数据时，需警惕缓存导致的“旧值覆盖新值”问题。 |
| **启动保护机制** | 对于应用关键状态（如主题），在应用启动初期（Hydration 阶段）应限制写操作，信任初始化引导逻辑（如 `main.ts`）的结果。 |
| **内存 vs 持久化** | 永远不要假设 UI 上看到的值等于 Storage 中的值。在执行关键 IO 操作（如备份）前，显式持久化当前状态是最安全的。 |
| **异步一致性** | 涉及 Storage IO 的操作链（如配置 -> 保存 -> 读取 -> 测试），必须处理好异步时序，或通过内存传参规避读取延迟。 |

### 文件变更

| 文件| 变更|
| :---| :---|
| `src/components/App.tsx`| **修改** - 添加启动保护逻辑，3秒内禁止覆盖主题设置 |
| `src/components/SettingsTab.tsx` | **修改** - 优化备份前完整写入、操作前配置同步、彻底清除数据 |
| `src/core/webdav-sync.ts` | **修改** - 增强恢复数据的验证和日志，优化配置加载和保存逻辑 |
