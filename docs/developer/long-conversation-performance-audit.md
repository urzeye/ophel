# 长会话性能审计报告

> 日期：2026-06-23  
> 背景：issue #675 长会话性能退化；PR #677、#682、#683 已分别处理生成期大纲 observer、隐藏节点渲染/书签匹配、大纲虚拟滚动。

## 结论

PR #683 的方向是合理的：它把大纲面板的 React 渲染从“按全部节点渲染”降到“按视口渲染”，对大纲节点很多时的面板打开、折叠、滚动会有直接收益。它不是完整的 #675 解决方案，因为它只降低了 UI 渲染成本，没有降低大纲抽取、周期刷新、滚动高亮测量、会话同步、全局搜索和用量计数器的成本。

目前剩余性能风险主要分三类：

1. 常驻 timer/observer 触发全量扫描：大纲 2 秒刷新、全局搜索 1.2 秒刷新大纲、Shadow DOM 轮询、Markdown 重扫。
2. 长 DOM 上的全量提取和测量：`extractOutline()`、`updateScrollPositions()`、用量计数器的全文 token 估算。
3. 大对象 store 写入和 UI 派发：会话同步逐条更新 Zustand/persist，触发全量对象拷贝、序列化和列表重算。

如果继续优化 #675，建议不要再优先做更细的列表渲染微调，而是先拆掉会在后台反复执行的全量工作。

## 已完成优化的边界

| PR | 已解决 | 仍未覆盖 |
| --- | --- | --- |
| #677 | `OutlineManager` 自动更新 observer 不再监听 `characterData`；全局 refresh debounce；URL 变化错峰探测 | `App` 层仍每 2 秒调用 `outlineManager.refresh()`；`OutlineTab` 自己的滚动位置 stale observer 仍监听 `characterData` |
| #682 | 大纲隐藏节点不再渲染；书签匹配从 O(n*m) 改为 Map | 大纲抽取仍要全量扫 DOM；字数统计仍可能很重 |
| #683 | 大纲面板虚拟滚动，降低 React 节点数 | 虚拟列表不减少 `extractOutline()`、`updateScrollPositions()`、全局搜索刷新和 adapter 查询成本 |

本地当前分支还已把大纲虚拟行高从“TS 常量 + CSS fallback”改为由 TS 注入 CSS 变量，避免未来主题改 `--gh-outline-item-height` 后滚动定位漂移。

## P0：优先处理

### 1. 大纲仍有无条件 2 秒全量刷新

证据：

- `src/components/App.tsx:2766` 创建 `setInterval(() => outlineManager.refresh(), 2000)`。
- `OutlineManager.refresh()` 只检查 `settings.enabled` 和 `isRefreshing`，不检查大纲 Tab 是否激活。
- `_doRefresh()` 每次都会调用 `siteAdapter.extractOutlineForSource()`，随后做书签合并、`treeKey` 构建、必要时 `updateScrollPositions()`。

影响：

- 长会话中，即使用户没有打开大纲 Tab，也会每 2 秒扫一次会话 DOM。
- PR #683 只减少大纲列表渲染，不能减少这个扫描成本。
- 全局搜索打开时还有额外 1.2 秒大纲刷新，会叠加。

建议方案：

- 去掉 `App.tsx` 的固定 2 秒 refresh，改为事件驱动：路由变化、生成完成、手动刷新、书签变化、设置变化。
- 如果需要兜底轮询，只在 `OutlineManager.isActive === true`、页面可见、`autoUpdate` 开启时运行，并在 tree 连续稳定后指数退避到 10-30 秒。
- 把兜底刷新放到 `requestIdleCallback`，超时后再执行，避免抢输入和滚动主线程。

兼容风险：

- 直接删除轮询可能暴露某些站点 observer 漏事件。应先用 feature flag 或按站点灰度，验证 ChatGPT、Claude、Gemini、DeepSeek、Doubao 的生成完成后大纲刷新。

### 2. 全局搜索打开时强制刷新大纲并全量评分

证据：

