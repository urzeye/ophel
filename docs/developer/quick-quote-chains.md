# 快速引用与链式提示词开发计划

## 目标

快速引用与链式提示词用于把会话中的任意选中文本变成可复用的运行上下文。用户选中一段文本后，Ophel 展示轻量悬浮操作条，允许直接引用、回复，或执行用户自定义的链式提示词。

第一版采用 Ophel 自建引用层，不接入 ChatGPT、Grok 等站点的原生引用能力。这样可以保持跨站体验一致，也避免把站点私有 DOM/API 作为核心依赖。

## 概念模型

- **Prompt**：单个提示词原子，继续由现有 Prompts 视图管理。
- **Chain**：链式提示词，由多个 prompt 步骤组成。
- **Action**：选中文本后悬浮层里的可点击执行入口。内置 Quote/Reply 和用户启用的 Chains 都表现为 action。
- **Selection context**：本次选区上下文，至少包含 `{{selection}}` 和 `{{quote}}`。
- **Quote reference**：Ophel 记录的源文锚点，用于用户消息旁的引用 chip 回跳原文。

## 交互设计

Prompts tab 增加 `Prompts / Chains` 二级视图。

`Prompts` 视图保持现有搜索、分类、提示词列表、导入导出与新增提示词流程。

`Chains` 视图展示链式提示词卡片：

- 图标、名称、启用状态。
- 步骤数量与 `A -> B -> C` 预览。
- 是否显示在选区悬浮层。
- hover 操作：编辑、复制、删除、测试、启用/停用。

Chain 编辑器使用结构化表单，不做画布：

- 基础信息：名称、SVG 图标、描述、是否显示在选区悬浮层。
- 步骤列表：每一步选择一个已有 prompt，可拖拽排序。
- 变量预览：汇总所有步骤里除 `{{selection}}`、`{{quote}}` 外仍需用户填写的变量。
- 执行预览：用示例选区展示最终会入队的内容。

用户在会话内容中选中文本后，悬浮层显示：

- 内置 Quote/Reply 固定靠前。
- 用户启用的 Chains 以 icon button 显示。
- 数量多时横向滚动。

## 执行语义

第一版 Chain 使用共享变量语义：

- `{{selection}}`：选中文本原文。
- `{{quote}}`：选中文本转换成 Markdown blockquote 后的内容。
- 除自动变量外的变量沿用现有变量弹窗一次性填写。
- 多步 Chain 在执行前一次性渲染，按步骤顺序加入提示词队列。
- 不自动捕获上一步 AI 输出作为下一步变量。

Prompt queue 关闭时，多步 Chain 提示用户启用队列。内置 Quote/Reply 仍允许插入输入框，便于用户手动编辑。

## 技术实现

新增或扩展以下能力：

- Chain 持久化 store：保存 action/chain 定义、排序、启用状态、清洗后的 SVG 图标与步骤。
- Prompt action 执行器：复用 `prompt-action-types.ts` 和 `prompt-actions.ts`，统一处理 Prompts tab、选区悬浮层和队列入口。
- Queue item metadata：队列项携带 chain、step、quote reference 信息，队列 UI 显示 `Chain: {title} · {index}/{total}`。
- Selection controller：监听选区变化，过滤编辑器、Ophel UI 与站点无关区域，生成 selection context 和源文锚点。
- Quote renderer：在发送后的用户消息旁渲染 Ophel 引用 chip；点击 chip 定位源文并短暂高亮。
- SVG sanitizer：只允许安全 SVG 图形节点和属性，禁止脚本、事件属性、外链与 `foreignObject`。

引用 chip 不把技术 marker 写进发给 AI 的正文。发送后渲染依赖队列项/插入上下文中的 quote reference 与用户消息内容匹配。

## 数据与兼容

- 完整备份包含 Chains。
- 提示词备份包含 Prompts + Chains。
- 旧版只有 prompts 数组的备份文件保持可导入。
- 新增或修改文案必须同步 10 种应用内语言。

## 验证

静态检查：

- `pnpm format:check`
- `pnpm lint:check`
- `pnpm typecheck`

