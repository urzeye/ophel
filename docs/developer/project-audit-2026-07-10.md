# Ophel Atlas 全项目架构、性能与 UI/UX 审查

> 审查日期：2026-07-10  
> 审查范围：全站共享架构、浏览器扩展与油猴双平台、核心生命周期、状态与存储、Shadow DOM/主题、通用 UI/UX、可访问性、构建体积、死代码与兼容层。  
> 不在范围：仅影响单个站点选择器或单个站点 DOM 适配的兼容问题。

## 1. 结论

项目当前可以通过格式、类型和两种生产构建，但仍存在数个会影响所有站点或整个平台的结构性问题。最需要优先处理的是：

1. 扩展端两个内容脚本入口重复打包全部站点适配器和 11 种语言，单页需解析约 7.49 MB 原始 JavaScript。
2. 多套弹窗、菜单和队列 UI 通过 Portal 跳出 Shadow DOM，动态主题变量没有随之跨出，深色、自定义和 24 套预置主题会退回局部硬编码 fallback。
3. 油猴端在所有站点永久保留全页 `MutationObserver` 和 2 秒轮询；选中提示词后还存在永久逐帧布局测量。
4. Options 页面在 600–800 px 宽度出现横向溢出和标签文字被压成竖排；设置开关没有可访问名称和可见键盘焦点。
5. 核心管理器的生命周期契约没有统一落地，已经出现无法释放的订阅、不可取消的延迟任务和存储写入竞态。

本次没有确认 P0 级别的稳定必现崩溃、全量数据损坏或安全漏洞。确认问题分布为：

| 级别 | 数量 | 含义 |
| --- | ---: | --- |
| P1 | 6 | 应优先进入近期版本，已造成明显性能、主题或可访问性问题 |
| P2 | 10 | 中期必须修复，存在竞态、泄漏、长期维护或一致性风险 |
| P3 | 5 | 清理和治理项，可随相关模块修改一起完成 |

### 1.1 Remediation 状态（2026-07-10）

下表记录本审计对应修复分支的最终状态。后续章节中的体积、代码位置和建议保留为“修复前证据”，不再代表当前实现。

| ID | 状态 | 修复结果 |
| --- | --- | --- |
| P1-01 | 已完成 | 适配器改为 hostname/path 轻量路由与动态 import；main/UI 共享 adapter runtime；应用语言按需加载。 |
| P1-02 | 已完成 | 建立 Shadow Root 内唯一 overlay root；Dialog、Menu、Tooltip、Loading、Queue、Prompt 覆盖层统一使用该目标。 |
| P1-03 | 已完成 | userscript 移除全树永久 observer + 2 秒 interval，改为直接父级 observer 和有界重挂载。 |
| P1-04 | 已完成 | SelectedPromptBar 改为事件触发和最长 700 ms 有界几何跟踪，不再永久 rAF。 |
| P1-05 | 已完成 | Options 增加 900/720/640 px 整体断点；600 px 浏览器冒烟无横向溢出。 |
| P1-06 | 已完成 | Switch/ToggleRow 建立 label、ARIA、整行点击和 `focus-visible`，并有键盘测试。 |
| P2-01 | 已完成 | 100 ms 全局禁写窗口替换为精确 persist write gate，并有竞态回归测试。 |
| P2-02 | 已完成 | OutlineManager 增加幂等 destroy，释放事件、store subscription、timer 和 observer。 |
| P2-03 | 已完成 | ModelLocker 跟踪并取消启动/防抖/验证任务，覆盖关闭和重启场景。 |
| P2-04 | 已完成 | URL 轮询默认关闭，仅允许 adapter 显式 opt-in fallback。 |
| P2-05 | 已完成 | Copy、Mermaid、User Query Markdown、Usage、Layout 等周期任务迁移到 PollingTaskRegistry，隐藏页默认暂停。 |
| P2-06 | 已完成 | 抽出 App runtime managers、MainPanel workspace、Outline 虚拟树和 Prompt chain 样式模块；四个入口分别降至 3526/1557/1677/2642 行。 |
| P2-07 | 已完成 | SettingsModal 与 Options 共享九项导航，独立 Options 展示外观、全局搜索和快捷键。 |
| P2-08 | 已完成 | 已确认的硬编码 UI/ARIA 文案全部 i18n 化，并由 11 语 key 一致性测试保护。 |
| P2-09 | 已完成 | 新增主题 token 校验；101 个引用和 85 个全局 token 默认值通过，24 套预置有测试。 |
| P2-10 | 已完成 | 引入 Vitest；当前 17 个测试文件、41 项测试覆盖路由、迁移、生命周期、搜索、备份、主题和关键 UI。 |
| P3-01 | 已完成 | 删除无引用 userscript Chrome polyfill 和不完整 Options barrel。 |
| P3-02 | 已完成 | scroll-lock 业务逻辑集中到 `src/core/scroll-lock-runtime.ts`，两平台只保留入口桥接。 |
| P3-03 | 已完成 | Conversation Dialog 复用通用 Dialog primitive，统一焦点、ESC、ARIA 和 Shadow overlay。 |
| P3-04 | 已完成 | 110 条 warning 清零，`lint:check` 启用 `--max-warnings=0`。 |
| P3-05 | 已完成 | 更新 architecture、CSS、Options 文档，删除被本审计或最终性能审计完全取代的历史计划。 |

