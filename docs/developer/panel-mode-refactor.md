# 面板模式改造方案（Panel Mode Refactor）

> 状态：✅ 已实施
> 分支：`refactor/panel`
> 日期：2026-04-18
> 影响范围：8000+ 现有用户数据需静默迁移

## 背景

当前面板行为由三个独立开关控制（`defaultOpen`、`autoHide`、`edgeSnap`），产生 2³=8 种组合，但有意义的行为仅 2 种。此外 `defaultEdgeDistance` 与 `edgeSnapThreshold` 存在隐含依赖关系（仅当 A ≤ B 时面板初始才会吸附），用户无法直观理解。

### 核心问题

1. **初始吸附条件矛盾**：默认 `defaultEdgeDistance=25` > `edgeSnapThreshold=18`，导致 `edgeSnap=true` 时面板并不在刷新后吸附，而是直接展开占屏。
2. **autoHide 语义变形**：`autoHide + edgeSnap` 组合下，"点击外部收起"实际变成"点击外部吸附"，名不副实。
3. **设置项之间依赖不透明**：`defaultEdgeDistance`、`edgeSnapThreshold` 两个数字滑块的隐含关系让用户困惑。
4. **面板与快捷按钮重复**：面板展开时，快捷按钮的 scrollTop/scrollBottom/anchor 与面板 footer 中的同功能按钮重复。

## 方案概要

将三个开关合并为 `panelMode` 二态字段（`"edge-snap"` | `"floating"`）。悬浮模式下通过 `lastPanelOpen` 记忆上次面板开关状态，取代原有的 `defaultOpen` 设置。

## A. 数据模型改动（`src/utils/storage.ts`）

### A1. 类型变更

```typescript
panel: {
  panelMode: "edge-snap" | "floating"  // 面板模式
  lastPanelOpen?: boolean              // 悬浮模式下记住上次开关状态
  // 保留的高级选项
  defaultPosition: "left" | "right"
  defaultEdgeDistance: number
  edgeSnapThreshold: number
  height: number
  width: number
  preventAutoScroll: boolean
  // 弃用字段，保留以兼容旧数据反序列化
  defaultOpen?: boolean
  autoHide?: boolean
  edgeSnap?: boolean
}
```

### A2. 默认值

```typescript
panel: {
  panelMode: "edge-snap",
  lastPanelOpen: true,
  defaultPosition: "right",
  defaultEdgeDistance: 25,
  edgeSnapThreshold: 30,           // 从 18 → 30
  height: 85,
  width: 320,
  preventAutoScroll: false,
}
```

### A3. 迁移映射表

三层迁移（兼容旧三态 panelMode 和更旧的三字段）：

| 旧值                             | → panelMode   | → lastPanelOpen |
| -------------------------------- | ------------- | --------------- |
| panelMode="always-open"          | `"floating"`  | `true`          |
| panelMode="manual"               | `"floating"`  | `false`         |
| panelMode="edge-snap"            | `"edge-snap"` | (不影响)        |
| edgeSnap=true                    | `"edge-snap"` | `true`          |
| defaultOpen=false                | `"floating"`  | `false`         |
| defaultOpen=true, edgeSnap=false | `"floating"`  | `true`          |

迁移时机：`settings-store.ts` 的 `normalizeSettings` 函数

## B. 初始化与模式切换逻辑（`src/components/App.tsx`）

### B1. 面板初始化（首次加载）

```typescript
const panelMode = settings.panel?.panelMode ?? "edge-snap"

switch (panelMode) {
  case "edge-snap":
    setIsPanelOpen(true)
    setEdgeSnapState(settings.panel?.defaultPosition ?? "right")
    break
  case "floating": {
    const lastOpen = settings.panel?.lastPanelOpen ?? true
    setIsPanelOpen(lastOpen)
    break
  }
}
```

### B2. 模式切换处理（运行中切换）

通过 `prevPanelModeForSwitchRef` 跟踪 panelMode 变化，仅在实际模式切换时触发：

```typescript
if (panelMode === "edge-snap") {
  // 切换到吸附模式：初始化吸附到默认位置，强制展开面板
  setEdgeSnapState(defaultPosition)
  setIsPanelOpen(true)
} else {
  // 切换到悬浮模式：清除吸附状态，恢复上次开关记忆
  setEdgeSnapState(null)
  setIsEdgePeeking(false)
  setIsPanelOpen(settings?.panel?.lastPanelOpen ?? true)
}
```

**设计决策**：

- 切换到吸附时始终展开面板（吸附模式无"关闭"概念，面板始终存在于边缘）
- 切换到悬浮时恢复 `lastPanelOpen` 记忆（尊重用户之前的开关偏好）

