# Ophel Atlas 独立设置页 (Options Page) 设计方案

本文档详细描述了 Ophel 扩展独立设置页面（Options Page）的 UI 布局、功能规划及技术实现方案。

## 1. 核心设计理念

- **独立窗口体验**：通过 `chrome.windows.create` 打开独立的 popup 类型窗口，提供类似原生应用的设置体验。
- **实时同步**：设置修改后通过 `chrome.storage.onChanged` 实时同步到 Content Script 面板，无需手动刷新。
- **主题一致性**：完全复用扩展现有的 CSS 变量体系，支持浅色/深色模式及自定义主题。
- **清晰分类**：采用侧边栏导航 + 顶部标签页的双层结构，解决设置项过多的问题。

## 2. 页面结构与布局

### 2.1 整体布局

页面采用经典的 **侧边栏导航 (Sidebar Navigation)** 布局：

- **左侧边栏 (240px)**：一级导航菜单，固定宽度。
- **右侧内容区 (自适应)**：显示具体的设置内容，顶部可能有二级标签页 (Tabs)。

### 2.2 导航结构 (Sitemap)

```text
⚙️ 基本设置 (General)
   ├── 通用设置 (General)
   └── 标签页 (Tab Settings)

🎨 外观主题 (Appearance & Theme)
   ├── 主题预置 (Presets)
   └── 自定义样式 (Custom CSS)

📄 页面与内容 (Page & Content)
   ├── 页面布局 (Layout)
   └── 内容样式 (Content Style)

📑 功能模块 (Features)
   ├── (大纲设置)
   ├── (会话管理)
   ├── (模型锁定)
   └── (阅读历史)

☁️ 备份与同步 (Backup & Sync)
   ├── 本地备份 (Local Backup)
   └── WebDAV 同步 (WebDAV)

ℹ️ 关于 (About)
```

---

## 3. 详细页面设计

### 3.1 ⚙️ 基本设置 (General Settings)

**顶部标签**：`通用` | `标签页`

#### 3.1.1 通用 (General)

内容分为两个卡片分组：

**卡片 1：通用设置**

- **语言 (Language)**: 下拉选择 [自动/简体中文/繁体中文/English]。
- **默认显示面板**: 开关。刷新页面后面板默认保持展开状态。
- **自动隐藏面板**: 开关。点击面板外部自动隐藏。
- **边缘吸附隐藏**: 开关。拖动到屏幕边缘自动隐藏。

**卡片 2：界面排版**

- **Tab 排序**:
  - 提示词 (Prompts): [开关] [上移] [下移]
  - 会话 (Conversations): [开关] [上移] [下移]
  - 大纲 (Outline): [开关] [上移] [下移]
- **折叠按钮排序**: 拖拽或上下移动排序 (Anchor, Theme, ScrollTop, etc.)。

#### 3.1.2 标签页 (Tab Settings)

**卡片 1：标签页行为**

- **自动重命名**: 开关。
- **检测间隔**: 输入框 (秒)。
- **标题格式**: 输入框 (支持 `{status}`, `{title}` 等占位符)。
- **显示状态图标**: 开关 (⏳/✅)。

**卡片 2：通知设置**

- **桌面通知**: 开关。
- **通知声音**: 开关。
- **声音音量**: 滑块 (0-100%)。
- **前台时也通知**: 开关。
- **自动置顶窗口**: 开关。

**卡片 3：隐私模式**

- **启用隐私模式**: 开关。
- **伪装标题**: 输入框 (如 "Work Document")。

---

### 3.2 🎨 外观主题 (Appearance & Theme)

**顶部标签**：`主题预置` | `自定义样式`

#### 3.2.1 主题预置 (Presets)

- **主题模式**: 单选组 [☀️ 浅色] [🌙 深色] [💻 跟随系统]。
- **浅色主题**: 网格展示预置主题卡片 (Google渐变, 紫罗兰, 海洋蓝等)。
- **深色主题**: 网格展示预置主题卡片 (经典深黑, 午夜蓝, 德古拉等)。
- _点击卡片立即应用预览。_

#### 3.2.2 自定义样式 (Custom Styles)

- **样式列表**: 展示已创建的样式。
- **操作**: 新建、编辑、删除。
- **编辑界面**:
  - 样式名称
  - 适用模式 (浅色/深色)
  - CSS 代码编辑器 (Monaco Editor 或简单的 Textarea 高亮)。

---

### 3.3 📄 页面与内容 (Page & Content)

**顶部标签**：`页面布局` | `内容样式`

#### 3.3.1 页面布局 (Page Layout)

- **页面宽度**: [开关] | 宽度值输入 | 单位选择 (px/%)。
- **用户问题宽度**: [开关] | 宽度值输入 | 单位选择 (px/%)。
- **防自动滚动**: [开关]。

#### 3.3.2 内容样式 (Content Style)