### 1.2 最终体积与门禁

修复后生产构建：

| 产物 | 原始大小 | gzip |
| --- | ---: | ---: |
| `main.*.js` | 1,507,680 B | — |
| `ui-entry.*.js` | 2,257,230 B | — |
| 两个扩展内容脚本合计 | 3,764,910 B | 约 975.4 KiB |
| `ophel.user.js` | 1,854,752 B | 约 472.0 KiB |

扩展内容脚本 raw 合计相对审计基线下降约 **49.8%**，超过 40% 完成指标。`scripts/check-bundle-budget.mjs` 对扩展内容入口与 userscript 同时设置 raw/gzip 上限，生产构建后可运行 `pnpm check:bundle-budget`。

## 2. 审查方法与证据

### 2.1 静态与构建检查

已运行：

- `pnpm format:check`：通过。
- `pnpm lint:check`：通过退出码，但有 110 条 warning。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `pnpm build:userscript`：通过。

当前没有正式测试体系，因此“构建通过”不能证明运行时生命周期、主题、键盘操作或窄屏布局正确。

### 2.2 视觉与键盘冒烟

使用生产构建的 Options 页面做了 1440×900、800×700、600×700 三档浏览器检查，并对原生 checkbox 执行键盘聚焦。

确认结果：

- 1440 px 下结构可用，但内容密度偏低，右侧存在较大空白。
- 800 px 下二级标签开始被强制折为两行。
- 600 px 下固定 228 px 侧边栏挤压主内容，二级标签接近竖排，右侧标签被裁切，页面产生横向溢出。
- 聚焦设置开关的 checkbox 后，没有可见焦点环；无障碍树中的 checkbox 也没有名称。

### 2.3 构建体积快照

本次生产构建测得：

| 产物 | 原始大小 | gzip |
| --- | ---: | ---: |
| `main.*.js` | 3,336,340 B | 849,872 B |
| `ui-entry.*.js` | 4,158,496 B | 1,056,090 B |
| 两个扩展内容脚本合计 | 7,494,836 B | 1,905,962 B |
| `ophel.user.js` | 1,860,986 B | 482,797 B |

扩展资源从本地加载，不直接产生网络下载成本，但 JavaScript 的解析、编译、初始化和内存占用仍发生在每个支持站点页面。

## 3. P1：优先修复

### P1-01 两个扩展入口重复打包全部适配器和语言包

**范围：所有扩展端支持站点；油猴端也受单体 bundle 影响。**

证据：

- `src/contents/main.ts` 导入 `getAdapter()`。
- `src/components/App.tsx:10` 和 `src/components/App.tsx:407` 再次导入并调用 `getAdapter()`。
- `src/adapters/index.ts:7-22` 同步导入全部 15 个站点适配器，并在模块加载时全部实例化。
- `src/locales/resources.ts:5-15` 同步导入全部 11 种语言。
- 构建产物中 `main.*.js` 和 `ui-entry.*.js` 均包含各适配器类及多语言文本。

影响：