### B3. 状态记忆

悬浮模式下，面板开关状态变化时自动持久化到 `lastPanelOpen`：

```typescript
useEffect(() => {
  if (!isInitializedRef.current) return
  if (panelMode === "floating") {
    updateNestedSetting("panel", "lastPanelOpen", isPanelOpen)
  }
}, [isPanelOpen, settings?.panel?.panelMode, updateNestedSetting])
```

### B4. 点击外部行为

两种模式下点击面板外部都不产生任何作用。面板的吸附仅通过拖拽触发，面板的收起仅通过快捷按钮/快捷键触发。

原有的 click-outside useEffect 已完全移除。

## C. 拖拽与吸附交互（`src/hooks/useDraggable.ts`）

### C1. 延迟取消吸附

关键修复：`handleMouseDown` 不再立即调用 `onUnsnap()`，而是将取消吸附延迟到首次 `mouseMove`（实际拖拽开始）时才执行。

```typescript
// mouseDown: 仅记录吸附状态
pendingUnsnapRef.current = edgeSnapState || null

// mouseMove（首次移动）: 执行延迟的取消吸附
if (!hasMovedRef.current) {
  hasMovedRef.current = true
  if (pendingUnsnapRef.current) {
    onUnsnap?.()
    pendingUnsnapRef.current = null
  }
  // 切换 CSS 定位 + 添加 .dragging 类
}

// mouseUp（无移动）: 直接清理，不影响吸附状态
```

**解决的问题**：双击面板标题（切换隐私模式）等点击操作不再导致面板意外取消吸附。

### C2. 模式切换时的 DOM 位置重置（`src/components/MainPanel.tsx`）

`useDraggable` 通过直接 DOM 操作管理面板位置（绕过 React 渲染循环），因此 React 无法在模式切换时自动重置位置。`MainPanel` 添加了专门的 `useEffect` 处理双向重置：

```typescript
// 吸附 → 悬浮：重置为默认悬浮位置
panel.style.top = "50%"
panel.style.transform = "translateY(-50%)"
panel.style.left/right = defaultEdgeDistance

// 悬浮 → 吸附：重置垂直位置，清除 left/right（由 CSS edge-snapped-* !important 接管）
panel.style.top = "50%"
panel.style.transform = "translateY(-50%)"
panel.style.left = ""
panel.style.right = ""
```

## D. 快速模式切换按钮

### D1. Header 按钮（`src/components/MainPanel.tsx`）

在面板 header 控制按钮区域（主题/设置/刷新/收起旁边）添加 pin/snap 切换按钮：

| 当前模式 | 图标                               | Tooltip      | 点击效果       |
| -------- | ---------------------------------- | ------------ | -------------- |
| 自动吸附 | `<FloatingModeIcon>` (图钉/Pin)    | "固定面板"   | 切换到悬浮模式 |
| 悬浮     | `<SnapToEdgeIcon>` (侧边栏+左箭头) | "吸附到边缘" | 切换到吸附模式 |

按钮通过 `updateNestedSetting("panel", "panelMode", ...)` 直接更新 Zustand store，由 App.tsx 的模式切换 useEffect 响应状态变化。

### D2. 设置页选择器（`src/tabs/options/pages/GeneralPage.tsx`）

分段选择器也添加了对应图标，与 header 按钮视觉一致。

## E. 快捷按钮改动

### E1. 按钮定义（`src/constants/ui.ts`）

在 `COLLAPSED_BUTTON_DEFS` 的按钮类型中新增 `hideWhenPanelOpen` 属性：

```typescript
scrollTop:    { ..., hideWhenPanelOpen: true }
scrollBottom: { ..., hideWhenPanelOpen: true }
anchor:       { ..., hideWhenPanelOpen: true }
```

### E2. 渲染逻辑（`src/components/QuickButtons.tsx`）

```typescript
const shouldHide =
  isDisabled || (isPanelOnly && isPanelOpen) || (def.hideWhenPanelOpen && isFloatingOpen)
```

其中 `isFloatingOpen = isPanelOpen && panelMode !== "edge-snap"`。

效果：在悬浮模式下，面板展开时隐藏 scrollTop/scrollBottom/anchor 按钮；在自动吸附模式下，这三个按钮始终可见（因为面板收在边缘不占空间）。

## F. 设置 UI 改动（`src/tabs/options/pages/GeneralPage.tsx`）

### F1. 面板模式选择器

替换原有的三个 Toggle 为二态分段选择器（含图标）：

```
面板模式:
  ┌────────────────┬──────────────┐
  │ 🧲 自动吸附     │  📌 悬浮      │
  └────────────────┴──────────────┘
```

