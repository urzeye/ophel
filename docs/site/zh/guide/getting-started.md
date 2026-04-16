# 快速上手

Ophel 是一款浏览器扩展，为你常用的 AI 对话平台（Gemini、ChatGPT、Claude 等）添加一个强大的侧边面板。它提供大纲导航、会话整理、提示词库以及大量体验优化功能，全程不需要离开 AI 页面。

## 支持的平台

Ophel 目前支持 15 个 AI 平台：

| 平台                  | 网址                          |
| --------------------- | ----------------------------- |
| **Gemini**            | gemini.google.com             |
| **Gemini Enterprise** | gemini.google.com（企业账号） |
| **AI Studio**         | aistudio.google.com           |
| **ChatGPT**           | chatgpt.com                   |
| **Claude**            | claude.ai                     |
| **Grok**              | grok.com, x.com               |
| **DeepSeek**          | chat.deepseek.com             |
| **豆包 (Doubao)**     | www.doubao.com                |
| **Kimi**              | kimi.moonshot.cn              |
| **Qwen Studio**       | chat.qwen.ai                  |
| **通义千问**          | tongyi.aliyun.com             |
| **元宝 (Yuanbao)**    | yuanbao.tencent.com           |
| **Z.ai**              | chat.z.ai                     |
| **智谱 ChatGLM**      | chatglm.cn                    |
| **ima**               | ima.copilot.tencent.com       |

## 安装方式

### Chrome / Edge（商店安装）

从 [Chrome 网上应用店](https://chromewebstore.google.com) 或 [Edge 附加组件商店](https://microsoftedge.microsoft.com/addons) 搜索 **Ophel** 安装。

### Chrome / Edge（手动加载）

1. 前往 [GitHub Releases](https://github.com/urzeye/ophel/releases) 下载最新的 `ophel-vX.X.X-chrome.zip`
2. 解压到本地某个文件夹
3. 打开扩展程序管理页面：Chrome 为 `chrome://extensions`，Edge 为 `edge://extensions`
4. 打开右上角的 **开发者模式**
5. 点击 **加载已解压的扩展程序**，选择解压后的文件夹

### Firefox

从 [Firefox 附加组件商店](https://addons.mozilla.org) 搜索 **Ophel** 安装。

或手动临时加载：

1. 下载 `ophel-vX.X.X-firefox.zip`
2. 打开 `about:debugging#/runtime/this-firefox`
3. 点击 **临时载入附加组件**，选择 zip 文件

> Firefox 临时扩展在浏览器重启后会失效，需重新加载。

### 油猴脚本（UserScript）

从 [Greasy Fork](https://greasyfork.org) 搜索 **Ophel** 安装油猴版本，需先安装 Tampermonkey 或 Violentmonkey。

## 初次使用

安装后，打开任意支持的 AI 网站，Ophel 会在页面右侧自动出现一个侧边面板，并在屏幕侧边显示一组浮动快捷按钮。

面板包含三个标签页（点击顶部标签栏切换）：

| 标签页     | 说明                                          |
| ---------- | --------------------------------------------- |
| **大纲**   | 当前对话的实时结构树，点击即可跳转            |
| **会话**   | 汇聚各平台的历史对话列表，支持文件夹/标签管理 |
| **提示词** | 你的个人提示词收藏库，一键插入                |

如果面板没有出现，按 **Alt+P** 打开。

## 基础操作

- **切换标签** — 点击顶部标签栏，或使用 `Alt+1` / `Alt+2` / `Alt+3`
- **打开/关闭面板** — `Alt+P`，或点击浮动按钮中的面板开关图标
- **全局搜索** — `Ctrl+K`（或配置的快捷键），可搜索大纲、会话、提示词和设置项
- **切换亮/暗模式** — `Alt+D`，或点击浮动按钮中的主题切换图标
- **打开设置** — `Alt+,`，或工具箱中的设置按钮

## 浮动快捷按钮

屏幕侧边的浮动按钮组是 Ophel 最常用的快捷入口。5 秒不操作后自动收缩为药丸形；鼠标移近 150px 以内重新展开。长按可拖拽到任意位置。

**工具箱按钮（☰）** 点击后弹出更多操作：导出对话、移动到文件夹、设置标签、开关滚动锁定和模型锁定等。

## 幽灵穿透模式

面板遮住内容时，按住 **Ctrl**（Windows/Linux）或 **Command**（Mac），保持约 0.2 秒（仅按这一个键），面板变透明并允许鼠标穿透到背后的 AI 页面。松开按键后恢复正常。

## 面板吸附

拖动面板靠近屏幕边缘，它会自动吸附。吸附后将鼠标悬停在屏幕边缘，面板会弹出预览。可在 **设置 → 通用 → 面板 → 边缘吸附** 中调整或关闭。

## 下一步

- [智能大纲](./features/outline) — 在长对话中快速导航
- [会话管理](./features/conversation) — 整理你的聊天记录
- [提示词库](./features/prompt) — 保存和复用常用提示词
- [全部功能与设置](./enhancements) — 完整功能参考
- [快捷键](./shortcuts) — 快捷键列表
- [外观与主题](./appearance) — 主题和自定义 CSS
- [常见问题](./faq) — 遇到问题看这里
