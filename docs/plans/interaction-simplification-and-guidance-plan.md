# 交互做减法与用户引导：分支实施计划

> 依据 `docs/plans/interaction-simplification-and-guidance.md` 的分析结论，将工作拆分为多个独立分支/PR。
> 边界：不引入 AI / skill / MCP；站点适配只维护不新增（作为开发纪律执行，不单设分支）；推广不在本计划内。
> 每个分支完成后必须更新本文档的进度表与对应小节的进度记录。
> 创建日期：2026-11-19。

## 总进度表

| # | 分支名                             | PR 标题（英文）                                                      | 依赖                 | 状态   | 完成日期 / PR |
| - | ---------------------------------- | -------------------------------------------------------------------- | -------------------- | ------ | ------------- |
| 1 | `ux/settings-card-layering`      | `ux(settings): add collapsible advanced sections to setting cards` | 无                   | 已完成 | 2026-11-19 · 本地分支，未建 PR |
| 2 | `feat/guidance-registry`         | `feat(guidance): add unified guidance state registry`              | 无                   | 未开始 | —            |
| 3 | `feat/first-run-onboarding`      | `feat(onboarding): add first-run panel tour`                       | #2                   | 未开始 | —            |
| 4 | `ux/conversation-classify-nudge` | `ux(conversations): add new-conversation classify nudge`           | #2                   | 未开始 | —            |
| 5 | `ux/inbox-triage-entry`          | `ux(conversations): add inbox triage entry`                        | #2，建议排在 #4 后   | 未开始 | —            |
| 6 | `feat/settings-consolidation`    | `feat(settings): consolidate low-frequency switches`               | #1，且删除项需先决策 | 未开始 | —            |

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

## 分支 2：`feat/guidance-registry`

**目标**：把分散的引导状态收敛为统一注册表，为后续所有引导提供一套"状态 + 频控 + 退出"基建。纯基建，无新引导 UI。

**做什么**

- 新增引导注册表模块：每个引导一个 id，统一存储 shownCount / dismissed / lastShownAt 等状态，走 `platform.storage`（油猴端 localStorage 按站点隔离，不能用于跨站点一致的引导状态）。
- 迁移现有两处引导状态：导出按钮流光（`ophel:exportDiscovered`）与全局搜索快捷键 nudge（localStorage），含旧数据迁移逻辑，保证老用户引导状态不重置。
- 注册表 API 保持小而显式：`shouldShow(id)` / `markShown(id)` / `dismiss(id)` / `reset(id)` 级别的接口，不做通用规则引擎。

**不做什么**

- 不新增任何可见引导；不改变现有引导的触发时机与文案。

**关键文件**：新模块（建议 `src/core/guidance/` 或 `src/utils/guidance.ts`，开工时按现有目录习惯定）、`src/hooks/useExportDiscovered.ts`、`src/components/global-search/useGlobalSearchShortcutNudge.ts`。

**注意**：涉及存储与跨平台，`src/platform/` 能力差异必须显式表达；油猴 GM 存储为同步 API，persist 不要包成 Promise；改 Zustand persist 时检查备份/恢复兼容。

**验证**：标准四件套 + `pnpm build:userscript`（存储路径涉及油猴端）。

**进度记录**：

- （待填写）

## 分支 3：`feat/first-run-onboarding`

**目标**：补首装引导空白。用户同意免责声明后，看到不超过 3 步的面板导览。

**做什么**

- 以 `DisclaimerModal` 同意动作（`hasAgreedToTerms` 置真）为零号触点，触发一次轻量导览：介绍大纲 / 对话 / 提示词三个 tab 各是什么，≤3 步。
- 可跳过、可"不再提示"；完成或跳过后经分支 2 的注册表永久记录。
- 仅对新安装用户展示（`hasAgreedToTerms` 由 false 变 true 的当次），老用户升级不触发。

**不做什么**

- 不做全屏蒙层 tour、不做逐步高亮页面元素的复杂引导。
- 不在 `onInstalled` 里新增打开页面行为。

**关键文件**：`src/components/DisclaimerModal.tsx`、`src/components/App.tsx`、分支 2 的注册表模块、面板 tab 组件。

**注意**：触及 UI 先做 `DESIGN.md` design read；全部新增文案一次性同步 11 种语言；步骤越多文案成本越高，严格 ≤3 步。

**验证**：标准四件套；冒烟：清 `hasAgreedToTerms` 后首启流程（同意 → 导览 → 跳过/完成 → 刷新不再出现）。

**进度记录**：

- （待填写）

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

**目标**：在分支 1 的分层基础上，收敛同族设置、处置低频开关。这是唯一可能删设置的改动，放最后并需先决策。

**做什么**

- 同族收敛：快捷键 expandLevel1~6、switchTab1~3 等成组项在 UI 上收敛为分组/档位呈现（存储结构尽量不变，避免迁移）。
- 低频开关移入分支 1 的高级区。
- 删除候选逐项确认后再删：默认值即正确行为、删除后可通过 persist 迁移静默处理的项；删除前在社区或 issue 收集一轮反馈。

**不做什么**

- 不在没有反馈依据的情况下批量删设置。
- 不改变任何保留下来的设置的默认行为。

**关键文件**：`src/tabs/options/pages/FeaturesPage.tsx`、`src/constants/default-settings.ts`、`src/stores/settings-store.ts`（persist 迁移）、`docs/developer/settings-schema.json`。

**注意**：删除设置项属于 `feat!` 级别的用户可见变更；涉及 persist 迁移必须检查备份/恢复兼容与旧数据路径；文案删改同步 11 语言。

**验证**：标准四件套；重点验证旧版本设置数据升级后行为不变（含备份导入旧数据的场景）。

**进度记录**：

- （待填写）

## 通用约定

- 每个 PR 默认创建为 Draft；转 Ready 前本地跑完 `pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`、`pnpm build`。
- Commit 与 PR 标题用英文 Conventional Commits；交互/文案类改动用 `ux`，行为新增用 `feat`。
- 每个触及 UI 的分支开工前先做 `DESIGN.md` design read 并在 PR 描述里说明。
- 每个有用户可见变更的分支按 `docs/developer/conventions/changelog.md` 补中英文更新日志。
- 每个分支 PR 里同步更新本文档进度（见"进度更新规则"）。
