# Gemini Enterprise 适配器配置热修覆盖矩阵

Gemini Enterprise 是 P3-06 批次的第五个也是最后一个配置化站点，当前 `configVersion` 为 `1`。适配器启动时使用内置默认配置，门闩完成后注入通过校验的合并结果；可热修字段均在调用时从 `this.config` 读取。

## 可通过 patch 热修

| 范围 | 配置字段 | 影响功能 |
| --- | --- | --- |
| 输入与操作按钮 | `selectors.textarea`、`selectors.submitButton`、`selectors.newChatButton`、`selectors.stopButton`、`input.submitKey`、`textareaHostExclusion` | 输入框识别、发送、新对话、停止生成、快捷键提交和宿主搜索框排除 |
| 会话侧栏 | `conversation.*`、`selectors.sidebarScrollContainer`、`sidebarScrollFallback`、`conversationButton`、`conversationMenuButton`、`conversationMenuButtonFallback`、`conversationActive`、`conversationAriaActive` | 会话列表、标题、ID、跳转、活动状态、侧栏滚动容器和观察器 |
| 会话删除菜单 | `conversationActionButton`、`conversationMenuIcon`、`conversationMenuAction`、`conversationMenuContainer` | 会话操作入口、菜单容器、删除项候选和菜单开关检测 |
| 消息、Markdown 与大纲 | `selectors.responseContainer`、`selectors.chatContent`、`selectors.userQuery`、`selectors.assistantResponse`、`selectors.scrollContainer`、`conversationRoot`、`conversationMain`、`markdownHost`、`markdownDocument`、`headingMarker`、`srOnly` | 最新回复、消息容器、滚动、大纲、用户问题与 AI 正文提取、Markdown 清理和导出 |
| 生成与模型 | `generating.existsSelectors`、`networkMonitor.*`、`modelSwitcher.*`、`modelName` | 生成检测、网络静默判断、当前模型名称、模型入口和模型锁定 |
| 宽度与面板避让 | `widthSelectors`、`panelScope`、`inputArea`、`userQueryWidth`、`shadowInjectionExclusion` | 页面宽度、主内容和输入区安全边距、用户问题宽度及页面 Shadow Root 注入范围 |
| 会话展开与原生主题 | `showMoreButton`、`showMoreIcon`、`showMoreExpandedIcon`、`themeMenu`、`settingsButton`、`themeTab`、`themeIcon` | 会话分组展开、主题设置入口、主题选项定位和菜单隐身处理 |
| 模式与宿主能力 | `export.*`、`zenMode.*`、`cleanMode.*`、`mermaidSupport`、`quickQuote`、`supportsHostThemeSync` | 对话导出、Zen/Clean Mode、Mermaid、Quick Quote 模式和主题联动声明 |

`sitePrivateSelectors` 使用 Gemini Enterprise 专属精确键白名单。数组整体替换，对象递归合并；patch 不能增加未知私有键、删除已登记键或移除内置 capability。

## 仍需随应用发版

- hostname、分享页与新会话判断、CID 提取、`/session` 和 `/home/cid/.../r/session` 路由构造及数字会话 ID 过滤。
- 会话删除的关键词集合、错误原因、批量失败熔断、hover/MouseEvent、菜单点击、等待时序、DOM 移除和当前会话路由清理。
- ProseMirror/contenteditable 有效性判断、Paste、`execCommand`、beforeinput/input/change/keyboard 四阶段输入事件与零宽字符清理。
- 递归 Shadow DOM 深度、标题层级与 Turn ID 解析、字数统计、Mermaid 查找和 HTML/Markdown 转换算法。
- 模型名称正则、模型关键词默认值、主题图标映射、菜单抑制动画帧、点击重试次数和清理时序。
- 会话展开次数/等待、面板避让 extra CSS/默认宽度/间距、Ophel 自身 `.gh-*` 节点、动态 heading/href selector、通用 `li/p/*` DOM 原语及非 selector 常量。

修改内置默认配置时必须递增 `GEMINI_ENTERPRISE_CONFIG_VERSION`，使旧 `baseConfigVersion` patch 自动失效。真实站点回归完成前，P3-06 继续保持“进行中”。
