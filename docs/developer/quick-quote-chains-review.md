# 快速引用与链式提示词 — 代码审查与优化方案

> 审查时间：2026-06-12
> 审查范围：PR #623 `feat/quick-quote-chains`
> 当前状态：WIP，功能未完工、UI 未达标

## 一、整体评估

PR 的架构设计合理，三层分离清晰：

- **执行层**（`prompt-chain-runner.ts`）：Chain 解析、变量替换、步骤渲染
- **持久化层**（`prompt-chains-store.ts` / `quick-quotes-store.ts`）：Chain 与引用锚点存储
- **交互层**（`QuickQuoteActions.tsx` + `PromptsTab.tsx` chains 视图）：选区悬浮层与 Chains 管理面板

但当前实现存在两类问题：**功能不完整**和 **UI 体验粗糙**。下面逐一分析。

## 二、功能层面问题

### 2.1 Chain 步骤只能选已有 prompt

**现状**：Chain 编辑器中每一步只能从下拉列表选择已有 prompt（`PromptsTab.tsx:1750-1760`）。如果用户只想写一句临时指令，必须先去 Prompts 视图创建 prompt，再回来编辑 Chain。

**影响**：使用流程断裂，临时需求下操作成本过高。与"快速引用"的"快速"定位矛盾。

**建议**：步骤支持"内联内容"模式——每个步骤增加一个 radio 切换：`使用已有 Prompt / 直接输入`。选择"直接输入"时下拉变为 textarea，内容直接作为该步骤的 prompt 模板。这个内联内容不与 Prompts 表关联，仅在 Chain 内持久化。

### 2.2 选区 popover 缺少"纯引用"操作

**现状**：popover 只有 Reply 按钮（`QuickQuoteActions.tsx:322-336`），没有独立的 Quote 按钮。设计文档明确提到"内置 Quote/Reply 固定靠前"，但代码中只实现了 Reply。

**影响**：用户只想引用原文而不附加回复模板时无法操作。

**建议**：增加独立 Quote action，与 Reply 并排显示：

- **Quote**：直接插入 `> selected text` blockquote 到输入框，不附加额外内容
- **Reply**：插入 blockquote + 空行（现有行为）
- 两者都生成 quote reference chip

### 2.3 Chain 执行强依赖 promptQueue

**现状**：`runChain` 在队列未开启时只弹 toast 提示（`QuickQuoteActions.tsx:351-354`），不做任何 fallback。

**影响**：用户点击 chain 后看到"请启用提示词队列"，可能不理解两者的关系，也不知道去哪开启。

**建议**：提供两种 fallback 策略：

1. 单步 Chain 直接插入输入框（与普通 prompt 行为一致）
2. 多步 Chain 提示启用队列，同时提供"仅插入第一步"的选项

### 2.4 引用 chip 渲染机制可优化

**现状**：`QuickQuoteRenderer`（`QuickQuoteActions.tsx:198-240`）使用 `MutationObserver` + 2s 定时轮询双保险，每个 user message 都要做文本 hash 匹配。

**问题**：

- 2s 定时器在长会话下持续运行，浪费资源
- MutationObserver 回调频繁触发 `renderReferenceChips`，每次遍历所有消息和所有引用做 O(n*m) 匹配

**建议**：

- 去掉定时轮询，仅在 MutationObserver 和队列发送事件中触发渲染
- 为已渲染 chip 的消息设置标记，避免重复匹配
- 考虑在队列项入队时提前绑定 consumerContentHash，发送后直接按 hash 定位消息

### 2.5 Chain 编辑器缺少执行预览

**现状**：设计文档提到"执行预览：用示例选区展示最终会入队的内容"，但当前编辑器中只有变量预览，没有执行预览。

**影响**：用户无法在保存前验证 Chain 各步骤的渲染结果是否正确。

**建议**：在编辑器底部增加可折叠的"执行预览"区域，用占位文本模拟 `{{selection}}` 和 `{{quote}}`，展示每个步骤渲染后的实际内容。

## 三、UI/UX 问题分析

### 3.1 Chains 卡片信息密度过高、层次不清

**现状**（`PromptsTab.tsx:1511-1638`）：每张卡片同时展示：

