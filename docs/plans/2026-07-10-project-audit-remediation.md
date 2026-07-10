# Project Audit Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 `docs/developer/project-audit-2026-07-10.md` 中全部全局审计问题，并完成双平台验证、两轮 review、提交、推送和 PR。

**Architecture:** 通过共享 adapter runtime、Shadow overlay root、统一 lifecycle/polling、响应式设置系统和按需资源加载消除重复真值与长期后台工作。所有改动保持现有用户数据兼容和 24 套主题能力。

**Tech Stack:** TypeScript 5.3、React 18、Zustand 5、Plasmo、Vite userscript、原生 CSS、Vitest、Playwright CLI、pnpm。

---

### Task 1: 建立测试与审计验证基础

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.config.ts`
- Create: `src/**/*.test.ts`
- Create: `scripts/check-theme-tokens.mjs`
- Create: `scripts/check-bundle-budget.mjs`

**Steps:**
1. 使用 pnpm 添加 Vitest。
2. 增加 `test`、`test:run`、token 校验和 bundle budget scripts。
3. 为 settings normalize、ModelLocker、PollingTaskRegistry、adapter route 写失败测试。
4. 运行测试确认失败，再实现后续任务。

### Task 2: 共享 adapter runtime 与按站点加载

**Files:**
- Modify: `src/adapters/index.ts`
- Create: `src/core/adapter-runtime.ts`
- Modify: `src/contents/main.ts`
- Modify: `src/contents/ui-entry.tsx`
- Modify: `src/platform/userscript/entry.tsx`
- Modify: `src/components/App.tsx`
- Modify: `src/components/QuickButtons.tsx`
- Modify: `src/components/ModelLockSettingsContent.tsx`

**Steps:**
1. 建立 hostname/path 到动态 import 的轻量路由。
2. main/userscript 初始化后把唯一 adapter 写入 runtime。
3. UI 从 runtime/context 接收 adapter，删除 UI 内的 `getAdapter()`。
4. 构建并检查 UI bundle 不再包含全部 adapter。

### Task 3: i18n 按需加载与硬编码文案清理

**Files:**
- Modify: `src/utils/i18n.ts`
- Modify: `src/locales/resources.ts`
- Modify: `src/platform/userscript/i18n.ts`
- Modify: `src/components/QueueOverlay.tsx`
- Modify: `src/components/ConversationsTab.tsx`
- Modify: `src/components/PromptsTab.tsx`
- Modify: `src/components/global-search/GlobalSearchOverlay.tsx`
- Modify: `src/components/ui/PlaceholderInput.tsx`
- Modify: `src/components/ui/SelectDropdown.tsx`
- Modify: `src/locales/*/index.ts`

**Steps:**
1. 保留同步 `t()`，增加异步语言加载和变更订阅。
2. 扩展只静态携带英文 fallback，当前语言按需加载。
3. 替换所有已确认硬编码 UI/ARIA 文案。
4. 校验 11 种语言 key 一致。

### Task 4: 建立统一 Shadow overlay root 与 Dialog

**Files:**
- Create: `src/components/ui/OverlayPortal.tsx`
- Modify: `src/components/ui/Dialog.tsx`
- Modify: `src/components/ConversationDialogs.tsx`
- Modify: `src/components/ConversationMenus.tsx`
- Modify: `src/components/LoadingOverlay.tsx`
- Modify: `src/components/prompts/*.tsx`
- Modify: `src/components/QueueOverlay.tsx`
- Modify: `src/components/ui/Tooltip.tsx`
- Modify: `src/contents/ui-entry.tsx`
- Modify: `src/platform/userscript/entry.tsx`
- Modify: `src/style.css`

**Steps:**
1. 在 Shadow Root 内创建并注册 overlay root。
2. 所有通用 overlay 改用统一 portal resolver；禁止静默回退 body。
3. 合并 Dialog 行为和样式，补齐 aria、焦点陷阱、ESC、焦点恢复。
4. 删除重复 document.head style 注入。

### Task 5: 主题 token 完整性

**Files:**
- Modify: `src/utils/themes/types.ts`
- Modify: `src/styles/theme-variables.css`
- Modify: `src/utils/themes/light/index.ts`
- Modify: `src/utils/themes/dark/index.ts`
- Modify: `src/styles/queue-overlay.css`
- Modify: `src/style.css`
- Modify: `src/styles/settings.css`

**Steps:**
1. 区分全局 token 与组件局部变量。
2. 将 accent、border-light、hover、success/error/disabled 等语义统一到现有 token。
3. 运行 token 校验，确保无未定义全局引用。
4. 验证 24 个 preset 和自定义 CSS。

### Task 6: Options 导航、响应式与 Switch 可访问性

**Files:**
- Create: `src/constants/settings-navigation.ts`
- Modify: `src/tabs/options.tsx`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/ui/Switch.tsx`
- Modify: `src/tabs/options/components/SettingRow.tsx`
- Modify: `src/styles/settings.css`

**Steps:**
1. 两种设置载体共享导航定义。
2. 独立 Options 展示外观、全局搜索和快捷键；缺少 site context 时使用默认站点说明。
3. Switch 建立 label/ARIA/focus-visible 和整行点击。
4. 增加 900/720/640 px 整体布局断点。
5. Playwright 验证三档宽度和键盘行为。

### Task 7: 生命周期、存储竞态与轮询

**Files:**
- Modify: `src/core/outline-manager.ts`
- Modify: `src/core/model-locker.ts`
- Modify: `src/stores/settings-store.ts`
- Modify: `src/core/modules-init.ts`
- Modify: `src/core/polling-task-registry.ts`
- Modify: `src/components/SelectedPromptBar.tsx`
- Modify: `src/components/QueueOverlay.tsx`
- Modify: `src/platform/userscript/entry.tsx`

**Steps:**
1. 为 OutlineManager 增加幂等 destroy，并在 App cleanup 调用。
2. ModelLocker 跟踪并取消全部延迟任务。
3. 用单次外部写入签名替换 100 ms 全局禁写窗口。
4. URL fallback 改为条件启用。
5. userscript mount 只观察直接父节点，稳定后停止重试。
6. SelectedPromptBar 删除永久 rAF，Queue 轮询仅在需要时运行。

### Task 8: 拆分大型 UI 控制器

**Files:**
- Modify: `src/components/App.tsx`
- Create: `src/components/app/*.tsx`
- Modify: `src/components/PromptsTab.tsx`
- Create: `src/components/prompts/*.tsx`
- Modify: `src/components/OutlineTab.tsx`
- Create: `src/components/outline/*.tsx`
- Modify: `src/components/MainPanel.tsx`
- Create: `src/components/panel/*.tsx`

**Steps:**
1. 优先抽出 overlay 集合、runtime managers、global search shell 和 panel controls。
2. 每次抽取保持 props 小、selector 精确、行为不变。
3. 对关键 controller 添加测试。
4. 记录文件行数下降和 effect cleanup。

### Task 9: 清理重复兼容、死代码和 lint warning

**Files:**
- Delete: `src/platform/userscript/chrome-adapter-polyfill.ts`
- Delete: `src/tabs/options/pages/index.ts`
- Refactor: `src/contents/scroll-lock-main.ts`
- Refactor: `src/platform/userscript/scroll-lock-inject.ts`
- Modify: lint 报告涉及的 TypeScript 文件

**Steps:**
1. 删除确认无引用文件。
2. 抽取 scroll-lock 共享逻辑，平台文件只保留桥接。
3. 将 `any` 收敛为 unknown/明确接口，修复 hook 和 console warning。
4. 将 lint 改为 `--max-warnings=0` 并验证。

### Task 10: 文档治理

**Files:**
- Review/Delete/Update: `docs/developer/*`
- Modify: `docs/developer/architecture.md`
- Modify: `docs/developer/css-architecture.md`
- Modify: `docs/developer/options-page-ui.md`
- Modify: `docs/developer/project-audit-2026-07-10.md`

**Steps:**
1. 用引用搜索判断过时文档是否仍有唯一信息。
2. 删除完全被替代的文档；保留的文档更新为当前架构。
3. 在审计报告中增加 remediation 状态表和最终体积。

### Task 11: 两轮 review、提交与 PR

**Steps:**
1. 运行 `pnpm format:check`、`pnpm lint:check`、`pnpm typecheck`、`pnpm test:run`、`pnpm build`、`pnpm build:userscript`。
2. 第一轮 review：逐个审计 ID 对照代码和测试。
3. 修正发现，重复完整检查。
4. 第二轮 review：检查 diff、重复数据源、cleanup、主题、i18n、双平台和安全退化。
5. 使用 Conventional Commits 提交。
6. 推送分支并使用英文标题/正文创建 GitHub PR。

