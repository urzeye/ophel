# ChatGPT 适配器配置热修覆盖矩阵

ChatGPT 是 P3-07 大站批次的第一个配置化站点，当前 `configVersion` 为 `1`。适配器启动时使用内置默认配置，门闩完成后注入通过校验的合并结果；可热修字段均在调用时从 `this.config` 读取。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与操作按钮 | `selectors.textarea`、`selectors.submitButton`、`selectors.newChatButton`、`selectors.stopButton`、`input.submitKey`、`validTextarea` | 输入框候选与有效性识别、发送、新对话、停止生成和快捷键提交 |
| 会话侧栏 | `conversation.*`、`selectors.sidebarScrollContainer`、`conversationTitleFallback`、`conversationPinnedTrailingPair`、`conversationPinnedTrailingIcon` | 会话列表、ID、标题、URL、活动/置顶状态、跳转、侧栏滚动容器和观察器 |
| 会话删除菜单 | `conversationActionButton`、`conversationActionIndicator`、`conversationMenu`、`conversationMenuItem` | 会话操作入口、菜单容器和删除项候选；点击与等待时序保持代码实现 |
| 消息、Markdown 与大纲 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`selectors.scrollContainer`、`codexTaskMarkdown`、`codexTaskUserQuery`、`userQueryText`、`srOnly`、`srOnlyFallback`、`assistantMarkdown`、`markdownFixerParagraph` | 普通会话与 Codex Task 消息识别、最新回复、滚动、大纲、字数统计、用户问题和 AI 正文提取及 Markdown 修复 |
| 导出、附件与图片 | `export.*`、`exportCleanup`、`exportTurnContainer`、`exportMountedMessage`、`exportImageContainer`、`exportFileTile`、`exportFileLabel`、`exportFileName`、`deepResearchIframe` | 实时 DOM 导出、虚拟 turn 挂载检测、图片/文件识别和 Deep Research 链接导出 |
| 原生 TOC | `nativeTocRail`、`nativeTocButton`、`nativeTocHoverAncestor`、`nativeTocTitleElement`、`nativeTocActive` | 原生 TOC 轨道、按钮、标题层、活动项和 hover 目标识别 |
| 生成与模型 | `generating.existsSelectors`、`networkMonitor.*`、`modelSwitcher.*`、`modelMenu`、`modelMenuItem`、`modelMessageSlug`、`modelNameContainer`、`modelSelectedIndicator`、`modelSelectorName` | 生成检测、网络静默判断、当前模型名称、模型入口和模型锁定 |
| 宽度与面板避让 | `widthSelectors`、`userQueryWidthRoot`、`panelScope`、`panelObstacle`、`panelThreadContentWidth`、`panelThreadLegacyWidth`、`panelComposerFormWidth`、`panelLibraryComposerFormWidth`、`panelNewChatHeadingInset`、`panelThreadInset`、`panelCanvasDialogInset`、`panelLibraryShellInset`、`panelLibraryComposerWrapperInset` | 页面和用户问题宽度、普通对话、Composer、新对话标题、Canvas、Deep Research iframe 与库文件 fullscreen shell 安全区 |
| 模式与宿主能力 | `zenMode.*`、`cleanMode.*`、`mermaidSupport`、`quickQuote`、`nativeQuotePopover`、`supportsHostThemeSync` | Zen/Clean Mode、Mermaid、原生 Quick Quote 浮层识别和主题联动声明 |

`sitePrivateSelectors` 使用 ChatGPT 专属精确键白名单。数组整体替换，对象递归合并；patch 不能增加未知私有键、删除已登记键或移除内置 capability。

## 仍需随应用发版

- hostname、会话/分享/Codex Task 路由判断、会话 ID 与账户隔离解析、`localStorage._account` 和 Cookie 读取。
- access token 缓存、原生删除 API endpoint/header、HTTP 错误映射、UI 删除关键词、批量失败熔断、点击/hover 和等待时序。
- 长会话虚拟滚动遍历、turn 挂载重试、去重与排序、导出快照 `data-gh-*` 标记、Markdown/文本转换及附件 URL 安全过滤。
- 原生 TOC 文本兼容、hover/PointerEvent、缓存签名、异步刷新、用户问题绑定和跳转等待逻辑。
- Turn/Message ID 解析、大纲缓存与稳定排序、字数计算、动态 heading/属性 selector 和 Ophel 自身 `.gh-*` 排除规则。
- 模型 slug/显示名解析、本地化信号缓存、重复进入冷却、菜单点击编排、PointerEvent 兼容和锁定结果判断。
- 主题 `localStorage`、`html.className` 与 `StorageEvent` 编排，Canvas/库文件避让的 CSS 属性、默认宽度、间距和安全阈值。
- 通用 `button/div/img/a/span/nav/h1-h6` DOM 原语、动态 href/属性 selector、删除理由、语言集合和非 selector 常量。

修改内置默认配置时必须递增 `CHATGPT_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。真实站点回归完成前，P3-07 继续保持“进行中”。
