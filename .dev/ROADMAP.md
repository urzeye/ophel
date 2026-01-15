# Ophel Extension Roadmap

> 待办事项和功能规划

---

## 🐛 Bug 修复

- [x] **提示词分类选择问题** ✅

  - 问题：更改提示词分类名后，没有默认选中的分类，所有提示词都查不出来，必须手动选一下分类
  - 修复：在 `handleRenameCategory` 中同步更新 `selectedCategory` 状态
  - 文件：`src/components/PromptsTab.tsx`

- [x] **阅读历史恢复不准确** ✅

  - 原因：Chrome Storage 写入存在竞态条件，导致部分历史记录未正确保存
  - 修复：增加防抖与队列机制
  - 优先级：中

  - 问题：阅读历史恢复功能不准确
  - 优先级：中

- [x] **Gemini Enterprise 滚动锁定无效** ✅

  - 问题：在 Gemini Enterprise (business.gemini.google) 站点上滚动锁定功能无效
  - 原因：主世界脚本缺少对 `Element.prototype.scrollTo/scroll/scrollBy` 的劫持
  - 修复：在 `scroll-lock-main.ts` 中补充三个元素级滚动 API 的劫持

- [x] **主题切换动画不同步** ✅

  - 问题：切换深浅主题时，圆形扩散动画还没完成前，面板框架（header/footer）已变成目标主题颜色，但中间的提示词列表、会话文件夹列表、输入框等仍保持原主题样式，视觉不一致
  - 修复：将 `onModeChange` 回调延迟到 `transition.finished` 之后，确保 React 重渲染不干扰 View Transition 动画
  - 文件：`src/core/theme-manager.ts`

- [x] **Gemini Enterprise 表格复制按钮** ✅

  - 问题：表格复制按钮在 Gemini Enterprise 不显示、点击无效果
  - 方案：为 Shadow DOM 站点添加定时扫描机制，使用内联样式和 JS 事件处理
  - 文件：`copy-manager.ts`, `main.ts`

- [x] **Grok 页面输入框焦点被强制抢占** ✅
  - 问题：在 Grok.com 的扩展输入框中输入时，焦点被 Grok 页面强制抢走
  - 原因：Plasmo Shadow DOM 事件隔离，在 document 上监听无法捕获内部事件
  - 修复：在组件根元素（panelRef / containerRef）上监听 keydown，使用 stopImmediatePropagation 阻止传播
  - 文件：`MainPanel.tsx`, `SettingsModal.tsx`

---

## 🔧 重构

- [x] **布局设置命名空间统一** ✅

  - 内容：将 `pageWidth` 移入 `layout` 命名空间，与 `userQueryWidth` 统一管理
  - 文件：`storage.ts`, `SettingsTab.tsx`, `settings-schema.json`

- [x] **设置页面重构** ✅

  - 目标：优化设置页面的代码结构和用户体验
  - 优先级：中

- [x] **会话 Tab 初始同步逻辑**
  - 问题：会话列表的初始同步逻辑需要优化
  - 优先级：中

---

## 🚀 待办优化 (Backlog)

### 权限与安全

- [x] **优化权限申请逻辑** ✅

  - 目标：遵从最小权限原则 (Least Privilege)
  - 内容：
    - 必需权限只保留 `storage` 等基础权限
    - `<all_urls>` 移至可选权限，用于 WebDAV 和去水印
    - 增加权限校验：操作对应设置项时，如果未授权，动态提示去授权
    - 权限撤销时自动禁用依赖该权限的功能
  - 文件：`background.ts`, `PageContentPage.tsx`, `perm-request.tsx`

- [x] **去水印功能权限处理** ✅

  - 默认关闭，开启时检查并请求 `<all_urls>` 权限
  - 权限撤销时自动禁用该功能

- [x] **WebDAV 恢复校验** ✅
  - ~~问题：目前 WebDAV 恢复时未做数据完整性/格式校验；恢复时不应该覆盖当前的webdav配置~~
  - 已实现：添加 `backup-validator.ts` 进行数据类型校验（settings/prompts/folders/conversations 等）
  - 恢复时保护当前 WebDAV 配置不被覆盖（已在早期版本实现）

