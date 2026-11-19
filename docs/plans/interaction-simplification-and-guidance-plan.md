# 交互做减法与用户引导：分支实施计划

> 依据 `docs/plans/interaction-simplification-and-guidance.md` 的分析结论，将工作拆分为多个独立分支/PR。
> 边界：不引入 AI / skill / MCP；站点适配只维护不新增（作为开发纪律执行，不单设分支）；推广不在本计划内。
> 每个分支完成后必须更新本文档的进度表与对应小节的进度记录。
> 创建日期：2026-11-19。

## 总进度表

| # | 分支名                             | PR 标题（英文）                                                      | 依赖                 | 状态   | 完成日期 / PR                                                   |
| - | ---------------------------------- | -------------------------------------------------------------------- | -------------------- | ------ | --------------------------------------------------------------- |
| 1 | `ux/settings-card-layering`      | `ux(settings): add collapsible advanced sections to setting cards` | 无                   | 已完成 | 2026-11-19 · [#1055](https://github.com/urzeye/ophel/pull/1055) |
| 2 | `feat/guidance-registry`         | `feat(guidance): add unified guidance state registry`              | 无                   | 已完成 | 2026-11-19 · [#1056](https://github.com/urzeye/ophel/pull/1056) |
| 3 | `feat/first-run-onboarding`      | `feat(onboarding): add first-run panel spotlight tour`             | #2                   | 已完成 | 2026-11-19 · [#1057](https://github.com/urzeye/ophel/pull/1057) |
| 4 | `ux/conversation-classify-nudge` | `ux(conversations): add new-conversation classify nudge`           | #2                   | 未开始 | —                                                              |
| 5 | `ux/inbox-triage-entry`          | `ux(conversations): add inbox triage entry`                        | #2，建议排在 #4 后   | 未开始 | —                                                              |
| 6 | `feat/settings-consolidation`    | `ux(settings): consolidate low-frequency options and shortcut groups` | #1                   | 进行中 | —                                                              |

状态取值：`未开始` / `进行中` / `已完成` / `已搁置`。

**进度更新规则**

- 分支开工时把状态改为 `进行中`；PR 创建后把状态改为 `已完成` 并填写日期与 PR 链接，同时在该分支小节的"进度记录"里追加一行。
- 进度更新属于 `docs/**` 改动，不触发 CI，可随该分支的 PR 一并提交，也可单独提交。
- 顺序建议：#1 与 #2 可并行先行；#3、#4、#5 在 #2 合并后启动，其中 #4、#5 都触碰 `ConversationsTab.tsx`，建议串行（#4 先），并行时后合并者负责 rebase；#6 最后做。

## 分支 1：`ux/settings-card-layering`

**目标**：给设置页加分层能力，把 94 行平铺压出层次，不删除、不改变任何设置行为。

**做什么**

- `SettingCard` 支持折叠（默认展开状态按分组配置，低频分组默认收起），或支持"高级区"二级容器；两种形态取其一，按 `DESIGN.md` 规范定。
- `FeaturesPage`（16 个分组）与 `GeneralPage`（5 个分组）逐组标记高频/低频，低频项进入折叠区。
- 分组内已有条件显隐（如通知子项）保持原行为，不动。

**不做什么**

- 不删除任何设置项，不改 `DEFAULT_SETTINGS`、store、备份/恢复逻辑。
- 不做设置项的同族合并（归分支 6）。

**关键文件**：`src/tabs/options/components/SettingCard.tsx`、`src/tabs/options/pages/FeaturesPage.tsx`、`src/tabs/options/pages/GeneralPage.tsx`、`src/styles/settings.css`。

**注意**：触及 UI/交互，开工前先按 `AGENTS.md` 做 `DESIGN.md` design read；新增文案同步 11 语言（折叠区标签等）。

**验证**：`pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`、`pnpm build`；选项页最小冒烟（展开/收起、搜索定位到折叠区内设置项）。

**进度记录**：

- 2026-11-19 完成。形态定为卡片底部「高级选项」折叠区（原生 `<details>`），新增 `SettingCardAdvanced` 组件；落地于导出、通知、标签页行为、内容交互 4 张最密的卡片，其余卡片不动。文案 `settingsAdvancedToggle` 已同步 11 语言。验证：format/lint/typecheck/build 通过；Playwright 加载构建产物实测收起/展开/键盘开合/深浅主题。
- 2026-11-19 样式迭代：展开态整组（标题行 + 设置行）共享主色 5% 浅底容器，标题行用负边距保持开合瞬间位置不动，内容行相对标题缩进一档；收起态去掉整行 hover 灰底，改为指示片与文字主色反馈。

## 分支 2：`feat/guidance-registry`

**目标**：把分散的引导状态收敛为统一注册表，为后续所有引导提供一套"状态 + 频控 + 退出"基建。纯基建，无新引导 UI。

**做什么**

- 新增引导注册表模块：每个引导一个 id，统一存储 shownCount / dismissed / lastShownAt 等状态，走 `platform.storage`（油猴端 localStorage 按站点隔离，不能用于跨站点一致的引导状态）。
- 不需要迁移现有两处引导状态：导出按钮流光（`ophel:exportDiscovered`）与全局搜索快捷键 nudge（localStorage），可以无视老用户引导状态数据丢失，这不是大问题。
- 注册表 API 保持小而显式：`shouldShow(id)` / `markShown(id)` / `dismiss(id)` / `reset(id)` 级别的接口，不做通用规则引擎。

**不做什么**

- 不新增任何可见引导；不改变现有引导的触发时机与文案。

**关键文件**：新模块（建议 `src/core/guidance/` 或 `src/utils/guidance.ts`，开工时按现有目录习惯定）、`src/hooks/useExportDiscovered.ts`、`src/components/global-search/useGlobalSearchShortcutNudge.ts`。

**注意**：涉及存储与跨平台，`src/platform/` 能力差异必须显式表达；油猴 GM 存储为同步 API，persist 不要包成 Promise；改 Zustand persist 时检查备份/恢复兼容。

**验证**：标准四件套 + `pnpm build:userscript`（存储路径涉及油猴端）。

**进度记录**：

- 2026-11-19 完成。新增纯逻辑层 `src/utils/guidance.ts`（规则表 `GUIDANCE_RULES`、状态归一化、`decideShouldShowGuidance` / `hasGuidanceCompleted` 纯函数）与存储层 `src/utils/guidance-storage.ts`（每个引导独立存储键 `ophel:guidance:<id>`，走 `platform.storage`，API：`getGuidanceState` / `shouldShowGuidance` / `markGuidanceShown` / `dismissGuidance` / `markGuidanceAction` / `watchGuidanceState`）。导出流光与全局搜索快捷键 nudge 两处消费者接入注册表，对外接口与触发时机不变；规则数值（3 次 / 24h / 2 次快捷键后停用）从 global-search constants 迁入规则表。油猴端 `KNOWN_STORAGE_KEYS` 从 `GUIDANCE_RULES` 派生引导键，保证「清除全部数据」覆盖且新增引导自动纳入；`handleClearAllData` 保留旧 localStorage 键清理并标注为历史遗留。按用户决策不做旧数据迁移。验证：format / lint / typecheck / build / build:userscript 通过；Playwright 实测首装同意免责声明 → 打开全局搜索 → nudge 展示且 `chrome.storage.local` 正确写入注册表状态。
- 2026-11-19 评审修复（PR #1056 Codex review）：存储形态从单键 blob 改为每引导独立键。原单键方案的异步读-改-写跨标签页不原子，两个引导并发写会丢更新（流光重复启用 / nudge 计数丢失）；按键隔离后不同引导物理隔离，同一引导并发写各操作幂等（置位类重复写结果相同、计数类允许低估），结构性消除该风险。另：分支内曾新增的 `tests/guidance.test.ts` 已由用户移除。

## 分支 3：`feat/first-run-onboarding`

**目标**：补首装引导空白。用户同意免责声明后，直接进入四步面板聚光灯导览。

**做什么**

- 以 `DisclaimerModal` 当前页面的同意回调触发一次导览：自动展开面板，依次介绍大纲 / 对话 / 提示词 tab 和设置入口，共四步。
- 可跳过、可"不再提示"；完成或跳过后经分支 2 的注册表永久记录。
- 仅在当前页面确认协议时触发；跨标签页设置同步与老用户升级不触发，卡片实际可见后才记录展示次数。

**不做什么**

- 不在 `onInstalled` 里新增打开页面行为。

**关键文件**：`src/components/DisclaimerModal.tsx`、`src/components/App.tsx`、分支 2 的注册表模块、面板 tab 组件。

**注意**：触及 UI 先做 `DESIGN.md` design read；全部新增文案一次性同步 11 种语言，保持四步。

**验证**：标准四件套；冒烟：清 `hasAgreedToTerms` 后首启流程（同意 → 导览 → 跳过/完成 → 刷新不再出现）。

**进度记录**：

- 2026-11-19：完成，PR [#1057](https://github.com/urzeye/ophel/pull/1057)（Draft）。⚠️ 方向变更：用户明确要求改为全屏蒙层 + 逐步高亮页面元素的 tour，原"不做全屏蒙层"约束作废；步数也从 ≤3 步调整为 4 步（大纲 / 对话 / 提示词 tab + 设置入口），i18n 已按 4 步同步 11 语言。
- 实现要点：导览挂载在 App 根级（与 `DisclaimerModal` 同级），因为面板内联 `transform` 会成为 `position: fixed` 后代的包含块，导致聚光灯定位整体偏移；`.gh-root` 全局 `pointer-events: none`，蒙层需显式恢复 `pointer-events: auto`；卡片水平夹取用实测宽度，避免盒模型差异导致右缘超出视口。
- 验证：四件套 + 油猴 / Firefox 构建通过；Playwright 真实浏览器全流程（同意免责声明 → 四步聚光灯几何与目标对齐 → 完成注销注册表 → 刷新不复发）。
- 2026-11-19 追加：tab 步骤真实切换面板内容区（真实点击 tab 按钮，走原有路径），退出导览时恢复初始 tab；设置步只指向齿轮、不打开设置弹窗（避免 modal 叠 modal）。恢复逻辑收敛在组件卸载 cleanup，覆盖完成/跳过/Esc/面板关闭全部退出路径。
- 2026-11-19 追加：移除导览前的「欢迎使用 Ophel」弹窗，直接从大纲聚光灯开始，保留大纲 / 对话 / 提示词 / 设置四步；第一步不显示「上一步」，同步清理欢迎页专用状态、样式和 11 种语言文案。
- 2026-11-19 评审修复：合并静态审查与 PR #1057 review 的意见，按「本地确认与展示计数 → 面板生命周期 → 键盘和焦点」修复；改为本地协议确认回调触发并自动展开抽屉 / 吸附面板，纠正吸附可见性判断，卡片可见后计数且计数与关闭写入串行；面板关闭时同步退出，导览接入交互层 / Esc / 悬停宽度保活，暂停快捷键和双 Shift 搜索，定位后聚焦并限制 Tab 焦点范围，退出经已有事件恢复初始 tab。
- 本次静态检查：相关文件 Prettier / ESLint 与 `pnpm typecheck` 通过，ESLint 仅保留 `useShortcuts.ts` 原有的 `any` 警告；按用户要求不运行构建或浏览器模拟验证。
- 2026-11-19 静态审查后续修复：补充面板 `animationend` / `animationcancel` 后的聚光灯重测，覆盖抽屉平移入场；Esc / Tab 改为文档捕获监听，通过 `composedPath()` 识别真实目标，并在焦点进入导览外时拉回主按钮，蒙层支持程序化聚焦以承接空白处点击。验证：组件 Prettier / ESLint、`pnpm typecheck` 与 `git diff --check` 通过；按用户要求不运行构建或浏览器模拟验证。

## 分支 4：`ux/conversation-classify-nudge`

**目标**：新对话首次入库后给用户一次轻量归类机会，把隐式的 `lastUsedFolderId` 机制显性化。

**做什么**

- 新同步入库的对话（落 `inbox` 或 `lastUsedFolderId`）在对话 tab 顶部出现一条轻提示条："新对话《标题》已存入 X · 移动到…"；目标文件夹默认预填 `lastUsedFolderId` 之外的常用项，一次点击完成移动。
- 提示条可关闭、可"不再提示"，状态走注册表；不打断当前浏览（非弹窗、非全屏）。
- 批量同步入库（一次多条）时合并为一条汇总提示，不逐条刷。

**不做什么**

- 不做弹窗式强制归类（与"减少交互重量"基调冲突）。
- 不改入库默认逻辑（`getValidFolderId` 的 inbox 归一保持不变）。

**关键文件**：`src/components/ConversationsTab.tsx`、`src/core/conversation/manager.ts`（仅读取入库事件，不改归一逻辑）、注册表模块。

**注意**：文案同步 11 语言；提示触发时机依赖同步事件，注意与 `markSyncHintSeen` 既有同步提示的共存关系，避免两条提示同时出现。

**验证**：标准四件套；冒烟：新对话入库出现提示、点击移动成功、关闭/"不再提示"后不再出现、批量入库只出一条。

**进度记录**：

- （待填写）

## 分支 5：`ux/inbox-triage-entry`

**目标**：给积压收件箱一个场景化的整理入口，复用现有批量模式。

**做什么**

- 收件箱对话数超过阈值（初定 20，阈值写为常量，不加设置项）时，收件箱顶部出现"开始整理"入口条，点击进入现有批量模式。
- 入口条可关闭，关闭后当次会话不再出现；是否持久化"不再提示"在实现时按打扰程度定，倾向只做会话级。

**不做什么**

- 不改批量模式本身的交互；不新增自动整理能力；不加阈值设置开关。

**关键文件**：`src/components/ConversationsTab.tsx`。

**注意**：与分支 4 串行做，避免 `ConversationsTab.tsx` 冲突；入口条与新对话提示条在视觉层级上错开，同一时间只显示一条。

**验证**：标准四件套；冒烟：收件箱 <20 条不显示、≥20 条显示、点击进入批量模式、关闭后当次会话不再出现。

**进度记录**：

- （待填写）

## 分支 6：`feat/settings-consolidation`

**目标**：在分支 1 的分层基础上，将功能页低频设置移入高级区，并收敛快捷键同族项；按用户确认跳过分支 4、5，先实施本分支。

**做什么**

- 功能 → 标签页：标题更新间隔移入现有「高级选项」，保留原有禁用条件。
- 功能 → 大纲：常规区保留跟随模式，自动更新、更新检测间隔、悬停显示字数移入「高级选项」。
- 快捷键：expandLevel1~6、switchTab1~3 分别收进「展开到指定层级」「切换面板标签」折叠组，默认收起，展开后仍可逐项编辑、移除绑定和查看冲突。
- 复用 `SettingCardAdvanced` 的原生 details/summary 和主题样式，只增加可选分组标签；新增标签同步 11 种语言。

**不做什么**

- 不删除设置或字段，保留模糊搜索的设置页入口和 `tab.customIcon`。
- 文件夹彩虹色保持常规显示，不为单项增加高级区。
- 常规页与站点设置全部保持现状，包括 AI Studio 的默认折叠开关。
- 收藏图标、用量自动清零、阅读历史保留时间等分析中建议暂时保留的项目不动。
- 不改变设置默认值、存储结构、备份格式和快捷键实际行为。

**关键文件**：`src/tabs/options/pages/FeaturesPage.tsx`、`src/tabs/options/pages/ShortcutsPage.tsx`、`src/tabs/options/components/SettingCard.tsx`、`src/locales/*/index.ts`。

**注意**：保持所有 `data-setting-id`，使全局搜索和深链定位继续自动展开目标折叠组；折叠不改变原有保存值或未绑定状态。

**实施顺序与验证**：

1. 移动功能页四项设置，核对控件值、写入回调和禁用条件不变。
2. 为折叠组件增加可选标签，将两组快捷键分组，核对 46 个动作均保留且没有重复渲染。
3. 同步 11 种语言与中英文更新日志；运行格式、Lint、类型检查和 Chrome 构建。
4. 浏览器最小冒烟：默认收起、鼠标与键盘展开/收起、目标设置深链定位、独立快捷键改绑/移除/冲突提示，以及深浅主题显示。

**进度记录**：

- 2026-11-19：用户确认仅实施功能页四项低频设置下沉与快捷键同族分组；不删除设置，不修改常规页和站点设置。已在 `feat/settings-consolidation` 开始实现。
- 2026-11-19：本地实现完成，尚未提交或创建 PR。`SettingCardAdvanced` 增加可选分组标签，功能页四项设置下沉，两组快捷键默认折叠，46 个动作及原有绑定独立保留；新增文案已同步 11 种语言，中英文日志合并进已有设置分层条目。验证：`pnpm format:check`、`pnpm lint:check`（0 错误，112 条原有警告）、`pnpm typecheck`、`pnpm build` 和 `git diff --check` 通过；Playwright 加载 Chrome 构建产物，在独立 Options 页验证默认折叠、键盘开合、逐项改绑与移除、冲突提示、六个设置深链自动展开、已有非默认值与未绑定状态保留，并检查深浅主题截图。

## 通用约定

- 每个 PR 默认创建为 Draft；转 Ready 前本地跑完 `pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`、`pnpm build`。
- Commit 与 PR 标题用英文 Conventional Commits；交互/文案类改动用 `ux`，行为新增用 `feat`。
- 每个触及 UI 的分支开工前先做 `DESIGN.md` design read 并在 PR 描述里说明。
- 每个有用户可见变更的分支按 `docs/developer/conventions/changelog.md` 补中英文更新日志。
- 每个分支 PR 里同步更新本文档进度（见"进度更新规则"）。
