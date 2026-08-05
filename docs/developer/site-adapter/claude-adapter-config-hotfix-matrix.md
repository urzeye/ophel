# Claude 适配器配置热修覆盖矩阵

Claude 是 P3-07 大站批次的第二个配置化站点，当前 `configVersion` 为 `1`。适配器启动时使用内置默认配置，门闩完成后注入通过校验的合并结果；可热修字段均在调用时从 `this.config` 读取。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与操作按钮 | `selectors.textarea`、`selectors.submitButton`、`selectors.newChatButton`、`selectors.stopButton`、`input.submitKey`、`validTextarea` | 输入框候选与有效性识别、发送、新对话、停止生成和快捷键提交 |
| 会话侧栏 | `conversation.*`、`selectors.sidebarScrollContainer`、`sidebarScrollFallback`、`conversationGroup`、`conversationGroupHeading`、`conversationGroupList`、`conversationPinnedList` | 会话列表、ID、标题、URL、活动/置顶状态、跳转、侧栏滚动容器和观察器 |
| 会话删除菜单 | `conversationActionButton`、`conversationMenu`、`conversationMenuItem`、`conversationMenuItemFallback`、`conversationDialog` | 会话操作入口、菜单/弹窗容器和删除项候选；点击、关键词与等待时序保持代码实现 |
| 消息、Markdown 与大纲 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`selectors.scrollContainer`、`responseMarkdown`、`outlineIgnoredHeading`、`srOnly`、`virtualSizer`、`virtualRow`、`virtualArticle` | 消息识别、最新回复、滚动、大纲提取与跳转、字数统计、虚拟列表行和总数识别 |
| Artifact 与文档查看器 | `documentRoot`、`hiddenAncestor`、`documentViewer`、`documentPanelTitle`、`documentBackButton`、`documentContentTitle`、`artifactCell`、`artifactMetadata`、`artifactTitle`、`artifactContainer`、`artifactViewButton` | Artifact 卡片识别、Markdown 文档打开、标题/正文提取、导出采集、面板关闭与恢复 |
| 用户附件与思考块 | `userQueryText`、`userMessageBubble`、`userMessageBoundary`、`userFileThumbnail`、`thoughtToggle`、`thoughtStatus` | 用户问题 Markdown 增强、图片/文件附件归属和思考块识别、展开、导出与恢复 |
| 生成、网络与模型 | `generating.existsSelectors`、`networkMonitor.*`、`modelSwitcher.*` | 生成检测、网络静默判断、当前模型名称、模型入口、菜单和子菜单识别 |
| 导出 | `export.*`、消息/Markdown、Artifact、附件、思考块和虚拟列表相关 selector | 实时 DOM 与长会话快照导出、文档资源导出、附件收集和思考块输出 |
| 宽度与面板避让 | `widthSelectors`、`layoutScope`、`panelScope`、`panelObstacle`、`panelScrollSafeArea`、`panelNewChatSafeArea`、`panelCanvasScope`、`userQueryWidth` | `.max-w-3xl`/`.max-w-4xl` 内容宽度、自动滚动安全区、新对话、Artifact/文件查看器和用户问题宽度 |
| 模式与宿主能力 | `zenMode.*`、`cleanMode.*`、`mermaidSupport`、`quickQuote`、`nativeQuotePopover`、`supportsHostThemeSync` | Zen/Clean Mode、Mermaid、原生 Quick Quote 浮层识别和主题联动声明 |

`sitePrivateSelectors` 使用 Claude 专属 42 个精确键白名单。数组整体替换，对象递归合并；patch 不能增加未知私有键、删除已登记键或移除内置 capability。

## 仍需随应用发版

- hostname、会话/分享路由判断、会话 ID 以外的 URL 控制流和新标签页域名。
- 组织 ID 的 Cookie/localStorage/API 解析、Anthropic 客户端标识、原生删除 API endpoint/header、HTTP 错误映射、删除关键词、批量失败熔断、点击/hover 和等待时序。
- ProseMirror 的 `execCommand` 输入编排、可见性和滚动范围判断、动态消息 ID selector、锚点恢复与通用 `button/li/img/a/h1-h6` DOM 原语。
- 长会话虚拟滚动遍历、扫描缓存、消息去重与排序、导出快照 `data-gh-*` 标记和不完整快照的显式失败。
- Artifact 文档签名、打开/稳定等待、缓存匹配、资源文件生成、原面板恢复和失败处理；附件 URL 规范化、安全过滤及文件名/类型解析。
- 思考块点击与等待时序、Markdown/数学内容判断、HTML 转换、引用块格式、大纲缓存与稳定排序、字数计算和滚动位置估算。
- 主题 `localStorage`、DOM class、`StorageEvent` 编排，以及面板避让的 CSS 属性、默认 `768px` 宽度、间距和安全阈值。
- Ophel 自身 `.gh-*` / `data-gh-*` 标记、删除理由、语言关键词和非 selector 常量。

修改内置默认配置时必须递增 `CLAUDE_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。真实站点回归完成前，P3-07 继续保持“进行中”。