- 每个页面都解析与当前站点无关的 14 个适配器。
- `main` 和 `ui-entry` 是独立内容脚本，适配器与语言资源被重复打包、重复解析。
- 适配器源文件本身很大，例如 Gemini、ChatGPT、AI Studio 分别约 4,900、3,411、3,276 行，重复成本明显。
- 扩展端两个入口合计约 7.49 MB 原始 JS；这比局部 DOM 微优化更值得优先处理。

建议：

1. 将站点识别拆成轻量 hostname/path 路由，不要先构造全部适配器再逐个 `match()`。
2. 按站点动态导入适配器，或由构建脚本为不同 match 组生成独立入口。
3. 评估合并 `main.ts` 与 CSUI 初始化，使核心逻辑和 React UI 共享同一适配器实例与模块图。
4. 扩展端语言资源按当前语言加载，至少避免 11 份完整字典同时进入两个入口。

验收标准：

- 单个站点产物不再包含其他站点的大型适配器实现。
- `main` 与 UI 不再各自携带完整适配器和语言字典。
- 记录修改前后的 raw/gzip 大小和页面初始化耗时。

### P1-02 Portal 跨出 Shadow DOM 后丢失主题变量，形成隐式第二主题系统

**范围：所有站点的通用弹窗、菜单、加载遮罩、提示词弹窗和队列 UI。**

证据：

- `src/core/theme-manager.ts:760-794` 只把动态变量写入 Shadow Root 内的 `:host` 和 `#gh-theme-vars`。
- `src/components/ui/Dialog.tsx:99-100,163` 把样式注入 `document.head`，再把对话框 Portal 到 `document.body`。
- `src/components/ConversationDialogs.tsx:92-101,165` 使用相同模式。
- `ConversationMenus`、`LoadingOverlay`、Prompt Import/Editor/Preview 等也 Portal 到 `document.body`。
- `QueueOverlay.tsx:516` 的目标查找使用 `document.querySelector(".gh-root")`；该 API 无法穿透 Shadow DOM，因此实际会回退到 `document.body`。
- 普通组件 CSS import 会生成页面级 content-script CSS；这能让队列样式“看起来存在”，但同时绕开 Shadow DOM 隔离和动态主题变量。

影响：

- 深色主题、自定义主题和非默认预置主题中的覆盖层会使用白色、灰色、蓝色等 fallback，而不是当前 `--gh-*` 变量。
- 页面级 CSS 和 DOM 节点污染宿主页面，增加样式冲突和 z-index 冲突风险。
- 主题兼容依赖 fallback，违反 `DESIGN.md` 的单一主题源和 24 套主题兼容要求。
- 同一功能在 Options 页面与内容面板中可能表现不同，因为 Options 的变量在文档根可用，而面板变量只存在于 Shadow Host。

建议：

- 建立一个 Shadow Root 内的统一 overlay portal 容器，所有面板弹窗、菜单、tooltip、loading 和 queue 默认渲染到该容器。
- 只有必须覆盖宿主页面且不能受 Shadow Host 几何影响的元素才进入 `document.body`；这类元素应挂到独立 portal host，并由 `ThemeManager` 显式镜像变量。
- 删除组件内各自向 `document.head` 注入样式的实现，统一样式入口和清理生命周期。

验收标准：

- 24 套主题与自定义主题下，弹窗、菜单、加载层、队列和预览均读取同一组动态变量。
- 内容面板功能不再依赖页面级 `.gh-*` CSS 才能显示正确。

### P1-03 油猴端在所有站点永久观察整个文档并同时轮询

**范围：所有油猴端支持站点。**

证据：`src/platform/userscript/entry.tsx:437-448` 在 UI 挂载后：

- 对 `document.documentElement` 建立 `{ childList: true, subtree: true }` 的永久 `MutationObserver`。
- 同时每 2 秒执行一次 `shadowHost.isConnected` 检查。
- 两者只在页面 unload 时清理。

影响：

- AI 流式生成会产生大量 DOM 变更，observer callback 即使只做连接检查，也会被高频调度。
- Observer 与 interval 完成同一“防宿主被移除”任务，属于重复监控。
- 该逻辑不是单站点兼容，而是对全部油猴站点无条件开启。

建议：

- 默认只观察 Shadow Host 的直接父节点 `{ childList: true, subtree: false }`。
- 稳定挂载后停止重试定时器；只在确认 host 被移除时短时重启。
- 不同时长期保留全树 Observer 和 interval。

