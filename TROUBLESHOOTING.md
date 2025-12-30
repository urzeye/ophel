# Chat Helper Extension 疑难杂症排查手册

> 记录浏览器扩展开发过程中遇到的问题及其解决方案，供后续参考。

---

## 📋 目录

1. [Plasmo CSUI Shadow DOM 样式隔离](#1-plasmo-csui-shadow-dom-样式隔离)

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