- `src/components/App.tsx:1681` 在全局搜索打开时每 1200ms 调用 `outlineManager.refresh()`。
- `src/components/global-search/useGlobalSearchData.ts` 每次搜索都会扫描会话、提示词、设置、大纲，并对每项构建 normalized fields、执行 fuzzy/typo 评分和排序。
- 会话结果来自 `conversationManager.getConversations()`，内部 `Object.values(this.conversations).filter(...)`。

影响：

- 用户打开搜索框后，即使没有输入，也会把大纲刷新变成常驻工作。
- 输入时，搜索计算和大纲刷新竞争主线程；长会话 + 多会话历史 + fuzzy 开启时更明显。

建议方案：

- 全局搜索打开时只做一次 `outlineManager.refresh()`；后续只订阅 `outlineManager.subscribe()`。
- 输入查询使用 `useDeferredValue` 或保持已有 debounce，但避免同步触发全量评分。
- 为 conversations/prompts/settings 建搜索索引：预先保存 normalized title/folder/tags/content，数据变更时增量更新，输入时只评分索引。
- fuzzy/typo 匹配按类别或数量阈值降级：例如结果候选超过 300 条时先做 includes/prefix 过滤，再对前 N 个做 fuzzy。

兼容风险：

- 搜索结果新鲜度可能从“轮询更新”变为“事件更新”。需要保证大纲 refresh、会话 store 更新、提示词 store 更新都会触发索引版本号变化。

### 3. 用量计数器会在长 DOM 上反复做全文 token 估算

证据：

- `src/core/usage-counter-manager.ts:255` 每秒 mount loop。
- `src/core/usage-counter-manager.ts:641` schedule render。
- `src/core/usage-counter-manager.ts:1160` `getUserMessageCount()` 使用 `DOMToolkit.query(..., { all: true, shadow: true })`。
- `src/core/usage-counter-manager.ts:1184` `getEstimateSnapshot()` 调 `getLoadedConversationStats()`。
- `src/core/usage-counter-manager.ts:1210` `getLoadedConversationStats()` 查询全部 chat content，提取文本，拼接大字符串并估算 token。

影响：

- 开启用量监控后，输入、focus、scroll、resize、发送确认都会触发 render。
- 每次 render 都可能扫描所有已加载消息并重新 token 估算，长会话中成本随 DOM 和文本长度线性增长。

建议方案：

- 把“输入框字符数”与“已加载上下文估算”拆开：输入时只更新 input 部分，全文上下文统计延迟到 idle 或 500-1000ms throttle。
- 对消息元素做 WeakMap 缓存：按 element + text hash 缓存 token 数，MutationObserver 只失效新增/变更节点。
- `window.scroll` 不应触发全文统计，只调整挂载位置；统计数据复用上次快照。
- 发送确认阶段只读用户消息数量和生成态，避免同时触发完整估算；确认成功后再异步补充 usage event 的 token 字段。

兼容风险：

- token 估算会从实时变为近实时。UI 上可以接受，因为它本来就是估算值；需要避免显示旧数据时没有状态提示。

### 4. 会话同步逐条 store 更新会放大为 O(k*n) 拷贝和持久化

证据：

- `src/core/conversation/manager.ts:896` `syncConversations()` 遍历 sidebar items，逐条调用 `store.updateConversation()` / `store.addConversation()`。
- `src/stores/conversations-store.ts:49`、`:54`、`:65`、`:71` 单条 action 都复制整个 `conversations` 对象。
- `src/stores/conversations-store.ts:151` persist 写入完整 `conversations`。
- `src/components/ConversationsTab.tsx:246` `loadData()` 每次复制 `manager.getAllConversations()` 到本地 state。

影响：

- 同步 100 条新增/更新时，不是一次构建新对象，而是 100 次复制大对象、100 次 persist 调度、100 次 UI data change 风险。
- 会话 Tab 订阅 `manager.onDataChange()` 后会重新 load 全量 folders/conversations/tags。

建议方案：

- 在 store 增加批量 action，例如 `upsertManyConversations(upserts, deletes, lastUsedFolderId?)`，一次 set 完成。
- `syncConversations()` 收集 diff 后一次提交，并只 `notifyDataChange()` 一次。
- 会话 Tab 尽量直接使用 Zustand selector，而不是 manager 事件 + 本地全量镜像；至少给 `loadData()` 做合并和引用稳定。
- 对 `getAllConversations()` 结果按 siteId/cid 建缓存，cid 或 conversations 引用变化时才重算。