### P1-04 选中提示词后永久逐帧测量布局

**范围：所有站点的提示词选择条。**

证据：`src/components/SelectedPromptBar.tsx:146-151` 在 `title` 存在期间递归调用 `requestAnimationFrame(trackPosition)`；每帧会执行：

- `adapter.getTextareaElement()`；
- 必要时向上遍历并调用 `getComputedStyle()`；
- `getBoundingClientRect()`；
- React state 比较与可能更新。

影响：

- 用户选中一个提示词但暂不发送时，会持续以显示器帧率工作。
- 布局读取可能触发同步 layout，在复杂站点和长对话中造成 CPU、耗电与滚动卡顿。
- 代码已经有 `ResizeObserver` 和 window resize 监听，逐帧循环属于过度兜底。

建议：

- 用 `ResizeObserver`、滚动事件的 rAF 节流、`visualViewport` 和有限时长 transition 跟踪替代永久循环。
- 若必须追踪宿主动画，只在检测到几何变化后维持短窗口，连续若干帧稳定后停止。

### P1-05 Options 页面缺少整体响应式策略

**范围：独立 Options、权限请求窗口和窄窗口使用场景。**

证据：

- `src/styles/settings.css:44-46` 将侧边栏固定为 228 px 且不收缩。
- `src/styles/settings.css:538-543` 内容区固定使用 24×32 px padding。
- 现有 `@media` 只处理主题卡片、About 局部和 reduced motion，没有处理整体 sidebar/content/tab 导航。
- 浏览器实测：800 px 时二级标签明显换行；600 px 时标签近似竖排、右侧内容被裁切并产生横向滚动。

影响：

- 权限请求页或用户缩窄 Options 窗口时，导航难以扫描和点击。
- 中文、德文、俄文等较长标签更容易被压缩。
- 与 `DESIGN.md` 中“稳定网格、可扫读、点击目标足够大”的要求不一致。

建议：

- 设定 Options 的响应式断点：窄屏下收起侧边栏为图标栏或顶部下拉导航。
- 二级 tab 改为横向滚动、下拉或允许有控制的两行布局，不应逐字折行。
- 设置行在窄屏下切为上下布局，控件保持最小可操作宽度。

### P1-06 通用设置开关没有可访问名称和可见焦点

**范围：至少 52 个 `ToggleRow` 设置项。**

证据：

- `src/components/ui/Switch.tsx:37-41` 使用原生 checkbox，但设置为 `opacity: 0; width: 0; height: 0`。
- `Switch` 没有 `aria-label`、`aria-labelledby` 或可关联的 `id`。
- `src/tabs/options/components/SettingRow.tsx:52,73-89` 的文字是普通 `div`，没有 `<label htmlFor>` 关系。
- 浏览器无障碍快照显示 checkbox 无名称；聚焦 checkbox 后界面没有可见 focus ring。

影响：

- 屏幕阅读器无法说明当前开关控制什么。
- 键盘用户无法判断焦点位置。
- 点击左侧标签不能切换开关，实际可点击区域只有 36×20 px。

建议：

- `Switch` 接受 `id`、`aria-label`/`aria-labelledby`，由 `ToggleRow` 生成稳定关联。
- 使用 visually-hidden checkbox，但保留可聚焦尺寸或为可视轨道实现 `:focus-visible`。
- 让整行 label 可点击，同时避免与行内其它按钮冲突。

## 4. P2：中期修复

### P2-01 跨上下文设置同步存在 100 ms 写入丢失窗口

**证据：** `src/stores/settings-store.ts:366-383` 收到 `chrome.storage.onChanged` 后将全局 `isUpdatingFromStorage` 设为 `true`，100 ms 后才恢复；`storageAdapter.setItem()` 在此期间直接返回。

影响：如果用户或其它代码恰好在这 100 ms 内修改设置，Zustand 内存状态会变化，但 persist 写入被静默跳过，刷新后修改丢失。

建议：使用“本次外部值的签名/版本”抑制同值回写，或只跳过由该次 `setState` 触发的单次 persist，不要用时间窗口阻止所有写入。

### P2-02 `OutlineManager` 缺少可释放生命周期

**证据：**

