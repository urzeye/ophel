# 主面板 Tab 拖拽排序方案

## 背景

Ophel 已经支持在 `Settings -> General -> Tab Order` 中拖拽排序 Outline、Conversations、Prompts 三个主面板 Tab。核心用户反馈希望在实际使用面板时直接调整顺序，不必进入设置页。

当前主面板已经通过 `settings.features.order` 渲染 Tab，设置页排序也写入同一个字段。因此主面板内排序应复用这条数据链路，不能新增第二套顺序状态。

## 目标

- 在主面板 Tab 栏支持直接拖拽排序 Outline、Conversations、Prompts。
- 拖拽完成后写入 `settings.features.order`，与设置页排序保持完全同步。
- 只对当前可见且启用的 Tab 进行拖拽命中，但保存时保留被禁用 Tab 的相对顺序。
- 不改变当前激活 Tab；拖动激活 Tab 后仍保持该 Tab 激活。
- 扩展版和油猴脚本共用实现，不依赖扩展专属 API。

## 非目标

- 不新增单独的“编辑 Tab 顺序”模式。
- 不支持把 Settings 作为主面板 Tab 拖入排序；设置入口仍在 Header。
- 不改变设置页现有排序能力。
- 不新增设置项或 i18n 文案，除非实现需要可访问名称。

## 数据流

唯一数据源仍是：

```ts
settings.features.order
```

主面板计算：

```ts
const tabOrder = currentSettings.features?.order || DEFAULT_SETTINGS.features.order
const visibleTabs = tabOrder.filter(...)
```

拖拽结束时根据 `visibleTabs` 计算新的可见顺序，再合并回完整 `tabOrder`：

```text
full order:    [outline, conversations, prompts]
visible tabs:  [outline, prompts]       // conversations disabled
drop result:   [prompts, outline]
saved order:   [prompts, conversations, outline]
```

这样禁用 Tab 不参与当前面板命中，但仍保留在完整顺序中，重新启用后会出现在最近一次排序的相对位置。

## 交互设计

- 每个 `.gh-panel-tab-btn` 设置 `draggable`。
- `dragstart` 记录源 Tab id，并设置 `dataTransfer.effectAllowed = "move"`。
- `dragover` 阻止默认行为并记录当前 hover target。
- `drop` 根据源/目标 Tab id 计算新顺序并写入 `features.order`。
- `dragend` 清理拖拽状态。
- 拖拽态只做低强度反馈：源 Tab 降低透明度，目标 Tab 显示轻微背景和边框。

为了避免误触：

- 如果只有一个可见 Tab，不启用拖拽。
- 拖拽与点击共存；没有发生 drop 时，点击仍只切换 Tab。
- 不使用复杂的 pointer 自绘拖拽层，优先使用浏览器原生 HTML Drag and Drop，保持实现小而稳定。

## 样式与主题

- 样式放在 `src/style.css`，仍通过现有 `getStyle()` 注入 Shadow DOM。
- 使用现有变量：`--gh-primary`、`--gh-hover`、`--gh-border`、`--gh-text-secondary`。
- 不新增主题变量，避免扩展 24 套主题配置。
- 拖拽反馈必须支持浅色/深色主题，并尊重 `prefers-reduced-motion`。

## 油猴兼容性

实现只依赖 React、Zustand settings store、HTML Drag and Drop 与 Shadow DOM 内部事件。油猴脚本构建复用同一 UI bundle，不需要 GM API 或 background script。

## 验证清单

- 主面板中拖动三个 Tab 后，Tab 顺序立即变化并持久保存。
- 打开设置页 `Tab Order` 能看到同样顺序。
- 在设置页调整顺序后，主面板顺序同步。
- 禁用某个 Tab 后，主面板只排序可见 Tab，重新启用后顺序仍合理。
- 拖动当前激活 Tab 后仍保持该 Tab 激活。
- 单个可见 Tab 不应进入拖拽排序状态。
- 浅色/深色主题下拖拽反馈可见但不干扰。
- `pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`、`pnpm build`、`pnpm build:userscript` 通过。