- 图标 + 标题 + 描述
- 4 个始终可见的操作按钮（启用/复制/编辑/删除）
- Flow chips（A → B → C 步骤预览）
- Variable chips（自定义变量预览）

所有元素视觉权重均等，没有主次关系。这与 Prompts 列表的 hover 浮现操作风格不一致。

**具体问题**：

| 问题 | 位置 | 说明 |
|------|------|------|
| 操作按钮始终可见 | `gh-chain-card-actions` 始终 display:flex | 每张卡片 4 个按钮产生视觉噪声，与 prompt 列表交互范式不一致 |
| Flow chips 碎片化 | `gh-chain-flow-chip` 使用圆角 chip | 多个 chip 横向排列容易溢出，且样式与 variable chips 相似难以区分 |
| Variable chips 默认展示没必要 | 卡片底部展示 `visibleVariables` | 这些信息是编辑时的关注点，列表浏览时不需要 |
| 描述文字紧贴标题 | `gh-chain-description` 与 title 同行 | 长标题 + 长描述时换行混乱 |

**建议**：将卡片重构为**两层信息架构**：

```
┌─────────────────────────────────────────┐
│ ●  Chain 名称          启用 · 3 步骤    │  ← 主体信息（静态）
│   Step1 → Step2 → Step3                │  ← 步骤预览（单行 truncate）
│                              [hover]    │
│              [📋] [✏️] [🗑️]             │  ← 操作按钮（hover 浮现）
└─────────────────────────────────────────┘
```

具体改进：

- 去掉 variable chips 的卡片展示
- Flow 改为纯文本单行 `→` 连接（不用 chip 样式），超长 `text-overflow: ellipsis`
- 操作按钮改为 `opacity: 0` → hover 时 `opacity: 1`，与 prompt-item-actions 行为一致
- 启用状态用左侧小圆点或边框色表示，不占单独按钮位
- 描述文字改为 tooltip 或折叠到详情

### 3.2 Chains 视图切换器存在感弱

**现状**：`gh-prompt-library-switch-btn` 为两个 56px 宽的小按钮（`style.css:1903-1922`），与搜索框挤在同一行。用户可能完全忽略 Chains 视图的存在。

**建议**：

- 将切换器改为更明显的 tab 样式，宽度加大，加上图标
- 或者使用 segmented control 风格，背景色填充整个切换区域
- 考虑在 Chains 为空时引导用户："还没有链式提示词？点击创建"

### 3.3 SVG 图标输入对普通用户不友好

**现状**：Chain 编辑器中的 `iconSvg` 字段是一个 textarea（`PromptsTab.tsx:1703-1712`），用户需要手动粘贴 SVG 代码。

**问题**：普通用户不会写 SVG，这个字段占用了编辑器不少空间，但大多数 Chain 只会用默认图标。

**建议**：

- 将 SVG 输入改为可折叠的"高级选项"，默认隐藏
- 提供 8-12 个预设图标供选择（常用语义：翻译、摘要、分析、代码审查等）
- 预设图标使用简单的几何图形 + 颜色，不依赖外部图标库

### 3.4 选区 popover 视觉粗糙

**现状**（`QuickQuoteActions.tsx:319-334`）：

- Reply 按钮用字母 "R" 作为图标，像占位符
- Chain 按钮无自定义图标时 fallback 为 `*` 字符
- 内置操作与 Chain 操作之间无视觉分隔

**建议**：

- 内置操作使用真实 SVG 图标（引用符号、回复箭头），不使用字母
- Chain 按钮无自定义图标时使用首字母彩色圆点（如 "翻译" → 蓝色圆形 "译"）
- 内置操作与 Chain 操作之间加一条细分隔线（1px vertical divider）
- popover 最大宽度限制 + 横向溢出时左右两侧加渐隐遮罩

### 3.5 Chain 编辑器步骤排序体验差

**现状**：步骤排序使用 ↑ ↓ 按钮（`PromptsTab.tsx:1762-1777`），v1 没有拖拽。设计文档明确计划"拖拽排序"，但当前实现中步骤行没有 drag handle 视觉暗示。

**建议**：即使 v1 不实现真拖拽，也应该：

