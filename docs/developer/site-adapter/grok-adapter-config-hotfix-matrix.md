# Grok 适配器配置热修覆盖矩阵

Grok 是 P3-06 批次的第二个配置化站点，当前 `configVersion` 为 `2`。适配器启动时使用内置默认配置，门闩完成后注入通过校验的合并结果；可热修字段均在调用时从 `this.config` 读取。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与操作按钮 | `selectors.textarea`、`selectors.submitButton`、`selectors.newChatButton`、`selectors.stopButton`、`input.submitKey` | Tiptap 输入框、发送、新对话、停止生成与快捷键提交 |
| 会话侧栏与 CMDK | `conversation.*`、`sidebarScrollContainer`、`sidebarGroup`、`sidebarMenu*`、`sidebarIcon`、`viewAllButton`、`cmdk*`、`actionDialog`、`actionIconNodes`、`conversationTitle` | 会话列表/标题/跳转、查看全部弹窗、观察器、置顶状态与 UI 删除目标定位 |
| 消息、大纲与滚动 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`messageBubble`、`responseMarkdown`、`responseRoot`、`mainScrollContainer`、`fallbackScrollContainers`、`inlineCodeSpan` | 用户与 AI 消息、滚动容器、标题大纲、字数统计和用户问题 Markdown 提取 |
| 导出与附件 | `export.*`、`responseMarkdown`、`responseRoot`、`exportDecoration`、`attachmentCardCandidates` | DOM/分享页导出正文、图片与文件卡片识别、装饰节点清理和用户问题替换 |
| 生成、模型与网络 | `generating.existsSelectors`、`modelSwitcher.*`、`modelName`、`networkMonitor.*` | 生成检测、停止入口、当前模型文本、模型锁定和流式请求识别 |
| 宽度与面板避让 | `widthSelectors`、`appLayoutScope`、`panelAvoidanceScope`、`chatSafeArea`、`newChatLogoSafeArea`、`inputSafeArea`、`canvasSafeArea` | 页面宽度、聊天/空态/输入区安全区及 Canvas 预览避让 |
| 模式与原生交互 | `zenMode.*`、`quickQuote`、`nativeQuotePopover` | 侧栏隐藏、Quick Quote 模式及 Grok 原生引用浮层避让 |

`sitePrivateSelectors` 使用 Grok 专属精确键白名单。数组整体替换，对象递归合并；patch 不能增加未知私有键、删除已登记键或移除内置 capability。

## 仍需随应用发版

- hostname、新对话/分享页路由判断、新标签页 URL、分享 ID 与 response ID 前缀解析。
- 删除 API 路径、请求头、Statsig/localStorage 读取、删除后刷新与错误原因映射。
- CMDK 虚拟列表滚动次数、等待时序、ESC/PointerEvent 编排、删除/确认关键词和批量删除熔断逻辑。
- 置顶图标 SVG path 签名、DOM 可见性算法及会话缓存生命周期。
- Tiptap `innerHTML`、InputEvent、光标与清空占位结构。
- 分享 API schema、附件 metadata、文件名/类型/大小解析、资源 URL 过滤与下载打包算法。
- 百分比宽度转换、面板避让 extra CSS/间距、主题 localStorage/class/color-scheme 操作。
- Ophel 自身 `.gh-*` 节点、通用 `button/svg/img/a/h1-h6` DOM 原语和非 selector 常量。

修改内置默认配置时必须递增 `GROK_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。真实站点回归完成前，P3-06 继续保持“进行中”。
