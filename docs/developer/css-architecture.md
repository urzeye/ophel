# Ophel Atlas CSS 与样式注入架构

本文档说明项目的样式隔离边界、双平台（浏览器扩展 + 油猴脚本）注入链路、主题运行时机制与常见样式排查。视觉规范、设计令牌和硬约束以根目录 [DESIGN.md](../../DESIGN.md)（尤其是附录 B）为准，本文只讲底层机制。

## 1. 四类执行环境与样式边界

| 环境                | 典型容器 / 挂载点                          | 样式特点与注入要求                                                    |
| ------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| 扩展 Shadow DOM     | `<plasmo-csui>` 的 shadowRoot              | 样式完全隔离，普通 `import "*.css"` 进不去；首屏走 `getStyle()`，非首屏走 `<link>` 懒加载 |
| 油猴 Shadow DOM     | `<div id="ophel-userscript-root">`         | 同属 Shadow DOM；由 `src/platform/userscript/entry.tsx` 注入 `@resource` 合并样式 |
| 主文档（宿主页）    | `document.head` / `document.body`          | Portal 弹窗（`DialogOverlay` 等）、`::view-transition-*`、页面增强（如提问 Markdown）必须注入这里 |
| 第三方 Shadow DOM   | Gemini Enterprise 的 `<ucs-fast-markdown>` | 宿主页本身嵌套 Shadow DOM，页面增强样式需直接 `shadowRoot.prepend(style)` |

## 2. 样式文件与来源速查

项目使用纯原生 CSS（无预处理器、无 CSS-in-JS），CSS 类名前缀延续历史命名 `gh-`，变量前缀统一为 `--gh-*`。

| 类别           | 文件路径                                              | 作用范围 / 注入目标              | 注入方式                                                   |
| -------------- | ----------------------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| 首屏面板主样式 | `src/style.css`                                       | 扩展 / 油猴 Shadow DOM           | 扩展：`data-text:` + `getStyle()`；油猴：打包进 `@resource` |
| 对话 Tab 样式  | `src/styles/conversations.css`                        | 扩展 / 油猴 Shadow DOM           | 同上（对话 Tab 可设为首标签，必须首屏同步可用）            |
| 主题变量默认值 | `src/styles/theme-variables.css`                      | Shadow DOM + Options 页          | 被 `style.css` 与 `options.css` 通过 `@import` 引入        |
| 设置页/弹窗    | `src/styles/settings.css`                             | Shadow DOM（弹窗）+ Options 页   | 扩展弹窗：`url:` + `registerPanelLazyStyles()`；Options 页直接导入 |
| 发布说明弹窗   | `src/styles/release-notes.css`                        | Shadow DOM + Options 页          | 同上，懒加载                                               |
| 队列悬浮层     | `src/styles/queue-overlay.css`                        | 扩展 / 油猴页面                  | 组件导入 / 油猴合并资源                                    |
| 扩展独立页     | `src/tabs/options.css`、`src/popup.css`               | Options 独立页、Popup 弹窗       | 常规 CSS 导入（`options.css` 导入 `theme-variables` / `settings` / `release-notes`） |
| Portal 内联样式 | `src/components/ui/Dialog.tsx`、`src/styles/conversation-sync-review-inline.ts`、`src/styles/image-export-inline.ts` 等 `*-inline.ts` | 主文档 `document.head`           | 扩展与油猴共享的 TS 字符串，按需注入 `<style>`             |
| 页面增强内联   | `src/core/user-query-markdown.ts`、`src/utils/markdown.ts`、`src/core/theme-manager.ts` | `document.head` 或第三方 Shadow DOM | 运行时动态创建 `<style>` 注入                              |
| 原生主题适配器 | `src/styles/native-theme-adapters/*.ts`（7 个站点）   | 同步宿主页颜色到 `--gh-*`        | `ThemeManager` 按当前站点调度                              |

## 3. Shadow DOM 注入顺序（核心机制）

Shadow Root 内所有样式必须维持严格顺序，保证**动态主题变量永远压在最底部**：

```html
<plasmo-csui> <!-- 油猴端为 #ophel-userscript-root -->
  #shadow-root (open)
    <style>/* 1. 首屏同步样式（扩展含 Inter @font-face + style.css + conversations.css + 主题缓存） */</style>
    <link rel="stylesheet" data-ophel-lazy-style="settings">      <!-- 2. 懒加载样式，强制插在 #gh-theme-vars 之前 -->
    <link rel="stylesheet" data-ophel-lazy-style="release-notes">
    <style id="gh-theme-vars">/* 3. ThemeManager 注入的当前主题变量，始终 append() 在末尾 */</style>
    <div class="gh-root">...</div>
</plasmo-csui>
```

关键细节：

