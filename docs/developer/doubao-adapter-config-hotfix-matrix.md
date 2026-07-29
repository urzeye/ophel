# Doubao 适配器配置热修覆盖矩阵

Doubao 是 P3-06 批次的第三个配置化站点，当前 `configVersion` 为 `1`。适配器启动时使用内置默认配置，门闩完成后注入通过校验的合并结果；可热修字段均在调用时从 `this.config` 读取。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与操作按钮 | `selectors.textarea`、`selectors.submitButton`、`selectors.newChatButton`、`selectors.stopButton`、`input.submitKey`、`slateElement` | 普通聊天与 `/code/chat` 输入框、Slate 插入落点、发送、新对话、停止生成和快捷键提交 |
| 会话侧栏 | `conversation.*`、`historyContainer`、`pinnedConversation` | 会话列表/标题/跳转、活动与置顶状态、侧栏滚动容器和观察器 |
| 虚拟列表与消息 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`virtualRow`、`virtualScrollHolder`、`shareMessageList`、`messageBlock`、`messageId`、`assistantMarkdown`、`userQueryTextContainer`、`renderedUserQueryMarkdown` | 滚动容器、普通/分享页消息、大纲缓存定位、用户问题与 AI 正文提取 |
| 导出与附件 | `export.*`、`assistantExportDecoration`、`userAttachmentCard`、`generatedImageBlock`、`assistantImageContainers`、`generatedImageWrapper`、`generatedImageGridItem` | 滚动扫描导出、装饰节点清理、用户附件与生成图片识别及打包 |
| 生成与模型 | `generating.existsSelectors`、`modelSwitcher.*`、`modelName` | 生成检测、停止入口、模型按钮定位、当前模型文本与模型锁定 |
| 会话删除 UI | `conversationMenuWrapper`、`conversationMenuTrigger`、`conversationMenuInnerButton`、`conversationMenuGenericTrigger`、`deleteMenuItem`、`deleteDangerIndicator`、`deleteConfirmButton`、`openDeleteDialog`、`deleteDialog`、`openConversationMenu` | 会话操作菜单、删除项、确认弹窗和菜单打开状态定位 |
| 宽度与面板避让 | `widthSelectors`、`mainLayoutScope`、`contentWidthRoot`、`contentWidth`、`contentWidthVar`、`contentColumn`、`newChatSafeArea`、`canvasScope`、`canvasSafeArea`、`userQueryWidth` | 页面宽度、主聊天列/新对话安全区、Canvas 右侧避让和用户气泡宽度 |
| 模式与原生交互 | `zenMode.*`、`cleanMode.*`、`quickQuote`、`nativeQuotePopover`、`supportsHostThemeSync` | Zen/Clean Mode、Quick Quote 模式、豆包原生引用浮层避让和主题联动声明 |

`sitePrivateSelectors` 使用 Doubao 专属精确键白名单。数组整体替换，对象递归合并；patch 不能增加未知私有键、删除已登记键或移除内置 capability。

## 仍需随应用发版

- hostname、`/chat`、`/code/chat`、`/thread` 路由判断，新标签页 URL 与会话 ID 路径回退解析。
- Slate paste、Backspace、`execCommand`、selection 与受控 textarea 事件编排。
- 虚拟列表行号/滚动位置解析、大纲缓存合并、跳转等待与滚动扫描次数/时序。
- 附件名称/类型识别、资源属性列表、下载 URL 安全过滤、Performance 生成图片回退与导出打包算法。
- 会话删除 hover/PointerEvent/键盘事件、删除/确认关键词、等待时序与批量失败熔断逻辑。
- 面板避让 property、extra CSS、默认宽度/间距和 Canvas 仅右侧应用规则。
- 主题行为、Ophel 自身 `.gh-*` 节点、通用 `button/svg/img/source/h1-h6` DOM 原语及非 selector 常量。

修改内置默认配置时必须递增 `DOUBAO_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。真实站点回归完成前，P3-06 继续保持“进行中”。
