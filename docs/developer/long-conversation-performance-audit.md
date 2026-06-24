# 长会话性能审计报告

> 更新日期：2026-06-25
> 审计对象：`main` @ `4af6e3a6` + PR #715
> 背景：#675 长会话性能退化。#678/#680/#681/#684/#685/#687/#688/#689/#690/#693/#694 已完成；#686 作为父 issue 仍 open；#679/#675 继续作为 tracking。

## 结论

最近一批已合并到 main 的性能 PR 覆盖了此前文档列出的主要 P0/P1 路径：

1. 大纲渲染从全量 DOM 渲染转为虚拟列表，并补了 debug-only 行高漂移校验。
2. App 级 2s 大纲无条件刷新和全局搜索 1200ms 大纲轮询已移除。
3. 正文滚动同步已改为 rAF 合帧、优先使用当前 mounted DOM/native active 证据，并去掉 `characterData` stale observer。
4. `updateScrollPositions()` 的 geometry read 已降为单次 `getClientRects()`，并复用同轮重复元素测量。
5. 会话 sidebar 同步已从逐条 Zustand set/persist 改成一次批量提交。
6. ChatGPT/Claude/Gemini 的大纲字数统计已加入 element + 文本签名缓存，并减少重复 query。
7. 虚拟大纲列表自身 scroll/resize state 已 rAF 合帧，并只在 virtual range、viewport 或按钮状态变化时更新 React state。
8. Doubao、Qwen Studio 针对虚拟/懒挂载正文增加站点级周期刷新兜底；该兜底只在大纲激活、自动更新开启且 source 为 conversation 时运行，并复用现有“更新检测间隔”设置。

本次静态审计没有发现需要立即回滚的确定性 bug。仍需注意：这些 PR 多数改变的是调度、缓存和 DOM 证据选择，当前仓库没有自动化运行时测试覆盖真实站点长会话，因此结论只能证明“静态上未见明显语义破坏”，不能替代 Chrome 扩展和油猴脚本的手动回归与 profiling。

针对虚拟/懒挂载正文的大纲补齐，当前采用保守方案：不恢复全站点无条件轮询，也不在 `OutlineManager` 增加通用标题回填缓存；core 只提供站点 opt-in 的周期 refresh timer，标题 identity、缓存和排序仍由各站点 adapter 自己负责。DeepSeek、Qianwen 当前未确认存在该问题，ChatGPT、AI Studio 仍待测试，因此暂不启用该兜底。

## 当前进展

| 任务 | 状态 | 实现/提交 | 静态审计结论 |
| --- | --- | --- | --- |
| 生成期 observer 与 refresh 防抖 | 已完成 | #678 / PR #677 / `c114444` | `OutlineManager` 自动更新 observer 不再监听 `characterData`；refresh 增加全局 debounce；方向仍正确。 |
| 隐藏大纲节点渲染与书签匹配 | 已完成 | #680 / PR #682 / `bf33117` | 隐藏节点条件渲染、书签匹配 Map 化；未在后续 PR 中被逆转。 |
| 大纲虚拟滚动 | 已完成 | #681 / PR #683 / `51e905c` | 只渲染 viewport + overscan；虚拟 metrics 继续作为 outline panel 定位依据。 |
| 移除大纲无条件刷新轮询 | 已完成 | #684 / PR #691 / `f0c68f3` | App 级固定 2s refresh 已移除，保留初始化、URL 错峰探测、显式刷新和 active consumer 刷新。 |
| 全局搜索与大纲轮询解耦 | 已完成 | #685 / PR #692 / `0c98227` | 搜索打开时按需 refresh，并订阅 outline 事件维护 index；不再持续 1200ms 调 refresh。 |
| 正文滚动同步合帧与降噪 | 已完成 | #693 / PR #695 / `f4eaea1` | scroll handler 单帧合并；DOM class 更新和 outline auto-scroll 会跳过 unchanged index；source observer 只监听 `childList/subtree`。 |
| 大纲位置缓存测量降本 | 已完成 | #694 / PR #696 / `343d810` | 同一轮测量使用一次 `getClientRects()`，重复元素 WeakMap 复用；断连节点先 re-resolve，失败才用旧缓存。 |
| 会话同步批量写 store | 已完成 | #687 / PR #697 / `00fcd46` | `syncConversations()` 先收集 upserts/updates/deletes，再用 `applyConversationChanges()` 一次写入；保留 site/cid、syncDeleted、syncUnpin 过滤语义。 |
| adapter 字数统计缓存 | 已完成 | #688 / PR #698 / `c6b1c42` | ChatGPT/Claude/Gemini 使用 WeakMap 缓存 word count；签名包含起点、边界和容器文本 hash，静态上覆盖流式文本变化。 |
| 虚拟大纲列表滚动渲染节流 | 已完成 | #689 / PR #699 / `5e92621` | outline list scroll/resize 通过 rAF 合帧；programmatic scroll 会 force sync，避免目标虚拟行延迟挂载。 |
| 虚拟行高漂移校验 | 已完成 | #690 / PR #700 / `032eb10` | #683 的 debug-only 校验覆盖该 follow-up；文档已关闭独立任务。 |
| 虚拟/懒挂载正文大纲刷新兜底 | 已完成 | PR #715 / 本次变更 | 只为 Doubao、Qwen Studio 开启 active-only 周期 refresh fallback；不引入 core 通用标题缓存，避免跨站点身份推断和缓存污染。 |