- `src/core/outline-manager.ts:147` 使用 `this.handleMessage.bind(this)` 注册事件，没有保存 bound function。
- `src/core/outline-manager.ts:150` 丢弃 `useBookmarkStore.subscribe()` 的 unsubscribe。
- 类中没有 `destroy()`；`src/components/App.tsx:2425` 卸载时只销毁 `ConversationManager`。

影响：App 重挂载、开发热更新或未来复用管理器时，旧实例仍会响应 message 和 bookmark 变化，形成重复 refresh 和内存泄漏。

建议：让 `OutlineManager` 实现 `CoreModule`/`Disposable`，保存所有 listener、store subscription、timer 和 observer，并在 App cleanup 中调用 `destroy()`。

### P2-03 `ModelLocker` 的延迟锁定任务不可取消

**证据：** `src/core/model-locker.ts:56` 的启动 `setTimeout` 没有保存 ID；`stop()` 只清理 debounce 和 verify interval。

影响：用户在初始化延迟期间关闭模型锁定，旧 timeout 仍可能调用 `adapter.lockModel()`；SPA 快速切换也可能让旧页面任务晚到。

建议：保存 `startTimer`，在 `stop()`、`updateConfig(disabled)`、`relock()` 中清理，并在回调执行前再次检查 `config.enabled`、keyword 和路由版本。

### P2-04 SPA 路由监听始终保留 1 秒轮询

**证据：** `src/core/modules-init.ts:767` 在已监听 `popstate`、`hashchange` 且 monkey-patch `pushState/replaceState` 后，仍对所有站点永久 `setInterval(handleUrlChange, 1000)`。

影响：每个标签页每秒执行 URL 比较；单次成本不高，但它是所有站点、整个页面生命周期的固定后台工作，并与已有事件路径重复。

建议：将轮询作为按适配器声明的兼容 fallback，默认关闭；或在检测到 history patch 被覆盖时才临时启用。

### P2-05 轮询治理不统一，隐藏页策略不一致

项目已有 `PollingTaskRegistry`，但大部分模块仍直接维护 interval。当前可见的周期任务包括 URL、用户提问 Markdown、Mermaid、复制、标题、用量面板、队列位置和生成状态等。

典型问题：

- `QueueOverlay` 在功能开启后即使折叠，也每 2 秒测位置、每 1 秒调用 `adapter.isGenerating()`。
- `AssistantMermaidRenderer` 同时使用 DOM watcher 和 2 秒全量重扫。
- 各模块对 `document.hidden` 的处理不一致。

建议：将通用轮询迁移到统一调度器，支持可见性暂停、任务去重、按功能激活、运行耗时统计和统一销毁。

### P2-06 `App` 与核心 UI 组件过度集中

当前统计：

| 文件 | 行数 | `useEffect` | `useCallback` | `useMemo` |
| --- | ---: | ---: | ---: | ---: |
| `App.tsx` | 3,617 | 49 | 59 | 28 |
| `PromptsTab.tsx` | 3,461 | 8 | 16 | 0 |
| `OutlineTab.tsx` | 2,143 | 12 | 27 | 7 |
| `MainPanel.tsx` | 1,612 | 9 | 35 | 1 |

此外 `App` 使用无 selector 的 `useSettingsStore()` 订阅整个 store，再额外订阅 `_syncVersion`。

影响：

- 任一局部状态变化都需要重新执行大量派生逻辑。
- Effect 依赖和 cleanup 很难完整审查，生命周期问题容易被隐藏。
- 全局搜索、导出、面板、设置、弹窗和快捷工具互相耦合，新增功能继续放大 bundle 和回归面。

建议：按领域拆出 controller hooks 和边界组件；让 Overlay、Export、Global Search、Panel State 分别订阅最小 Zustand selector；管理器实例由单一 runtime/context 提供。

### P2-07 独立 Options 与设置弹窗的信息架构不一致

**证据：**

- `SettingsModal` 有 9 个一级入口：基本、外观、功能、站点、全局搜索、快捷键、数据、权限、关于。
- `src/tabs/options.tsx` 只有 7 个，缺少全局搜索和快捷键。
- `src/tabs/options.tsx:252-260` 在独立页面中继续隐藏外观主题；实际冒烟仅显示 6 个入口。

影响：从浏览器扩展管理页进入 Options 的用户找不到全局搜索、快捷键和主题设置；同名“设置”入口呈现不同能力，增加认知和支持成本。