构建检查：

- `pnpm build`
- `pnpm build:userscript`

手动冒烟站点：

- ChatGPT
- Grok
- Gemini

重点场景：

- 选区悬浮层出现/消失时机正确。
- Chain 多步按顺序入队。
- 变量弹窗只询问未自动提供的变量。
- 队列发送后引用 chip 正确渲染。
- chip 能回跳源文并高亮。
- 普通 prompt 插入、发送、入队、批量导入不回归。
- 备份导入导出兼容新旧数据。

---

## 开发进度

### ✅ P1: 核心数据结构与存储（已完成）

- [x] Chain 数据模型定义（PromptChain、ChainStep）
- [x] Chain store 实现（usePromptChainsStore）
- [x] 支持步骤模式：使用已有提示词 / 直接输入内联内容
- [x] 本地存储持久化（localStorage）

### ✅ P2: Chains 视图与管理（已完成）

- [x] Prompts / Chains 二级标签页切换
- [x] Chains 列表视图
  - [x] 卡片布局：图标、标题、步骤流预览
  - [x] 启用/停用状态切换
  - [x] 是否显示在悬浮层开关
  - [x] 卡片操作：编辑、复制、删除
- [x] Chain 编辑器弹窗
  - [x] 基础信息：名称、描述、SVG 图标
  - [x] SVG 图标预设（40 个常用图标）
  - [x] 步骤列表：添加、删除、拖拽排序
  - [x] 步骤配置：模式切换、提示词选择、内联输入
  - [x] 变量预览：自动提取所有变量
  - [x] 执行预览：示例渲染，支持导航跳转
- [x] 创建新 Chain
- [x] 编辑现有 Chain
- [x] 复制 Chain
- [x] 删除 Chain

### ✅ P3: UI/UX 优化（已完成）

- [x] Chain 卡片布局优化
  - [x] 标题和步骤分两行显示
  - [x] 步骤流文本支持省略号 + Tooltip 悬浮预览
  - [x] 步骤数量 badge 移到步骤流同一行
- [x] SVG 图标预设显示修复
  - [x] 添加图标预设样式到 PORTAL_STYLES
  - [x] 修复第一个图标（Translate）的 SVG 路径
- [x] 步骤行拖拽排序
  - [x] 实现真实拖拽功能（dragStart/dragOver/dragEnd）
  - [x] 拖拽状态视觉反馈（半透明 + cursor: grabbing）
  - [x] 移除上下箭头按钮，简化操作
- [x] 步骤行布局完全重构
  - [x] 改为上下两行布局（header + input）
  - [x] 删除按钮直接显示在 header 右侧（hover 显示）
  - [x] 输入框占据全宽（100%）
  - [x] 内联输入框最小高度 80px，可调整大小
  - [x] 白色卡片背景 + hover 阴影效果
  - [x] 用分段控制器替换难看的单选按钮
  - [x] 步骤编号改用蓝色 badge
- [x] 执行预览优化
  - [x] 使用 renderMarkdown 渲染内容
  - [x] 步骤标题重新设计（编号 + 标题）
  - [x] 添加步骤导航按钮（1、2、3...）
  - [x] 悬浮导航栏（sticky，始终展示在可视区域顶部）
  - [x] 导航按钮显示步骤编号 + 标题（截断超长标题）
  - [x] 支持点击导航按钮平滑跳转
  - [x] 导航按钮 hover 动效优化
  - [x] 预览卡片圆角 + 阴影效果
  - [x] blockquote 样式优化（蓝色左边框 + 浅色背景）
- [x] 按钮样式统一
  - [x] 收起/展开按钮样式优化
  - [x] 删除按钮 hover 效果优化（红色背景，hover 显示）
- [x] 修复模式切换样式问题
  - [x] 删除重复的 CSS 定义
  - [x] 用分段控制器完全替换单选按钮
  - [x] iOS 风格的切换效果（灰色背景 + 白色活动按钮）

### 🚧 P4: 选区悬浮层与执行（已完成）