### UI/UX 体验优化

- [ ] **自定义样式编辑器优化**

  - 问题：当前弹窗太小，不方便编辑 CSS
  - 方案：优化弹窗尺寸，或改为非弹窗模式（如侧边栏展开/独立页面）

- [x] **预置主题样式微调** ✅

  - 问题：部分按钮/开关在特定主题下对比度不足，区别不明显
  - 修复：优化赛博霓虹、黑客终端、极致黑白等主题的对比度与图标可见性
  - 目标：优化配色方案，提升可视性

- [x] **细节样式优化**

  - 内容：优化 emoji 图标显示，统一样式细节

- [x] **模型锁定排版优化**
  - 目标：改进模型锁定功能的 UI 布局

### 交互逻辑

- [x] **设置页与自动吸附的交互** ✅
  - 问题：打开设置模态框时，面板不应触发自动吸附
  - 方案 A：将设置模态框加入 Portal 检测，复用现有禁止自动吸附逻辑
  - 方案 B：当关闭自动吸附开关时，立即重置 `edgeSnapState` 为 `null`

## 💡 提示词功能规划

### ✅ 已完成

- [x] **变量占位符** - 支持 `{{topic}}` 格式，插入时弹窗填写变量值
- [x] **收藏/置顶** - 手动置顶常用提示词
- [x] **导入/导出 JSON** - 数据迁移与备份（支持覆盖/合并）
- [x] **最近使用记录** - 自动记录并支持筛选
- [x] **分类颜色** - 根据分类名自动哈希生成颜色
- [x] **Markdown 预览** - 集成 markdown-it + highlight.js
- [x] **用户提问 Markdown 渲染** ✅
  - 场景：Gemini 把用户输入的 Markdown 按行拆分成 HTML，丢失了格式
  - 方案：提取文本 → 合并 → 用 markdown-it 渲染
  - 支持 Gemini 普通版和 Enterprise 版（Shadow DOM）
  - 包含代码块复制按钮、滚动条美化、深色模式适配

---

## 🎨 布局与样式

### ✅ 已完成

- [x] **用户问题容器宽度调整** ✅

  - 支持调整用户提问气泡的最大宽度（默认 600px）
  - 支持 Gemini 普通版和 Enterprise 版
  - 使用 `gh-` 前缀样式 ID，焦点离开后才应用（onBlur 模式）
  - 文件：`LayoutManager`, `storage.ts`, `SettingsTab.tsx`

- [x] **页面加宽功能** ✅
  - 支持调整聊天页面的宽度
  - 支持按站点独立配置

### ✅ 已完成

- [x] **快捷键设置** ✅

  - 支持用户自定义任意快捷键
  - 兼容 Mac（⌘）和 Windows（Ctrl）
  - 提供专门的快捷键设置面板（键位设置）
  - 支持快捷键冲突检测、录入、恢复默认

### P1 - 待实现

- [x] **自定义面板高度** ✅

  - 支持用户调整面板的高度 (50-100 vh)
  - 设置项位于「基本设置 → 面板 → 面板高度」
  - 文件：`storage.ts`, `MainPanel.tsx`, `GeneralPage.tsx`

- [x] **适配 ChatGPT** ✅

  - 适配 chat.openai.com / chatgpt.com
  - 挂载方案：body 挂载 + 延迟重挂载机制（ChatGPT 专用）
  - 原因：ChatGPT 的 React Hydration 会清除 body 下的非预期元素
  - 文件：`ui-entry.tsx`、`ChatGPTAdapter`

- [x] **适配 Grok**

  - 适配 grok.com
  - 需要分析 DOM 结构，实现 SiteAdapter