建议：两种载体共享同一导航定义和页面能力矩阵；站点上下文缺失时显示说明或选择默认站点，而不是直接隐藏入口。

### P2-08 存在直接面向用户的硬编码文案

确认示例：

- `src/components/QueueOverlay.tsx:581`：硬编码中文空状态，尽管 locale 中已有 `queueEmpty`。
- `src/components/ConversationsTab.tsx:1747-1748`：硬编码“无标题”。
- `src/components/PromptsTab.tsx:1946`：硬编码删除确认中文。
- `src/components/global-search/GlobalSearchOverlay.tsx:286`：硬编码英文 aria-label。
- `src/components/ui/PlaceholderInput.tsx:176`：硬编码英文 aria-label。
- `src/components/ui/SelectDropdown.tsx:309`：硬编码 `No options`。

影响：非中文/英文用户看到混合语言，且无障碍名称不随语言切换，违反 11 种语言同步规则。

建议：新增/复用 i18n key，并增加静态检查，禁止组件 JSX 中出现未豁免的用户可见中英文文本。

### P2-09 主题 token 定义与使用漂移

静态扫描发现 108 个被引用的 `--gh-*` 名称，其中 32 个没有在源码中找到全局定义。部分是局部动态变量或模式化变量，但仍确认存在多组全局语义 token 漂移，例如：

- Queue：`--gh-accent`、`--gh-accent-hover`、`--gh-bg-accent`、`--gh-border-light`。
- 通用 UI：`--gh-border-hover`、`--gh-primary-hover`、`--gh-primary-light`、`--gh-success`、`--gh-error`、`--gh-text-disabled`。

影响：这些组件永远依赖 fallback，24 套主题无法完整控制它们；修改 fallback 时又会形成新的局部主题分支。

建议：建立 token 校验脚本，区分“全局主题 token”和“组件局部动态变量”；全局 token 必须同时存在于类型、默认 CSS 和主题预置生成链路。

### P2-10 没有正式测试体系，关键纯逻辑与迁移无回归保护

目前没有 test/spec 文件、测试命令或测试依赖。以下全局逻辑尤其需要测试：

- `settings-normalize.ts` 的旧数据迁移和默认值合并；
- 备份/恢复 schema、WebDAV 合并；
- 全局搜索语法解析与设置深链；
- 主题 token 完整性与 24 套预置；
- 模块 start/update/stop 幂等性；
- 双平台存储同步行为。

建议先引入 Vitest 覆盖纯逻辑和生命周期，不必从站点 E2E 开始。之后增加最小 Playwright 扩展冒烟：加载面板、打开设置、切换主题、键盘操作、窄屏 Options。

## 5. P3：清理与治理

### P3-01 两个确认无引用的删除候选

1. `src/platform/userscript/chrome-adapter-polyfill.ts`
   - 当前 Vite alias 没有引用该文件。
   - 文件注释仍称“通过 Vite alias 替换”，与实际配置不符。
   - 其 GM API 被包装成 Promise，违反当前项目“油猴同步 hydration”的明确架构约束。
   - 当前有效实现已经集中在 `src/stores/chrome-adapter.ts`。
2. `src/tabs/options/pages/index.ts`
   - 没有 import 命中；Options 和 SettingsModal 都直接导入具体页面。
   - barrel 只导出 6 个页面，已遗漏 GlobalSearch、Shortcuts、Permissions，本身也不再是完整入口。

这两个文件可在单独清理提交中删除，并以 `typecheck + build + build:userscript` 验证。

### P3-02 滚动锁主世界逻辑存在双份手工实现

- 扩展：`src/contents/scroll-lock-main.ts`，约 341 行。
- 油猴：`src/platform/userscript/scroll-lock-inject.ts`，约 319 行。
- 两者注释要求“保持一致”，但当前 diff 已有 166 行变化。

这不是可以直接删除的兼容代码，因为两种平台的注入方式不同；可删除的是“双份业务逻辑”。建议抽取纯函数/模板源，由构建脚本生成扩展入口与注入函数，平台文件只保留桥接。

### P3-03 存在两套通用 Dialog 与重复 style ID

