# 浏览器原生侧边栏模式改造方案

> 状态：已实现；静态检查、打包、userscript 隔离搜索、Edge/Chromium 自动冒烟和 Firefox lint 已通过，Chrome/Firefox 实机手动冒烟待执行
> 日期：2026-07-01
> 适用范围：浏览器扩展版 Chrome / Edge / Firefox
> 非适用范围：油猴脚本版继续使用现有页内面板

## 结论

可以单独给浏览器扩展版增加原生 sidebar 模式，并且不影响油猴脚本。推荐实现为“浏览器原生侧边栏 + 当前标签页 content script 消息桥”，而不是把现有 `App` / `MainPanel` 直接搬进 sidebar。

核心原因是：原生 sidebar 是扩展页面，不能直接访问 Gemini、ChatGPT、Claude 等页面 DOM；当前 `App.tsx` 会通过 `getAdapter()` 直接创建 `PromptManager`、`ConversationManager`、`OutlineManager`，这些 manager 都依赖当前网页 DOM 和站点适配器。因此 sidebar 页面只负责显示和发出命令，真实页面操作仍由 content script 内的 adapter / manager 执行。

## 目标

- 浏览器扩展用户可以在设置中选择“页内面板”或“浏览器侧边栏”。
- 页内面板保留现有 `edge-snap` 和 `floating` 两种模式。
- 浏览器侧边栏模式下，页面不再被 `.gh-main-panel` 大面板遮挡。
- 侧边栏中的大纲、会话、Prompt 操作仍作用于当前活动的受支持 AI 页面。
- Chrome / Edge 使用 Chromium `side_panel` 能力。
- Firefox 使用 `sidebar_action` 能力。
- 油猴脚本不展示、不导入、不执行原生 sidebar 相关逻辑。
- 旧设置和备份数据静默兼容，默认仍使用页内面板。

## 非目标

- 不移除现有页内面板。
- 不把油猴脚本改造成 sidebar。
- 不承诺精确控制浏览器侧边栏外层宽度；原生 sidebar 宽度主要由浏览器 UI 和用户拖拽控制。
- 不把站点专属 DOM 选择器或 adapter 逻辑泄漏到 sidebar UI 组件。
- 不在第一版追求所有页内面板交互的完全等价，优先完成可用 MVP。

## 初始基线

- `package.json` 的 base manifest 不写 `side_panel`、`sidebar_action` 或 `sidePanel` 权限，浏览器目标差异由 postbuild patch 处理。
- 改造前 `.plasmo/sidepanel.html` 已存在生成模板，但构建产物 manifest 没引用它。
- `src/contents/ui-entry.tsx` 把页内 React 面板挂载到 Plasmo Shadow DOM。
- `src/components/App.tsx` 直接依赖 `getAdapter()` 和当前网页 DOM。
- 改造前 `src/utils/storage.ts` 与 `src/stores/settings-store.ts` 只接受 `panel.panelMode: "edge-snap" | "floating"`。
- `vite.userscript.config.ts` 使用独立 Vite 油猴构建入口 `src/platform/userscript/entry.tsx`，没有浏览器 sidebar API。

## 总体架构

```text
Browser sidebar page
  |
  | chrome.runtime.sendMessage(MSG_SIDEBAR_*)
  v
Background service worker
  |
  | 查询当前活动标签页
  | chrome.tabs.sendMessage(activeTab.id, MSG_SIDEBAR_*)
  v
Content script on supported AI page
  |
  | 复用现有 adapter / manager / Zustand stores
  v
Page DOM, outline navigation, prompt insertion, conversation actions
```

### 模块边界

