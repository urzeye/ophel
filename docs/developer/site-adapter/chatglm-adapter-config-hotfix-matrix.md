# ChatGLM 适配器配置热修覆盖矩阵

ChatGLM 是 P3-05 批次的第四个配置化站点，当前 `configVersion` 为 `1`。适配器实例先使用内置默认配置，启动门闩完成后再注入通过校验的合并结果；所有可热修字段均在方法调用时从 `this.config` 读取，不缓存配置派生值。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与发送 | `selectors.textarea`、`selectors.submitButton`、`input.submitKey`、`submitButton`、`submitButtonDisabled` | textarea 定位、发送快捷键、可发送按钮过滤和按钮可见性判断 |
| 主题与 Quick Quote | `quickQuote`、`nativeQuotePopover`、`themeUserMenuButtons`、`themeEntry`、`themeOptionCandidates`、`themeClickable`、`themeRootCandidates` | 原生引用入口、用户菜单、主题入口/选项、可点击根节点和主题 fallback 根容器 |
| 消息、滚动与大纲 | `selectors.responseContainer`、`selectors.scrollContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`conversationItem`、`userText`、`assistantMarkdown`、`conversationTitle`、`collapseButton` | 消息/滚动容器、用户与 AI 正文、会话标题、折叠按钮、最新回复和大纲遍历 |
| 生成、模型与网络监控 | `selectors.stopButton`、`generating.existsSelectors`、`modelSwitcher.*`、`modelName`、`networkMonitor.*` | 生成状态与停止入口、模型名/触发器/菜单和流式请求识别 |
| DOM 导出与思维内容 | `export.*`、`thinkingContainer`、`thoughtContent`、`markdownBody`、`exportDecoration` | 导出角色、AI 正文/思维节点归并、正文根节点和界面装饰清理 |
| DOM 附件与图片 | `userAttachmentCandidates`、`attachmentNameRoot`、`avatar` | 用户附件候选、文件名文本根节点、头像排除和 DOM 图片/文件提取入口 |
| 页面宽度与 Canvas 避让 | `widthSelectors`、`conversationScope`、`conversationInner`、`messageWidth`、`markdownWidth`、`newChatGuideSafeArea`、`canvasLayoutScope`、`canvasPreviewSafeArea` | 对话/消息/Markdown 宽度、代码块与表格伸展、新对话引导区和 Canvas 右侧 edge 避让 |
| Zen 与净化模式 | `zenMode.*`、`cleanMode.*` | 侧栏、政策区、会员按钮和宣传横幅隐藏 |

`sitePrivateSelectors` 使用 ChatGLM 专属的精确键白名单。patch 不能新增私有键，合并结果也不能删除已登记键；内置 capability 是最低运行契约，只能保留或新增；数组字段整体替换，不做元素级合并。

`input.mode` 与 `capabilities` 仍属于公共配置契约，但 ChatGLM 的 textarea 输入实现和内置能力接线是命令式代码。仅修改这些字段不会切换输入算法或新增一套功能。

## 仍需随应用发版

- hostname、`cid`/分享查询参数、分享路径、新标签页路径和新会话判断。
- `SKIN_MODE` key、主题值映射、系统主题解析、主题中英文标签和 120/80/50/60 ms 点击/轮询编排。
- textarea 原生 value setter、InputEvent、change、光标位置和 MouseEvent 点击序列。
- 分享页 `/chatglm/share-api/conversation/info/*` 请求、凭据、响应 schema 与 API/DOM 导出切换逻辑。
- API 消息/思维/工具调用字段解析、附件来源属性列表、文件名/类型/大小解析、资源去重与 URL 过滤。
- DOM 导出消息排序、连续同角色合并、思维引用格式化、图片最小尺寸、头像/图标路径过滤和下载判断算法。
- 站点主题颜色、会话标题文本清理、最大大纲文本长度、面板默认宽度/间距和其它非 selector 常量。
- Ophel 自身 `.gh-*` 标记及其生命周期；这些不是宿主站点选择器。

当命令式行为或内置默认配置需要修复时，应正常发版；只要修改了默认配置，就必须递增 `CHATGLM_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。四站真实页面回归矩阵完成前，P3-05 继续保持“进行中”。
