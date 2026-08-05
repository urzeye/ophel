# Gemini 适配器配置热修覆盖矩阵

Gemini 是 P3-07 大站批次的第三个配置化站点，当前 `configVersion` 为 `1`。适配器启动时使用内置默认配置，门闩完成后注入通过校验的合并结果；适配器与 My Stuff helper 均在调用时读取同一份 `this.config`。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与操作按钮 | `selectors.textarea`、`selectors.submitButton`、`selectors.newChatButton`、`selectors.stopButton`、`input.submitKey`、`validTextarea` | 输入框识别与有效性、发送、新对话、停止生成和快捷键提交 |
| 账号与会话侧栏 | `accountIdentity`、`conversation.*`、`selectors.sidebarScrollContainer`、`chatsExpandableSection*`、`conversationList`、`historyLoadingSpinner`、`conversationAnchor`、`conversationPinnedIcon`、`conversationActiveTitle`、`shareTitle` | 账号邮箱候选、会话列表、展开与加载、ID/标题/URL、活动和置顶状态、跳转、观察器以及普通/分享标题 |
| 会话删除菜单 | `conversationActionButton`、`conversationMoreIcon`、`conversationDeleteIcon`、`conversationMenuAction`、`conversationMenuContainer`、`conversationConfirmButton`、`conversationDialog` | 会话操作入口、菜单、删除项、确认按钮和对话框识别；点击、等待与批量失败熔断保持代码实现 |
| My Stuff | `myStuffMediaHost`、`myStuffMediaCard`、`myStuffMediaCardContainer`、`myStuffDocumentHost`、`myStuffJslogHost`、`myStuffTitle`、`myStuffThumbnail` | 媒体/文档卡识别、按钮挂载、主文档样式作用范围和记录定位信号 |
| 消息、Markdown 与大纲 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`selectors.scrollContainer`、`shareResponseContainer`、`markdownFixerParagraph`、`markdownFixerSource`、`visuallyHidden`、`userQueryText`、`userQueryLine`、`outline*` | 普通/分享消息识别、滚动、用户问题文本与 Markdown、大纲 ID/边界/字数统计和 Markdown 修复排除 |
| 图片、附件与 Drive 导出 | `export.*`、`exportMessageSource`、`exportImageScope`、`userQueryImage`、`uploadedFile`、`assistantExportNoise`、`decorativeImage`、`generatedImage*`、`driveViewer*`、`uploadedFile*` | 长会话导出标记、图片与文件识别、生成图清理、文件名/类型读取和 Drive 文档预览提取 |
| Deep Research | `deepResearchPanel`、`deepResearchPanelExportButton`、`deepResearchPanelCloseButton`、`panelToolbarActions`、`panelThinking`、`panelToolbarTitle`、`deepResearchDocumentShare`、`deepResearchArtifactShare`、`deepResearchConfirmation*`、`deepResearchPanelMarkdown`、`deepResearchAppDocumentMarkdown`、`deepResearchAppTrigger`、`deepResearchIcon`、`share*` | App 报告入口与沉浸面板、复制/下载操作、研究计划规范化、文档/Artifact 分享页、标题、大纲和导出正文 |
| Gemini Canvas | `canvasCodePanel`、`canvasDocumentPanel`、`canvasPanelDownloadButton`、`canvasPanelTitle`、`canvasPanelCloseButton`、`canvasCodeIcon`、`canvasDocumentIcon`、`canvasCard`、`canvasShareArtifact`、`canvasArtifactContainer`、`canvasEntryChip`、`canvasCodeTab`、`canvasTabGroup`、`canvasTabToggle`、`canvasCodeBlock`、`canvasCodeEditor`、`canvasDocumentMarkdown`、`canvasTab*`、`canvasMonaco*`、`canvasTitle`、`canvasNestedTitle`、`canvasCodeLanguage`、`canvasMode` | App/分享 Artifact 识别、文档与代码导出、面板打开/关闭、代码 tab、code-block、Monaco 内容和标题/语言提取 |
| 生成、网络与模型 | `generating.existsSelectors`、`networkMonitor.*`、`modelSwitcher.*`、`modelName` | 生成检测、网络静默判断、当前模型名称、模型入口与菜单项识别 |
| 宽度与 preserve 面板避让 | `widthSelectors`、`layoutScope`、`immersiveLayout`、`chatColumnScope`、`messageSafeArea`、`inputSafeArea`、`newChatInputSafeArea`、`userQueryWidth` | 页面和用户问题宽度、普通对话列、消息/输入安全区、零态输入以及沉浸模式右侧 edge inset |
| 模式与宿主能力 | `zenMode.*`、`cleanMode.*`、`mermaidSupport`、`quickQuote`、`supportsHostThemeSync` | Zen/Clean Mode、Mermaid、Quick Quote 和主题联动声明 |

`sitePrivateSelectors` 使用 Gemini 专属的 115 个精确键白名单。数组整体替换，对象递归合并；patch 不能增加未知私有键、删除已登记键或移除内置 capability。Canvas code/document panel 在适配器调用时动态组合，My Stuff helper 通过配置 getter 读取，不存在第二份缓存 selector。

## 仍需随应用发版

- hostname、普通/分享/Gem/My Stuff 路由、`/u/<n>` 前缀、账号邮箱语义过滤和 CID 回退。
- My Stuff 缓存同步、时间戳/缩略图/标题匹配、记录评分、新标签预开和跨扩展/油猴打开流程。
- 会话 jslog/路径规范化、动态 href selector、删除关键词、hover/click/PointerEvent、等待时序、批量失败熔断和删除后路由恢复。
- 长会话滚动加载、导出生命周期与去重排序、图片水印处理、附件 URL 安全过滤、文件名/MIME 推断、Blob/Data URL 转换和资源路径去重。
- Drive、Deep Research 与 Canvas 面板的打开/关闭/恢复时序，Canvas main-world Monaco bridge、模型匹配、可视代码分块拼接和 Markdown 格式化。
- 大纲稳定 ID、DOM 顺序、字数缓存与 Range 计算、主题 `localStorage`/body class/`StorageEvent` 编排。
- preserve 布局的 CSS 属性、沉浸模式 inset 变量、默认宽度、间距和安全阈值；Deep Research、Canvas 与 Drive 不加入聊天区 `obstacleSelectors`。
- Ophel 自身 `.gh-*` / `data-ophel-*`、动态属性/URL selector、未登记为站点专属键且只用于通用遍历的 `button`、`img`、`a`、`span`、`h1-h6` 原语、删除理由和非 selector 常量。

修改内置默认配置时必须递增 `GEMINI_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。真实站点回归完成前，P3-07 继续保持“进行中”。
