# Kimi 适配器配置热修覆盖矩阵

Kimi 是 P3-05 批次的首个配置化站点，当前 `configVersion` 为 `1`。适配器实例先使用内置默认配置，启动门闩完成后再注入通过校验的合并结果；所有可热修字段均在方法调用时从 `this.config` 读取，不缓存配置派生值。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与发送 | `selectors.textarea`、`selectors.submitButton`、`input.submitKey`、`inputScope`、`editorScope`、`submitButtonContainer`、`submitButtonDisabled` | Prompt 输入框识别、发送快捷键、发送按钮作用域和禁用/停止状态排除 |
| 会话列表与标题 | `conversation.*`、`sidebarConversation`、`conversationHeaderTitle`、`pinnedConversation`、`activeConversation` | 会话项、ID/标题提取、活动/置顶状态、会话 URL、观察器和点击导航策略 |
| 历史列表加载 | `historyContainer`、`historyScrollCandidates`、`nextSidebarBody`、`moreHistoryLink`、`closeHistory`、`closeButtonContainer` | 历史页入口、滚动容器、加载计数和关闭按钮定位 |
| 消息与大纲 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`chatItem`、`userItem`、`assistantItem`、`userContentBox`、`assistantBodyMarkdown` | 消息容器、用户提问与 AI 回复识别、字数统计和大纲遍历 |
| 新对话与生成状态 | `selectors.newChatButton`、`selectors.stopButton`、`generating.existsSelectors`、`submitButtonContainer` | 新对话按钮、生成状态检测和停止生成按钮定位 |
| 模型与网络监控 | `modelSwitcher.*`、`modelName`、`networkMonitor.*` | 当前模型读取、模型菜单选择、等待/重试参数和流式请求静默阈值 |
| 导出正文与思维内容 | `export.*`、`markdown`、`thinkingContainer`、`toolcallContainer`、`toolcallContentMarkdown`、`exportDecoration` | 导出角色映射、正文根节点、思维内容提取、工具调用排除和界面装饰清理 |
| 导出附件 | `userAttachmentList`、`userAttachmentImage`、`userFileCard`、`userFileName`、`userFileType`、`userFileSize`、`fileLink` | 用户图片/文件附件识别及文件元信息读取 |
| 页面宽度与面板避让 | `widthSelectors`、`chatLayoutScope`、`chatContentContainer`、`chatListWidth`、`chatActionContainer`、`chatEditor`、`chatDetailMain`、`newChatLayoutScope`、`userQueryWrapper`、`userContent`、`userQueryContent` | 页面加宽、用户问题宽度和 Ophel 面板安全区避让 |
| Zen、净化与 Markdown 修复 | `zenMode.*`、`cleanMode.*`、`markdownFixerParagraph`、`lastAssistant` | 侧栏/干扰元素隐藏，以及生成中最后一条回复的 Markdown 修复跳过判断 |

`sitePrivateSelectors` 使用 Kimi 专属的精确键白名单。patch 不能新增私有键，合并结果也不能删除已登记键；内置 capability 是最低运行契约，只能保留或新增；数组字段整体替换，不做元素级合并。

`input.mode` 与 `capabilities` 仍属于公共配置契约，但 Kimi 的 Lexical 输入实现和内置能力接线是命令式代码。仅修改这些字段不会切换输入算法或新增一套功能。

## 仍需随应用发版

- 站点 hostname、会话/分享/历史路径判断、新标签页 URL 和非聊天路径排除规则。
- Cookie/localStorage/sessionStorage key、JWT 搜索与解析、CID 读取和主题存储兼容处理。
- 删除会话 API 路径、请求头、认证字段、响应判断、错误原因和批量删除后的导航/刷新策略。
- Lexical 的 Selection、`execCommand`、Paste/Input/KeyboardEvent、清空重试和焦点确认流程。
- 历史列表轮询、SPA 路由事件、滚动父级识别、会话快照缓存和 DOM 点击事件编排。
- 大纲层级、字数计算、导出消息排序、思维内容格式化、附件去重、URL 过滤、文件名与扩展名解析算法。
- 主题切换行为、站点主题颜色、快照有效期、轮询次数和其它非 selector 常量。
- Ophel 自身 `.gh-*` 标记及其生命周期；这些不是宿主站点选择器。

当命令式行为或内置默认配置需要修复时，应正常发版；只要修改了默认配置，就必须递增 `KIMI_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。
