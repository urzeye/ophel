# Chat Helper Extension 疑难杂症排查手册

> 记录浏览器扩展开发过程中遇到的问题及其解决方案，供后续参考。

---

## 📋 目录

1. [Plasmo CSUI Shadow DOM 样式隔离](#1-plasmo-csui-shadow-dom-样式隔离)
2. [Plasmo Shadow DOM 样式注入顺序与 CSS 优先级冲突](#2-plasmo-shadow-dom-样式注入顺序与-css-优先级冲突)

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
