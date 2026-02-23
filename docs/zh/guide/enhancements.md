# ⚙️ 设置中心与进阶能力

这页把 Ophel 的设置菜单按真实代码实现做一份完整总览，方便你从“功能名”快速定位到“设置路径”。

> 文档映射来源：`src/tabs/options/pages/GeneralPage.tsx`、`FeaturesPage.tsx`、`SiteSettingsPage.tsx`、`GlobalSearchPage.tsx`、`AppearancePage.tsx`、`ShortcutsPage.tsx`、`BackupPage.tsx`、`PermissionsPage.tsx`、`ClaudeSettings.tsx`

## 菜单总览

| 一级菜单   | 二级标签 / 模块                                             | 主要能力                                                      |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| 基本设置   | 面板 / 界面排版 / 快捷按钮 / 工具箱                         | 面板位置与尺寸、Tab 顺序、快捷入口、工具箱菜单显示项          |
| 功能模块   | 大纲 / 会话 / Prompts / 标签页 / 内容交互 / 阅读历史        | 自动重命名、通知、隐私模式、导出配置、Markdown/LaTeX/表格增强 |
| 站点设置   | 页面布局 / 模型锁定 / Gemini / AI Studio / ChatGPT / Claude | 站点专属开关、模型锁定、Markdown 修复、Session Key 管理       |
| 全局搜索   | Search Everywhere                                           | 统一检索大纲/会话/提示词/设置，支持语法过滤与模糊匹配         |
| 外观主题   | 主题预置 / 自定义样式                                       | 24 套预置主题、站点级明暗配置、自定义 CSS                     |
| 快捷键     | 全局开关 / 分类动作 / 独立设置                              | 快捷键录制、冲突检测、重置、Prompt 发送键位                   |
| 备份与同步 | 导出 / 导入 / WebDAV                                        | 全量与按模块备份、JSON 导入、WebDAV 上传/恢复                 |
| 权限管理   | 可选权限 / 必需权限                                         | `notifications`、`cookies`、`<all_urls>` 授权与撤销           |

## 快速定位

- 设置入口：面板内「⚙️ 设置」或快捷键 `Alt + ,`
- 站点内弹窗设置：包含 `全局搜索` 菜单
- 独立 Options 页面：包含 `基本设置 / 功能模块 / 站点设置 / 备份与同步 / 权限管理 / 关于`

<a id="settings-general"></a>

## 基本设置（General）

### 面板

- 默认显示面板、默认位置（左/右）
- 默认边距、面板宽度（px）、面板高度（vh）
- 边缘自动吸附、吸附触发距离
- 点击外部自动收起

### 界面排版

- 面板内标签顺序拖拽排序
- 对 `大纲 / 会话 / Prompts` 单独启停

### 快捷按钮

- 快捷按钮组拖拽排序
- 按钮启用控制（如锚点、主题、全局搜索、工具箱等）
- 快捷按钮整体透明度

### 工具箱菜单

可按需显示或隐藏以下菜单项（设置按钮固定保留）：

- 导出
- 复制 Markdown
- 移动到文件夹
- 设置标签
- 滚动锁定
- 模型锁定
- 清理无效收藏

<a id="settings-features"></a>

## 功能模块（Features）

### 标签页行为与通知

- 新会话在新标签页打开
- 标签页自动重命名
- 重命名检测频率（秒）
- 标题格式模板（支持 `{status}`、`{title}`、`{model}`）
- 标签页显示生成状态
- 生成完成通知（桌面通知、提示音、音量、前台也通知）
- 生成完成后自动置顶窗口
- 隐私模式与伪装标题

### 大纲与收藏

- 自动更新与更新间隔
- 跟随模式（当前位置 / 最新消息 / 手动）
- 悬浮显示字数
- 页内收藏图标显示模式
- 面板收藏图标显示模式
- 防止自动滚动（滚动锁定相关）

### 会话策略与导出配置

- 文件夹彩虹色
- 同步时取消置顶
- 删除本地会话时同步删除云端会话（支持站点）
- 导出用户名 / AI 名称自定义
- 导出文件名附加时间戳
- 导出时图片转 Base64

### Prompts 交互

- 提示词双击发送
- 发送键位独立设置（Enter / Ctrl+Enter，位于快捷键页）

### 阅读历史

- 启用阅读历史记录
- 自动恢复阅读位置
- 历史保留时长（1/3/7/30/90 天或永久）

### 内容交互增强

- 用户问题 Markdown 渲染
- 双击复制 LaTeX 公式
- 公式分隔符转换（复制时）
- 表格复制 Markdown（表格右上角复制按钮）

<a id="settings-site-settings"></a>

## 站点设置（Site Settings）

### 页面布局

- 页面宽度覆盖（值 + 单位 `%/px`）
- 用户问题宽度覆盖（值 + 单位 `%/px`）

### 模型切换锁定

支持按站点配置模型关键词或模型 ID：

- Gemini
- Gemini Enterprise
- AI Studio（下拉选择模型，可刷新模型列表）
- ChatGPT
- Claude
- Grok

### Gemini / Gemini Enterprise

- Markdown 加粗修复
- 图片水印移除（需 `<all_urls>`）
- Gemini Enterprise 策略重试（启用与最大重试次数）

### AI Studio

- 默认折叠侧边栏
- 默认收起运行设置面板
- 默认收起工具面板
- 默认收起高级设置
- 默认启用搜索工具
- 去水印（提示需刷新页面生效）
- Markdown 加粗修复

### ChatGPT

- Markdown 加粗修复

### Claude Session Key 管理

- 添加 / 删除 Session Key
- 从浏览器导入（扩展环境）
- JSON 导入 / 导出
- 单个测试与批量有效性检测
- 当前 Key 切换与状态展示

<a id="settings-global-search"></a>

## 全局搜索（Search Everywhere）

支持在一个入口统一检索：

- 大纲节点
- 会话
- 提示词
- 设置项

可配置项：

- 双击 Shift 打开全局搜索
- 模糊匹配开关（标题、标签、文件夹、内容等）
- Prompt 结果回车行为：智能插入 / 仅定位

## 站点专属增强速查

| 站点      | 专属能力                                                                           |
| --------- | ---------------------------------------------------------------------------------- |
| Gemini    | Markdown 修复、图片水印移除、Gemini Enterprise 策略重试                            |
| AI Studio | 导航/运行设置折叠、工具面板折叠、高级设置折叠、搜索默认启用、去水印、Markdown 修复 |
| ChatGPT   | Markdown 修复                                                                      |
| Claude    | Session Key 管理（切换、测试、导入导出）                                           |

## 相关页面

- [外观主题](/zh/guide/appearance)
- [快捷键系统](/zh/guide/shortcuts)
- [隐私与数据](/zh/guide/privacy)
