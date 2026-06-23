# 长会话性能审计报告

> 更新日期：2026-06-23
> 背景：#675 长会话性能退化。已完成 #678/#680/#681/#684/#685；#686 已拆分为 #693/#694。本文作为长会话性能优化的 tracking 文档，`docs/developer/outline-performance-plan.md` 保留为早期大纲专项计划，不再承载 #675 的后续拆分。

## 结论

PR #683 已合并，方向是正确的：大纲面板从“按全部可见节点渲染”改为“按视口窗口 + overscan 渲染”，对 500+ 可见大纲项场景有直接收益。它解决的是 #681 的大纲面板 React/DOM 成本，不是 #675 的完整解法。

#675 剩余瓶颈仍主要在虚拟列表外。#684/#685 已移除 App 级大纲无条件刷新和全局搜索大纲轮询，下一批应继续压缩用户正在查看长会话时的滚动同步、DOM 测量、adapter 抽取和 store 写入成本：

1. 正文滚动同步和位置测量：`OutlineTab` source scroll 同步高亮、stale observer、`updateScrollPositions()`。
2. 长 DOM 上的全量提取：adapter `extractOutline()`、用户提问提取、字数统计。
3. 大对象 store 写入和 UI 派发：会话同步逐条更新 Zustand/persist，放大为多次对象拷贝、序列化和列表重算。
4. 其他功能开关的周期扫描：Shadow DOM/Markdown/Mermaid/表格复制/Quick Quote 等仍需按 profiling 决定是否拆分。

后续优化不要继续优先做大纲 UI 微调；#693 应先把正文滚动同步从“全量高度/位置缓存推断当前项”改为“真实 mounted DOM/native active 判定”，再由 #694 处理剩余跳转、书签或统计路径里的位置测量成本。

## 当前进展

| 任务 | 状态 | 实现/Issue | 说明 |
| --- | --- | --- | --- |
| 生成期 observer 与 refresh 防抖 | 已完成 | #678 / PR #677 | `OutlineManager` 自动更新 observer 不再监听 `characterData`；refresh 增加全局 debounce；URL 变化错峰探测。 |
| 隐藏大纲节点渲染与书签匹配 | 已完成 | #680 / PR #682 | 隐藏节点改为条件渲染；书签匹配从 O(n*m) 改为 Map。 |
| 大纲虚拟滚动 | 已完成 | #681 / PR #683 | `tree + visibleMap` 展平为 `visibleItems`，只渲染 viewport + overscan；PR #683 已合并，#681 可关闭。 |
| 虚拟行高硬化 | 已合并 | commit `550216d` | 固定行高拆为可读常量；虚拟列表内 locate highlight 不再用 2px border；禁用 user query hover 位移；增加 debug-only 行高漂移告警。 |
| 移除大纲无条件刷新轮询 | 已完成 | #684 / PR #691 | App 级固定 2s 大纲刷新已移除，保留初始化、URL 错峰探测、显式刷新和按需激活刷新。 |
| 全局搜索与大纲轮询解耦 | 已完成 | #685 / PR #692 | 全局搜索不再靠 1200ms 轮询刷新大纲；改为搜索打开时按需刷新、订阅 outline 事件并使用 normalized index。 |
| 大纲滚动同步拆分 | 已拆分 | #686 -> #693/#694 | #693 处理 source scroll rAF 合帧、stale observer 降噪，并重写当前项判定为 mounted DOM/native active 驱动；#694 处理剩余位置测量降本。 |
| 后续性能拆分 | 已建 issue | #684-#694 | 见下方 issue mapping。 |

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
| #681 | P0 | Open，PR #683 已合并 | 大纲面板虚拟滚动 | 建议关闭。 |
| #684 | P0 | Closed，PR #691 已合并 | 移除大纲无条件刷新轮询 | 大纲面板关闭且页面 idle 时，不再每 2s 触发 outline extraction。 |
| #685 | P0 | Closed，PR #692 已合并 | 全局搜索与大纲轮询解耦 | 打开搜索框但不输入时，不持续 refresh outline；输入延迟下降。 |
| #686 | P0/P1 | Open，已拆分 | 大纲滚动同步与位置重测量降本 | 父 issue；执行拆到 #693/#694。 |
| #693 | P0/P1 | Open，下一步实施 | 大纲正文滚动同步 rAF 合帧、stale observer 降噪与当前项判定重写 | source scroll 同帧合并；滚动高亮只接受当前 mounted DOM 或站点 native active 证据；移除 `characterData` stale observer；没有可靠证据时不高亮。 |
| #694 | P1 | Open，#693 后实施 | 大纲位置缓存测量降本 | `updateScrollPositions()` 不再作为滚动高亮真值，只优化点击跳转、书签、调试或其他仍需位置数据的低频路径；减少重复 geometry read。 |
| #687 | P1 | Open | 会话同步批量写入 Zustand store | 同步 N 条会话时 set/persist 从 O(N) 降到 O(1) 或小常数。 |
| #688 | P1 | Open | adapter 大纲抽取输入与字数统计缓存 | 同一 DOM version 下重复 refresh 的 adapter 抽取耗时下降。 |
| #689 | P1 | Open | 虚拟大纲列表自身滚动渲染节流 | 大纲列表快速滚动时减少 React render，无白屏/错位/闪烁。 |
| #690 | P1 | Open，PR #683 已覆盖核心校验 | 虚拟行高漂移校验 | 如果当前 debug-only 校验足够，可关闭或缩小为后续 CSS 回归守护。 |

