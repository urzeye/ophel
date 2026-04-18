# 面板模式改造方案（Panel Mode Refactor）

> 状态：✅ 已实施
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

## B. 初始化逻辑改动（`src/components/App.tsx`）

### B1. 面板初始化

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

### B2. 状态记忆

悬浮模式下，面板开关状态变化时自动持久化到 `lastPanelOpen`：

```typescript
useEffect(() => {
  if (!isInitializedRef.current) return
  if (panelMode === "floating") {
    updateNestedSetting("panel", "lastPanelOpen", isPanelOpen)
  }
}, [isPanelOpen])
```

### B3. 点击外部行为

两种模式下点击面板外部都不产生任何作用。面板的吸附仅通过拖拽触发，面板的收起仅通过快捷按钮/快捷键触发。

原有的 click-outside useEffect 已完全移除。

## C. 快捷按钮改动

### C1. 按钮定义（`src/constants/ui.ts`）

在 `COLLAPSED_BUTTON_DEFS` 的按钮类型中新增 `hideWhenPanelOpen` 属性：

```typescript
scrollTop:    { ..., hideWhenPanelOpen: true }
scrollBottom: { ..., hideWhenPanelOpen: true }
anchor:       { ..., hideWhenPanelOpen: true }
```

### C2. 渲染逻辑（`src/components/QuickButtons.tsx`）

```typescript
const shouldHide =
  isDisabled || (isPanelOnly && isPanelOpen) || (def.hideWhenPanelOpen && isPanelOpen)
```

效果：面板展开时隐藏 scrollTop/scrollBottom/anchor 按钮（这些功能在面板 footer 中已存在）。

## D. 设置 UI 改动（`src/tabs/options/pages/GeneralPage.tsx`）

### D1. 面板模式选择器

替换原有的三个 Toggle 为二态分段选择器：

```
面板模式:
  ┌──────────┬──────────┐
  │ 自动吸附  │   悬浮    │
  └──────────┴──────────┘
```

- **自动吸附**：刷新后自动吸附到边缘，鼠标悬浮展开
- **悬浮**：面板自由悬浮，记忆上次开关状态

### D2. 条件显示

- 吸附触发距离：仅在自动吸附模式下显示

## E. 涉及文件清单

| 文件                                     | 改动类型        | 内容                                         |
| ---------------------------------------- | --------------- | -------------------------------------------- |
| `src/utils/storage.ts`                   | 类型+默认值     | panel 类型新增 panelMode，默认值更新         |
| `src/stores/settings-store.ts`           | 迁移逻辑        | onRehydrateStorage 中添加迁移函数            |
| `src/components/App.tsx`                 | 初始化+点击外部 | panelMode 替代旧三字段逻辑                   |
| `src/constants/ui.ts`                    | 按钮定义        | COLLAPSED_BUTTON_DEFS 新增 hideWhenPanelOpen |
| `src/components/QuickButtons.tsx`        | 渲染逻辑        | renderButton 判断 hideWhenPanelOpen          |
| `src/tabs/options/pages/GeneralPage.tsx` | 设置 UI         | 三态选择器 + 高级选项折叠                    |
| `src/locales/*/` (10 种语言)             | i18n            | 新增面板模式文案                             |

## F. 风险控制

1. **旧字段不删除**：`defaultOpen`/`autoHide`/`edgeSnap` 保留在类型和存储中
2. **迁移幂等**：有 `panelMode` 则跳过迁移，无则执行映射后写回
3. **高级选项保持**：拖拽吸附判定仍使用 `edgeSnapThreshold`
4. **`edgeSnap` 模式下 `defaultEdgeDistance` 的语义**：仅影响面板被拖出吸附态后的非吸附位置
5. **分段实施**：数据模型 → 迁移逻辑 → 初始化/交互逻辑 → 快捷按钮 → UI → i18n

## G. 实施顺序

1. ✅ 持久化改造文档
2. 数据模型: `storage.ts` 类型 + 默认值
3. 迁移逻辑: `settings-store.ts`
4. 初始化 + 点击外部: `App.tsx`
5. 按钮定义: `constants/ui.ts`
6. 快捷按钮渲染: `QuickButtons.tsx`
7. 设置 UI: `GeneralPage.tsx`
8. i18n 多语言文案
