# Qwen Studio 适配器配置热修覆盖矩阵

Qwen Studio 是 P3-06 批次的第四个配置化站点，当前 `configVersion` 为 `2`。适配器启动时使用内置默认配置，门闩完成后注入通过校验的合并结果；可热修字段均在调用时从 `this.config` 读取。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与操作按钮 | `selectors.textarea`、`selectors.submitButton`、`selectors.newChatButton`、`selectors.stopButton`、`input.submitKey`、`composerButton` | 输入框、发送、新对话、停止生成和快捷键提交 |
| 会话侧栏 | `conversation.*`、`sidebarRoot`、`sidebarScroll`、`conversationLink`、`pinnedConversation` | 会话列表、标题、ID、跳转、置顶状态、侧栏滚动容器和观察器 |
| 消息、正文与公式 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`userMessageRoot`、`userContent`、`assistantContent`、`latex`、`latexDisplay`、`markdownParagraph` | 消息容器、大纲、用户问题与 AI 正文提取、公式复制和 Markdown 修复 |
| 消息滚动容器 | `selectors.scrollContainer` | 去顶部、到底部、返回锚点和阅读位置恢复 |
| 代码块与 Mermaid | `codeBlock`、`codeLine`、`codeBody`、`codeBodyFallback`、`mermaidCodeBody`、`mermaidCodeContent`、`mermaidChart`、`codeHeader`、`codeHeaderActions`、`codeLineNumber`、`mermaidSwitch`、`mermaidSwitchItem`、`mermaidActiveSwitch` | 代码语言/正文提取、Mermaid 源码识别、代码/预览视图定位和导出恢复 |
| 思考面板 | `thinkingCard`、`thoughtTrigger`、`thoughtTitle`、`thoughtPanel`、`thoughtPanelContent`、`thoughtPanelContentFallback`、`thoughtPanelCards`、`thoughtCardContent`、`thoughtMarkdown`、`thoughtPanelClose`、`phaseId`、`assistantMessageId` | 思考入口、当前消息匹配、思考内容提取、标题清理和面板关闭 |
| 导出、附件与图片 | `export.*`、`exportDecoration`、`responseToolbar`、`userImageCard`、`userFileCard`、`assistantGeneratedImage`、`assistantGeneratedImageCard`、`assistantImageDecoration`、`messageMarkerRoot` | 对话导出、装饰节点清理、用户附件、生成图片和消息去重标记 |
| 生成与模型 | `generating.existsSelectors`、`networkMonitor.*`、`modelSwitcher.*`、`modelTrigger`、`modelText`、`primaryModelPopup`、`secondaryModelPopup`、`modelItem`、`modelItemName`、`modelMoreTrigger`、`modelMoreInner`、`modelTriggerFallback` | 生成检测、网络静默判断、当前模型文本、模型入口、主/次菜单和模型锁定 |
| 宽度与面板避让 | `widthSelectors`、`layoutScope`、`messageWidth`、`inputSafeArea`、`newChatInputSafeArea`、`newChatPlaceholder`、`userQueryWidth` | 页面宽度、思考面板避让、新对话安全区和用户气泡宽度 |
| 模式与原生交互 | `zenMode.*`、`cleanMode.*`、`mermaidSupport`、`quickQuote`、`supportsHostThemeSync` | Zen/Clean Mode、原生 Mermaid、Quick Quote 模式和主题联动声明 |

`sitePrivateSelectors` 使用 Qwen Studio 专属精确键白名单。数组整体替换，对象递归合并；patch 不能增加未知私有键、删除已登记键或移除内置 capability。

## 仍需随应用发版

- hostname、`/c` 与 `/s` 路由判断，新标签页 URL、会话 ID 路径回退、token/cookie 与 UID 解析。
- 会话 API 请求、快照 TTL、分页上限、响应归一化、DOM/API 合并和会话标题回退算法。
- 受控 textarea setter、focus、input/change/keyboard 事件和发送按钮状态判断。
- 完整历史滚动加载、消息排序/去重、附件元数据解析、资源属性列表、下载 URL 安全过滤和导出打包算法。
- Mermaid 代码/预览点击、等待、稳定轮次、恢复时序和 Ophel 导出标记属性。
- 思考面板点击、可见性判断、消息关联、等待时序、Markdown/纯文本解析和引用格式。
- 主题设置 API、localStorage/DOM 同步和系统主题解析。
- 二级模型菜单 hover/PointerEvent/click 编排、模型关键词归一化与匹配顺序、等待次数/时序和失败提示。
- 面板避让 property、extra CSS、默认宽度/间距，Ophel 自身 `.gh-*` 节点，通用 `button/svg/img/math/meta` DOM 原语及非 selector 常量。

修改内置默认配置时必须递增 `QWEN_STUDIO_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。真实站点回归完成前，P3-06 继续保持“进行中”。