- [x] **适配 AI Studio** ✅

  - 适配 aistudio.google.com（Google Gemini Playground）
  - 技术栈：Angular + Material UI，三栏布局
  - URL 结构：`/prompts/new_chat`（新对话）、`/prompts/[ID]`（历史对话）
  - 已实现功能：
    - 站点匹配、主题色配置
    - 输入框操作（textarea.textarea）
    - 会话列表从侧边栏 `a[href*="/prompts/"]` 提取
    - 大纲提取（定位 `ms-prompt-chunk.text-chunk` 排除按钮/标签文字）
    - 导出配置（`.chat-turn-container.user` / `.chat-turn-container.model`）
    - 生成状态检测（Run 按钮禁用状态 + loading 动画）
    - 复制最新回复
  - 待完善：
    - [x] 默认模型配置
    - [x] 界面状态控制（侧边栏、工具栏、高级设置、运行设置面板自动收起）
    - [x] 页面宽度调整（`.chat-session-content` + `.chat-turn-container`）
    - [x] ~~用户问题 Markdown 增强~~（不做 - AI Studio 已有良好的 Markdown 渲染）
    - [ ] 阅读历史恢复（URL 不是单独会话）
    - [x] **模型锁定优化**：从 DOM 动态抓取模型列表，下拉选择器替代手动输入
    - [x] **会话同步**：跳转 `/library` 页面抓取全量会话列表并缓存
    - [x] **移除图片水印**：移除 AI Studio 生成的图片水印 (display: none)
  - 文件：`adapters/aistudio.ts`, `contents/aistudio-preload.ts`

- [x] **适配 Claude** ✅

  - 适配 claude.ai / claude.com
  - 已实现功能:
    - 会话列表、侧边栏滚动、导航到会话
    - 收藏会话识别(通过DOM结构特征,支持国际化)
    - 输入框操作(插入/清空)
    - 模型切换与锁定(支持子菜单)
    - 大纲提取、生成状态检测
    - 导出配置、复制最新回复
    - 用户问题 Markdown 增强(分量增强,保留 Claude 已渲染的元素)
    - 会话观察器、页面宽度选择器
    - 主题切换(LSS-userThemeMode)
    - 一键切换 Session Key (支持多账号轮询)
  - 遗留问题：
    - [ ] ~~**Artifacts 导出**~~：暂缓 - 目前直接过滤 Artifacts 并保留占位符，待有更好方案后再处理
  - 文件：`adapters/claude.ts`

- [ ] ~~**会话导出优化**~~（暂缓）

  - 优化导出格式和内容

- [ ] ~~**批量导出**~~（暂缓）

  - 支持批量选择会话并导出

- [x] **Gemini Gem 适配** ✅

  - 支持 `/gem/{gem_id}` 使用 Gem 新对话、`/gems/create` 创建、`/gems/edit/` 编辑
  - 这些页面不会恢复阅读历史
  - 文件：`adapters/gemini.ts` 的 `isNewConversation()`

- [ ] **适配 DeepSeek**

  - 适配 deepseek.com / chat.deepseek.com

- [ ] **适配 Kimi**

  - 适配 kimi.moonshot.cn

- [ ] **适配 Perplexity**
  - 适配 perplexity.ai

### 功能增强 (New)

- [x] **支持移除快捷键** ✅

  - 支持移除单个快捷键绑定（设为 null）
  - 跨平台录入兼容：Mac 上录入的 ⌘ 自动转换为 Ctrl，确保 WebDAV 同步后 Windows 可用

- [x] **允许设置页面最大化**

  - 支持配置：在当前页弹窗打开 (默认) 或 新标签页打开 (最大化)

- [x] **多语言国际化适配**

  - 计划支持：日语、韩语、法语、德语、意大利语

- [x] **免责声明弹窗**
  - 用户首次安装/更新后首次打开时提示
  - 包含免责声明与隐私政策概要
  - 需点击"我同意"后方可开始使用

---

## 📝 更新日志