## 待完成优化项

### 已完成：大纲与全局搜索后台轮询收敛（#684/#685）

#684 已由 PR #691 合并：移除 App 级固定 2s 大纲刷新，保留初始化 refresh、URL 错峰探测、显式刷新、设置/source/书签变化和按需激活刷新。

#685 已由 PR #692 合并：全局搜索不再每 1200ms 调 `outlineManager.refresh()`；打开搜索时只做按需 refresh，并通过 `outlineManager.subscribe()`、`outlineSearchVersion` 和 normalized index 维护搜索结果新鲜度。PR #692 还补上了全局搜索打开期间的 outline active consumer，避免长回复生成时大纲候选 stale。

### P0/P1：降低大纲滚动同步与位置重测量成本（#686 -> #693/#694）

#683 保留的 `manager.findVisibleItemIndex(scrollTop, viewportHeight)` 不能继续作为正文滚动高亮真值。该方案依赖全量 heading/user query 的高度与位置缓存，但 Gemini 历史懒加载、ChatGPT/DeepSeek/Z.ai 等虚拟滚动会卸载离屏 DOM，缓存高度和旧 rect 很容易过期；在重复标题、同前缀用户问题或 DOM remount 后，还可能把当前正文位置映射到错误大纲项。正文滚动同步需要从“预测离屏节点位置”改为“只相信当前真实挂载 DOM 或站点原生活跃状态”。`OutlineTab` 的 source scroll container observer 仍监听 `characterData`，流式生成时也会反复标记 scroll positions stale。

拆分后执行顺序：

1. #693：`OutlineTab` source scroll handler 用单个 `requestAnimationFrame` 合并同一帧内多次 scroll；当前项判定改为 mounted DOM/native active 驱动，只从当前已挂载的 `OutlineItem.element` 或站点原生 active 状态得到 outline index；没有可靠 mounted 证据时返回 `null`，宁可不高亮也不误高亮；`observeRoot()` 首版移除 `characterData: true`，只监听 `childList/subtree`。
2. #694：`updateScrollPositions()` 不再服务滚动高亮主路径；只优化仍需要位置数据的低频场景，例如跳转前定位、书签 scrollTop、debug 校验或站点兼容兜底。同一轮测量中避免先 `getClientRects()` 再读 `getBoundingClientRect()`；不要再把 lazy/viewport-near 测量设计成新的高亮真值。

风险：

- 某些站点没有稳定 native active 状态，只能依赖当前 mounted DOM。虚拟滚动卸载真实内容时，高亮可能短暂清空；这是比错高亮更可接受的行为。
- `OutlineItem.element` / stable id 只适合作为当前已挂载 DOM 的精确映射，不适合作为离屏节点的预测来源。DOM remount 后必须由下一次 outline refresh 或 adapter stable id 重新绑定。
- #693 不再扩大 `updateScrollPositions()` 的测量模型；#694 不改变 `OutlineTab` 的 scroll event scheduling，避免两个风险面混在同一个 PR。

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

## 功能开关相关风险与后续候选（暂不抢优先级）

这些不是当前第一批 issue。原则是先完成 #693/#694/#687/#688；只有 profiling 显示对应功能在长会话中仍有明显主线程成本，才继续拆分。

### 后续可拆 issue 候选

