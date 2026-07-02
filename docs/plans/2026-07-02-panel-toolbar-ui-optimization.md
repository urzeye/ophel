# 主面板工具栏与快捷按钮组 UI 优化实施方案

## 背景

PR #749 已合并到 `main`，设置页、主题管理和面板基础 chrome 已完成第一轮整理。下一步优化范围聚焦主面板内的高频操作区：大纲、提示词、会话三个 tab 的工具栏与搜索框，以及右侧快捷按钮组。

## Design read

- 界面类型：高频 AI 工作流工具面板。
- 重设计模式：`preserve`。保留现有信息架构、功能入口和快捷方式，只升级控件系统、视觉层级和交互反馈。
- 适用规范：`DESIGN.md` 的 `4.2 面板 MainPanel`、`5.1 按钮`、`5.2 标签页与分段切换`、`5.3 表单`、`5.6 可访问性`、`6. 交互与动效`、`9. 实现约束`。
- Skill 取舍：以 `redesign-existing-projects` 的 audit-first 与定向升级为主；`gpt-taste` 只采用更强分组、控件节奏和触感反馈，不采用 AIDA、GSAP、hero 或营销页式动效。

## 当前问题

- 三个 tab 顶部控件分别实现，按钮尺寸、搜索框高度、圆角、focus、active 状态不一致。
- 大纲 tab 顶部仍有大量内联样式，层级滑杆视觉过重，搜索框过小。
- 提示词 tab 顶部搜索、库切换、导入导出按钮是局部拼装，和大纲/会话的搜索语言不一致。
- 会话 tab 中 toolbar/search 样式重复定义，搜索后缀按钮由 `div` 模拟按钮，键盘语义不足。
- 右侧快捷按钮组的常驻旋转和呼吸动画会制造视觉噪音。

## 实施阶段

### 阶段 1：统一基础控件

- 在 `src/style.css` 建立共享面板控件类：
  - `gh-panel-tool-stack`
  - `gh-panel-toolbar`
  - `gh-panel-toolbar-group`
  - `gh-panel-icon-btn`
  - `gh-panel-search`
  - `gh-panel-search-icon`
  - `gh-panel-search-input`
  - `gh-panel-search-action`
- 将大纲、提示词、会话 tab 的顶部工具栏和搜索框迁移到这些类。
- 删除明显的 toolbar/search 内联样式。
- 将会话搜索栏的筛选/清除控件改为真实 `button`。
- 去掉快捷按钮组的常驻 spin/breathe 动画。

### 阶段 2：重排 tab 内部层级

- 大纲 tab：把主操作、搜索和层级控制整理成更清楚的两层结构。
- 提示词 tab：把 `Prompts / Chains`、搜索、导入导出、分类 chips 分成主控制行和过滤行。
- 会话 tab：把文件夹上下文、同步、定位、批量、新建文件夹和搜索过滤拆成更明确的命令区。

### 阶段 3：细化状态与验收

- 补齐 hover、active、focus-visible、disabled 状态。
- 检查浅色/深色主题和 24 套预置主题下的可读性。
- 检查扩展版和油猴版的构建。

## 文件范围

- `src/components/OutlineTab.tsx`
- `src/components/PromptsTab.tsx`
- `src/components/ConversationsTab.tsx`
- `src/components/QuickButtons.tsx`
- `src/style.css`
- `src/styles/conversations.css`
- 必要时更新 `CHANGELOG.md` 与 `CHANGELOG.zh-CN.md`

## 验收标准

- 三个 tab 顶部控件高度、圆角、边框、focus ring、active 态一致。
- 搜索框在三个 tab 中具有相同的视觉骨架和键盘焦点反馈。
- 快捷按钮组不再有无目的常驻动画。
- 不改变现有业务逻辑、快捷键、搜索行为、同步行为、导入导出行为。
- 通过 `pnpm format:check`、`pnpm typecheck`，必要时通过 `pnpm build` 与 `pnpm build:userscript`。