| 模块                           | 职责                                                  |
| ------------------------------ | ----------------------------------------------------- |
| `src/sidepanel.tsx`          | 浏览器 sidebar 页面入口，只存在于扩展构建。           |
| `src/components/sidebar/*`   | sidebar 专用 UI，不直接访问页面 DOM。                 |
| `src/background.ts`          | 打开 sidebar、查询活动标签页、转发 sidebar 命令。     |
| `src/components/App.tsx`     | 在 content script React app 内注册 sidebar bridge，并按 `panelPlacement` 控制页内面板渲染。 |
| `src/core/sidebar-bridge.ts` | 把页面态转换为可序列化快照，并执行受控命令。          |
| `src/utils/messaging.ts`     | 定义 sidebar 消息常量、payload、response 类型。       |
| `src/platform/*`             | 扩展实现暴露 `browserSidebar` 能力；油猴实现不提供 sidebar runtime。 |

## 关键技术决策

### 1. 新增 `panelPlacement`，不扩展 `panelMode`

新增：

```typescript
panelPlacement: "in-page" | "browser-sidebar"
```

保留：

```typescript
panelMode: "edge-snap" | "floating"
```

原因：

- `panelMode` 已经表示页内面板交互方式。
- “渲染在哪里”和“页内如何交互”是两个独立概念。
- 分离字段可以避免破坏旧用户设置、快捷键、功能提示和油猴逻辑。
- 旧数据一律迁移为 `panelPlacement: "in-page"`，不做自动切换。

### 2. Sidebar 页面不直接实例化站点 adapter

sidebar 页面无法访问活动标签页 DOM，因此不能直接使用 `getAdapter()`。所有需要 DOM 的动作都必须通过 content script 执行：

- 大纲提取、定位、收藏
- Prompt 插入、队列执行
- 会话同步、导航、导出
- 滚动、锚点、当前会话识别

sidebar 可以直接读取 Zustand 中的全局数据，例如提示词库、文件夹、标签、已缓存会话，但需要操作当前页面时必须走消息桥。

### 3. Manifest 按浏览器目标拆分

Chrome / Edge：

```json
{
  "permissions": ["storage", "declarativeNetRequestWithHostAccess", "sidePanel"],
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```

Firefox：

```json
{
  "sidebar_action": {
    "default_title": "Ophel Atlas",
    "default_panel": "sidepanel.html",
    "default_icon": {
      "16": "icon16.plasmo.<hash>.png",
      "32": "icon32.plasmo.<hash>.png"
    }
  }
}
```

`src/sidepanel.tsx` 存在后，Plasmo 会为扩展构建生成 `sidepanel.html`，Chromium
构建通常也会自动带上 `side_panel` 和 `sidePanel` 权限。仍需要新增 postbuild 脚本按
target 幂等 patch manifest，原因是发布包需要和 `.github/workflows/release.yml` 的
复制、清理、打包流程对齐，并且 Firefox 需要转换为 `sidebar_action`：

- Chromium 产物保留或补齐 `side_panel`，移除 `sidebar_action`，确保有 `sidePanel` 权限。
- Firefox 产物保留或补齐 `sidebar_action`，移除 `side_panel` 和 `sidePanel` 权限。
- Edge 继续复用 Chrome 构建产物，但在复制、Edge locale patch 后也要执行 Chromium patch。
- 不把 `side_panel` / `sidebar_action` 写进 `package.json` 的 base manifest，避免浏览器目标互相污染。

### 4. 第一版按 MVP 落地

第一版只要求 sidebar 路径可用、核心行为闭环：

- 打开 sidebar。
- 识别当前活动受支持页面。
- 展示大纲、会话、Prompt 三个核心 tab。
- 大纲点击能定位当前页面。
- Prompt 能插入当前页面输入框。
- 会话能导航或同步当前页面。
- 设置中可以切回页内面板。

更完整的交互复用、虚拟列表、复杂菜单、导出进度细节可以后续增强。

## 落地文件结构

