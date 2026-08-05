# Ima 适配器配置热修覆盖矩阵

Ima 是内置配置热修的第二个试点，当前 `configVersion` 为 `1`。适配器实例先使用内置默认配置，启动门闩完成后再注入通过校验的合并结果；所有可热修字段均在方法调用时从 `this.config` 读取，不缓存配置派生值。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与发送 | `selectors.textarea`、`input.submitKey`、`tagTextarea`、`chatInputContainer`、`inputScope`、`submitButton`、`submitDisabled` | Prompt 输入框识别、发送快捷键、发送按钮作用域与禁用状态识别 |
| 消息与大纲 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`scrollContainer`、`userText`、`assistantMarkdown`、`inlineReference` | 消息容器、用户提问与 AI 回复识别、大纲、字数统计和标题清理 |
| 新对话与生成状态 | `selectors.newChatButton`、`selectors.stopButton`、`generating.existsSelectors`、`stopButtonChildren` | 新对话按钮、生成状态检测、停止生成按钮定位 |
| 模型选择 | `modelSwitcher.*`、`modelText` | 当前模型识别、模型按钮与菜单项选择、菜单等待与重试参数 |
| 网络生成检测 | `networkMonitor.*` | Ima SSE 请求识别、静默完成阈值和请求规则 |
| 导出正文与思维内容 | `export.*`、`assistantBubble`、`assistantBubbleFallback`、`thinking`、`thinkingTitle`、`exportDecoration` | 通用导出回退、正文根节点、思维内容提取和界面装饰清理 |
| 导出附件与生成图片 | `userAttachmentImages`、`userAttachmentFiles`、`userAttachmentImageCard`、`assistantGeneratedImages`、`assistantGeneratedImageCards` | 用户图片/文件附件识别、生成图片提取和重复卡片清理 |
| 会话标题与侧栏 | `activeHistoryTitle`、`sidebarScrollContainer` | 当前会话标题读取、历史列表滚动容器定位 |
| 页面宽度与面板避让 | `widthSelectors`、`userQueryWidth`、`pageContent`、`mainArea`、`newChatContent`、`chatPageInputContainer`、`editorContainer` | 页面加宽、用户问题宽度和 Ophel 面板安全区避让 |
| Zen 与净化模式 | `zenMode.*`、`cleanMode.*` | 侧栏、下载入口、活动横幅和其它干扰元素的隐藏目标 |

`sitePrivateSelectors` 使用 Ima 专属的精确键白名单。patch 不能新增私有键，合并结果也不能删除已登记键；内置 capability 是最低运行契约，只能保留或新增；数组字段整体替换，不做元素级合并。

`input.mode` 与 `capabilities` 仍属于公共配置契约，但 Ima 的 contenteditable 输入实现和内置能力接线是命令式代码。仅修改这些字段不会把适配器切换为另一种输入实现或新增一套功能。

## 仍需随应用发版

- 站点 hostname、会话路径正则、分享页判断和新标签页 URL。
- localStorage key、CID 结构和会话 ID/标题清理算法。
- contenteditable 的粘贴、`execCommand`、Selection、InputEvent 和清空流程；若 Ima 更换编辑器框架或输入模式，需要修改代码。
- DOM 点击模拟、会话导航、导出编排、大纲遍历、字数计算和可见性判断等命令式算法。
- 附件来源属性列表、文件名/类型/大小解析、URL 过滤、去重与资源下载逻辑。
- 主题联动能力、站点主题颜色以及最大大纲文本长度等非 selector 常量。
- Ophel 自身 `.gh-*` 标记及其生命周期；这些不是宿主站点选择器。

当命令式行为或内置默认配置需要修复时，应正常发版；只要修改了默认配置，就必须递增 `IMA_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。
