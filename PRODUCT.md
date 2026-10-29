# Product

<!-- impeccable:product-schema 1 -->

> 说明：本文件由 `$impeccable init` 基于仓库证据（README、package.json、AGENTS.md、DESIGN.md、manifest）编写

## Platform

web

## Users

- 主要用户：高频使用 AI 对话的个人用户，处于学习与工作场景（学习、调研、需求分析、代码讨论、内容创作），需要快速浏览、定位、整理对话内容。
- 界面覆盖 11 种语言（zh-CN、zh-TW、en、ja、ko、it、de、es、fr、pt、ru），用户群跨中英文及多语种市场。

## Product Purpose

将 AI 对话转化为可阅读、可导航、可复用的知识内容：通过实时大纲、对话文件夹与 Prompt 词库，让对话告别无限滚动，成为可组织、可沉淀的工作流。_(来源：package.json description；作为产品使命的表述为推断)_

## Positioning

- 一套适配层机制（15+ 内置站点适配器 + SitePack 热插拔注册表、云端更新可修复内置适配器），让"大纲 + 文件夹 + Prompt 库"的结构化工作流在所有主流 AI 站点上提供一致体验——这是同类单站点插件无法直接照搬的机制。
- 开源免费（GPL-3.0-only）、数据全部本地存储、无数据收集。

## Operating Context

- 载体：Chrome / Edge / Firefox 浏览器扩展（Plasmo）+ 油猴脚本（Vite + vite-plugin-monkey，Greasy Fork 分发），同一套代码双平台构建。
- 运行环境：第三方 AI 聊天站点页面内，UI 挂载于 Shadow DOM（内容面板、设置弹窗），另有独立 Options 页面。
- 覆盖站点（以 package.json host_permissions 为准）：Gemini（含 Enterprise / AI Studio）、ChatGPT、Claude、Grok、豆包、DeepSeek、Kimi、通义千问 / Qianwen / Qwen Studio、腾讯元宝、ima、ChatGLM、Z.ai 等。
- 文档站：https://ophel.app/docs/ ；仓库：https://github.com/urzeye/ophel 。

## Capabilities and Constraints

已确认功能（来源：README / docs）：

- 实时大纲：自动解析对话结构为可导航目录，层级折叠、搜索、锚点、书签、大纲复制、字数统计。
- 对话管理：文件夹 + 标签双维度，源站点自动同步，搜索、批量操作、拖拽排序。
- 导出：Markdown / JSON / TXT 多格式，图片附件 zip 打包，分段导出。
- Prompt 词库：变量模板、分类、一键插入、链式提示词与队列自动顺序发送、划词引用。
- 站点适配器：内置 15+ 站点，SitePack 扩展包热插拔，云端更新自动修复内置适配器。
- 全局搜索：跨对话、大纲、Prompt、设置，支持 `folder:` `tag:` `date:` 语法与模糊匹配。
- 阅读增强：Mermaid 渲染、LaTeX 公式、用户提问 Markdown 样式、滚动锁定。
- 24 套预置主题（12 浅色 + 12 深色）与自定义样式能力。

硬约束：

- GPL-3.0-only 开源免费。
- 扩展 + 油猴双平台、Chrome + Firefox 双浏览器必须同时兼容。
- 任何文案变更必须同步 11 种语言（应用内 `src/locales/` 与 Manifest `locales/` 两套体系）。
- 隐私：本地存储、无数据收集（Firefox manifest 声明 `data_collection_permissions: ["none"]`）；不硬编码密钥、令牌、Cookie。
- Manifest 权限最小化，优先 optional permissions。
- UI 必须遵守 Shadow DOM 样式注入链路（`src/contents/ui-entry.tsx` 的 `getStyle()`），24 套主题兼容不可破坏。

## Brand Commitments

- 名称：Ophel Atlas；仓库与包名：ophel。
- 口号：README 标题用 "Turn Conversations into Knowledge, Not Just History"（让对话成为知识，而不只是历史记录）；应用内用「AI 之益，触手可及」（`welcomeSlogan` / `aboutPageDesc`），出现在欢迎弹窗标题和关于页口号徽章。
- 图标：`assets/icon.png`。
- 语气：功能界面直接、简短、面向操作结果，不用营销腔、口号式标题与 AI 套话；口号只放在品牌位（DESIGN.md Components 章节「文案与信息表达」）。

## Evidence on Hand

- README 演示动图（GitHub user-attachments 链接）与 docs 站功能文档页。
- 商店上架：Chrome Web Store、Edge Add-ons、Firefox Add-ons、Greasy Fork。
- 品牌与功能徽章、多语言 README（`docs/readmes/`）。
- 无用户证言、案例研究、benchmark、媒体报道；未来工作不得编造这些内容。

## Product Principles

1. 结构化优先于装饰：所有界面服务于浏览、定位、整理对话内容这一核心任务。
2. 一处体验，处处一致：跨站点、跨扩展与油猴平台保持统一的功能与体验。
3. 本地优先与透明：数据不出本机，开源可审计，权限最小化。
4. 克制可维护：简单、可上线的方案优先；视觉升级不得破坏主题系统与双平台行为。

## Accessibility & Inclusion

DESIGN.md Components 章节「可访问性」已确立项目级标准：icon-only 按钮必须有可访问名称且点击区域不小于 32px×32px；焦点态不能只靠颜色变化；次级文字在深浅主题下都要可辨认；键盘焦点流自然、无焦点陷阱；尊重 `prefers-reduced-motion`（同章「交互与动效」）。
