# Gemini-helper

<p align="center">
  <strong>✨ Your Gemini, Your Way. ✨</strong><br/>
  <em>打造你的专属 Gemini</em>
</p>

> [!TIP]
> **Gemini 助手**：会话管理与导出、对话大纲、提示词管理、标签页增强（状态/隐私模式/通知）、阅读历史记录与恢复、双向/手动锚点、图片水印移除、加粗修复、公式/表格复制、模型锁定、页面美化、主题切换、智能暗色模式（适配 Gemini 标准版/企业版）

🌐 **语言**: **简体中文** | [English](README_EN.md) | [日本語](README_JA.md) | [한국어](README_KO.md) | [Deutsch](README_DE.md) | [Français](README_FR.md) | [Español](README_ES.md) | [Português](README_PT.md) | [Русский](README_RU.md)

## ✨ 功能特性

### 📝 提示词管理

- **快速插入**：一键将常用提示词插入对话框
- **分类管理**：支持按类别筛选、重命名、删除分类
- **搜索功能**：快速查找需要的提示词
- **增删改查**：自定义管理你的提示词库
- **复制功能**：一键复制提示词内容到剪贴板
- **拖动排序**：自由调整提示词显示顺序

### ⁠ 📁 会话管理

- **文件夹归档**：创建自定义文件夹，将历史会话有序整理
- **多色标签**：内置 30+ 种中国传统色标签，支持自定义颜色与多标签管理
- **实时搜索**：按标题快速筛选会话，支持标签组合过滤
- **批量操作**：支持多选会话进行批量删除、移动、归档
- **会话导出**：支持导出为 Markdown/JSON/TXT 格式，图片可转 Base64 嵌入
- **无缝同步**：自动同步 Gemini 侧边栏最新数据（兼容标准版/企业版）

### 📑 对话大纲

- **自动提取**：从 AI 回复中提取标题结构（支持标准版和企业版 Shadow DOM）
- **用户提问分组**：按对话轮次分组显示大纲，用户提问作为分组标题（💬 图标标识）
- **智能缩进**：根据最高层级自动调整缩进，减少左侧空白
- **快速跳转**：点击大纲项平滑滚动到对应位置，并高亮显示 2 秒
- **同步滚动**：页面滚动时自动高亮对应的大纲项，可在设置中开关控制
- **级别过滤**：支持设置显示到几级标题，Level 0 可快速折叠到只显示用户提问
- **开关控制**：禁用时自动隐藏大纲 Tab 页

### 🚀 快捷导航

- **跳转顶部/底部**：长对话中快速定位
- **悬浮按钮组**：面板收起时仍可使用

### 📐 页面加宽

- **自定义宽度**：支持像素（px）和百分比（%）两种单位
- **即时生效**：调整后立即应用，无需刷新页面
- **独立配置**：不同站点可单独设置

### ⚓ 智能定位系统

本脚本拥有两套独立的位置记录系统：

- **阅读历史 (Reading Progress)**：

  - 长期“阅读进度记忆”，支持跨刷新/跨会话恢复
  - 用户滚动时自动记录，持久化到 GM_storage
  - 页面加载或切换会话时自动恢复

- **双向锚点 (Bidirectional Anchor)**：
  - 短期“返回点”，类似浏览器后退或 `git switch -`
  - 点击大纲/顶部/底部按钮跳转时自动保存当前位置
  - 支持在两个位置间来回切换

### 🏷️ 标签页增强

- **生成状态显示**：标签页标题前自动显示 ⏳（生成中）或 ✅（完成）状态图标
- **自定义标题格式**：支持 `{status}{title}[{model}]` 等占位符组合
- **隐私模式 (Boss Key)**：一键伪装标签页标题为"Google"，隐藏对话内容
- **生成完成通知**：后台生成完成时发送桌面通知
- **自动窗口置顶**：生成完成后自动将浏览器窗口带回前台

### ⚙️ 设置面板

- **Tab 切换**：提示词、大纲、设置三个标签页
- **面板设置**：自定义默认展开/收起，点击外部自动隐藏
- **中文输入修复**：可选开关，解决企业版首字母问题
- **语言切换**：支持简中/繁中/英语

### 🎯 智能适配

- ✅ Gemini 标准版 (gemini.google.com)
- ✅ Gemini 企业版 (business.gemini.google)

### 🌓 自动暗色模式

- **智能检测**：实时跟随系统/网页切换亮/暗模式
- **全局适配**：精心调配的深色主题配色，保护眼睛

### � 内容辅助

- **公式双击复制**：双击数学公式可复制 LaTeX 源码，支持自动添加分隔符
- **表格 Markdown 复制**：在表格右上角添加复制按钮，直接复制 Markdown 格式
- **水印移除**：自动移除 Gemini AI 生成图片中的 NanoBanana 水印，感谢 @Entropy-Xu 贡献
- **边缘吸附隐藏**：拖动面板到屏幕边缘时自动隐藏，悬停恢复，感谢 @Entropy-Xu 贡献
- **手动锚点**：快捷工具栏一键设置/返回/清除锚点位置，感谢 @Entropy-Xu 贡献