## 静态审计结果

### #695 正文滚动同步

审计文件：`src/components/OutlineTab.tsx`、`src/core/outline-manager.ts`、`src/hooks/useShortcuts.ts`。

- `OutlineTab` 的 source scroll sync 现在每帧最多执行一次 `manager.findMountedActiveItemIndex()`，并且只有 active index 或 visible index 变化时才改 DOM class 或触发 outline auto-scroll。
- MutationObserver 只监听 `childList/subtree`，不再因流式文本 `characterData` 持续标记 scroll positions stale。
- 当前项判定优先从 viewport 采样点命中的 mounted outline element、包含 section 或 ShadowRoot host 链路映射得到 index。
- DeepSeek/Z.ai 仍保留 cached fallback：`shouldKeepPreviousVisibleItem()` 为 true 且 scroll positions 非 stale 时，才会退回 `findVisibleItemIndex()`。这和“没有 mounted 证据时宁可不高亮”的严格策略有差异，但作用域限制在原本需要长内容间隙保持上一项高亮的站点，静态上没有扩大到所有站点。
- 风险：采样点被站点浮层、sticky header 或虚拟滚动占位层遮挡时，可能短暂回退到 cached fallback 或清空高亮。需要手动覆盖 ChatGPT、Gemini、Claude、DeepSeek、Z.ai 长会话滚动。

### #696 位置缓存测量

审计文件：`src/core/outline-manager.ts`。

- `updateScrollPositions()` 不再同一元素先读 `getClientRects()` 再读 `getBoundingClientRect()`，减少 layout read。
- 同一轮测量中重复 element 用 WeakMap 复用结果。
- element 断连时会先尝试按 user query index 或 heading text re-resolve；re-resolve 失败才 push 旧 `scrollTop/scrollHeight`。
- 风险：重复标题的 text re-resolve 仍可能命中错误 heading，这是既有兜底路径，不是本次新增的高频滚动真值。后续不要再把该缓存扩展回主要滚动高亮路径。

### #697 会话同步批量写入

审计文件：`src/core/conversation/manager.ts`、`src/stores/conversations-store.ts`。

- `syncConversations()` 仍以当前 sidebar 列表为输入，保留已有 title、pinned、siteId、cid 更新逻辑。
- `syncDeleted` 仍按 siteId 和 cid 过滤，仅删除当前站点/团队范围内 sidebar 已不存在的会话。
- 新增 `applyConversationChanges()` 只在实际有 conversations 或 `lastUsedFolderId` 变化时返回新 state，减少无效 persist。
- 风险：批处理 action 是新 store API，缺少单元测试保护。需要手动验证同步、取消置顶同步、删除同步、目标文件夹同步和备份/恢复后的旧数据。

### #698 adapter 字数统计缓存

审计文件：`src/adapters/chatgpt.ts`、`src/adapters/claude.ts`、`src/adapters/gemini.ts`、`src/utils/text-hash.ts`。

- 缓存 key 不只看 heading/user element 自身文本，还包含 next boundary 与 container/root 文本 hash，避免边界之间正文变化后复用旧 word count。
- ChatGPT/Claude 把用户问题和 assistant response 查询提升到单次 extraction pass，避免每个 item 重复 query。
- WeakMap 以 DOM element 为 key，节点卸载后不会形成持久引用。
- 风险：签名仍需要读取 container/root 全文，说明 #688 主要减少 range/clone 和重复 query 成本，不等于完全消除全文读取。`hashTextForCache()` 是轻量非加密 hash，理论上存在碰撞，但对 UI 字数缓存可接受。

### #699 虚拟大纲列表 scroll state

审计文件：`src/components/OutlineTab.tsx`。

- outline list scroll/resize 通过 `outlineScrollFrameRef` 合帧。
- `syncOutlineScrollState()` 比较 virtual range、viewport height 和 top/bottom 按钮状态，未变化时不 setState。
- `scrollOutlineNodeIntoView()` 和列表高度变化路径仍会 force sync，保证点击、locate current 和正文同步驱动目标行时，虚拟 range 立即更新。
- 风险：快速滚动时只在 range 变化触发 React render，符合虚拟列表预期；仍需浏览器里看是否有白屏、错位或按钮状态延迟。

### PR #715 站点级周期刷新兜底

审计文件：`src/core/outline-manager.ts`、`src/adapters/base.ts`、`src/adapters/doubao.ts`、`src/adapters/qwen-studio.ts`。