兼容风险：

- 批量 action 要保留现有 `updatedAt`、`syncUnpin`、`syncDeleted` 语义，并检查备份/恢复兼容。

### 5. 会话 Tab 搜索和列表计算仍是全量重算

证据：

- `src/components/ConversationsTab.tsx:284` 搜索遍历 `Object.values(conversations)`。
- `src/components/ConversationsTab.tsx:329` filter 变化 effect 调用 `handleSearch(searchQuery)`。
- `src/components/ConversationsTab.tsx:366` 输入处理又设置 150ms timeout 调用 `handleSearch(value)`，同一次输入会重复搜索。
- `src/components/ConversationsTab.tsx:444` `folderConversationsMap` 每次对全部会话分组并对每个文件夹排序。
- `shouldShowFolder()` 对每个文件夹执行 `Array.from(searchResult.conversationFolderMap.values()).includes(folder.id)`，搜索模式下是重复扫描。

影响：

- 已有 `PROGRESSIVE_BATCH_SIZE` 限制渲染数量，但搜索、分组、排序仍处理全部数据。
- 搜索输入重复执行会直接造成卡顿和多余 render。

建议方案：

- 删除 `handleSearchInput()` 内的 timeout，保留 effect；或删除 effect，保留 debounce。不要双路径。
- 搜索结果中直接维护 `matchedFolderIds: Set<string>`，避免每个文件夹重复 `Array.from(...).includes()`。
- `folderConversationsMap` 拆成两个阶段：会话数据变更时分组/排序；搜索变化时只过滤 id。
- 搜索模式如果会展开多个文件夹，考虑对 `conversations-list` 做真正虚拟化，而不是只分批 append。

兼容风险：

- 低。主要是交互节奏变化，需验证标签筛选、置顶筛选、定位当前对话、批量选择。

## P1：第二阶段处理

### 6. 大纲滚动高亮的 stale 频率仍偏高

证据：

- `src/components/OutlineTab.tsx:1049` 对源滚动容器 observe `{ childList: true, subtree: true, characterData: true }`。
- `src/components/OutlineTab.tsx:1083` 每次源滚动调用 `manager.findVisibleItemIndex()`。
- `src/core/outline-manager.ts:1568` scroll positions stale 时会调用 `updateScrollPositions()`。
- `src/core/outline-manager.ts:1118` `updateScrollPositions()` 遍历 flatNodes，对每个真实元素读 `getClientRects()` 和 `getBoundingClientRect()`，并可能重新 find 元素。

影响：

- #677 已避免 OutlineManager 自动更新监听字符流，但 OutlineTab 为滚动高亮又把 `characterData` 加回来了。
- 这个 observer 只是标记 scroll positions stale，不会直接 refresh；但下一次滚动会触发全量测量。

建议方案：

- 先把 OutlineTab 的 stale observer 改为 `childList: true, subtree: true, characterData: false`；文本流式变化通常不改变标题位置，位置变化可由 `ResizeObserver` 或 `scrollHeight` 变化捕获。
- 对长列表只测量当前视口附近节点：先用已有 cached top 二分出邻近范围，再补测前后 overscan。
- 同一轮测量中只用一次 `getBoundingClientRect()`，不再先 `getClientRects()` 再读 rect。
- 对支持稳定 message id 的站点，让 adapter 在抽取时直接提供 scrollTop，减少后续 DOM re-resolve。

兼容风险：

- 某些站点流式输出会导致标题换行高度变化。应重点验证生成中新增标题、展开 thinking、图片加载、代码块渲染后的高亮是否仍准确。

### 7. Adapter 的大纲抽取和字数统计复杂度偏高

证据：

- 多数 adapter 的 `extractOutline()` 都通过 `querySelectorAll` 扫完整回复容器。
- `src/adapters/claude.ts:1383` Claude 抽取时查所有 headings；包含用户提问时还查所有 user messages 并排序。
- `src/adapters/claude.ts:1399` `calculateUserQueryWordCount()` 在每个用户消息内重新查询所有 user queries 和 responses。
- `src/adapters/chatgpt.ts:3089`、`src/adapters/gemini.ts:5097` 也有按全 DOM 抽取、边界查找和字数统计逻辑。