列表式开关选项：

- **Markdown 加粗修复**: 修复 Gemini 响应中未渲染的加粗文本。
- **用户问题 Markdown 渲染**: 将用户输入的 Markdown 渲染为富文本。
- **图片水印移除**: 移除 AI 生成图片的水印。
- **双击复制公式**: 数学公式交互增强。
- **表格复制 Markdown**: 表格右上角添加复制按钮。

---

### 3.4 📑 功能模块 (Features)

**无顶部标签**，直接使用垂直排列的卡片分组。

**卡片 1：大纲设置 (Outline)**

- 启用大纲 [开关]。
- 显示标题级别 [下拉 1-6]。
- 展示用户提问 [开关]。
- 自动更新 [开关] | 间隔 [输入框]。
- 跟随模式 [下拉：当前位置/最新消息/手动]。

**卡片 2：会话管理 (Conversations)**

- 文件夹彩虹色 [开关]。
- 同步取消置顶 [开关]。
- 同步删除云端 [开关]。
- 同步重命名 [开关]。

**卡片 3：模型锁定 (Model Lock)**

- **Gemini Standard**: [开关] | 关键词输入。
- **Gemini Enterprise**: [开关] | 关键词输入。
- **AI Studio**: [开关] | 关键词输入。

**卡片 4：阅读历史 (Reading History)**

- 启用阅读历史 [开关]。
- 自动恢复位置 [开关]。
- 保留天数 [输入框] (-1 为永久)。

---

### 3.5 ☁️ 备份与同步 (Backup & Sync)

**顶部标签**：`本地备份` | `WebDAV 同步`

#### 3.5.1 本地备份 (Local Backup)

- **导出数据**: 提供三个按钮 [完整备份] [仅账号数据] [仅用户设置]。
- **导入数据**: 文件选择器 + [导入按钮]。
  - _导入前弹出确认警告，提示会覆盖当前设置。_

#### 3.5.2 WebDAV 同步 (WebDAV)

- **服务器设置**:
  - 服务器地址 (URL)
  - 用户名
  - 密码
- **备份加密**: [开关] | 密码输入。
- **操作**: [保存配置] [测试连接]。
- **手动同步**: [⬆️ 上传备份] [⬇️ 下载并导入]。
- **自动同步**: [开关] | 间隔 (秒) | 策略 (智能合并/覆盖)。

---

### 3.6 ℹ️ 关于 (About)

**无顶部标签**，展示静态信息。

- **Header**: Logo + Ophel 名称 + 版本号。
- **项目链接**: GitHub 仓库链接、官网链接、Issues 链接。
- **技术栈**: React, Plasmo, TypeScript, Zustand, Tailwind CSS.
- **版权信息**: MIT License / Copyright声明。
- **隐私声明**: 强调数据仅存储在本地，无远程服务器记录。

---

## 4. 技术实现方案

### 4.1 文件结构

```text
src/
├── tabs/
│   ├── options.tsx        # 入口文件
│   ├── options.html       # HTML 模板
│   ├── options.css        # 全局样式
│   └── options/           # Options 页面组件目录
│       ├── Layout.tsx     # 侧边栏布局框架
│       ├── Sidebar.tsx    # 侧边栏导航
│       ├── components/    # 复用组件 (Card, ToggleRow, InputRow...)
│       ├── General.tsx
│       ├── Appearance.tsx
│       ├── PageContent.tsx
│       ├── Features.tsx
│       ├── Backup.tsx
│       └── About.tsx
```

### 4.2 路由管理

扩展页面通常不使用复杂的 Router 库，推荐使用简单的 **State-based Routing**：

```typescript
// Zustand Store 或 Local State
const [activeTab, setActiveTab] = useState<string>("general")
const [activeSubTab, setActiveSubTab] = useState<string>("general-common")
```

### 4.3 主题适配

Options 页面作为独立 HTML 页面，无法直接继承 Content Script 的样式。解决方案：

1. **复用 CSS 变量**：确保 `src/tabs/options.css` 引入了定义 `--gh-*` 变量的基础样式文件。
2. **动态注入**：
   - 页面加载时，从 `chrome.storage` 读取当前主题设置。
   - 将对应的主题类名或 CSS 变量注入到 `<html>` 或 `<body>` 标签。
   - 监听 `settings` 变化，实时更新根节点样式。

### 4.4 数据同步

不需要 Message Passing，直接利用 `chrome.storage` 的特性：

1. **读数据**: Options 页面初始化时 `useSettingsStore` 从 storage 读取配置。
2. **写数据**: 用户操作 -> 更新 Store -> 自动持久化到 `chrome.storage.local`。
3. **Content Script 更新**: 面板端的 Zustand store 即使不手动刷新，也可以通过监听 `chrome.storage.onChanged` 来实现热更新 (Rehydration)。

### 4.5 打开方式