- `SiteAdapter.usesPeriodicOutlineRefreshFallback()` 默认返回 false，避免把周期 refresh 重新扩大到所有站点。
- `OutlineManager` 的 fallback timer 复用现有 `autoUpdate` 和 `updateInterval` 设置，只在大纲处于 active consumer、当前 source 为 `conversation`、站点显式 opt-in 时运行。
- source 切换、设置变更、URL 切换和 active 状态变化都会重新同步 timer 生命周期，避免在文档 source 或非激活状态继续刷新。
- Doubao、Qwen Studio opt-in；DeepSeek、Qianwen、ChatGPT、AI Studio 暂不启用。
- 风险：该方案解决的是“新正文挂载后需要再次抽取大纲”的调度缺口，不负责保留已卸载标题。Doubao 已有 adapter 级 outline cache；Qwen Studio 仍需手动验证标题滚出可见区域后的保留效果，如仍丢失，应在 Qwen adapter 内补站点级缓存，而不是上移到 core。

## Issue Mapping

| Issue | 状态 | 范围 | 当前判断 |
| --- | --- | --- | --- |
| #675 | Open | 长会话性能退化总任务 | Epic/tracking，仍需真实长会话 profiling 后决定是否继续拆分。 |
| #679 | Open | 已完成长对话查看性能 | Tracking，汇总 #680/#681 和后续查看路径优化。 |
| #681 | Closed | 大纲面板虚拟滚动 | PR #683 已合并。 |
| #684 | Closed | 移除大纲无条件刷新轮询 | PR #691 已合并。 |
| #685 | Closed | 全局搜索与大纲轮询解耦 | PR #692 已合并。 |
| #686 | Open | 大纲滚动同步与位置重测量降本父任务 | 子任务 #693/#694 已完成；可在手动回归后评估是否关闭父 issue。 |
| #687 | Closed | 会话同步批量写入 Zustand store | PR #697 已合并。 |
| #688 | Closed | adapter 大纲抽取输入与字数统计缓存 | PR #698 已合并。 |
| #689 | Closed | 虚拟大纲列表自身滚动渲染节流 | PR #699 已合并。 |
| #690 | Closed | 虚拟行高漂移开发期校验 | PR #700 已关闭文档 follow-up；#683 已提供 debug-only 校验。 |
| #693 | Closed | source scroll rAF 合帧与 stale observer 降噪 | PR #695 已合并。 |
| #694 | Closed | 大纲位置缓存测量降本 | PR #696 已合并。 |

## 剩余风险与下一步

当前不建议继续提前拆新的性能 PR。下一步应先做真实站点回归和 profiling，确认最近合并的优化没有行为回归，也确认 #675 是否仍有主线程瓶颈。

优先验证：

1. Chrome 扩展构建和油猴构建均能通过。
2. ChatGPT、Claude、Gemini 长会话打开大纲后，快速正文滚动时高亮不误跳、不明显卡顿。
3. DeepSeek/Z.ai 长回复间隙仍能保持合理上一项高亮，不因 cached fallback 误指到完全无关节点。
4. 搜索清空、书签模式、source 切换、定位当前大纲、点击大纲跳转、复制完整大纲。
5. 全局搜索打开但不输入时不持续 refresh outline；输入搜索词时结果能随 outline refresh 更新。
6. sidebar 同步新增、标题更新、置顶/取消置顶、删除同步、按目标文件夹同步。
7. `showWordCount` 开启后 ChatGPT/Claude/Gemini 流式生成、会话切换和重复 refresh 时字数会更新，不复用旧值。
8. 虚拟大纲列表 500+ 可见项快速滚动时无白屏、错位、闪烁，top/bottom 按钮状态正常。
9. Doubao、Qwen Studio 长会话滚动到新挂载正文后，大纲能按“更新检测间隔”自动补扫；切到非大纲 Tab、关闭自动更新、切换到非 conversation source 后不再周期刷新。
10. DeepSeek、Qianwen 在未启用周期兜底的情况下保持现有行为，不出现额外 refresh 或大纲重复项。

Profiling 仍应记录：

- `.outline-item` 实际挂载数量。
- `outlineManager.refresh()`、`extractOutlineForSource()`、`updateScrollPositions()` 单次耗时。
- Doubao、Qwen Studio 启用周期兜底后，active outline 状态下单位时间 refresh 次数和主线程耗时。
- 长会话正文滚动 dropped frames 或明显 jank。
- 全局搜索输入每字符耗时。
- 会话同步时 Zustand set/persist 次数和同步总耗时。
- 开启 `showWordCount` 后 adapter extraction 耗时变化。

若回归后仍卡，再按 profiling 命中路径拆分。候选仍是：渲染增强扫描事件化、会话列表 DOM 轮询降本、SPA URL 变化轮询统一、Usage Counter 触发范围降本、Tab/Queue 生成状态轮询收敛。不要在没有 profiling 证据前继续做大范围重构。