## 📸 功能预览

**📹 视频演示**：

| 大纲 Outline | 会话 Conversations | 功能 Features |
|:---:|:---:|:---:|
| <video src="https://github.com/user-attachments/assets/a40eb655-295e-4f9c-b432-9313c9242c9d" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/a249baeb-2e82-4677-847c-2ff584c3f56b" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/c704463c-1ca9-4ab1-937d-7ce638a4f4bb" width="280" controls></video> |

![会话](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-7.png) ![会话](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-8.png) ![大纲](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-2.png) ![提示词](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-1.png) ![阅读导航](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-3.png) ![标签页增强](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-4.png) ![主题切换](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-theme.gif) ![深色模式](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-9.png) ![深色模式](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-10.png) ![深色模式](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-11.png) ![深色模式](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-12.png) ![其他设置](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-5.png)

## 🔧 使用方法

1. 安装 Tampermonkey 浏览器扩展
2. 安装本脚本
3. 打开 Gemini 页面，右侧会出现提示词管理面板
4. 点击提示词即可快速插入

## ⌨️ 快捷操作

| 操作        | 说明              |
| ----------- | ----------------- |
| 点击提示词  | 插入到输入框      |
| 📋 复制按钮 | 复制提示词内容    |
| ☰ 拖动按钮  | 拖动调整排序      |
| ✏ 编辑按钮  | 编辑提示词        |
| 🗑 删除按钮  | 删除提示词        |
| ⚙ 管理分类  | 重命名/删除分类   |
| 点击 × 按钮 | 清除已插入的内容  |
| Enter 发送  | 自动隐藏悬浮条    |
| ⬆ / ⬇ 按钮  | 跳转页面顶部/底部 |

## 📋 [更新日志](./changelog.md)

### v1.11.2

- 🐛 **Bug 修复**：修复 Flutter 图文并茂（图文交汇模式）的滚动问题，去顶部/底部/返回锚点现在能正常工作

### v1.11.1

- 🐛 **Bug 修复**：修复边缘吸附展开问题、修复侧边按钮组显示问题
- 🎨 **UI 优化**：手动锚点按钮加入统一排序系统，智能分隔线

### v1.11.0

- ✨ **新功能**：**会话导出** - 支持导出为 Markdown/JSON/TXT 格式，图片可转 Base64 嵌入
- ✨ **新功能**：**边缘吸附隐藏** - 拖动面板到屏幕边缘时自动隐藏，悬停恢复
- ✨ **新功能**：**手动锚点** - 快捷工具栏新增设置/返回/清除锚点按钮
- ✨ **新功能**：**水印移除** - 自动移除 Gemini AI 生成图片中的 NanoBanana 水印
- ✨ **新功能**：**公式双击复制** - 双击数学公式可复制 LaTeX 源码
- ✨ **新功能**：**表格复制 Markdown** - 表格右上角添加复制按钮
- 🎨 **UI 优化**：**统一侧边按钮组** - 蓝色渐变风格，垂直居中显示

### v1.10.3

### v1.10.2

- ✨ **新功能**：**会话定位** - 新增 ◎ 定位按钮，快速定位当前对话在会话列表中的位置，支持自动同步未收录会话
- 🎨 **UI 优化**：优化工具栏布局，缩小按钮间距，调整按钮顺序为 定位 → 同步 → 新建 → 批量

### v1.10.1

- ✨ **新功能**：**大纲同步滚动** - 页面滚动时自动高亮对应的大纲项（绿色右边框标识），可在大纲设置中开关
- ✨ **新功能**：**大纲定位按钮** - 新增 ◎ 按钮，点击后在大纲面板中定位到当前页面对应的大纲项
- 🐛 **Bug 修复**：修复开启「展示用户提问」且展开层级为 0 时，新增的提问-回复节点被错误展开的问题
- 🔧 **重构**：统一使用 `relativeLevel` 进行层级判断，引入 `minDisplayLevel` 动态计算

### v1.10.0

- ✨ **新功能**：**大纲用户提问分组** - 按对话轮次分组显示大纲，用户提问作为分组标题，支持 Level 0 快速折叠
- 🎨 **UI 优化**：统一大纲 tooltip 和按钮样式，适配深色/浅色主题

### v1.9.9

- ✨ **新功能**：通知声音音量控制、前台时也通知开关、文件夹彩虹色开关
- 🐛 **Bug 修复**：修复面板拖拽跳动问题

### v1.9.8

- 🐛 **Bug 修复**：增强 Markdown 加粗修复，解决跨节点 `**加粗**` 渲染异常问题

### v1.9.7

- 🐛 **Bug 修复**：修复用户在前台看完 AI 回复后切换页面仍收到通知的问题

### v1.9.6

