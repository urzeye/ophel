# 长会话性能审计报告

> 更新日期：2026-06-23
> 背景：#675 长会话性能退化。已完成 #678/#680；#681 由 PR #683 实现中。本文作为长会话性能优化的 tracking 文档，`docs/developer/outline-performance-plan.md` 保留为早期大纲专项计划，不再承载 #675 的后续拆分。

## 结论

PR #683 的方向是正确的：大纲面板从“按全部可见节点渲染”改为“按视口窗口 + overscan 渲染”，对 500+ 可见大纲项场景有直接收益。它解决的是 #681 的大纲面板 React/DOM 成本，不是 #675 的完整解法。

#675 剩余瓶颈仍主要在虚拟列表外：

1. 常驻 timer/observer 触发全量扫描：大纲固定刷新、全局搜索刷新大纲、Shadow DOM/Markdown/Quick Quote 扫描。
2. 长 DOM 上的全量提取和测量：`extractOutline()`、`updateScrollPositions()`、adapter 字数统计。
3. 大对象 store 写入和 UI 派发：会话同步逐条更新 Zustand/persist，放大为多次对象拷贝、序列化和列表重算。

后续优化不要继续优先做大纲 UI 微调，应先拆掉后台反复执行的全量工作。

## 当前进展

| 任务 | 状态 | 实现/Issue | 说明 |
| --- | --- | --- | --- |
| 生成期 observer 与 refresh 防抖 | 已完成 | #678 / PR #677 | `OutlineManager` 自动更新 observer 不再监听 `characterData`；refresh 增加全局 debounce；URL 变化错峰探测。 |
| 隐藏大纲节点渲染与书签匹配 | 已完成 | #680 / PR #682 | 隐藏节点改为条件渲染；书签匹配从 O(n*m) 改为 Map。 |
| 大纲虚拟滚动 | 实现中 | #681 / PR #683 | `tree + visibleMap` 展平为 `visibleItems`，只渲染 viewport + overscan。 |
| 虚拟行高硬化 | 已推送到 PR #683 | commit `550216d` | 固定行高拆为可读常量；虚拟列表内 locate highlight 不再用 2px border；禁用 user query hover 位移；增加 debug-only 行高漂移告警。 |
| 后续性能拆分 | 已建 issue | #684-#690 | 见下方 issue mapping。 |

## PR #683 当前判断

### 已解决

- 大纲面板可见项很多时，不再一次性挂载所有行。
- 继续复用现有 `visibleMap`，没有引入第二套可见性规则。
- 搜索、复制完整大纲、全局搜索、source switching、正文滚动同步和正文跳转的数据流保持不依赖已挂载 DOM。
- `scrollOutlineNodeIntoView()` 基于虚拟 metrics 定位，目标行未挂载时也能滚到对应虚拟行。
- locate current 改为 `revealNode()` 后滚动虚拟列表，等待行挂载后再高亮。

### 已补强的行高约束

固定行高仍是 #683 的关键正确性约束。当前 PR 已做以下硬化：

- `OUTLINE_ITEM_HEIGHT` 拆成 `24px line-height + 12px vertical padding + 2px border = 38px`。
- 虚拟列表通过 `--gh-outline-item-height` 约束真实 `.outline-item` 高度。
- 用户提问行的额外间距由虚拟 row padding 管理，虚拟列表内清除原 margin。
- 虚拟列表内 locate highlight 使用 1px border + box-shadow，不再用 2px border 压缩内容盒。
- 虚拟列表内禁用 user query hover 的 `translateY(-1px)`，避免绝对定位行视觉重叠。
- 可通过 `document.documentElement.dataset.ophelDebugOutlineVirtualHeights = "true"` 或 `localStorage["ophel.debugOutlineVirtualHeights"] = "1"` 开启行高漂移告警。告警只在 debug 开关开启时抽样已挂载行，不进入生产高频路径。

### 仍需回归

- 普通 heading、user query、sync-highlight、locate-highlight、bookmark/copy hover 不改变真实行高。
- 快速滚动 500+ 可见项时无白屏、错位、闪烁。
- 搜索清空、书签模式、source 切换、定位当前大纲、正文滚动同步高亮。
- Chrome 扩展构建与油猴构建。

## 已明确不做

以下两项此前作为候选拆分出现过，但当前不建 issue、不进入近期执行：

- 长会话性能基线/benchmark fixtures：暂不做独立 issue。
- 用量计数器全文 token 估算缓存：仍是潜在风险，但当前不作为 #675 近期拆分项。

## Issue Mapping