1. **防闪烁（FOUC）**：扩展端（`ophel_ext_theme_cache`）与油猴端（`ophel_us_theme_cache`）在首帧都会从 `localStorage` 预读上次的主题变量拼进首个 `<style>`。
2. **懒加载占位规则**：`src/utils/panel-lazy-styles.ts` 在空闲时预加载、打开设置或发布说明时立即兜底注入；插入 `<link>` 时会先查 `#gh-theme-vars`，存在则 `insertBefore(link, themeStyle)`，避免后加载的样式盖掉主题变量。
3. **字体注入差异**：扩展端在 `ui-entry.tsx` 的 `getStyle()` 里注册打包字体 `assets/fonts/InterVariable.woff2`（`unicode-range` 排除 CJK/韩文防缺字），油猴端不打包字体文件，按本机 Inter → 平台系统栈回退；`applyOphelPlatformFontClass()` 给 Shadow Host 挂 `.gh-platform-macos` 等类名调整中文字体优先级。

## 4. 主题系统运行时

- **24 套预置**：12 套浅色（`src/utils/themes/light/index.ts`，默认 `google-gradient`）+ 12 套深色（`src/utils/themes/dark/index.ts`，默认 `classic-dark`）；类型在 `src/utils/themes/types.ts`，工具函数在 `helpers.ts`。
- **`ThemeManager`（`src/core/theme-manager.ts`）职责**：
  - 监听宿主页 `html` / `body` 的 `class`、`data-theme`、`style` 变化以判断页面明暗；
  - 将当前预置（及用户自定义样式、原生主题适配映射）同时写入 `<html>` 与 Shadow Root 末尾的 `<style id="gh-theme-vars">`；
  - 向 Shadow Host 写入 `data-theme="dark" | "light"`；
  - 向 `document.head` 注入 `::view-transition-*` 样式以支持圆形扩散切换动画。
- **跨浏览器深浅选择器**：Shadow DOM 内部统一写 `:host([data-theme="dark"])`。**禁用 `:host-context()`**——Firefox 不支持，且同一条规则的选择器列表里只要混入无效选择器，整条规则都会被浏览器丢弃。
- **Portal 弹窗读变量**：Portal 到 `document.body` 的弹窗不在 Shadow DOM 内，拿不到 `theme-variables.css` 的默认值，只能继承 `ThemeManager` 写在 `<html>` 上的预置变量。读取派生变量（如 `--gh-primary-text`、`--gh-surface`）时必须写完整回退链，例如 `var(--gh-primary-text, var(--gh-primary, #4285f4))`。

## 5. 新增样式决策清单

1. **面板首屏必需样式**（如主面板、大纲、提示词、对话 Tab）：写进 `src/style.css` 或 `src/styles/conversations.css`；若必须拆新文件，需同步接入 `ui-entry.tsx` 的 `getStyle()` 以及油猴打包样式清单。
2. **面板非首屏大块样式**（如弹窗子系统）：用 `url:` 导入并在 `ui-entry.tsx` 调用 `registerPanelLazyStyles()`，同时确认 Options 页和油猴端是否需要引入。
3. **Portal 到 `document.body` 的弹窗样式**：放在共享内联样式模块（如 `src/styles/*-inline.ts` 或组件内 `inject*Styles`）按需注入 `document.head`，确保扩展与油猴两端一致。
4. **作用于宿主页或第三方 Shadow DOM 的增强样式**：内嵌在 TS 中，按站点形态注入 `document.head` 或目标 `shadowRoot.prepend(style)`。
5. **文档根级伪元素动画**（如 `::view-transition-*`）：统一在 `ThemeManager` 中注入 `document.head`，不要放进 Shadow DOM CSS。

## 6. 常见样式陷阱速查

- **组件里 `import "./foo.css"` 不生效**：普通 import 进不了 Shadow DOM；按上节 1 / 2 走 `getStyle()` 或 `panel-lazy-styles`。
- **深色模式局部仍显示浅色**：检查 `#gh-theme-vars` 是否被后插的样式盖住，以及深色派生变量是否在 `html[data-theme="dark"]` 与 `:host([data-theme="dark"])` 两处都声明了。
- **Firefox 下整条样式规则神秘失效**：排查是否误用了 `:host-context()`，或把浏览器私有选择器跟通用选择器写进了同一组逗号选择器里。
- **View Transitions 动画闪烁或不生效**：确认规则注入在 `document.head` 而不是 Shadow DOM。
- **代码高亮与页面增强样式打架**：注意 `getHighlightStyles()` 与用户提问 Markdown 样式的注入顺序，必要时提高选择器具体度（如 `.gh-user-query-markdown pre code`）。
- **ChatGPT / Next.js 站点面板闪一下就消失**：宿主 React Hydration 清除了 `body` 下的新增节点，挂载与重挂载机制见 [troubleshooting.md #13](./troubleshooting.md#13-chatgpt-面板被-react-hydration-清除)。