```text
src/
  sidepanel.tsx
  sidepanel.css
  background.ts
  components/
    App.tsx
    sidebar/
      BrowserSidebarApp.tsx
      SidebarHeader.tsx
      SidebarStatus.tsx
      SidebarTabs.tsx
      SidebarOutlineTab.tsx
      SidebarPromptsTab.tsx
      SidebarConversationsTab.tsx
  contents/
    ui-entry.tsx
  core/
    sidebar-bridge.ts
  platform/
    types.ts
    extension/index.ts
    userscript/index.ts
  stores/
    settings-store.ts
  utils/
    messaging.ts
    storage.ts
scripts/
  patch-sidebar-manifest.mjs
docs/
  developer/
    browser-sidebar-mode.md
    browser-sidebar-tasks.csv
```

## 消息协议

在 `src/utils/messaging.ts` 中新增常量和类型。

```typescript
export const MSG_OPEN_BROWSER_SIDEBAR = "OPEN_BROWSER_SIDEBAR"
export const MSG_GET_SIDEBAR_CONTEXT = "GET_SIDEBAR_CONTEXT"
export const MSG_GET_SIDEBAR_OUTLINE = "GET_SIDEBAR_OUTLINE"
export const MSG_GET_SIDEBAR_CONVERSATIONS = "GET_SIDEBAR_CONVERSATIONS"
export const MSG_SIDEBAR_OUTLINE_COMMAND = "SIDEBAR_OUTLINE_COMMAND"
export const MSG_SIDEBAR_PROMPT_COMMAND = "SIDEBAR_PROMPT_COMMAND"
export const MSG_SIDEBAR_CONVERSATION_COMMAND = "SIDEBAR_CONVERSATION_COMMAND"
```

命令必须显式枚举，不允许把任意方法名透传到 content script。

```typescript
export type SidebarOutlineCommand =
  | { action: "refresh" }
  | { action: "locate"; nodeId: string }
  | { action: "toggleBookmark"; nodeId: string }
  | { action: "setLevel"; level: number }
  | { action: "setSearchQuery"; query: string }
  | { action: "setActiveSource"; sourceId: string }

export type SidebarPromptCommand =
  | { action: "insert"; promptId: string; submitAfterInsert?: boolean }
  | { action: "enqueue"; promptId: string }

export type SidebarConversationCommand =
  | { action: "sync" }
  | { action: "navigate"; conversationId: string; url?: string }
  | { action: "export"; conversationId: string; format: "markdown" | "json" | "txt" }
  | { action: "rename"; conversationId: string; title: string }
  | { action: "move"; conversationId: string; folderId: string }
```

## 可序列化上下文

content script 返回给 sidebar 的数据必须可序列化，不能包含 DOM 元素、函数、class 实例。

```typescript
export interface SidebarPageContext {
  supported: boolean
  siteId?: string
  siteName?: string
  tabId?: number
  url?: string
  title?: string
  sessionId?: string | null
  placement: "in-page" | "browser-sidebar"
  panelMode: "edge-snap" | "floating"
}

export interface SidebarOutlineSnapshot {
  siteId: string
  sessionId: string | null
  activeSourceId: string
  sources: Array<{ id: string; label: string; available: boolean }>
  nodes: SidebarOutlineNode[]
  searchQuery: string
  level: number
  isLoading: boolean
  updatedAt: number
}

export interface SidebarOutlineNode {
  id: string
  text: string
  level: number
  relativeLevel: number
  index: number
  parentId?: string
  children: SidebarOutlineNode[]
  collapsed: boolean
  isBookmarked?: boolean
  isGhost?: boolean
  isMatch?: boolean
  hasMatchedDescendant?: boolean
  isUserQuery?: boolean
  wordCount?: number
}
```

上下文主动推送可作为后续增强；当前实现采用 sidebar 页面主动刷新和命令返回快照，避免额外的跨上下文订阅状态。

## 设置与 UI 变化

### 设置模型

修改 `src/utils/storage.ts`：