- 在步骤行左侧添加 drag handle 图标（⠿ 六点网格），视觉上暗示可排序
- handle 样式用 `cursor: grab`，为后续拖拽实现做准备
- ↑ ↓ 按钮保留作为键盘可访问性的补充

## 四、代码质量备注

以下问题不影响功能但值得改进：

### 4.1 PromptsTab.tsx 文件过大

当前 2895 行，包含了 Prompts 列表、Chains 列表、Chain 编辑器、Prompt 编辑器、分类管理、导入导出等所有逻辑。建议后续拆分为：

- `PromptsTab.tsx` — Prompts 视图（列表 + 搜索 + 分类）
- `ChainsView.tsx` — Chains 列表视图
- `ChainEditor.tsx` — Chain 编辑器弹窗（portal）

### 4.2 内联样式过多

Chain 编辑器的 `CHAIN_EDITOR_PORTAL_STYLES` 使用了 `<style>` 注入（`PromptsTab.tsx:85-334`），但 Prompts 编辑弹窗仍然大量使用 inline style。建议统一迁移到 CSS 文件或 CSS-in-JS 方案。

### 4.3 缺少空状态引导

Chains 视图有"暂无链式提示词"的空状态（`PromptsTab.tsx:1522-1528`），但没有引导用户创建第一个 Chain 的 CTA 按钮。建议在空状态中直接放置"创建链式提示词"按钮。

## 五、优先级与实施进度

| 优先级 | 类别 | 条目 | 状态 | 说明 |
|--------|------|------|------|------|
| P0 | UI | 3.1 Chains 卡片重设计 | ✅ 已完成 | 两层架构：状态点+标题+步骤数 / 步骤流纯文本单行 / 操作 hover 浮现 |
| P0 | UI | 3.4 选区 popover 精炼 | ✅ 已完成 | 真实 SVG 图标(Quote/Reply)、首字母彩色圆点 fallback、内置与 chain 间分隔线 |
| P1 | 功能 | 2.2 增加"纯引用"操作 | ✅ 已完成 | `handleQuote` 插入 blockquote，不附加回复模板 |
| P1 | UI | 3.2 切换器存在感 | ✅ 已完成 | segmented control 风格、加大尺寸、hover 态高亮 |
| P1 | UI | 空状态 CTA 引导 | ✅ 已完成 | Chains 为空时显示"创建链式提示词"按钮 |
| P1 | UI | 3.3 SVG 图标简化 | ✅ 已完成 | 预设图标选择网格 + 自定义 SVG 折叠输入 |
| P2 | 功能 | 2.1 步骤支持内联内容 | 🚧 进行中 | 类型已扩展 `inlineContent` 字段，编辑器 UI 和 runner 待适配 |
| P2 | 功能 | 2.3 队列未开启时的 fallback | 🔲 待做 | 单步 chain 直接插入，多步提示启用队列 |
| P2 | UI | 3.5 步骤排序体验 | 🔲 待做 | 步骤行左侧添加 drag handle 视觉暗示 |
| P3 | 功能 | 2.4 引用 chip 渲染优化 | 🔲 待做 | 去掉 2s 定时轮询，仅依赖 MutationObserver |
| P3 | 功能 | 2.5 执行预览 | 🔲 待做 | 编辑器内模拟渲染各步骤 |
| P3 | 代码 | 4.1-4.3 代码重构 | 🔲 待做 | 拆分 PromptsTab / 统一样式方案 |

## 六、与设计文档的差距（更新后）

当前实现与 `docs/developer/quick-quote-chains.md` 设计文档的差异：

| 设计要求 | 当前实现 | 差距 |
|----------|----------|------|
| 内置 Quote/Reply 固定靠前 | ✅ Quote + Reply 均已实现 | 已对齐 |
| hover 操作：编辑、复制、删除、测试、启用/停用 | ✅ hover 浮现操作按钮，无"测试" | 缺测试功能 |
| 执行预览 | 只有变量预览 | 缺执行预览 |
| 拖拽排序 | ↑ ↓ 按钮，无 drag handle | 视觉暗示不足 |
| Chain 图标 | ✅ 预设图标网格 + 自定义 SVG 折叠 | 已对齐 |

---

*本文档随 PR #623 迭代持续更新。最近更新：2026-06-12*
