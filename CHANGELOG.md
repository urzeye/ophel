# Changelog

所有重要更改都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## Unreleased

### 🚀 新增功能

### 🔧 功能优化

- support gemini multi-account `/u/<n>` URLs (keep single-user `/app` style) / 支持 gemini 多账户 `/u/<n>` URL（保留单用户 `/app` 风格） #16 by @lanvent

### 🐛 问题修复

## [1.0.1] - 2026-01-23

### 🚀 新增功能

- **油猴脚本兼容**：提供 Tampermonkey/GreaseMonkey 脚本的完整构建支持，扩展了浏览器扩展之外的使用方式。
- **多语言文档**：发布并同步了 8 种额外语言（日语、韩语、繁体中文、德语、法语、西班牙语、葡萄牙语、俄语）的详细 README 文档。
- **工程化**：添加 Pull Request 模板以规范社区贡献。

### 🐛 问题修复

- **CI/CD**：优化了文档构建工作流，避免在仅更新 `docs` 目录下的 README 文件时触发不必要的构建。
- **文档**：修复了多语言文档中缺失的“演示”、“本地构建”和“Star History”章节。

## [1.0.0] - 2026-01-18

### 🎉 首次发布

这是 Ophel 的第一个正式版本，为 Gemini、ChatGPT、Claude、Grok 和 AI Studio 提供全方位的增强体验。

### ✨ 核心功能

#### 智能大纲导航

- 自动解析 AI 回复内容，生成可点击的目录大纲
- 支持多级标题层级结构
- 快速定位到指定内容位置

#### 会话管理

- 按文件夹整理对话
- 批量操作会话
- 会话搜索与定位
- 同步原生侧边栏置顶状态

#### 提示词库

- 内置丰富的提示词模板
- 支持自定义创建和编辑
- 分组管理与快速搜索
- 一键填充到输入框

#### 快捷键系统

- 提供丰富的键盘快捷键
- 支持自定义按键绑定
- 覆盖常用操作场景

#### 主题与外观

- 20+ 精心设计的主题
- 区分浅色/深色模式主题
- 支持自定义页面宽度

#### 阅读记录恢复

- 自动保存阅读位置
- 重新打开时恢复上次阅读进度
- 智能区分新内容

#### WebDAV 同步

- 支持同步设置到个人 WebDAV 服务器
- 多设备配置共享
- 完全自主掌控数据

### 🌐 平台支持

- **Gemini** - 完整功能支持
- **Gemini Business** - 完整功能支持
- **ChatGPT** - 完整功能支持
- **Claude** - 完整功能支持
- **Grok** - 完整功能支持
- **AI Studio** - 完整功能支持

### 🌍 多语言支持

- 简体中文
- 繁体中文
- English
- Deutsch
- Español
- Français
- 日本語
- 한국어
- Português
- Русский

### 🔒 隐私保护

- 所有数据本地存储
- 无远程数据收集
- 无第三方跟踪
- 开源透明

---

[1.0.1]: https://github.com/urzeye/ophel/releases/tag/v1.0.1
[1.0.0]: https://github.com/urzeye/ophel/releases/tag/v1.0.0