- [x] Selection controller
  - [x] 监听选区变化
  - [x] 过滤无效选区（编辑器、Ophel UI）
  - [x] 生成 selection context（{{selection}}, {{quote}}）
  - [x] 生成 quote reference（源文锚点）
- [x] 悬浮层 UI
  - [x] 内置 Quote/Reply 按钮
  - [x] Chain 快捷按钮（显示已启用的 Chains）
  - [x] 横向滚动支持
  - [x] 响应式定位
- [x] Chain 执行
  - [x] 变量收集（复用现有变量弹窗）
  - [x] 渲染所有步骤
  - [x] 加入提示词队列
  - [x] Prompt queue 关闭时的提示
  - [x] runMode 正确传递和执行
  - [x] 修复队列时序竞争问题（AI 生成时不会过早发送下一步）

### ✅ P5: 引用 Chip 与回跳（已完成）

- [x] Quote renderer
  - [x] 在用户消息旁渲染引用 chip
  - [x] Chip 样式设计
  - [x] 不把技术 marker 写入正文
- [x] 回跳功能
  - [x] 点击 chip 定位源文
  - [x] 短暂高亮源文区域
  - [x] 滚动到可见区域
- [x] Queue item metadata
  - [x] 队列项携带 chain/step/quote reference
  - [x] 队列 UI 显示 "Chain: {title} · {step}/{total}"
- [x] URL 长度优化
  - [x] 精简锚点数据结构（v2 格式）
  - [x] 减少上下文字符长度（80→40）
  - [x] 缩短文本签名长度（120→60）
  - [x] 移除冗余字段（cid, rootSelector, scrollTop, stepId, quoteText, createdAt）
  - [x] 向后兼容 v1 格式
  - [x] **优化效果：URL 长度减少 51.2%**

### 🔜 P6: 备份与国际化

- [ ] 备份功能
  - [ ] 完整备份包含 Chains
  - [ ] 提示词备份包含 Prompts + Chains
  - [ ] 兼容旧版只有 prompts 的备份
- [ ] 国际化
  - [ ] 新增文案翻译（10种语言）
  - [ ] Chain 相关文案
  - [ ] 选区悬浮层文案
  - [ ] 错误提示文案

### 🔜 P7: 测试与验收

- [ ] 静态检查全部通过
- [ ] 构建检查全部通过
- [ ] 手动测试主要站点（ChatGPT、Grok、Gemini）
- [ ] 核心场景验证
- [ ] 回归测试（普通 prompt 功能）

---

## 技术债务与改进

### 已解决
- ✅ SVG 图标不显示 → 添加样式到 PORTAL_STYLES
- ✅ 拖拽排序无效 → 实现真实拖拽功能
- ✅ 步骤行 UI 粗糙 → 用分段控制器替换单选按钮，白色卡片设计
- ✅ 执行预览导航简陋 → Sticky 悬浮导航栏 + 显示步骤标题
- ✅ runMode 未生效 → 传递 runMode 到队列，dispatcher 根据 runMode 执行
- ✅ 队列时序竞争 → dispatchNext 二次确认 + submitPrompt 后等待 500ms
- ✅ 引用 URL 过长 → v2 精简格式，URL 长度减少 51.2%
  - 精简锚点数据：移除 cid, scrollTop, stepId, quoteText, createdAt
  - 缩短上下文：CONTEXT_CHARS 从 80 减到 40
  - 缩短签名：textSignature 从 120 字符减到 60 字符
  - 保持向后兼容：同时支持 v1 和 v2 格式解码
- ✅ 引用跳转定位不准确 → 恢复 rootSelector + 短文本自适应上下文
  - 恢复 rootSelector 字段（基于 data-message-id 或 id 属性）
  - rootSelector 匹配优先级最高（score 40 vs 其他最高 18）
  - 短文本（<20字符）自动使用更长上下文（80 字符 vs 40 字符）
  - 提高短文本引用（如 "右键 → Reset Overrides"）的定位准确率

### 待优化
- [ ] Chain 执行性能优化
- [ ] 变量提取算法优化
- [ ] 悬浮层定位算法优化
- [ ] 引用 chip 匹配算法优化
---
