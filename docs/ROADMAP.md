# Ophel Extension Roadmap

> 待办事项和功能规划

---

## 🐛 Bug 修复

- [x] **提示词分类选择问题** ✅

  - 问题：更改提示词分类名后，没有默认选中的分类，所有提示词都查不出来，必须手动选一下分类
  - 修复：在 `handleRenameCategory` 中同步更新 `selectedCategory` 状态
  - 文件：`src/components/PromptsTab.tsx`

- [ ] **阅读历史恢复不准确**

  - 问题：阅读历史恢复功能不准确
  - 优先级：中

- [ ] **Gemini Enterprise 滚动锁定无效**

  - 问题：在 Gemini Enterprise (business.gemini.google) 站点上滚动锁定功能无效
  - 优先级：中

- [x] **主题切换动画不同步** ✅
  - 问题：切换深浅主题时，圆形扩散动画还没完成前，面板框架（header/footer）已变成目标主题颜色，但中间的提示词列表、会话文件夹列表、输入框等仍保持原主题样式，视觉不一致
  - 修复：将 `onModeChange` 回调延迟到 `transition.finished` 之后，确保 React 重渲染不干扰 View Transition 动画
  - 文件：`src/core/theme-manager.ts`

---

## 🔧 重构

- [ ] **设置页面重构**

  - 目标：优化设置页面的代码结构和用户体验
  - 优先级：中

- [ ] **会话 Tab 初始同步逻辑**
  - 问题：会话列表的初始同步逻辑需要优化
  - 优先级：中

---

## 💡 提示词功能规划

> 详见 [PROMPTS_ROADMAP.md](./PROMPTS_ROADMAP.md)

### ✅ 已完成

- [x] **变量占位符** - 支持 `{{topic}}` 格式，插入时弹窗填写变量值
- [x] **收藏/置顶** - 手动置顶常用提示词
- [x] **导入/导出 JSON** - 数据迁移与备份（支持覆盖/合并）
- [x] **最近使用记录** - 自动记录并支持筛选
- [x] **分类颜色** - 根据分类名自动哈希生成颜色
- [x] **Markdown 预览** - 集成 markdown-it + highlight.js

### P1 - 待实现

- [ ] **快捷键设置**

  - 支持用户自定义任意快捷键
  - 兼容 Mac（⌘）和 Windows（Ctrl）
  - 提供专门的快捷键设置面板

- [x] **用户提问 Markdown 渲染** ✅
  - 场景：Gemini 把用户输入的 Markdown 按行拆分成 HTML，丢失了格式
  - 方案：提取文本 → 合并 → 用 markdown-it 渲染
  - 支持 Gemini 普通版和 Enterprise 版（Shadow DOM）
  - 包含代码块复制按钮、滚动条美化、深色模式适配

### P2 - 待实现

- [ ] **用户提问容器宽度调整**

  - 支持调整用户提问渲染区域的宽度

- [ ] **Gemini Enterprise 表格复制按钮**
  - 问题：表格复制按钮在 Gemini Enterprise 不显示
  - 原因：Shadow DOM 隔离导致 DOMToolkit.each 无法检测到表格

---

## 📝 更新日志

| 日期       | 内容                                       |
| ---------- | ------------------------------------------ |
| 2026-01-07 | 完成用户提问 Markdown 渲染功能             |
| 2026-01-06 | 更新提示词功能完成状态，添加快捷键设置规划 |
| 2026-01-06 | 添加提示词功能规划                         |
| 2026-01-06 | 创建 Roadmap 文档                          |
