# Qianwen 适配器配置热修覆盖矩阵

Qianwen 是 P3-05 批次的第二个配置化站点，当前 `configVersion` 为 `1`。适配器实例先使用内置默认配置，启动门闩完成后再注入通过校验的合并结果；所有可热修字段均在方法调用时从 `this.config` 读取，不缓存配置派生值。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与发送 | `selectors.textarea`、`selectors.submitButton`、`input.submitKey`、`chatInput`、`slateEditor`、`submitButtonCandidates`、`submitButtonClickable` | textarea/Slate 输入框识别、发送快捷键、发送按钮候选与可点击根节点定位 |
| 滚动与消息 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`messageList`、`messageListArea`、`scrollRootCandidates`、`scrollContent` | 消息容器、用户/AI 消息识别、滚动容器发现、长会话加载签名和大纲遍历 |
| 新对话与生成状态 | `selectors.newChatButton`、`selectors.stopButton`、`generating.existsSelectors` | 新对话按钮、生成状态检测和停止生成按钮定位 |
| 模型与网络监控 | `modelSwitcher.*`、`modelDialog`、`modelTrigger`、`modelExpandToggle`、`sidebar`、`chatInput`、`networkMonitor.*` | 当前模型触发器、模型弹窗/条目、展开入口、重试上限、菜单等待和流式请求识别 |
| 导出正文与思维内容 | `export.*`、`turn`、`assistantContent`、`assistantExportDecoration`、`thinking`、`thinkingContent`、`thinkingDecoration`、`assistantPlainTextDecoration` | 导出角色/轮次、正文根节点、思维内容提取、界面装饰清理和纯文本统计 |
| 导出附件与生成图片 | `userTextCard`、`userImageCard`、`userFileCard`、`attachmentImage`、`assistantGeneratedImage`、`userTextDecoration`、`cleanTextDecoration` | 用户正文卡片、图片/文件附件、AI 生成图片和附件文本清理 |
| 页面宽度与 Canvas 避让 | `widthSelectors`、`chatLayoutScope`、`messageCenter`、`messageList`、`chatContent`、`messageListArea`、`canvasLayoutScope`、`canvasPanel`、`bubble`、`questionCard` | 页面加宽、用户问题宽度、Ophel 面板安全区和 Canvas 右侧避让 |
| Zen、净化与 Markdown 修复 | `zenMode.*`、`cleanMode.*`、`markdownFixerParagraph`、`selectors.assistantResponse` | 侧栏/脚注隐藏，以及生成中最后一条回复的 Markdown 修复跳过判断 |

`sitePrivateSelectors` 使用 Qianwen 专属的精确键白名单。patch 不能新增私有键，合并结果也不能删除已登记键；内置 capability 是最低运行契约，只能保留或新增；数组字段整体替换，不做元素级合并。

`input.mode` 与 `capabilities` 仍属于公共配置契约，但 Qianwen 的混合 textarea/Slate 输入实现和内置能力接线是命令式代码。仅修改这些字段不会切换输入算法或新增一套功能。

## 仍需随应用发版

- 站点 hostname、聊天/群组/分享路径正则、新会话判断和新标签页 URL。
- CID 与主题 localStorage key、模型展开状态 key 和存储内容解析。
- Slate/textarea 的原生 setter、Selection、`execCommand`、InputEvent、焦点和 fallback 流程。
- 长会话向上滚动、WheelEvent、稳定轮次、等待时长、最大轮数和可滚动性判断算法。
- 模型文本归一化与匹配优先级、“查看更多模型”多语言判断，以及 500/400/150 ms 的自定义重试/收尾编排。
- 附件来源属性列表、下载 URL 过滤、阿里静态资源排除、文件名/类型/大小解析和资源去重逻辑。
- 导出消息排序、顶层块去重、思维引用格式化、图片 alt fallback 和 DOM 顺序比较算法。
- 主题切换行为、站点主题颜色、Quick Quote 支持模式、按钮禁用/可见性判断和其它非 selector 常量。
- Ophel 自身 `.gh-*` 标记及其生命周期；这些不是宿主站点选择器。

当命令式行为或内置默认配置需要修复时，应正常发版；只要修改了默认配置，就必须递增 `QIANWEN_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。
