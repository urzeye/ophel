# Ophel Atlas Extension CSS 架构指南

> 本文档详细说明项目中 CSS 的使用方法、注入机制和约束条件。
> 供开发者和 AI 分析问题时参考。

---

## 📋 目录

1. [核心概念：执行环境与样式隔离](#1-核心概念执行环境与样式隔离)
2. [CSS 文件分类与用途](#2-css-文件分类与用途)
3. [样式注入机制详解](#3-样式注入机制详解)
4. [主题系统架构](#4-主题系统架构)
5. [样式文件索引](#5-样式文件索引)
6. [常见问题与陷阱](#6-常见问题与陷阱)
7. [决策树：如何添加新样式](#7-决策树如何添加新样式)

---

## 1. 核心概念：执行环境与样式隔离

### 1.1 三种执行环境

项目涉及三种不同的 JavaScript/CSS 执行环境，理解它们的边界是正确使用样式的关键：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           浏览器标签页                                    │
├─────────────────┬────────────────────────┬──────────────────────────────┤
│   隔离世界        │      主世界             │        Shadow DOM            │
│  (Isolated)      │     (Main)              │      (Encapsulated)          │
├─────────────────┼────────────────────────┼──────────────────────────────┤
│ Content Script  │ 页面脚本 (Gemini)        │ Plasmo CSUI                  │
│ 默认运行环境      │ scroll-lock-main.ts     │ <plasmo-csui>                │
│                 │                         │                              │
│ • 可访问 DOM     │ • 可修改全局 API         │ • 样式完全隔离               │
│ • 无法修改原型链  │ • 受 CSP 限制           │ • 需要特殊方式注入 CSS       │
└─────────────────┴────────────────────────┴──────────────────────────────┘
```

### 1.2 Shadow DOM 样式隔离

**关键规则**：Shadow DOM 内的元素只能被 Shadow DOM 内部的样式影响。

```
外部样式表 ──→ 无法穿透 ──→ Shadow DOM 内部元素
                │
                ↓
       必须通过 getStyle() 注入
```

Plasmo 框架将 React 组件渲染在 `<plasmo-csui>` 元素的 Shadow DOM 内：

```html
<plasmo-csui>
  #shadow-root (open)
  <style>
    /* 通过 getStyle() 注入的样式 */
  </style>
  <div class="gh-root">
    <!-- 插件 UI 组件 -->
  </div>
</plasmo-csui>
```

### 1.3 Gemini Enterprise 的双重 Shadow DOM

Gemini Enterprise (business.gemini.google) 页面本身使用 Shadow DOM：

```
document
└── 页面元素
    └── <ucs-fast-markdown>
        └── #shadow-root (Gemini 的 Shadow DOM)
            └── 用户提问内容
```

这意味着某些功能（如用户提问 Markdown 渲染）需要将样式注入到 **Gemini 的 Shadow DOM** 中，而不是 Plasmo 的。

---

## 2. CSS 文件分类与用途

### 2.1 静态 CSS 文件（通过 Plasmo `getStyle()` 注入）

这些文件的样式会被注入到 **Plasmo 的 Shadow DOM** 中，用于插件 UI 组件。

| 文件                             | 用途                                             | 注入方式                              |
| -------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `src/style.css`                  | 主样式文件，包含面板、大纲、工具栏等核心 UI 样式 | `data-text:~style.css`                |
| `src/styles/conversations.css`   | 会话 Tab 专用样式，从油猴脚本迁移                | `data-text:~styles/conversations.css` |
| `src/styles/theme-variables.css` | CSS 变量定义（浅色/深色模式默认值）              | 被 `style.css` 通过 `@import` 引入    |

**注入代码** (`src/contents/ui-entry.tsx`)：

```typescript
import cssText from "data-text:~style.css"
import conversationsCssText from "data-text:~styles/conversations.css"

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText + "\n" + conversationsCssText
  return style
}
```

### 2.2 动态注入的 CSS（内嵌在 TypeScript 中）

这些样式需要动态注入到**主世界的 `document.head`** 或 **Gemini 的 Shadow DOM** 中，因此作为字符串内嵌在 TS 文件里。

| 文件                                             | 样式用途                    | 注入目标                                    |
| ------------------------------------------------ | --------------------------- | ------------------------------------------- |
| `src/core/user-query-markdown.ts`                | 用户提问 Markdown 渲染样式  | 主世界 `document.head` 或 Gemini Shadow DOM |
| `src/utils/markdown.ts` (`getHighlightStyles()`) | 代码高亮样式 (highlight.js) | 多个上下文复用                              |
| `src/core/theme-manager.ts`                      | View Transitions 动画样式   | 主世界 `document.head`                      |

**为什么不抽离成独立 CSS 文件？**

1. **注入目标不是 Plasmo Shadow DOM**：`getStyle()` 只能注入到 Plasmo 的 Shadow DOM
2. **需要在运行时动态注入**：根据页面类型（普通版/Enterprise）注入到不同位置
3. **需要作为字符串拼接**：与其他样式组合后注入

```typescript
// user-query-markdown.ts 的注入逻辑
private injectGlobalStyles() {
  const style = document.createElement("style")
  style.textContent = getHighlightStyles() + "\n" + USER_QUERY_MARKDOWN_CSS
  document.head.appendChild(style)  // 注入到主世界
}

private injectStyleToShadowRoot(shadowRoot: ShadowRoot) {
  // Gemini Enterprise：注入到页面的 Shadow DOM
  const style = document.createElement("style")
  style.textContent = getHighlightStyles() + "\n" + USER_QUERY_MARKDOWN_CSS
  shadowRoot.prepend(style)
}
```

### 2.3 主题预置（TypeScript 对象）

主题变量定义在 TypeScript 中，以便支持多主题预置系统。

| 文件                              | 用途                                       |
| --------------------------------- | ------------------------------------------ |
| `src/utils/themes/index.ts`       | 主题系统入口，导出预置列表和工具函数       |
| `src/utils/themes/types.ts`       | 类型定义 (`ThemePreset`, `ThemeVariables`) |
| `src/utils/themes/light/index.ts` | 浅色主题预置 (10+ 种配色方案)              |
| `src/utils/themes/dark/index.ts`  | 深色主题预置 (10+ 种配色方案)              |

---

## 3. 样式注入机制详解

### 3.1 Plasmo Shadow DOM 样式注入流程

```
编译时:
  style.css + conversations.css
       │
       ↓ (data-text: 导入)
  ui-entry.tsx 中的 getStyle()
       │
       ↓ (Plasmo 框架调用)
运行时:
  创建 <style> 元素
       │
       ↓
  插入到 <plasmo-csui> 的 Shadow Root 中
```

### 3.2 主题变量动态注入流程

```
ThemeManager.syncPluginUITheme()
       │
       ↓
  1. 从预置系统获取 CSS 变量对象
       │
       ↓
  2. 生成 :host { --gh-bg: ...; } 样式文本
       │
       ↓
  3. 插入/更新 Shadow Root 中的 <style id="gh-theme-vars">
       │
       ↓ (关键!)
  4. 使用 shadowRoot.append() 将样式移到末尾
      以确保覆盖 getStyle() 注入的默认样式
```

**为什么需要 `append()` 到末尾？**

CSS 优先级规则：当选择器特异性相同时，后出现的规则覆盖先出现的。

```
<plasmo-csui>
  #shadow-root
    <style>/* getStyle() 注入，包含默认浅色变量 */</style>
    <style id="gh-theme-vars">/* 主题变量，必须在后面 */</style>
    <div class="gh-root">...</div>
```

### 3.3 用户提问 Markdown 样式注入流程

```
UserQueryMarkdownRenderer 初始化
       │
       ├─ 普通站点 (gemini.google.com)
       │       │
       │       ↓
       │   injectGlobalStyles()
       │       │
       │       ↓
       │   document.head.appendChild(style)
       │
       └─ Shadow DOM 站点 (business.gemini.google)
               │
               ↓
           injectStyleToShadowRoot(shadowRoot)
               │
               ↓
           geminiShadowRoot.prepend(style)
```

---

## 4. 主题系统架构

### 4.1 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         主题系统架构                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐     ┌─────────────────┐                        │
│  │ theme-variables │     │  themes/light/  │                        │
│  │      .css       │     │    index.ts     │                        │
│  │                 │     │                 │                        │
│  │ 默认 CSS 变量    │     │ 浅色预置方案     │                        │
│  │ (静态注入)       │     │ (10+ 种配色)     │                        │
│  └────────┬────────┘     └────────┬────────┘                        │
│           │                       │                                 │
│           ↓                       ↓                                 │
│  ┌─────────────────────────────────────────┐                        │
│  │            ThemeManager                  │                        │
│  │                                          │                        │
│  │  • 检测页面主题 (light/dark)             │                        │
│  │  • 根据用户选择加载预置                  │                        │
│  │  • 生成 CSS 变量并注入到 Shadow DOM     │                        │
│  │  • 监听页面主题变化 (MutationObserver)  │                        │
│  └─────────────────────────────────────────┘                        │
│                       │                                             │
│                       ↓                                             │
│  ┌─────────────────────────────────────────┐                        │
│  │  <style id="gh-theme-vars">             │                        │
│  │    :host {                              │                        │
│  │      --gh-bg: #1e1e1e;                  │                        │
│  │      --gh-text: #e3e3e3;                │                        │
│  │      ...                                │                        │
│  │    }                                    │                        │
│  │  </style>                               │                        │
│  │                                          │                        │
│  │  动态注入到 plasmo-csui Shadow Root     │                        │
│  └─────────────────────────────────────────┘                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 CSS 变量命名规范

所有 CSS 变量使用 `--gh-` 前缀（Ophel）：

| 变量类别 | 示例                                 | 说明          |
| -------- | ------------------------------------ | ------------- |
| 背景色   | `--gh-bg`, `--gh-bg-secondary`       | 基础背景颜色  |
| 文字色   | `--gh-text`, `--gh-text-secondary`   | 文字颜色层级  |
| 边框     | `--gh-border`, `--gh-border-active`  | 边框颜色      |
| 交互状态 | `--gh-hover`, `--gh-active-bg`       | 悬停/点击状态 |
| 品牌色   | `--gh-primary`, `--gh-header-bg`     | 主题色/渐变   |
| 阴影     | `--gh-shadow`, `--gh-shadow-sm`      | 阴影效果      |
| 输入框   | `--gh-input-bg`, `--gh-input-border` | 表单元素      |
| 大纲     | `--gh-outline-locate-bg`             | 大纲面板专用  |
| 危险操作 | `--gh-danger`, `--gh-text-danger`    | 删除/警告     |

### 4.3 主题预置结构

```typescript
// src/utils/themes/types.ts
export interface ThemePreset {
  id: string         // 唯一标识，如 "google-gradient"
  name: string       // 显示名称，如 "Google 渐变"
  description: string
  variables: ThemeVariables  // CSS 变量键值对
}

// 示例
{
  id: "classic-dark",
  name: "经典深黑",
  description: "默认深色主题",
  variables: {
    "--gh-bg": "#1e1e1e",
    "--gh-text": "#e3e3e3",
    // ... 约 50+ 个变量
  }
}
```

---

## 5. 样式文件索引

### 5.1 完整文件清单

```
src/
├── style.css                          # 主样式文件
├── styles/
│   ├── theme-variables.css            # CSS 变量默认值
│   └── conversations.css              # 会话 Tab 样式
├── utils/
│   ├── themes.ts                      # 主题系统入口
│   ├── themes/
│   │   ├── index.ts                   # 预置列表和工具函数
│   │   ├── types.ts                   # 类型定义
│   │   ├── light/index.ts             # 浅色预置 (10+ 种)
│   │   └── dark/index.ts              # 深色预置 (10+ 种)
│   └── markdown.ts                    # getHighlightStyles() - 代码高亮样式
├── core/
│   ├── theme-manager.ts               # 主题管理器 (View Transitions 样式)
│   └── user-query-markdown.ts         # 用户提问 Markdown 样式
└── contents/
    └── ui-entry.tsx                   # getStyle() - 静态样式注入
```

### 5.2 样式来源速查表

| 样式类型         | 定义位置                                | 注入目标                   | 注入方式                |
| ---------------- | --------------------------------------- | -------------------------- | ----------------------- |
| 面板框架         | `style.css`                             | Plasmo Shadow DOM          | `getStyle()`            |
| 大纲组件         | `style.css`                             | Plasmo Shadow DOM          | `getStyle()`            |
| 会话列表         | `conversations.css`                     | Plasmo Shadow DOM          | `getStyle()`            |
| 提示词 Tab       | `style.css`                             | Plasmo Shadow DOM          | `getStyle()`            |
| CSS 变量默认值   | `theme-variables.css`                   | Plasmo Shadow DOM          | `@import` by style.css  |
| 主题预置变量     | `themes/light/*.ts`, `themes/dark/*.ts` | Plasmo Shadow DOM          | `ThemeManager` 动态注入 |
| 代码高亮         | `markdown.ts`                           | 多个上下文                 | 函数返回字符串          |
| 用户提问渲染     | `user-query-markdown.ts`                | 主世界 / Gemini Shadow DOM | 动态创建 `<style>`      |
| View Transitions | `theme-manager.ts`                      | 主世界 `document.head`     | 动态创建 `<style>`      |

---

## 6. 常见问题与陷阱

### 6.1 Shadow DOM 样式不生效

**症状**：在组件中 `import` 的 CSS 完全不生效。

**原因**：普通 `import` 的 CSS 无法穿透 Shadow DOM。

**解决**：

1. 使用 `data-text:` 前缀导入为字符串
2. 在 `ui-entry.tsx` 的 `getStyle()` 中合并

```typescript
// ❌ 错误
import "./my-component.css"

// ✅ 正确
// ui-entry.tsx
import myComponentCss from "data-text:~styles/my-component.css"

export const getStyle = () => {
  style.textContent = cssText + "\n" + myComponentCss
  return style
}
```

### 6.2 主题变量被覆盖

**症状**：深色模式下某些变量仍显示浅色值。

**原因**：`getStyle()` 注入的样式在动态主题样式之后。

**解决**：确保 `ThemeManager` 使用 `shadowRoot.append()` 将主题样式移到末尾。

### 6.3 样式冲突

**症状**：不同来源的样式相互覆盖（如代码块样式）。

**案例**：`getHighlightStyles()` 中的 `.hljs` 与 `user-query-markdown.ts` 中的样式冲突。

**解决**：

1. 调整 CSS 加载顺序（先加载可被覆盖的）
2. 使用更具体的选择器（如 `.gh-user-query-markdown pre code`）

### 6.4 View Transitions 样式不生效

**症状**：主题切换动画不显示或闪烁。

**原因**：`::view-transition-*` 伪元素在 Document Root 上，Shadow DOM 内的样式无法影响。

**解决**：在 `ThemeManager.injectGlobalStyles()` 中向 `document.head` 注入。

### 6.5 ChatGPT 面板被 React Hydration 清除

**症状**：面板在 ChatGPT 页面刷新后短暂显示后消失。

**原因**：ChatGPT 的 React Hydration 会清除 `document.body` 下的非预期元素。

**尝试的方案**：

1. **挂载到 `<html>`**（已放弃）：避开 Hydration，但引发 Portal 渲染、pointer-events、z-index 等连锁问题
2. **body 挂载 + 延迟监控**（采用）：ChatGPT 特殊处理，其他站点不受影响

**解决**：在 `ui-entry.tsx` 中实现 `mountShadowHost`，对 ChatGPT 使用延迟挂载 + MutationObserver 监控重挂载。

**Portal 渲染规则**：

| 挂载位置                   | Portal 目标       | 适用场景                      |
| -------------------------- | ----------------- | ----------------------------- |
| `document.body`            | `document.body`   | 默认方案，简单可靠            |
| `document.documentElement` | Shadow DOM 内容器 | 需要额外的 Context 和样式处理 |

详见 [troubleshooting.md #12](./troubleshooting.md#12-chatgpt-面板被-react-hydration-清除)。

---

## 7. 决策树：如何添加新样式

```
开始：我需要添加新样式
       │
       ↓
这些样式用于什么？
       │
       ├─ 插件 UI 组件 (面板/Tab/弹窗)
       │       │
       │       ↓
       │   添加到 style.css 或创建新 CSS 文件
       │   并在 ui-entry.tsx 中合并
       │
       ├─ 需要注入到主世界 (页面增强功能)
       │       │
       │       ↓
       │   在 TS 文件中内嵌 CSS 字符串
       │   使用 document.head.appendChild() 注入
       │
       ├─ 需要注入到第三方 Shadow DOM (Gemini Enterprise)
       │       │
       │       ↓
       │   在 TS 文件中内嵌 CSS 字符串
       │   使用 shadowRoot.prepend() 注入
       │
       └─ 全局动画/过渡效果
               │
               ↓
           在 ThemeManager.injectGlobalStyles() 中添加
           或创建专门的全局样式注入函数
```

---

## 📚 相关文档

- [troubleshooting.md](./troubleshooting.md) - 详细的问题排查案例
- [Plasmo 官方文档 - CSUI](https://docs.plasmo.com/framework/content-scripts-ui)
- [Shadow DOM 样式隔离](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)

---

## 📝 更新日志

| 日期       | 内容                                      |
| ---------- | ----------------------------------------- |
| 2026-01-11 | 添加 ChatGPT 面板挂载与 Portal 渲染的说明 |
| 2026-01-07 | 创建文档，整理 CSS 架构                   |
