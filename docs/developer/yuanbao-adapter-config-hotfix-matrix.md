# Yuanbao 适配器配置热修覆盖矩阵

Yuanbao 是 P3-05 批次的第三个配置化站点，当前 `configVersion` 为 `1`。适配器实例先使用内置默认配置，启动门闩完成后再注入通过校验的合并结果；所有可热修字段均在方法调用时从 `this.config` 读取，不缓存配置派生值。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与发送 | `selectors.textarea`、`selectors.submitButton`、`input.submitKey`、`inputContainer`、`primarySubmitButton` | Quill 输入框识别、发送快捷键、主发送按钮优先级和发送候选定位 |
| 会话列表与导航 | `conversation.*`、`selectors.sidebarScrollContainer`、`conversationPinned`、`conversationFallbackId`、`agentId` | 会话列表/标题/活动态、主 ID 提取、列表观察、侧栏滚动、动态会话 URL 和点击/地址导航策略 |
| 会话删除 UI | `conversationMenuTrigger`、`conversationActionExclusion`、`conversationActionIcon`、`dropdownMenu`、`dropdownItem`、`dialog`、`dialogButton` | 会话操作入口评分、下拉菜单、删除项、确认弹窗和按钮定位 |
| 消息与滚动 | `selectors.responseContainer`、`selectors.scrollContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`userText`、`assistantMarkdown`、`assistantSpeechText`、`bubbleContent` | 消息容器、滚动根、用户/AI 消息、正文 fallback、大纲和最新回复识别 |
| 生成、模型与网络监控 | `selectors.stopButton`、`generating.existsSelectors`、`sendIcon`、`stopIcon`、`modelSwitcher.*`、`networkMonitor.*` | 生成状态、停止按钮、发送/停止图标区分、模型名/菜单和流式请求识别 |
| 导出正文与思维内容 | `export.*`、`assistantExportDecoration`、`assistantPlainTextDecoration`、`headingDecoration`、`thoughtMarkdown`、`thoughtContainer`、`thoughtDecoration`、`assistantReasonerBody` | 导出角色、正文根节点、思维内容提取、装饰清理、纯文本与标题统计 |
| 导出附件与生成图片 | `userAttachmentImage`、`userAttachmentFile`、`userImageContainer`、`assistantGeneratedImage`、`assetCard`、`userTextDecoration`、`cleanTextDecoration` | 用户图片/文件附件、AI 生成图片、资源卡片、正文和附件文本清理 |
| 页面宽度与 Canvas 避让 | `widthSelectors`、`layoutScope`、`chatColumnScope`、`chatContent`、`inputContainer`、`canvasPane` | 页面宽度变量、聊天内容/输入安全区和 Canvas 右侧 edge 避让 |
| Zen 与净化模式 | `zenMode.*`、`cleanMode.*` | 侧栏、输入区留白、导航偏移、版权说明、下载入口和工具区隐藏 |

`sitePrivateSelectors` 使用 Yuanbao 专属的精确键白名单。patch 不能新增私有键，合并结果也不能删除已登记键；内置 capability 是最低运行契约，只能保留或新增；数组字段整体替换，不做元素级合并。

`input.mode` 与 `capabilities` 仍属于公共配置契约，但 Yuanbao 的 Quill 输入实现和内置能力接线是命令式代码。仅修改这些字段不会切换输入算法或新增一套功能。

## 仍需随应用发版

- hostname、聊天/分享路径正则、agent/session 路径组成规则和新会话判断。
- 主题与用户 ID localStorage key、`dt-agent-id`、`data-item-id`、`data-item-name`、`data-card-url` 等属性读取语义。
- Quill 的 `execCommand`、InputEvent、焦点、清空 fallback，以及 PointerEvent/MouseEvent 点击序列。
- 会话删除的中文/英文文本规则、候选评分权重、重试次数、80/800/1000/1200/2000/4500 ms 等等待编排和批量中止策略。
- 附件来源属性列表、资源 ID 文件名、URL 过滤、文件类型/大小解析、去重和资源下载逻辑。
- 导出消息排序、顶层块去重、思维引用格式化、图片扩展名推断和 DOM 顺序比较算法。
- 主题切换行为、站点主题颜色、公式复制支持、最大大纲文本长度和其它非 selector 常量。
- Canvas 内 Monaco 自动换行与 `layout()` 的扩展/油猴平台接线；本配置只控制外围 Pane 避让 selector。
- Ophel 自身 `.gh-*` 标记及其生命周期；这些不是宿主站点选择器。

当命令式行为或内置默认配置需要修复时，应正常发版；只要修改了默认配置，就必须递增 `YUANBAO_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。ChatGLM 与四站真实页面回归完成前，P3-05 继续保持“进行中”。
