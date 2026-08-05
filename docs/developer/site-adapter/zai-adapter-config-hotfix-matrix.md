# Z.ai 适配器配置热修覆盖矩阵

Z.ai 是内置配置热修的首个试点，当前 `configVersion` 为 `1`。适配器构造时始终使用内置默认配置，启动门闩完成后再注入通过校验的合并结果；方法体不缓存配置派生值。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与发送 | `selectors.textarea`、`sitePrivateSelectors.submitButton`、`input.submitKey` | Prompt 插入、发送按钮识别、发送快捷键 |
| 消息与大纲 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`sitePrivateSelectors.assistantMarkdown`、`assistantBody` | 消息容器、阅读锚点、用户提问与 AI 回复识别、大纲和字数统计 |
| 新对话与生成状态 | `selectors.newChatButton`、`selectors.stopButton`、`generating.existsSelectors` | 新对话、停止生成、生成状态检测 |
| 模型选择 | `modelSwitcher.*` | 当前模型识别、模型菜单与子菜单选择 |
| 导出与思维链 | `selectors.userQuery`、`assistantMarkdown`、`assistantBody`、`thinkingChainContainer`、`thinkingBlock`、`thinkingContent`、`blockquote`、`thinkingContainer`、`thinkingBlockquote`、`exportDecoration` | 当前 Z.ai 导出消息识别、思维链提取与清理、导出正文净化 |
| 附件 | `attachmentCards`、`attachmentImages`、`attachmentIconImages`、`messageRoot`、`userContentCandidates` | 用户附件卡片、图片/文件识别、消息正文定位 |
| 侧栏与会话 | `sidebarItem`、`sidebarTitle`、`sidebarItemTrigger`、`sidebarScrollContainer` | 会话列表 best-effort 读取、标题识别、站内跳转、侧栏滚动容器 |
| 页面宽度与避让 | `widthSelectors`、`chatContainer`、`chatMessagesContainer`、`chatMessageWidth`、`chatInputSafeArea`、`newChatContentSafeArea`、`userQueryWidth`、`paneRoot`、`inputWithinScrollContainer`、`horizontalScrollContainer` | 页面加宽、用户问题宽度、面板安全区避让、滚动容器评分 |
| Zen 与主题目标 | `zenMode.*`、`themeMeta` | Zen Mode 隐藏目标、宿主页主题 meta 更新目标 |

`sitePrivateSelectors` 采用逐站点精确白名单。patch 不能新增键，合并结果也不能删除已登记键；内置默认 capability 是最低运行契约，只能保留或新增，不能通过 patch 移除；数组字段整体替换，不做元素级合并。

`export.*` 仍可配置，但主要用于通用导出回退、代码搜索和 Mermaid 等兼容路径；Z.ai 当前的主导出流程优先使用上表中的消息选择器。

## 仍需随应用发版

- 站点 hostname、会话/分享路径正则和新标签页 URL。
- 输入控件类型与插入算法；`input.mode` 变化需要同步修改命令式输入实现。
- Z.ai API 路径、响应结构、会话 ID 与消息 ID 解析算法。
- localStorage key、主题 class 切换流程和亮暗主题颜色值。
- 附件 URL 属性列表、文件名/类型/大小解析和资源下载逻辑。
- DOM 点击、输入事件、导出编排、会话导航、滚动容器评分等命令式算法。
- Ophel 自身 `.gh-*` 标记与清理规则；这些不是宿主站点选择器。

当上述命令式行为或内置默认配置需要修复时，应正常发版并递增 `ZAI_CONFIG_VERSION`；旧 `baseConfigVersion` patch 会自动失效。

## 自动化与手工验收

`src/adapters/zai-config.test.ts` 锁定默认配置映射、合法 patch 动态生效、返回值防御性复制，以及全部私有 selector 白名单键存在运行时消费点。P0-08 仍需在真实 Z.ai 页面完成输入、生成、大纲、导出、附件、会话、模型、宽度、Zen、主题与面板避让手工回归后才能标记完成。