在 `src/components/MainPanel.tsx` 或 `SettingsTab.tsx` 中：

```typescript
const openOptionsPage = () => {
  // 检查是否已打开（可选）
  chrome.windows.create({
    url: chrome.runtime.getURL("tabs/options.html"),
    type: "popup",
    width: 960,
    height: 720,
    focused: true,
  })
}
```

## 5. UI 组件规范

为了保持风格统一，需抽取以下基础组件：

- **SettingCard**: 白色/深色背景圆角卡片，带标题和可选的描述。
- **SettingRow**: 卡片内的一行设置项。左侧 Label + Description，右侧 Control。
- **Toggle**: 开关组件。
- **Select**: 下拉选择组件。
- **Input**: 输入框组件。
- **Button**: 主按钮 (蓝色渐变) / 次级按钮 (灰色/透明)。
- **TabGroup**: 页面顶部的二级导航标签切换器。

## 4. 技术实现与重构细节 (2026-01 Refresh)

本次设置页重构从单一的 `SettingsTab` 组件迁移到了模块化的 `SettingsModal` 和独立的 `OptionsPage` 架构，解决了代码臃肿和扩展性差的问题。

### 4.1 模态框实现 (SettingsModal)

- **Shadow DOM 注入**：为了避免与宿主页面 (Gemini) 的样式冲突，模态框依然渲染在扩展的 Shadow DOM 容器 (`#plasmo-shadow-container`) 内。
- **交互修复**：由于 Shadow DOM 根容器默认设置了 `pointer-events: none`（以穿透点击到底层页面），模态框容器 (`.settings-modal-overlay`) 必须显式设置 `pointer-events: auto` 才能响应点击和滚动。
- **样式隔离**：样式文件 `settings.css` 通过 `plasmo` 的 CSUI 机制注入，并使用 CSS 变量实现主题动态切换。

### 4.2 权限管理机制 (Permissions Management)

为了符合 Chrome 扩展安全规范并提供良好的用户体验，采用了 **"混合环境处理"** 策略：

1. **权限展示**：
    - **必需权限** (`storage`, `notifications` 等)：只读展示，不可撤销。
    - **可选权限** (`<all_urls>` 等)：提供授予/撤销按钮。
2. **API 调用限制与解决方案**：
    - **问题**：Content Script 环境（模态框所在环境）**无法直接调用** `chrome.permissions.request` API（Chrome 安全限制）。
    - **方案**：
      1. 用户点击“授予”按钮。
      2. 模态框发送 `MSG_REQUEST_PERMISSIONS` 消息给 Background Script。
      3. Background Script 打开一个 **popup 类型** 的独立小窗口（加载 Options 页面并带上 `?page=permissions&auto_request=true` 参数）。
      4. Options 页面加载后自动触发 Chrome 原生权限请求弹窗。
      5. 用户授权后，Options 页面状态更新；用户手动关闭小窗口回到原页面，刷新状态即可看到变更。

### 4.3 跨环境通信 (Messaging)

所有跨环境（Content Script <-> Background <-> Options Page）操作均通过统一的 `messaging.ts` 模块处理：

- **消息类型**：定义了 `MSG_CHECK_PERMISSIONS`, `MSG_REQUEST_PERMISSIONS` (打开 Popup), `MSG_REVOKE_PERMISSIONS` 等强类型消息。
- **统一入口**：Content Script 不直接处理业务逻辑，而是作为 UI 层，通过 `sendToBackground` 委托 Background 处理敏感操作（如 WebDAV 请求、权限变更）。

### 4.4 数据实时同步

- **Store 设计**：使用 `zustand` + `chrome.storage.local` 持久化。
- **跨上下文同步**：
  - `settings-store.ts` 监听 `chrome.storage.onChanged` 事件。
  - 当 Options 页面修改设置时，Content Script 中的 Store 会自动捕获变更。
  - 引入 `_syncVersion` 状态，强制触发 React 组件重渲染，确保 UI（如主题、界面语言）在多窗口间毫秒级同步。
- **防循环机制**：
  - 问题：`setState` 触发 `persist` 写回 storage，进而再次触发 `onChanged`，形成无限循环。
  - 方案：引入 `isUpdatingFromStorage` 标记，包装 `chromeStorageAdapter.setItem`，在同步更新时跳过写入。
  - 使用 `sortedStringify` 进行稳定对象比较，避免键顺序差异导致的虚假变更。

### 4.5 权限撤销处理

当用户在 Chrome 扩展管理页面手动撤销 `<all_urls>` 权限时：

1. `background.ts` 监听 `chrome.permissions.onRemoved` 事件。
2. 检测到 `<all_urls>` 被撤销后，自动将依赖该权限的功能（如 `watermarkRemoval`）关闭。
3. 立即更新 storage，通过 `onChanged` 同步到所有上下文。
