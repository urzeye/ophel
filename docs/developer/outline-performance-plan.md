# 大纲系统性能优化与 Bug 修复计划

> 创建日期：2026-04-20  
> 分析范围：`src/core/outline-manager.ts`、`src/adapters/gemini.ts`、`src/components/OutlineTab.tsx`

---

## 问题清单

| #   | 优先级 | 类型 | 位置                                            | 描述                                                         |
| --- | ------ | ---- | ----------------------------------------------- | ------------------------------------------------------------ |
| P1  | 🔴 高  | Bug  | `outline-manager.ts` `captureTreeState`         | 同文本同级标题 key 碰撞，折叠状态互覆盖                      |
| P2  | 🔴 高  | 性能 | `outline-manager.ts` `startAutoUpdate`          | MutationObserver 观察整个 `document.body`，AI 生成时高频触发 |
| P3  | 🟡 中  | 性能 | `outline-manager.ts` `_doRefresh`               | `treeKey` 拼接所有标题文本，超长字符串比较                   |
| P4  | 🟡 中  | 性能 | `outline-manager.ts` `updateScrollPositions`    | 批量 `getBoundingClientRect()` 触发 Layout Thrashing         |
| P5  | 🟢 低  | 性能 | `OutlineTab.tsx`                                | 全量渲染所有节点，无虚拟列表                                 |
| P6  | 🟡 中  | Bug  | `outline-manager.ts` `_doRefresh` fallback 竞态 | fallback timer 清空 treeKey 可能打断正常状态恢复             |
| P7  | 🟡 中  | Bug  | `outline-manager.ts` `executeAutoUpdate`        | 生成完成后切 Tab，`postGenerationScheduled` 复位导致漏刷新   |

---

## Phase 1：`captureTreeState` key 碰撞 Bug

**状态**：已完成

### 问题描述

`captureTreeState` 使用 `${node.level}_${node.text}` 作为 key：

```ts
// 当前代码（有 bug）
const key = `${node.level}_${node.text}`
```

当同一对话包含两个文本相同的同级标题（如两次 `## 总结`、`## 分析`），后者的折叠状态会覆盖前者，导致大纲刷新后折叠状态错乱。

### 修复方案

优先使用 `node.id`（如果存在），否则用 `node.index`（节点在扁平列表中的全局唯一序号）作为 key 的组成部分：

```ts
// 修复后
const key = node.id ? `id:${node.id}` : `${node.level}_${node.text}_${node.index}`
```

`restoreTreeState` 同步更新 key 逻辑。

### 影响范围

- 仅 `captureTreeState` / `restoreTreeState` 方法
- 不影响数据结构、序列化、书签逻辑
- 风险：极低

---

## Phase 2：缩小 MutationObserver 观察范围

**状态**：已完成

### 问题描述

```ts
this.observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
})
```

`document.body` 全量观察导致：

- AI 流式生成时每个字符都触发 MutationObserver 回调
- 即使有 debounce，高频写入场景下 debounce 也无法完全抑制

### 修复方案

在 `SiteAdapter` 基类新增方法 `getObserveTarget()`，默认使用 `getResponseContainerSelector()` 返回更小范围的容器；各适配器如有需要仍可覆盖：

```ts
// base.ts 默认实现（通过 getResponseContainerSelector 自动查找容器）
getObserveTarget(): Element | null {
  const selector = this.getResponseContainerSelector()
  if (!selector) return null
  return document.querySelector(selector)
}

// claude.ts 覆盖（使用滚动容器而非单条回复容器）
getObserveTarget(): Element | null {
  return this.getScrollContainer()
}
```

`startAutoUpdate()` 中使用适配器返回的目标：

```ts
const target = this.siteAdapter.getObserveTarget() ?? document.body
this.observer.observe(target, { childList: true, subtree: true, characterData: true })
```

### 影响范围

- `src/adapters/base.ts` 新增 `getObserveTarget()`（默认用 `getResponseContainerSelector()` 查找容器，不破坏已有适配器）
- `src/adapters/claude.ts` 覆盖为 `getScrollContainer()`
- `src/core/outline-manager.ts` 修改 `startAutoUpdate`
- 其他适配器通过基类默认实现自动生效；未实现 `getResponseContainerSelector()` 的适配器自动 fallback 到 `document.body`

---

## Phase 3：`treeKey` 改用 hash

**状态**：已完成

### 问题描述

```ts
const outlineKey =
  sessionScopeKey +
  "|" +
  showWordCountFlag +
  "|" +
  outlineData.map((i) => `${i.text}:${(i as ExtendedOutlineItem).isBookmarked}`).join("|")
```

1000 个标题时，字符串可能超过 10 万字符，每次 `refresh()` 都要进行超长字符串比较。

### 修复方案

使用 djb2 hash 将全文 key 压缩为 32 位 hex 字符串：

```ts
function djb2Hash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}
```

修改 key 生成：

```ts
const rawKey =
  sessionScopeKey +
  "|" +
  showWordCountFlag +
  "|" +
  outlineData.map((i) => `${i.text}:${(i as ExtendedOutlineItem).isBookmarked}`).join("|")
const outlineKey = djb2Hash(rawKey)
```

