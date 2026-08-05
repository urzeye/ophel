# AI Studio 适配器配置热修覆盖矩阵

AI Studio 是 P3-07 大站批次的第四个配置化站点，当前 `configVersion` 为 `1`。适配器启动时使用内置默认配置，门闩完成后注入通过校验的合并结果；输入、时间线、模型、Library、导出与布局路径均在调用时读取同一份 `this.config`。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与操作按钮 | `selectors.textarea`、`selectors.submitButton`、`selectors.newChatButton`、`selectors.stopButton`、`input.submitKey`、`validTextarea` | 输入框识别与有效性、发送按钮、新对话、停止生成和未设置站点偏好时的发送键回退 |
| 时间线与会话标题 | `scrollbarButton`、`activeScrollbarButton`、`turn`、`pageHeading`、`sidebarTitleLink` | 新旧时间线用户问题、turn 定位与揭示、当前时间线项、页面/侧栏标题来源和大纲跳转 |
| 滚动、消息与大纲 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`selectors.scrollContainer`、`turnContent`、`userContentChunk`、`userPromptContainer`、`outlineContainer`、`outlineAssistantContainer`、`markdownNode`、`thoughtChunk` | 普通消息、滚动容器、用户问题文本、标题过滤、回复字数、大纲排序与 Thought 排除 |
| 三栏宽度与面板避让 | `widthSelectors`、`layoutScope`、`editorScope`、`modelSidebar`、`panelChatContentWidth`、`panelChatTurnWidth`、`panelPromptBoxWidth`、`panelTableWidth`、`panelChatSafeArea`、`panelPromptSafeArea` | 页面加宽、聊天列/turn/输入框一致宽度、表格拉伸、聊天安全区和 Run settings 三栏避让 |
| 模型选择与 Run settings | `modelSwitcher.*`、`modelNameMarker`、`runSettingsToggleButton`、`runSettingsCloseButton`、`modelCategoryButton`、`modelCardName`、`modelSidebarCloseButton`、`modelNameText` | 模型入口、侧栏等待、All 分类、模型卡 ID/名称、锁定模型、面板关闭与当前模型名称 |
| Library 会话列表 | `conversation.*`、`selectors.sidebarScrollContainer`、`libraryNavigationLink`、`libraryRoot`、`libraryTable`、`libraryMobileCards`、`libraryTableWrapper`、`libraryCard`、`libraryEmptyState`、`sidebarConversationLink` | SPA 进入 Library、桌面表格/移动卡片/空状态、会话 ID/标题/URL、全量/侧栏列表、观察器和导航 |
| Library UI 删除 | `conversationVisibilityLink`、`conversationRemovalContainer`、`libraryRow`、`conversationMenuButton`、`conversationMenuItem`、`conversationDialog` | 会话可见性、行定位与移除、更多菜单、删除项和确认对话框；关键词、点击、等待与批量熔断保持代码实现 |
| 用户附件导出 | `userContentNoise`、`userImageAttachment`、`userFileAttachment`、`userFileName`、`userFileAriaLabel`、`userFileDetails`、`userFileLink` | 用户正文清理、图片/文件识别、文件名、token 信息和附件链接提取 |
| Assistant/Thought/代码导出 | `assistantContentNoise`、`assistantFragment`、`thoughtChunk`、`markdownNode`、`inlineCode`、`katex`、`katexAnnotation`、`codeBlock`、`codeBlockContent`、`codeBlockLanguage` | 回复片段、Thought、Markdown 节点、行内代码、公式、代码块正文与语言规范化 |
| 长会话导出 | `export.*`、`turn`、`assistantFragment`、`chatSession`、`promptChunk`、`mountedContent`、`textChunk` | 普通导出配置、全部 turn 遍历、内部虚拟内容挂载判定、用户/模型分组和可见快照兜底 |
| 生成与宿主能力 | `generating.existsSelectors`、`runButton`、`generationTextStopIndicator`、`zenMode.*`、`cleanMode.*`、`markdownFixerTarget`、`mermaidSupport`、`quickQuote`、`supportsHostThemeSync`、`themeEventTarget` | 生成检测、Zen/Clean Mode、Markdown 修复、Mermaid、Quick Quote、主题联动声明和主题变更事件目标 |

`sitePrivateSelectors` 使用 AI Studio 专属的 66 个精确键白名单。数组整体替换，对象递归合并；patch 不能增加未知私有键、删除已登记键或移除内置 capability。模块级只保留 Ophel 导出快照属性、删除理由和 RPC 常量，不再保留第二份宿主 selector。

## 仍需随应用发版

- hostname、`/prompts/*`、`/app/prompts/*`、`/library`、`new_chat` 路由语义，会话 ID 动态 href 匹配和 SPA 返回流程。
- `localStorage.aiStudioUserPreference` 的发送键、模型、主题和预加载设置结构；document-start 的 `aistudio-preload.ts` 仍属于 L1 代码。
- Library 缓存时效、完整同步、空列表等待、删除关键词、多语言信号、点击/等待时序、批量失败熔断和删除后当前路由恢复。
- 当前默认关闭的原生 RPC 删除、候选 origin、认证 header、API key 搜索、HTTP 错误解释和 API/UI 回退编排。
- 模型 ID 规范化、模型显示名缓存、面板展开/恢复时序和用户设置读取。
- 附件 URL 安全过滤、资源去重/打包、默认名称、MIME 推断与 Markdown 格式化。
- 用户附件 turn 合并、Thought-only/reply 状态机、内部虚拟内容滚动挂载、超时重试、缺失 turn 修复、快照去重排序和原滚动位置恢复。
- 大纲稳定 ID、文本/字数缓存、时间线文本匹配、DOM/时间线混合排序与 Range 字数计算。
- preserve 布局的 CSS 属性、默认宽度 `1000px`、16px 间距和 Run settings 右侧 edge 行为。
- Ophel 自身 `.gh-*` / `data-gh-*`、动态会话 selector、通用 `button`、`main`、`script`、`textarea`、`h1-h6` 遍历原语，以及非 selector 常量。
- 本仓库的 Flutter iframe 主世界脚本仅匹配 Gemini 域名；AI Studio 当前没有对应注入链路，新增此类能力需要代码发版。

修改内置默认配置时必须递增 `AISTUDIO_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。真实站点回归完成前，P3-07 继续保持“进行中”。