影响：

- `showWordCount` 开启后，部分站点会从一次全量扫描变成多次嵌套扫描。
- App/全局搜索/手动刷新都会触发这些 adapter 成本。

建议方案：

- 字数统计默认惰性：只对可见/展开节点计算，或鼠标悬停/复制时计算。
- 每次 extract 先一次性收集 userQueries/responses/headings，并传给 word count helper，不在每个节点里重新 query。
- 给 adapter 增加可选增量接口：`extractOutlineDelta(mutations, previous)`，先在 ChatGPT/Gemini/Claude 三个主站试点。

兼容风险：

- 中等。不同站点 DOM 结构差异大，适合先做“缓存和一次性收集”，再考虑 delta 接口。

### 8. 浏览器标签页监控混合了固定轮询和短间隔确认

证据：

- `src/core/tab-manager.ts:143` auto rename 使用设置频率轮询 `updateTabName()`。
- `src/core/tab-manager.ts:349` title observer 监听 head 的 `characterData`。
- `src/core/tab-manager.ts:577` 网络生成确认每 200ms poll。
- `src/core/tab-manager.ts:630` DOM completion 每 150ms poll。
- `src/core/modules-init.ts:706` SPA URL 变化还有每秒兜底 poll。

影响：

- 标签页监控本身不是长会话主因，但 `adapter.isGenerating()`、`adapter.getConversationTitle()`、`adapter.getModelName()` 往往会查 DOM。
- 多个 manager 同时 poll 时，长会话页面主线程会有稳定背景噪声。

建议方案：

- auto rename interval 在页面隐藏且没有未读完成状态时退避；生成中/刚完成再恢复高频。
- 200ms/150ms 短轮询加最长持续时间已经有部分保护，但可以优先用站点按钮/状态节点 MutationObserver。
- URL 变化兜底 poll 可改为只在 patch pushState/replaceState 失败或特定站点启用。

兼容风险：

- 通知和标题状态是用户可见功能，优化时要验证后台生成完成通知、hideStatusWhenRead、隐私标题格式。

### 9. Shadow DOM 和用户提问 Markdown 有周期全树扫描

证据：

- `src/core/layout-manager.ts:532` 启用相关布局功能后每秒 `injectToAllShadows()`。
- `src/core/layout-manager.ts:552` 遍历所有 ShadowRoot。
- `src/core/user-query-markdown.ts:40` `RESCAN_INTERVAL = 2000`。
- `src/core/user-query-markdown.ts:644` 每轮 `DOMToolkit.query(selector, { all: true, shadow: true })`，再处理所有用户提问元素。
- `src/utils/dom-toolkit.ts:449` `all + shadow` 查询会递归 shadow root；过程中会 `querySelectorAll("*")`。

影响：

- 这些功能不是默认所有用户都会启用，但一旦启用，成本与页面 DOM/ShadowRoot 数量线性相关。
- 在 Gemini Enterprise 等 Shadow DOM 站点上更明显。

建议方案：

- 维护 ShadowRoot registry：新增 shadow root 时处理一次，不每秒遍历全部。
- 用户提问 Markdown 改为 observer 处理 added nodes；周期 rescan 只作为低频 fallback，例如 10-30 秒且页面可见时。
- `processedElements` 已避免重复渲染，但仍要避免重复扫描所有元素。

兼容风险：

- Shadow DOM 动态挂载复杂，不能一次性移除 fallback；建议先把 interval 降频并加 page visibility gating。

### 10. Quick Quote 引用 chips observer 监听过宽

证据：

- `src/components/QuickQuoteActions.tsx:614` 对 observe target 使用 MutationObserver。
- 配置包含 `attributes`、`characterData`、`childList`、`subtree`，attributeFilter 包括 `class/style/href/title`。
- `renderReferenceChips()` 内会查询用户消息、引用 markers，并维护 chips。

影响：

- AI 流式输出时 `characterData` 和 style/class 变化会频繁触发防抖 render。
- 对长会话，render 即使跳过已处理元素，也仍可能扫描候选消息。

建议方案：