- `src/components/ui/Dialog.tsx` 和 `src/components/ConversationDialogs.tsx` 都实现 overlay、ESC、document.head 样式注入和 body portal。
- 两者都使用 `style#gh-dialog-styles`，但各自用独立 module boolean 判断是否注入，可能产生重复 ID。
- 两套实现的 focus、ARIA、主题和关闭行为不一致。

建议合并为一个通用 Dialog primitive，并让业务弹窗只组合内容。

### P3-04 Lint 以 warning 形式积累了 110 个问题

主要包括：

- 大量 `any`，集中在 background、network monitor、scroll-lock bridge、userscript API。
- 4 条 React Hook 不必要依赖。
- 2 条普通 `console`。

当前 CI 只要没有 error 就会通过，warning 不会形成治理压力。建议先建立 warning baseline，再逐类清理并最终启用 `--max-warnings=0`；对确实需要动态类型的边界使用 `unknown`、类型守卫和窄接口。

### P3-05 架构/CSS 文档已经明显过时

`docs/developer/architecture.md` 仍记录：

- CSS 共 7 个、约 5,974 行；当前扫描为 8 个 CSS、约 11,478 行、260 KB。
- `style.css` 约 1,472 行；当前约 4,463 行。
- `settings.css` 约 2,081 行；当前约 3,541 行。

文档也没有准确说明普通组件 CSS import 会进入页面级 content-script CSS，以及 body portal 与 Shadow 主题变量之间的边界。这会直接误导后续 UI 修改。

## 6. 不建议现在删除的兼容代码

以下代码虽然带有“兼容/legacy”字样，但仍有当前引用或承担数据迁移，不能仅凭名称删除：

- `src/utils/themes.ts`：仍被 ThemeManager、AppearancePage、ThemePreview 使用。
- `src/core/conversation-manager.ts`：仍被 App、MainPanel、Outline、Conversations 等多个模块使用。
- `settings-normalize.ts` 中旧快捷按钮字段迁移：仍是旧用户升级入口，应在明确最低支持版本和迁移完成策略后再删。
- WebDAV 旧扁平备份格式兼容：涉及用户数据恢复，删除前必须先定义版本淘汰策略。

建议为兼容代码增加 `introducedVersion`、`lastNeededVersion` 或 schema version，并按发布周期清理，而不是长期无期限保留。

## 7. 建议实施顺序

### 第一阶段：低风险、直接收益

1. 修复 Switch 的 label、ARIA 和 focus-visible。
2. 修复 Options 的 900/720/640 px 整体响应式布局。
3. 清理硬编码文案并同步 11 种语言。
4. 删除两个确认无引用文件。
5. 修复 ModelLocker 可取消 timeout 和 settings 写入竞态。

### 第二阶段：统一 UI 边界

1. 建立 Shadow Root 内统一 overlay portal。
2. 合并两套 Dialog。
3. 统一 tooltip/menu/dialog/loading/queue 的主题和焦点策略。
4. 建立主题 token 完整性检查。

### 第三阶段：性能与架构

1. 按 hostname 懒加载站点适配器。
2. 消除 `main` 与 `ui-entry` 的适配器/语言资源重复。
3. 收敛 userscript 永久 Observer 与 interval。
4. 用统一 lifecycle/polling registry 管理所有模块。
5. 拆分 App、PromptsTab、OutlineTab 和 MainPanel。

### 第四阶段：回归体系

1. Vitest：设置迁移、搜索语法、主题 token、备份 schema、模块生命周期。
2. Playwright：Options 三档宽度、键盘焦点、主题弹窗、面板基本流程。
3. CI 增加 bundle size budget 和 `--max-warnings=0`。

## 8. 建议的完成指标

- 扩展内容脚本 raw 总量至少下降 40%，且单站点不包含其它站点大型适配器。
- 油猴稳定挂载后不再同时保留全树 observer 和 interval。
- 选中提示词静置时不再持续产生 rAF 布局测量。
- 600 px Options 无横向溢出，二级标签可完整读取。
- 所有 ToggleRow 在无障碍树中有名称，键盘焦点清晰可见。
- 24 套主题和自定义主题下，所有 overlay/portal 组件颜色一致。
- 核心 manager 均具备可验证的 start/update/stop 或 destroy 生命周期。
- 新增测试覆盖设置迁移、主题 token 和关键生命周期。
