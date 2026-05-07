# Edge Peek Controller 重构计划

> 状态：进行中  
> 分支：`refactor/edge-peek-controller`  
> 日期：2026-05-07  
> 目标：在不改变现有交互行为的前提下，收敛自动吸附模式下的 peek 显示控制逻辑。

## 背景

当前面板已经完成 `panelExpanded` 的统一语义：展开/收起是跨模式状态，`panelMode` 只表示展开后的展示方式。新的问题不再是数据模型，而是自动吸附模式下 `isEdgePeeking` 的维护成本过高。

`isEdgePeeking` 现在由多类入口共同影响：

- 鼠标进入/离开面板
- 快捷键打开吸附面板
- 快捷按钮 logo 打开面板
- 设置弹窗、全局搜索、菜单和对话框等 overlay
- 面板内输入框聚焦与失焦
- 拖拽脱离吸附、模式切换、默认侧边切换

这些入口分散在 `App.tsx` 的多个 `useEffect`、timer、ref 和回调中。功能可以工作，但后续维护容易继续堆补丁。

## 本次范围

本次只做第一阶段：**收敛 edge-snap / peeking 控制逻辑**。

### 会改的文件

- `src/hooks/useEdgePeekController.ts`：新增 hook，集中管理 peek 可见性、延迟同步、Shadow DOM 焦点与搜索框 Esc 处理。
- `src/components/App.tsx`：移除分散的 `isEdgePeeking`、timer、focus/overlay effect，改为调用 hook 暴露的 API。
- `docs/developer/edge-peek-controller-refactor.md`：记录计划、边界和验证矩阵。

### 不会改的文件

- `src/hooks/useDraggable.ts`：拖拽、吸附触发和 zoom/resize 位置恢复不在本次范围内。
- `src/components/QuickButtons.tsx`：快捷按钮组位置、水滴收缩、近距唤醒不在本次范围内。
- `src/components/MainPanel.tsx`：保留现有 props 与 DOM 定位逻辑，不重写模式切换定位。
- `src/utils/storage.ts`、`src/stores/settings-store.ts`：不改变设置结构，不新增持久化字段。
- CSS 和主题系统：不改 class 名和动画语义。

## 设计原则

1. **行为不变**：只搬运和命名，不重写交互策略。
2. **单一收口点**：所有“延迟后是否缩回”的判断都走统一函数。
3. **入口保持薄**：快捷键、按钮、弹窗入口只表达意图，不重复写 hover/focus/overlay 判断。
4. **不扩大状态面**：`edgeSnapState` 仍由 `App.tsx` 管理；hook 只管理 `isEdgePeeking` 和与 peek 相关的计时/监听。
5. **可回滚**：新增 hook 后，`App.tsx` 的外部 props 和 store 写入保持不变。

## 目标状态模型

`panelExpanded`：持久化状态，表示面板是否未收进快捷按钮组。  
`panelMode`：持久化状态，表示展开后的表现方式：`floating` 或 `edge-snap`。  
`edgeSnapState`：运行时状态，表示当前吸附侧边。  
`isEdgePeeking`：运行时状态，由 `useEdgePeekController` 计算和维护，表示吸附面板是否临时伸出。

`useEdgePeekController` 负责以下条件：

- 面板 hover 时保持 peek
- 面板内 focus-within 时保持 peek
- 面板内输入框聚焦时保持 peek
- 设置弹窗打开时保持 peek
- 菜单、对话框、全局搜索等 overlay 打开时保持 peek
- 快捷键临时显示后，延迟重新同步 hover/focus 状态
- 搜索框按 Esc 时取消焦点，并触发统一同步

## 具体改法

### 1. 新增 hook

创建 `src/hooks/useEdgePeekController.ts`，输入：

- `edgeSnapState`
- `panelMode`
- `isPanelExpanded`
- `findUiElement`
- `getQueryRoots`
- `isSettingsOpenRef`

输出：

- `isEdgePeeking`
- `showEdgePeek()`
- `hideEdgePeek()`
- `syncEdgePeekVisibility()`
- `scheduleEdgePeekSync(delayMs?)`
- `showEdgePeekFromShortcut()`
- `markSuppressOverlayInit(shouldSuppress?)`
- `markSyncAfterOpen()`
- `handlePanelMouseEnter()`
- `handlePanelMouseLeave()`
- `handleInteractionChange(isActive)`