### 影响范围

- 仅 `_doRefresh` 中 key 生成逻辑
- 风险：极低（理论上存在 hash 碰撞，但 djb2 碰撞概率极低，且碰撞最多跳过一次刷新）

---

## Phase 4：~~消除 Layout Thrashing~~（`updateScrollPositions`）

**状态**：跳过（诊断有误）

### 原始诊断（有误）

原计划认为 `getBoundingClientRect()` 循环调用构成 Layout Thrashing。

### 实际分析

经审查，`updateScrollPositions` 中 **不存在 Layout Thrashing**：

- `getClientRects()` / `getBoundingClientRect()` 均为 DOM 只读操作
- `node.scrollTop = top` / `node.scrollHeight = height` 写的是 JS 对象属性（`OutlineNode`），**不是 DOM 属性**
- 无 DOM 读写交替，浏览器首次读取后使用缓存布局，不会反复重排

仅有的小优化空间（收益极低，暂不处理）：

1. `getClientRects()` + `getBoundingClientRect()` 每个元素两次 API 调用，可合并为一次
2. 元素重连接逻辑（`querySelectorAll`）可前置到测量循环外

---

## Phase 5：修复 fallback 竞态

**状态**：已完成

### 问题描述

```ts
// fallbackRefreshTimer 触发时清空 treeKey
this.fallbackRefreshTimer = setTimeout(() => {
  this.treeKey = "" // 强制重建
  this.refresh()
}, FALLBACK_DELAY)
```

如果 `refresh()` 在 timer 触发前已正常更新了 `treeKey`，但 timer 里又清空 `treeKey` 强制重建，会导致用户之前手动调整的折叠状态被重置（因为重建时 `currentStateMap` 来自旧树，而树被强制清空重建）。

### 修复方案

在 fallback timer 回调中，先检查当前 `treeKey` 是否与触发 timer 时相同；若已变化（说明正常刷新已发生），跳过本次 fallback：

```ts
const keyAtSchedule = this.treeKey

this.fallbackRefreshTimer = setTimeout(() => {
  this.fallbackRefreshTimer = null
  if (Date.now() - this.lastTreeChangeTime >= OutlineManager.FALLBACK_DELAY - 100) {
    // 只有 treeKey 没有自然更新时才强制重建
    if (this.treeKey === keyAtSchedule) {
      this.treeKey = ""
      this.refresh()
    }
  }
}, OutlineManager.FALLBACK_DELAY)
```

---

## Phase 6：修复生成完成后切 Tab 漏刷新

**状态**：已完成

### 问题描述

```ts
if (this.wasGenerating && !isGenerating && !this.postGenerationScheduled) {
  this.postGenerationScheduled = true
  setTimeout(() => {
    this.postGenerationScheduled = false
    this.treeKey = ""
    this.refresh()
  }, 500)
}
```

用户在 AI 生成完成前切走 Tab（`setActive(false)` → `stopAutoUpdate()`），500ms 后 `postGenerationScheduled` 复位、500ms 的刷新执行，但此时 observer 已停止——当用户切回 Tab 时，最终的生成结果不会被扫描。

### 修复方案

新增 `pendingPostGenerationRefresh` flag，在 `setActive(true)` 时检查并补一次刷新：

```ts
private pendingPostGenerationRefresh = false

// 在 postGeneration setTimeout 中
setTimeout(() => {
  this.postGenerationScheduled = false
  if (!this.isActive) {
    // Tab 已切走，标记为待刷新
    this.pendingPostGenerationRefresh = true
    return
  }
  this.treeKey = ""
  this.refresh()
}, 500)

// 在 setActive 中
setActive(active: boolean) {
  this.isActive = active
  this.updateAutoUpdateState()
  if (active && this.pendingPostGenerationRefresh) {
    this.pendingPostGenerationRefresh = false
    this.treeKey = ""
    this.refresh()
  }
}
```

### 影响范围

- `outline-manager.ts` `setActive` 和 `executeAutoUpdate` 方法
- 新增一个 `boolean` 属性，极小改动

---

## Phase 7：虚拟列表（OutlineTab 大量节点渲染优化）

**状态**：评估中，不进入当前迭代（工程量较大，需单独讨论）

### 问题描述

`OutlineTab.tsx` 对所有可见节点直接渲染 DOM，1000+ 节点时：

- React reconcile 开销大
- 所有节点的 `ref` 均保留在内存中

### 可能方案

1. 使用 `react-window` / `react-virtual` 添加虚拟滚动
2. 手写分页/懒加载（仅渲染可见区域 ±100px 的节点）
3. 折叠状态下大量节点不渲染，实际影响可能较小——需先用 Profiler 量化

---

## 执行规则

1. 严格按 Phase 1 → Phase 2 → ... → Phase 6 顺序执行
2. 每完成一个 Phase，需要用户确认再继续下一个
3. 每个 Phase 在独立提交中完成
4. 分支名：`perf/outline-optimizations`
5. Phase 7 虚拟列表单独评估，不在本计划内强制执行
