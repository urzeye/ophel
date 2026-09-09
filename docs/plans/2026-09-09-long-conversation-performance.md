# Long Conversation Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 Gemini 打开已有会话、流式回复时卡死以及跨站长对话滚动卡顿，保持已有功能，完成回归验证后提交本地分支。

**Architecture:** 沿用站点适配器与核心管理器分工。先用本地 Gemini DOM 样本建立浏览器基线，再消除观察器自激、重复扫描和滚动时全量几何查询；监听与计时器严格跟随功能生命周期。优先使用现有能力边界，不新增全局事件总线、不默认关闭功能、不引入运行时依赖。

**Tech Stack:** TypeScript, React 18, MutationObserver / ResizeObserver, Vitest, Chromium, Plasmo / Vite userscript.

---

## Scope and evidence

- Branch: `perf/gemini-long-conversations`.
- `gemini.html` 是用户本地输入，仅用于离线结构/性能验证，不提交、不上传；浏览器复现禁止其脚本与远程请求。
- 初步静态证据：LayoutManager 观察 body 子树属性并逐帧查询布局；OutlineTab 在每批 childList 变更后使全部位置缓存失效；Mermaid 定时全量扫描已完成回复；页内书签类自身的 hidden 生命周期仍需完整释放 observer（App 调用方原本已限制 hidden 时的创建）。
- 这些是待测热点，不将静态猜测当成已验证根因。浏览器结果决定具体修复落点。
- 不改变信息架构、主题变量、默认设置与现有功能语义；如修复需要改变设置结构，则同步默认值、存储/迁移与 11 语言。

## Task 1: Reproduce and measure

**Files:** local artifacts under `output/playwright/performance/`; inspect `src/core/layout-manager.ts`, `src/core/outline-manager.ts`, `src/components/OutlineTab.tsx`, `src/core/assistant-mermaid-renderer.ts`, `src/core/inline-bookmark-manager.ts`, `src/utils/dom-toolkit.ts`, Gemini adapter/config.

1. 在禁用远程请求与页面脚本的 Chromium 页面加载样本，并在本机复制 DOM 扩大压力规模；原始文本不写入提交或对外报告。
2. 测量初次加载、静止已完成会话、追加回复 DOM、滚动四种场景；记录管理器调用、DOM 扫描/几何读取、长任务/帧间隔。
3. 定位可重复的根因，保留相同数据与操作供修复前后对比。

## Task 2: Fix mutation-driven work and lifecycle

**Files:** 根据 Task 1 证据修改上述核心管理器及必要调用方；回归测试放入 `tests/core/` / `tests/utils/`。

1. 先写可重复的失败测试，覆盖自有 DOM 修改不应引发新一轮全量工作、持续流式变化有界执行、关闭/销毁后释放任务。
2. 只在相关结构/内容改变时调度；合并同批变化，保证持续流式输出不会无限延迟必要工作。
3. 已处理且未变化的回复不重复扫描；保留懒加载、虚拟列表复用、Shadow DOM 和路由切换路径。
4. 运行目标 Vitest，修复实现而非放宽断言。

## Task 3: Bound scroll-path work

**Files:** `src/core/outline-manager.ts`, `src/components/OutlineTab.tsx` and focused regression tests.

1. 建立长对话滚动的几何读取预算测试及高亮正确性测试。
2. 修复无关 DOM 变更导致的位置缓存失效，移除滚动热路径不必要的全量重建/查询。
3. 验证当前段落高亮、问题边界、标题跳转、窗口 resize、文本更新、元素卸载/重挂载。

## Task 4: Verify and commit

1. 先运行目标测试和相关文件格式/lint，然后运行 `pnpm format:check`, `pnpm lint:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`。
2. 跨平台核心/注入变更再运行 `pnpm build:userscript` 与 `pnpm build:firefox`。
3. 用相同浏览器样本重复 Task 1，检查初始/静止、流式回复、长对话滚动；记录量化结果和验证边界，不把离线样本当作线上 Gemini 验证。
4. `git status` / `git diff --check` / diff 审查确认无第二数据源、死代码、隐式行为或未释放资源；只暂存任务文件，排除原始 HTML 和生成物。
5. 按 Conventional Commits 提交本地分支，不 push、不创建 PR。

## Acceptance

- [x] 已建立新分支，完整方案和实测结果可查。
- [x] 消除已定位的重复扫描和自激路径，保留打开、静止及流式变化的浏览器对照；初次图表渲染的剩余成本见下文。
- [x] 长对话滚动的工作量受控，导航/高亮行为回归通过。
- [x] 本次涉及的功能关闭时释放观察器/定时任务；新增调度可销毁，Shadow DOM 发现路径及双平台构建保留。
- [x] 针对性测试、全量测试、类型、lint 和三平台构建通过；全仓历史格式问题及离线验证限制明确记录。
- [x] 本地提交交付源码、回归测试和方案，不包含用户样本。

## Results

### 根因与修改