### 2. 替换 App 内部分散逻辑

在 `App.tsx` 中：

- 保留 `edgeSnapState` 和 `setEdgeSnapState`。
- 删除本地 `isEdgePeeking` state、`hideTimerRef`、`shortcutPeekTimerRef`、`isInputFocusedRef`、`suppressEdgePeekInitRef`、`shouldSyncEdgePeekAfterOpenRef`。
- 删除 portal observer effect、Shadow DOM focus/key effect、QuickButtons 打开后的 delayed sync effect。
- 用 hook 返回的 API 替换所有 `setIsEdgePeeking(...)` 调用。

### 3. 保持外部组件接口不变

`MainPanel` 继续接收：

- `edgeSnapState`
- `isEdgePeeking`
- `onMouseEnter`
- `onMouseLeave`
- `onUnsnap`
- `onInteractionStateChange`

`QuickButtons` 继续接收：

- `isPanelExpanded`
- `onPanelToggle`

## 验证矩阵

### 自动吸附模式

1. 页面刷新后，面板按 `panelExpanded` 恢复展开/收起。
2. 面板收起为 logo 后，点击 logo 可以展开并 peek。
3. 面板收起为 logo 后，按面板开关快捷键可以展开并 peek。
4. 面板已展开但吸附隐藏时，按 `Alt+F` 搜索大纲，面板 peek，焦点在大纲搜索框。
5. 大纲搜索框按 Esc 后失焦，鼠标不在面板上时自动吸附回去。
6. 会话搜索框按 Esc 后失焦，鼠标不在面板上时自动吸附回去。
7. 提示词搜索框按 Esc 后失焦，鼠标不在面板上时自动吸附回去。
8. 鼠标悬停面板时保持 peek，离开后延迟缩回。
9. 打开设置弹窗时保持 peek，关闭后按 hover/focus 状态决定是否缩回。
10. 打开会话菜单、标签筛选、提示词弹窗等 overlay 时保持 peek，关闭后自动同步。
11. 拖拽面板离开边缘后不应立即重新吸附。
12. 修改默认侧边时，已吸附面板切换侧边并保持隐藏态。
13. 点击面板自身关闭按钮后，面板应收起到快捷按钮组 logo，且下次打开仍能正常 peek。
14. 从设置弹窗切到全局搜索后，按 Esc 应返回设置弹窗，面板保持可见。
15. 从普通页面打开全局搜索后，按 Esc 应关闭全局搜索，并按当前 hover 状态决定是否吸附回去。
16. 全局搜索结果跳转到设置项或提示词后，不应留下永久 peek 状态。
17. 会话 Tab 开启多选、选择/取消选择会话后，鼠标移出面板应自动吸附；只有批量导出菜单、移动/删除弹窗打开时才保持 peek。
18. 提示词 Tab 点击导出按钮后，鼠标移出面板应自动吸附。

### 悬浮模式

1. 模式切换到悬浮后，面板展开/收起状态不被改变。
2. 悬浮模式下鼠标 hover、搜索框 Esc、overlay 打开关闭不应触发 edge peek 相关行为。
3. 面板拖拽、resize/zoom 位置恢复保持原行为。

### 快捷按钮组

1. 面板收起时快捷按钮组保持 logo 可见。
2. 面板展开时 `hideWhenPanelOpen` 仍按原规则生效。
3. 水滴收缩和近距唤醒行为不因本次重构改变。

## 自动验证命令

```bash
pnpm typecheck
pnpm build
pnpm lint:check
```

本次重构改动超过 30 行，完成后还需要运行 CCG 质量门禁：

```bash
node C:/Users/user/.claude/skills/ccg/run_skill.js verify-change --mode unstaged
node C:/Users/user/.claude/skills/ccg/run_skill.js verify-quality ./src/components ./src/hooks
node C:/Users/user/.claude/skills/ccg/run_skill.js verify-security ./src/components ./src/hooks
```

## 回滚策略

如果出现交互异常，优先回滚 `src/hooks/useEdgePeekController.ts` 和 `App.tsx` 的接入改动。因为本次不改变 settings schema、不改变 CSS class、不改变 `MainPanel` / `QuickButtons` props，回滚不会影响用户数据。