```typescript
export type PanelPlacement = "in-page" | "browser-sidebar"

panel: {
  panelExpanded: boolean
  panelPlacement: PanelPlacement
  panelMode: "edge-snap" | "floating"
  preventAutoScroll: boolean
  defaultPosition: "left" | "right"
  defaultEdgeDistance: number
  edgeSnapThreshold: number
  height: number
  width: number
}
```

默认值：

```typescript
panelPlacement: "in-page"
```

归一化逻辑：

```typescript
const panelPlacement =
  panel?.panelPlacement === "browser-sidebar" || panel?.panelPlacement === "in-page"
    ? panel.panelPlacement
    : defaults.panelPlacement
```

### Options 页面

在 `src/tabs/options/pages/GeneralPage.tsx` 的面板设置中增加“面板显示位置”分段选择：

- 页内面板
- 浏览器侧边栏

当选择浏览器侧边栏时：

- 隐藏或弱化 `panelMode`、面板宽度、高度、吸附距离等页内专属设置。
- 页面宽度、用户提问宽度、禅模式等内容布局设置继续保留。
- 如果运行在油猴脚本或浏览器不支持 sidebar，则不允许选择浏览器侧边栏。

### 快捷按钮

当 `panelPlacement === "browser-sidebar"`：

- 快捷按钮中的“面板”按钮改为尝试打开浏览器 sidebar。
- 打开失败时显示明确 toast，不要静默失败。
- 不渲染 `.gh-main-panel` 遮挡页面。

### Popup

扩展 popup 增加“打开侧边栏”入口，作为最稳定的用户手势来源。若浏览器拒绝 content-script 间接打开 sidebar，则 popup 入口作为主路径。

## 样式策略

sidebar 页面不是 Shadow DOM 内的 content-script UI。建议：

- `src/sidepanel.tsx` 直接导入需要的 CSS。
- `src/sidepanel.css` 只写 sidebar 页面容器样式。
- 不复用 `.gh-main-panel` 作为 sidebar 根容器，避免固定定位、拖拽、吸附样式污染。
- 保留 `--gh-*` CSS 变量体系，保证主题观感一致。

基础样式：

```css
html,
body,
#__plasmo {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text, #1f2937);
  font-family: var(--ophel-font-family, Inter, system-ui, sans-serif);
}

.gh-browser-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 260px;
  height: 100vh;
  overflow: hidden;
}
```

## 重点事项

1. **不要直接复用 `App.tsx` 作为 sidebar 根组件**`App.tsx` 直接依赖网页 DOM 和 adapter。直接复用会导致 sidebar 页面没有 adapter、没有当前页 DOM、无法定位滚动。
2. **不要把 `panelMode` 改成三态**`panelMode` 继续只表示页内模式，新增 `panelPlacement` 表示渲染位置。
3. **不要让油猴看到 sidebar 设置**油猴没有原生 sidebar，设置 UI 必须隐藏或禁用该选项，平台实现必须返回不可用。
4. **不要在 sidebar UI 里写站点选择器**所有站点差异继续放在 `src/adapters/` 和 content script。
5. **不要吞掉 sidebar 打开失败**失败可能来自 API 不支持、缺少用户手势、content script 未注入、当前标签页不受支持。必须显式显示错误或 unsupported 状态。
6. **不要新增不必要权限**优先使用当前已有能力和 active tab 查询。只有实测必须时才考虑新增 `tabs` 权限。
7. **Firefox 和 Chromium 必须分别验 manifest**Firefox 不接受 Chromium 专属字段时会直接影响打包或上架。
8. **大纲节点 ID 必须可刷新恢复**sidebar 发出的 `nodeId` 可能因页面 rerender 失效。content script 执行命令前应刷新或校验节点映射，失败时返回明确错误。
9. **设置切换要可逆**用户从 sidebar 切回页内后，原有 `edge-snap` / `floating` 行为必须恢复。
10. **先保 MVP，再做 UI 等价**
    侧边栏核心价值是不遮挡页面。第一版优先打通打开、上下文、定位、插入、会话导航。