- ✨ **新功能**：去顶部加载全部历史 - 点击「去顶部」按钮时自动加载全部历史记录
- 🐛 **Bug 修复**：修复阅读历史不更新、Gemini Business 滚动容器定位问题

### v1.9.5

### v1.9.4

- 🐛 **Bug 修复**：修复深色模式下输入框背景色异常
- 🎨 **UI 优化**：优化深色模式下 Tab 标题样式

### v1.9.3

- ✨ **新功能**：**主题切换动画** - 圆形扩散效果，从点击位置开始扩散/收缩
- ✨ **新功能**：**折叠按钮排序** - 自定义折叠面板 5 个快捷按钮的显示顺序
- ✨ **新功能**：**锚点/主题开关** - 独立控制锚点和主题按钮的显示/隐藏

### v1.9.2

- ✨ **新功能**：**面板设置** - 支持设置默认展开/收起，支持点击面板外部自动隐藏
- ✨ **重构**：新增独立“面板设置”手风琴区域

### v1.9.1

- ✨ **新功能**：**自动暗色模式** - 完美适配深色主题，智能检测切换，全 UI 重绘

### v1.9.0

- ✨ **新功能**：**会话管理面板** - 文件夹、标签、搜索、批量操作全套解决方案
- 🔄 **同步**：自动同步 Gemini 侧边栏会话数据

### v1.8.1

- 🐛 **Bug 修复**：修复标题污染、重复通知、后台状态检测等问题
- 🔧 **技术改进**：NetworkMonitor 始终运行、AI 状态机重构、移除 batchexecute 误判

### v1.8.0

- ✨ **标签页增强**：生成状态显示（⏳/✅）、自定义标题格式、模型名称识别
- ✨ **隐私模式**：一键伪装标签页标题，双击面板标题快速切换
- ✨ **后台行为**：生成完成时发送桌面通知、自动窗口置顶

### v1.7.3

### v1.7.2

- ✨ **智能锚点系统**：
  - **精准定位**：弃用不稳定像素定位，改用内容指纹算法，精准还原阅读位置
  - **自动回溯**：自动检测并加载未显示的历史消息，彻底解决长对话刷新后进度丢失问题
- 🎨 **体验优化**：优化大纲设置文案，新增锚点清理时间选项

### v1.7.1

- ✨ **新功能**：支持全站点模型自动化锁定
- 🎨 **UI**：优化设置面板样式，支持折叠收纳与顺序调整

### v1.7.0

- ✨ **新功能**：对话大纲 - 自动提取 AI 回复中的标题结构，支持快速跳转、关键字检索智能匹配、一键展开/恢复全部、展开到指定层级、自动刷新
- ✨ **新功能**：大纲设置 - 启用/禁用开关、标题级别过滤、自动刷新配置
- 🎯 **UI**：Tab 栏新增"大纲"标签页

### v1.6.1

- ✨ **新功能**：支持设置页面加宽，支持像素单位与百分比单位

### v1.6.0

- ✨ **新功能**：Tab 切换架构（提示词 | 设置）
- ✨ **新功能**：设置面板（仅 Gemini Business）
  - 发送后自动修复中文输入开关
- 🌐 **国际化**：多语言支持（简中/繁中/英语）
- 🎨 **UI**：面板重命名为"Gemini 助手"

### v1.5.5

- 🚑 **彻底修复**：Gemini Business 提示词发送后，悬浮条不隐藏问题

### v1.5.4

- 🚑 **修复**：Gemini Business 中文输入首字母自动转换为英文

### v1.5.3

- 🚑 **紧急修复**：修正输入框检测逻辑，彻底解决点击面板导致的全选和样式异常

### v1.5.2

- 🔧 **优化**：拖拽排序仅限手柄触发；优化滚动锁定和防误触提示

### v1.5.1

- 🔧 **优化**：新增滚动锁定机制，防止滚动期间误触提示词导致错乱

### v1.5.0

- ⚡️ **重构**：引入站点适配器模式 (Site Adapter Pattern)，大幅提升代码扩展性
- 🛠 **优化**：解耦特定站点逻辑，为未来支持更多 AI 平台奠定基础

- 修复页面加载后首次插入提示词时，多行文本只能插入首行

### v1.4.4

- 修复切换提示词时内容叠加

### v1.4.3

- 优化拖动悬浮窗体验，避免误选文本

### v1.4.2

- 新增拖动排序功能

### v1.4.1

- 新增复制提示词功能

### v1.4.0

- 新增分类管理功能（重命名、删除）
- 修复新分类不实时显示问题

### v1.3.0

- 优化悬浮条逻辑，发送后自动隐藏

### v1.2.0

- 新增快捷跳转按钮（顶部/底部）

### v1.1.0

- 支持 Gemini 企业版 (Shadow DOM 适配)

## 🐛 反馈问题

如有问题或建议，请在 [GitHub Issues](https://github.com/urzeye/tampermonkey-scripts/issues) 反馈

## 📄 开源协议

MIT License