| Issue | 优先级 | 状态 | 范围 | 验收重点 |
| --- | --- | --- | --- | --- |
| #675 | Epic | Open | 长会话性能退化总任务 | 只做 tracking，不直接承载实现 PR。 |
| #679 | Tracking | Open | 已完成长对话查看性能 | 汇总 #680/#681 以及后续查看路径优化。 |
| #681 | P0 | Open，PR #683 实现中 | 大纲面板虚拟滚动 | PR #683 合并后可关闭。 |
| #684 | P0 | Open | 移除大纲无条件刷新轮询 | 大纲面板关闭且页面 idle 时，不再每 2s 触发 outline extraction。 |
| #685 | P0 | Open | 全局搜索与大纲轮询解耦 | 打开搜索框但不输入时，不持续 refresh outline；输入延迟下降。 |
| #686 | P0/P1 | Open | 大纲滚动同步与位置重测量降本 | source scroll 同帧合并；`characterData` stale observer 降噪；`updateScrollPositions()` 惰性/邻近测量。 |
| #687 | P1 | Open | 会话同步批量写入 Zustand store | 同步 N 条会话时 set/persist 从 O(N) 降到 O(1) 或小常数。 |
| #688 | P1 | Open | adapter 大纲抽取输入与字数统计缓存 | 同一 DOM version 下重复 refresh 的 adapter 抽取耗时下降。 |
| #689 | P1 | Open | 虚拟大纲列表自身滚动渲染节流 | 大纲列表快速滚动时减少 React render，无白屏/错位/闪烁。 |
| #690 | P1 | Open，PR #683 已部分覆盖 | 虚拟行高漂移校验 | 如果 PR #683 的 debug-only 校验足够，合并后可关闭或缩小为后续 CSS 回归守护。 |

## 待完成优化项

### P0：移除大纲无条件刷新轮询（#684）

当前 `src/components/App.tsx` 仍创建 `setInterval(() => outlineManager.refresh(), 2000)`。长会话中，即使用户没有打开大纲 Tab，也会定期扫描会话 DOM。#683 只减少大纲列表渲染，不能减少这个扫描成本。

建议：

- 去掉固定 2s refresh，改为事件驱动：初始化、URL 变化、生成完成、手动刷新、书签变化、设置/source 变化。
- 如需兜底轮询，只在 outline enabled、页面可见、autoUpdate enabled、且大纲面板 active 或最近被使用时运行。
- tree 连续稳定后指数退避到 10-30s。
- refresh 尽量通过 `requestIdleCallback` 或等价调度避开输入和滚动高峰。

风险：

- 直接删除轮询可能暴露某些站点 observer 漏事件。需要重点回归 ChatGPT、Claude、Gemini、DeepSeek、Doubao 的生成完成刷新。

### P0：全局搜索与大纲轮询解耦（#685）

全局搜索打开后当前会每 1200ms 调 `outlineManager.refresh()`，并对 conversations/prompts/settings/outline 执行 normalized fields 构建、fuzzy/typo 评分和排序。长会话中，打开搜索框会把大纲抽取变成常驻主线程工作。

建议：

- 搜索打开时最多 refresh 一次；后续只订阅 `outlineManager.subscribe()`。
- 输入查询使用现有 debounce 或 `useDeferredValue`，避免每个 keypress 同步全量评分。
- 为 conversations/prompts/settings/outline 建 normalized index，数据变更时增量更新。
- 候选数量过大时先 includes/prefix 粗过滤，再对前 N 个做 fuzzy score。

风险：

- 搜索结果新鲜度从“轮询更新”变为“事件更新”。需要保证大纲、会话、提示词、设置变更都会更新索引版本号。

### P0/P1：降低大纲滚动同步与位置重测量成本（#686）

#683 保留 `manager.findVisibleItemIndex()` 是正确的，但正文滚动同步仍可能高频触发 DOM 测量。`OutlineTab` 的 source scroll container observer 仍监听 `characterData`，流式生成时会反复标记 scroll positions stale。

建议：

- `OutlineTab` source scroll handler 用单个 `requestAnimationFrame` 合并同一帧内多次 scroll。
- 只有 `visibleIdx` 变化时才更新 DOM class 和滚动大纲列表。
- `observeRoot()` 首版移除 `characterData: true`，只监听 `childList/subtree`；如个别站点需要文本变化更新标题高度，再做站点级或低频 fallback。
- `updateScrollPositions()` 改为 lazy/viewport-near 测量，避免 stale 后全量读取所有 source 元素 rect。
- 同一轮测量中只用一次 `getBoundingClientRect()`，不再先 `getClientRects()` 再读 rect。

风险：

- 某些站点流式输出会导致标题换行高度变化。需要验证生成中新增标题、展开 thinking、图片加载、代码块渲染后的同步高亮准确性。