## 风险与处理

| 风险                                              | 处理                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `chrome.sidePanel.open()` 需要直接用户手势      | popup/action 作为主入口；content script 快捷按钮失败时提示用户从 popup 打开。          |
| Firefox sidebar manifest 与 Plasmo 输出路径不匹配 | postbuild 后检查`sidepanel.html` 是否存在并 patch `sidebar_action.default_panel`。 |
| content script 未注入或未初始化                   | background 返回`{ supported: false }`，sidebar 显示 unsupported / retry。            |
| 大纲定位目标过期                                  | 执行命令前刷新 snapshot 或根据 index/text/hash 重新解析。                              |
| userscript bundle 混入 sidebar API                | 构建后搜索 `sidePanel`、`side_panel`、`sidebarAction`、`sidebar_action`、`openBrowserSidebar`、`browserSidebar`、`browser-sidebar`。 |
| 旧用户设置异常                                    | normalization 默认`panelPlacement: "in-page"`，不自动切换到 sidebar。                |
| 页面增强功能被误关                                | content script 继续初始化 core modules；`src/components/App.tsx` 只在 sidebar placement 下禁用大面板渲染。 |

## 验收标准

- `DEFAULT_SETTINGS`、settings store normalization、Options UI、设置 schema 都包含 `panelPlacement`。
- Chrome / Edge 构建产物 manifest 包含 `side_panel.default_path` 和 `sidePanel` 权限。
- Firefox 构建产物 manifest 包含 `sidebar_action.default_panel`，不包含 `side_panel` 和 `sidePanel` 权限。
- 油猴构建不包含原生 sidebar API 引用。
- 浏览器侧边栏可以从明确用户操作打开。
- sidebar 模式下页面不显示 `.gh-main-panel` 遮挡层。
- 大纲定位、Prompt 插入、会话导航至少在一个 Chromium 浏览器和 Firefox 中通过冒烟。
- 切回页内面板后，`edge-snap` 和 `floating` 仍按现状工作。
- 新增文案同步 10 种应用内语言。
- `pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`、`pnpm build`、`pnpm build:firefox`、`pnpm build:userscript` 通过，或记录明确环境原因。

## 验证命令

```bash
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:firefox
pnpm build:userscript
```

构建后检查：

```bash
rg -n "side_panel|sidePanel|sidebar_action|sidebarAction" build/chrome-mv3-prod build/firefox-mv3-prod
rg -n "sidePanel|side_panel|sidebarAction|sidebar_action|openBrowserSidebar|browserSidebar|browser-sidebar" build/userscript
```

## 当前验证进度

- `pnpm typecheck`、`pnpm format:check`、`pnpm lint:check` 已通过；lint 仅保留既有 warning。
- `pnpm package:all` 已通过，Chrome / Firefox zip 内 manifest 已确认目标字段正确。
- `pnpm build:userscript` 已通过，`build/userscript` 中未检出原生 sidebar API、消息常量、设置 key 或 sidebar CSS 类名。
- `web-ext lint --source-dir build/firefox-mv3-prod` 已通过，无 `sidePanel.open` 静态引用告警。
- Edge 临时 profile 自动冒烟已通过：当前页 content script 可返回 `GET_SIDEBAR_CONTEXT`，页面无 `.gh-main-panel`，`sidepanel.html` 可渲染 browser sidebar。
- Chrome 自动加载在当前机器上不稳定，Firefox 原生 sidebar runtime 仍需实机手动冒烟。

## 后续增强

- 抽取现有 `OutlineTab` / `PromptsTab` / `ConversationsTab` 中可复用的纯 UI 片段。
- 为 sidebar 增加更完整的导出进度、批量操作、标签管理和设置搜索。
- 增加 Playwright 扩展冒烟测试，覆盖 Chrome sidebar 打开与 content script 命令桥。
- 根据用户反馈决定是否将 sidebar 作为扩展版默认推荐模式。
