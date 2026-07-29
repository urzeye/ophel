# DeepSeek 适配器配置热修覆盖矩阵

DeepSeek 是 P3-06 批次的首个配置化站点，当前 `configVersion` 为 `1`。适配器启动时使用内置默认配置，门闩完成后注入通过校验的合并结果；可热修字段均在调用时从 `this.config` 读取。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与操作按钮 | `selectors.textarea`、`selectors.submitButton`、`selectors.newChatButton`、`selectors.stopButton`、`input.submitKey`、`composerButton` | 输入框、发送、新对话、停止生成与生成状态识别 |
| 会话、消息与滚动 | `conversation.*`、`sidebarScrollArea`、`message`、`selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse` | 会话列表/标题/跳转、侧栏滚动、用户与 AI 消息、主滚动容器评分 |
| 大纲与正文 | `assistantMarkdown`、`thoughtContainer`、`iconButton`、`focusRing`、`nativeOutline*`、`mainRegion` | 标题提取、用户问题正文、思维内容、原生大纲扫描与跳转 |
| 导出与复制 | `export.*`、`assistantMarkdown`、`thoughtContainer`、`iconButton`、`focusRing`、`shareTitleMeta` | DOM/分享页导出正文、思维链清理、最新回复、代码块和分享标题 |
| 生成、模型与网络 | `generating.existsSelectors`、`selectedModel`、`networkMonitor.*` | 生成检测、停止入口、当前模型文本和 SSE 请求识别 |
| 宽度与面板避让 | `widthSelectors`、`newChatLayoutScope`、`canvasLayoutScope`、`canvasPreviewSafeArea`、`panelAvoidanceScope`、`messageListItems`、`messageComposer`、`userMessageContent` | 历史消息/输入区、新对话页、用户问题宽度和 Canvas 预览安全区 |
| 模式开关 | `zenMode.*`、`cleanMode.*`、`quickQuote` | 侧栏/页面元素隐藏与 Quick Quote 启用状态 |

`sitePrivateSelectors` 使用 DeepSeek 专属精确键白名单。数组整体替换，对象递归合并；patch 不能增加未知私有键、删除已登记键或移除内置 capability。

## 仍需随应用发版

- hostname、会话/分享路由正则、新会话判断和新标签页 URL。
- token/localStorage/sessionStorage key、鉴权头、删除 API 路径与删除后刷新流程。
- textarea 原生 value setter、InputEvent/change/光标事件和按钮查找作用域算法。
- 主题存储格式、body class/attribute 映射、系统主题解析和 300 ms 清理时序。
- 原生大纲虚拟列表扫描、缓存、批次合并、估算滚动与点击/等待算法。
- 分享 API schema、附件/图片识别、文件信息解析、资源下载过滤与导出消息去重算法。
- Ophel 自身 `.gh-*` 属性/节点、通用 `img/svg/button/main` DOM 原语和非 selector 常量。

修改内置默认配置时必须递增 `DEEPSEEK_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。真实站点回归完成前，P3-06 继续保持“进行中”。