1. **面板避让**：回复内部 token/class 变化原本会每帧触发布局，并重复穿透整页 Shadow DOM 查找同一 scope。现在过滤无关内容变化、复用已挂载面板、在单次计算内缓存 scope、仅在 CSS 改变时同步 Shadow 样式；布局/障碍节点和 ResizeObserver 路径保留。
2. **Mermaid**：普通 DOM 站点原本每两秒重扫历史，渲染未完成时还可能重复派发。现在仅排队变化的回复，200ms 合批、每批最多 16 个回复并让出主线程；同源/同主题的 in-flight 请求去重。主题改变会更新图表，瞬态失败仅重试相关回复（最多两次），关闭时清理任务并阻止过期请求。Shadow DOM 站点仍保留发现轮询。
3. **大纲**：内容变化合批失效位置缓存，真实滚动仍逐帧更新。滚动热路径不再为每个已卸载节点查询整页；DOM 引用由既有 refresh 路径统一更新，正常滚动只测量邻近节点。
4. **页内收藏与快捷引用**：忽略自身 DOM 修改；AI 回复不再触发快捷引用扫描用户历史。固定窗口合批避免持续变化饿死任务，关闭/卸载时取消任务并清空引用，重新开启可恢复。

没有新增运行时依赖、设置或用户文案，没有默认关闭功能，也没有引入第二份大纲数据源或全局观察器总线。

### 浏览器对照

全部测试在本机 Chromium 离线执行，禁用样本中的脚本与外网请求。原始样本 4 轮对话，压力夹具复制为 80 轮、720 个大纲节点；加载本地 Mermaid vendor/runner 后约 8.1 万个 DOM 元素、60 份历史图表。基线 bundle 固定来自修改前源码。

以下为**加载真实图表运行时**后的同组操作：静止等待、每 40ms 追加一次内容（共 60 次，理想耗时 2.4s）、60 次实际滚动。历史图表尚未结束的工作会计入操作阶段，因此数据反映页面响应而不是模型输出速度；不是线上 Gemini 的性能承诺。

| 指标 | 修复前 | 修复后 |
| --- | ---: | ---: |
| 60 次模拟流式追加耗时 | 28,745.7ms | 2,404.6ms |
| 流式阶段面板避让计算次数 | 88 | 0 |
| 流式阶段几何读取次数 | 68,389 | 15,456 |
| 流式阶段 DOM 查询次数 | 52,715 | 899 |
| 流式阶段 Mermaid 回复扫描次数 | 960 | 11 |
| 纯滚动阶段 >50ms 长任务 | 2 | 0 |
| 相同滚动操作后的活动大纲索引 | 35 | 35 |

修复后的静止、流式追加、纯滚动三个测量阶段均未记录到 >50ms 长任务。静止阶段为 0 次 DOM 查询、0 次几何读取，但 LayoutManager 的 Shadow Root 发现轮询仍存在，不代表完全没有后台工作。

早期未提供图表资产的隔离夹具也复现了主热点：60 次追加约 14.0s → 2.40s，面板避让累计约 12.4s → 0；该数据只用于定位 DOM 重复工作，不用于评价图表加载性能。

### 功能与默认模块冒烟

- 原始 4 轮样本能完成打开及实际图表渲染，没有观察到持续循环卡死；该次初始阶段最长记录约 98ms 的长任务，并非零开销。
- 新标题能进入大纲并生成收藏图标；标题跳转可见，路由变化/节点重挂载后大纲重新建立；窗口缩放仍触发面板避让计算。
- 实际 Mermaid 运行时完成新增图表、文本节点更新、代码/图表标签切换、主题切换、关闭恢复源码及重新开启渲染。
- 收藏 hidden 时 observer/timer 均释放，恢复 hover 后图标重新出现。
- 快捷引用在待执行任务被取消后关闭再开启，后续用户消息变化正常触发一次合批扫描。
- 单独运行 `initCoreModules` 默认组合，包含 Mermaid、Theme、Copy、Layout、Tab、ReadingHistory、ModelLocker、ScrollLock、UserQueryMarkdown、UsageCounter 共 10 个实例；静止 3 秒为 0 次几何读取、12 次查询、0 个长任务。销毁后仅保留设计要求的全局 ThemeManager 单例。
- 浏览器未记录到未捕获异常或 Promise rejection。外部站点、真实账号、后台消息和存储权限由本地桩替代，不等于完整扩展线上端到端测试。

### 自动检查

- 新增 26 个针对性回归测试：mutation 过滤/合批、Mermaid 初始化分批与主题/重试/停止、收藏生命周期、大纲虚拟节点与滚动查询预算。
- `pnpm test`：59 个测试文件、477 个测试全部通过。
- `pnpm typecheck`：通过。
- `pnpm lint:check --ignore-pattern 'output/**'`：0 errors；现有 warnings 保留。排除本地浏览器复现 bundle，未修改 lint 配置。
- 所有改动源码/测试的 Prettier 检查通过。
- `pnpm format:check`：仍由未修改的历史文件 `scripts/patch-edge-locales.mjs` 报告格式问题；未顺手格式化该文件。
- `pnpm build`、`pnpm build:firefox`、`pnpm build:userscript`：均通过，油猴资源大小门禁通过。

### 边界与交付

- 超大 DOM、60 份历史图表首渲仍记录到约 1.5s 级长任务；样式/布局与图表生成成本未全部消除，不将稳态改善描述为任意会话打开都无卡顿。
- 本次不扩展为图表懒加载、全局 MutationObserver 总线或更改功能默认值；保留现有站点/平台能力边界。
- 原始 HTML、基线/修复 bundle、测量 JSON 和本地服务脚本仅存于本机，其中复现产物位于 gitignored 的 `output/playwright/performance/`。报告未包含原始对话文本。
- 本地分支：`perf/gemini-long-conversations`；仅提交源码、回归测试和本文档，不提交 `gemini.html`，不 push、不创建 PR。