- 引用 chips 只需要在用户消息新增或 marker 出现时处理，优先监听 `childList`。
- 以 addedNodes 为入口增量处理消息，而不是每次全量 render。
- `characterData` 仅在 quick quote marker 可能在文本节点中流入的站点开启。

兼容风险：

- 需要验证刷新后从 marker 恢复引用、AI Studio 发送后改写 marker 的 fallback。

## P2：低优先级或按功能开关处理

### 11. Queue Dispatcher 每秒轮询

证据：

- `src/core/queue-dispatcher.ts:44` 队列运行时每秒 `tick()`。

判断：

- 只有队列启动时运行；每轮主要检查队列状态、编辑器内容和 `adapter.isGenerating()`。
- 相比大纲/搜索/计数器，优先级较低。

建议：

- 保持当前设计即可。若后续优化，可在队列为空时自动 stop，新增 item 时 start。

### 12. DOMToolkit 的 Shadow DOM 全量查询需要约束调用点

证据：

- `src/utils/dom-toolkit.ts:449` 支持 `all: true, shadow: true`。
- `findInShadow()` / `collectInShadow()` 会通过 `querySelectorAll("*")` 遍历 shadow hosts。

判断：

- 工具本身不是问题，问题是把它放进 1 秒/2 秒轮询或输入事件里。

建议：

- 新增开发约束：`all: true, shadow: true` 不应出现在高频 timer、scroll、input、MutationObserver 回调的同步路径。
- 对确实需要的调用点传入更小 parent，或使用 adapter 提供的稳定 root。

## 建议拆分的后续 PR

1. `perf(outline): remove unconditional outline refresh interval`
   - 删除/降级 `App.tsx` 2 秒 refresh。
   - Outline refresh 只由 active、route、generation、manual、bookmark/settings 触发。

2. `perf(search): decouple global search from outline polling`
   - 移除全局搜索 1.2 秒大纲 refresh。
   - 为 conversations/prompts/settings 建 normalized index。

3. `perf(usage): cache loaded conversation token estimates`
   - WeakMap 缓存消息 token。
   - 输入渲染与全文统计拆分。

4. `perf(conversations): batch sync store writes`
   - conversations-store 增加批量 upsert/delete。
   - `syncConversations()` 一次提交 diff。

5. `perf(outline): reduce scroll-position remeasurement`
   - OutlineTab stale observer 关闭 `characterData`。
   - `updateScrollPositions()` 改为惰性/邻近测量。

6. `perf(adapters): cache outline word-count inputs`
   - ChatGPT/Claude/Gemini 先做一次性收集和 lazy word count。

## 验证计划

建议先建立最小性能基线，再拆 PR：

- 采样页面：ChatGPT、Claude、Gemini，各准备短会话、中等会话、长会话。
- 指标：
  - 打开面板到可交互时间。
  - 大纲 Tab 首次打开耗时、滚动 FPS、源页面滚动 jank。
  - `outlineManager.refresh()`、`extractOutlineForSource()`、`updateScrollPositions()` 单次耗时。
  - 全局搜索输入每字符耗时和 dropped frames。
  - 用量计数器开启后 input latency。
  - 会话同步的 store 写入次数、persist 写入次数、同步总耗时。
- 手段：
  - 临时加 `performance.mark/measure`，只在开发模式或 debug flag 下输出。
  - Chrome DevTools Performance 录制长会话滚动、搜索输入、生成中输出。
  - Memory heap snapshot 对比长时间生成前后 listener/timer/DOM 引用是否释放。

## 对原有功能的影响判断

- PR #683 本身方案可靠，主要影响面是大纲列表 UI；行高变量已同步后，滚动定位漂移风险降低。
- 对 #675 的整体性能收益有限，因为剩余瓶颈大量存在于虚拟列表外部。
- 最可能继续造成长会话卡顿的是“大纲固定刷新 + 全局搜索大纲刷新 + 用量计数器全文估算”三者叠加。
- 会话 Tab 的渲染已经有分批加载，但数据计算和 store 写入还没有批处理；当历史会话很多或同步新增很多时仍会卡。
- 浏览器标签页监控、Shadow DOM 注入、Markdown 重扫、Quick Quote observer 多数是功能开关相关，应按启用条件做 gating，避免全局常驻。