- **自动吸附**：刷新后自动吸附到边缘，鼠标悬浮展开
- **悬浮**：面板自由悬浮，记忆上次开关状态

### F2. 条件显示

- 吸附触发距离：仅在自动吸附模式下显示

## G. SVG 图标（`src/components/icons/`）

新增两个 SVG 图标组件：

- `SnapToEdgeIcon.tsx`：左侧边缘线 + 面板矩形 + 向左箭头（stroke-based，viewBox 0 0 24 24）
- `FloatingModeIcon.tsx`：fill-based 图钉（Pin）图标（viewBox 0 0 1024 1024）

## H. 国际化（`src/locales/*/index.ts`）

新增 i18n 键（10 种语言）：

| Key                 | zh-CN      | en           | 用途                |
| ------------------- | ---------- | ------------ | ------------------- |
| `panelModeEdgeSnap` | 自动吸附   | Edge Snap    | 设置页              |
| `panelModeFloating` | 悬浮       | Floating     | 设置页              |
| `pinPanel`          | 固定面板   | Pin panel    | Header 按钮 tooltip |
| `snapToEdge`        | 吸附到边缘 | Snap to edge | Header 按钮 tooltip |

## I. 涉及文件清单

| 文件                                        | 改动类型        | 内容                                         |
| ------------------------------------------- | --------------- | -------------------------------------------- |
| `src/utils/storage.ts`                      | 类型+默认值     | panel 类型新增 panelMode，默认值更新         |
| `src/stores/settings-store.ts`              | 迁移逻辑        | normalizeSettings 中三层迁移函数             |
| `src/components/App.tsx`                    | 初始化+模式切换 | panelMode 替代旧三字段，双向切换逻辑         |
| `src/hooks/useDraggable.ts`                 | 拖拽交互        | 延迟 unsnap 到首次 mouseMove                 |
| `src/components/MainPanel.tsx`              | UI+DOM重置      | pin/snap 按钮，模式切换位置重置              |
| `src/constants/ui.ts`                       | 按钮定义        | COLLAPSED_BUTTON_DEFS 新增 hideWhenPanelOpen |
| `src/components/QuickButtons.tsx`           | 渲染逻辑        | renderButton 判断 hideWhenPanelOpen          |
| `src/tabs/options/pages/GeneralPage.tsx`    | 设置 UI         | 二态选择器 + 图标 + 条件显示                 |
| `src/components/icons/SnapToEdgeIcon.tsx`   | 新增            | 吸附图标 SVG 组件                            |
| `src/components/icons/FloatingModeIcon.tsx` | 新增            | 悬浮图标 SVG 组件                            |
| `src/components/icons/index.ts`             | 导出            | 新增两个图标的 barrel export                 |
| `src/styles/settings.css`                   | 样式修复        | scrollbar-gutter: stable 防闪烁              |
| `src/locales/*/index.ts` (10 种语言)        | i18n            | 新增 pinPanel、snapToEdge 文案               |
| `docs/developer/panel-mode-refactor.md`     | 文档            | 本文档（更新至最新实现）                     |

## J. 风险控制

1. **旧字段不删除**：`defaultOpen`/`autoHide`/`edgeSnap` 保留在类型和存储中
2. **迁移幂等**：有合法 `panelMode` 则跳过迁移，无则执行映射后写回
3. **高级选项保持**：拖拽吸附判定仍使用 `edgeSnapThreshold`
4. **`defaultEdgeDistance` 的语义**：控制页面刷新后及模式切换时的面板默认位置
5. **延迟 unsnap**：点击/双击不影响吸附状态，仅实际拖拽才触发取消吸附
6. **DOM 位置重置**：模式切换时手动重置 useDraggable 设置的内联样式，确保面板位置正确

## K. 实施记录

| 提交      | 内容                                                                 |
| --------- | -------------------------------------------------------------------- |
| `7e9f62b` | 核心重构：二态 panelMode + 迁移 + 初始化 + 快捷按钮 + 设置 UI + i18n |
| `608556d` | 修复：设置页 scrollbar-gutter: stable 防闪烁                         |
| `50573a1` | 修复：延迟 unsnap 到首次 mouseMove，防止点击/双击取消吸附            |
| `daa38e5` | 修复：模式切换时重置面板 DOM 位置                                    |
| `3dd53e4` | 修复：双向模式切换正确处理（悬浮→吸附初始化 + 恢复 lastPanelOpen）   |
| `780a329` | 修复：切换到悬浮模式时恢复 lastPanelOpen 状态                        |
| `3809f4d` | 功能：header pin/snap 快速切换按钮 + SVG 图标 + i18n                 |