| 候选项 | 现状 | 建议方向 | 优先级判断 |
| --- | --- | --- | --- |
| 渲染增强扫描事件化 | 用户提问 Markdown 2s rescan；Assistant Mermaid 2s rescan；Shadow DOM 表格复制 1s rescan；都可能走 `DOMToolkit.query(..., { all: true, shadow: true })`。 | 用 addedNodes/known root observer 作为主路径；维护 ShadowRoot registry；保留 page hidden/focus gating；兜底轮询指数退避并尽量 idle 调度。 | P2；如果用户开启这些功能后长会话仍卡，可升为 P1。 |
| 会话列表 DOM 轮询降本 | #687 只解决 store 批量写入；`ConversationManager` 仍有 sidebar DOM 轮询和标题观察路径。 | 先做 #687；之后若 sidebar/list 同步仍耗时，再做 observer 可靠性、可见性 gating、列表容器 version 判断和批量派发。 | P1/P2；取决于 #687 后的 profiling。 |
| SPA URL 变化轮询统一 | `modules-init.ts` 有 1s URL fallback，`App.tsx` 还有 500ms URL 检查用于清空 prompt/textarea。 | 统一到单一路由变化服务或事件通道；保留低频兼容兜底，避免多个模块各自轮询 URL。 | P2；兼容性风险高，不应早于 #693/#694。 |
| Usage Counter 触发范围降本 | 已明确不做 token 估算缓存，但 mount loop、pending send 检测和 Shadow DOM 查询仍是启用后成本。 | 只优化触发范围：mounted 后降频/停止 mount loop，pending 检测加超时和 generation 事件优先，减少全 shadow 查询。 | P2；仅在功能启用且 profiling 命中时拆。 |
| Tab/Queue 生成状态轮询收敛 | Tab auto rename 有网络生成确认 200ms poll、DOM completion 150ms poll；Queue dispatcher 有 1s poll。 | 限定运行窗口、页面可见性 gating、复用 network monitor 事件；不要影响通知和队列可靠性。 | P2；属于主动功能态，不是长会话查看主路径。 |

### 保留为风险观察项

- Shadow DOM 注入：布局功能启用后周期遍历 ShadowRoot，可考虑 ShadowRoot registry 和 page visibility gating。
- Quick Quote 引用 chips：observer 监听 attributes/characterData/childList/subtree 较宽，可改为以 addedNodes 为入口增量处理，并和“渲染增强扫描事件化”合并考虑。
- Inline Bookmark：#691 已补上大纲 Tab 关闭时的候选新鲜度路径；后续只在 inline bookmark mode 为 always 且长会话仍有明显 DOM work 时再单独 profile。
- `DOMToolkit.query(..., { all: true, shadow: true })`：不应出现在高频 timer、scroll、input、MutationObserver 同步路径。

## 推荐执行顺序

1. 收尾 #681/#690：PR #683 已合并；关闭 #681，按需确认 #690 是否可关闭或缩小为 CSS 回归守护。
2. 已完成 #684/#685：PR #691/#692 已合并，后台无条件大纲轮询和全局搜索大纲轮询已移除。
3. 下一步做 #693：正文 source scroll rAF 合帧、mounted DOM/native active 当前项判定、active/visible index 去重、移除 `characterData` stale observer。
4. 接着做 #694：`updateScrollPositions()` 从滚动高亮主路径退出后，减少剩余低频路径的 DOM geometry read；不再把位置缓存当作当前项真值。
5. 第二批做 #687：会话同步批量写入 Zustand store，减少长会话列表同步时的多次 persist 和对象拷贝。
6. 第二批做 #688：优化 ChatGPT/Claude/Gemini 等 adapter 的大纲抽取输入收集和字数统计缓存。
7. 视 profiling 决定 #689：只有大纲列表自身快速滚动仍有明显 render 压力时，再做 rAF 合帧和 range 变化才 setState。

## 验证建议

当前不单独做 benchmark fixture issue，但每个性能 PR 仍应记录最小 before/after：

- 大纲面板内 `.outline-item` 挂载数量。
- `outlineManager.refresh()`、`extractOutlineForSource()`、`updateScrollPositions()` 单次耗时。
- 长会话正文滚动时 dropped frames 或明显 jank。
- 全局搜索输入每字符耗时。
- 会话同步时 Zustand set/persist 次数和同步总耗时。
- 必要时用 Chrome DevTools Performance/Memory 采样，避免只用“感觉不卡”判断。