| 日期       | 内容                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| 2026-01-15 | AI Studio 增强：集成去水印功能（拦截原生 Fetch/XHR 阻止加载水印图片）           |
| 2026-01-15 | AI Studio 增强：实现全量会话同步（跳转 library 页面抓取表格数据）              |
| 2026-01-15 | AI Studio 增强：实现页面宽度调整（`.chat-session-content` + `.chat-turn-container`）|
| 2026-01-15 | AI Studio 增强：实现运行设置面板自动收起、预加载脚本优化体验                   |
| 2026-01-15 | 国际化完善：AI Studio 设置文案覆盖所有 10 种语言                               |
| 2026-01-14 | 新增：AI Studio 适配器 MVP 版本（站点匹配、输入框、会话管理、导出）           |
| 2026-01-14 | 功能增强：支持移除单个快捷键 + 跨平台录入兼容 (Mac⌘→Ctrl)                     |
| 2026-01-14 | UI 优化：设置页语言切换菜单样式升级 (地球图标、卡片风格)                      |
| 2026-01-14 | UI 优化：关于页新增社区标语 (Community Motto)                                 |
| 2026-01-14 | 功能增强：设置页面支持最大化/还原切换                                         |
| 2026-01-14 | 交互优化：免责声明弹窗 UI 焕新，强化 GitHub Star 引导及隐私说明               |
| 2026-01-14 | 国际化修复：站点配置页 Tab 名称修正 (去除非必要的“专属”后缀)                  |
| 2026-01-14 | Claude 设置优化：非 Claude 站点禁用即时切换与导入，添加快捷键 Ctrl+Alt+S 限制 |
| 2026-01-14 | 快捷键重构：新增设置分类、Claude/Gemini/主题专属快捷键                        |
| 2026-01-14 | 交互优化：快捷键直接唤起当前页设置弹窗并精准定位子页面 (SubTab)               |
| 2026-01-14 | Claude 增强：实现一键切换 Session Key (多账号轮询)                            |
| 2026-01-13 | 完成 Claude 适配器（会话/模型/大纲/导出/用户问题 Markdown 增强）              |
| 2026-01-13 | 优化模型锁定：分阶段执行、优先精确匹配、语言无关子菜单检测                    |
| 2026-01-11 | 完成 ChatGPT 账户隔离（getCurrentCid，支持 personal/团队）                    |
| 2026-01-11 | 完成 ChatGPT 面板挂载适配（延迟 + MutationObserver 监控）                     |
| 2026-01-11 | 适配 Gemini Gem 功能（新对话判断、阅读历史跳过）                              |
| 2026-01-11 | 添加备份恢复数据类型校验（本地导入 + WebDAV 恢复）                            |
| 2026-01-11 | 实现自定义面板高度功能 (50-100 vh)                                            |
| 2026-01-11 | 修复赛博霓虹主题 CSS 变量污染导致底栏文字变粉色的问题                         |
| 2026-01-11 | 快捷键系统完成：自定义键位、设置页面、冲突检测                                |
| 2026-01-11 | 修复边缘吸附时 IME 输入法导致面板隐藏的问题                                   |
| 2026-01-09 | 预置主题样式修复：赛博/黑客/黑白主题对比度优化                                |
| 2026-01-09 | 交互优化：数字输入框支持更加流畅的编辑体验                                    |
| 2026-01-09 | 修复设置页切换 Tab 时滚动位置未重置的问题                                     |
| 2026-01-09 | 多语言补全：完善繁体中文翻译                                                  |
| 2026-01-09 | UI 优化：关于页 Slogan 渐变色适配                                             |
| 2026-01-08 | 实现权限最小化：`<all_urls>` 可选、动态检测、撤销后自动禁用                   |
| 2026-01-08 | 去水印默认关闭，开启时请求权限                                                |
| 2026-01-08 | 修复 settings-store 跨上下文同步无限循环问题                                  |
| 2026-01-08 | 设置页重构完成：独立模态框、权限管理、数据同步                                |
| 2026-01-07 | 修复 Gemini Enterprise 滚动锁定失效问题                                       |
| 2026-01-07 | 修复 Gemini Enterprise 表格复制按钮问题                                       |
| 2026-01-07 | 完成用户问题宽度调整功能                                                      |
| 2026-01-07 | 重构：布局设置统一到 layout 命名空间                                          |
| 2026-01-07 | 完成用户提问 Markdown 渲染功能                                                |
| 2026-01-06 | 更新提示词功能完成状态，添加快捷键设置规划                                    |
| 2026-01-06 | 添加提示词功能规划                                                            |
| 2026-01-06 | 创建 Roadmap 文档                                                             |