### P1：会话同步批量写 store（#687）

`syncConversations()` 当前逐条调用 `updateConversation()` / `addConversation()` / `deleteConversation()`。同步 100 条会话时，会变成多次复制大对象、多次 persist 调度和多次 UI data change 风险。

建议：

- 在 `conversations-store` 增加批量 action，例如 `upsertManyConversations(upserts, deletes, lastUsedFolderId?)`。
- `syncConversations()` 先收集 diff，再一次提交并只通知一次。
- 会话 Tab 尽量减少 manager 事件 + 本地全量镜像；至少让 `loadData()` 合并和引用稳定。

风险：

- 批量 action 要保留 `updatedAt`、`syncUnpin`、`syncDeleted`、`lastUsedFolderId`、站点/team cid 过滤语义，并检查备份/恢复兼容。

### P1：adapter 大纲抽取和字数统计缓存（#688）

大纲虚拟化不减少 adapter 抽取成本。多数 adapter 的 `extractOutline()` 都通过 `querySelectorAll` 扫完整回复容器；`showWordCount` 开启后，部分站点还会重复查询用户问题和回复。

建议：

- 先优化 ChatGPT、Claude、Gemini。
- 每次 extract 先一次性收集 userQueries/responses/headings，并传给 word count helper，不在每个节点里重复 query。
- 对 word count 使用 element + text hash 缓存，只有文本变化时重新计算。
- 暂不把站点特定缓存逻辑上移到 `SiteAdapter` 基类，除非多个站点已经验证共享同一抽象。

风险：

- 不同站点 DOM 差异大，适合先做缓存和一次性收集，再考虑增量接口。

### P1：虚拟大纲列表滚动渲染节流（#689）

#683 的虚拟列表自身 scroll 目前会通过 `outlineScrollTop` / `outlineViewportHeight` state 触发 React render。快速滚动时可能吃掉一部分虚拟化收益。

建议：

- 用单个 `requestAnimationFrame` 合并同一帧内的大纲列表 scroll 事件。
- 只在虚拟 range 或顶部/底部按钮状态实际变化时 setState。
- 保留 `userScrollingOutlineRef`，用户手动滚动大纲时继续暂停正文同步自动定位。

风险：

- 需要确保 `scrollOutlineNodeIntoView()`、locate current、正文滚动同步仍能驱动虚拟列表显示目标行。

### P1：虚拟行高漂移校验后续（#690）

PR #683 已实现 debug-only 行高漂移告警。#690 后续可以按 PR 验收结果决定：

- 如果当前告警足够，#683 合并后关闭 #690。
- 如果需要更完整覆盖，则保留 #690 跟踪 hover/highlight/bookmark/copy 状态的手动回归流程或开发工具开关文档。

## 功能开关相关风险（暂不拆 issue）

这些不是当前第一批 issue，但后续遇到对应功能卡顿时应回到这里拆分：

- 浏览器标签页监控：auto rename interval、网络生成确认 200ms poll、DOM completion 150ms poll、SPA URL 变化兜底 poll。
- Shadow DOM 注入：布局功能启用后周期遍历 ShadowRoot，可考虑 ShadowRoot registry 和 page visibility gating。
- 用户提问 Markdown：2s rescan 可改为 addedNodes observer + 低频 fallback。
- Quick Quote 引用 chips：observer 监听 attributes/characterData/childList/subtree 较宽，可改为以 addedNodes 为入口增量处理。
- `DOMToolkit.query(..., { all: true, shadow: true })`：不应出现在高频 timer、scroll、input、MutationObserver 同步路径。

## 推荐执行顺序

1. 合并并验证 PR #683；它关闭 #681，但不关闭 #675。
2. 第一批处理 #684、#685、#686，先拆掉后台大纲刷新、搜索轮询和滚动同步测量成本。
3. 第二批处理 #687、#688，降低会话同步和 adapter 抽取成本。
4. #689 作为 #683 后续微优化，视真实滚动表现决定是否提前。
5. #690 在 #683 合并后按行高校验实际覆盖情况关闭或收窄。

## 验证建议

当前不单独做 benchmark fixture issue，但每个性能 PR 仍应记录最小 before/after：

- 大纲面板内 `.outline-item` 挂载数量。
- `outlineManager.refresh()`、`extractOutlineForSource()`、`updateScrollPositions()` 单次耗时。
- 长会话正文滚动时 dropped frames 或明显 jank。
- 全局搜索输入每字符耗时。
- 会话同步时 Zustand set/persist 次数和同步总耗时。
- 必要时用 Chrome DevTools Performance/Memory 采样，避免只用“感觉不卡”判断。
