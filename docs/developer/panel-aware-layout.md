# Ophel 面板安全区布局方案

## 背景

Ophel 主面板是固定定位的 Shadow DOM 浮层。页面默认宽度较窄时通常不会遮挡正文，但用户开启页面加宽、把浏览器缩到半屏、或把 Ophel 面板宽度调大后，宿主页内容仍然按自身容器居中，右侧面板会覆盖正文、代码块或输入区。

此前尝试浏览器原生 sidebar 的方向已经放弃，原因是扩展版需要维护第二套 UI，并引入大量 background 通信；油猴脚本也无法复用该能力。PR #722 里的 ChatGPT 专用脚本验证了“扣除面板占用区后重算内容宽度”的方向，但不适合以站点专用 content script 落地。

## 目标

- 不引入第二套 UI，不依赖浏览器原生 sidebar。
- 不全局修改 `body`、`html` 或宿主页主布局。
- 由站点 adapter opt-in，先以 DeepSeek 试点，验证后再扩展到其他站点。
- 悬浮模式下面板展开、拖动、调宽、左右切换时，宿主页内容能进入可见安全区。
- 自动吸附模式、面板收起、幽灵模式临时隐藏时，不为面板预留空间。

## 非目标

- 不在第一阶段做“视口过窄时自动收起面板”。
- 不处理所有极端拖拽位置；试点优先覆盖右侧或左侧贴边浮层的主流场景。
- 不为所有站点一次性适配，避免把未验证的选择器批量写入公共逻辑。

## 方案

新增一层共享的 panel-aware layout 能力，由 `LayoutManager` 执行，站点 adapter 只声明配置：

```ts
interface PanelAvoidanceConfig {
  scopeSelector?: string
  widthSelectors: WidthSelectorConfig[]
  insetSelectors?: PanelAvoidanceInsetConfig[]
  defaultWidth?: string
  gap?: number
  minVisiblePanelWidth?: number
  minSafeWidth?: number
  minViewportWidth?: number
}
```

`PanelAvoidanceInsetConfig` 可选声明自己的 `scopeSelector`、`applySide` 和 `insetMode`。默认复用主 `scopeSelector`、同时应用左右 inset，并使用包含内容居中余量的 `centered` 模式；当站点存在聊天区之外的固定右栏或兄弟面板时，可以为该面板单独声明更大的计算 scope，使用 `edge` 模式只取避让面板所需的边缘余量，避免主聊天区未重叠时整段避让样式被清掉，也避免右栏被内容居中余量额外推开。

执行流程：

1. `SiteAdapter.getPanelAvoidanceConfig()` 默认返回 `null`，站点逐步 opt-in。
2. `LayoutManager.startPanelAvoidance()` 查找 Shadow DOM 内的 `.gh-main-panel`。
3. 读取 `layout.panelAvoidance[siteId].enabled`；用户关闭时停止监听并移除避让样式。
4. 视口宽度小于 `minViewportWidth` 时直接移除避让样式，避免手机和窄屏设备被进一步压缩。
5. 读取站点声明的 `scopeSelector` 作为内容区域；未声明时才退回整个 viewport。
6. 读取面板 `getBoundingClientRect()`，只计算面板与 scope 相交的左右占用区。
7. 如果 `panel.panelMode` 不是 `floating`，或面板带有 `edge-snapped-left/right` class，移除避让样式。
8. 如果面板可见宽度小于阈值，视为收起态，移除避让样式。
9. 如果 `.gh-root` 处于 `gh-pass-through` 幽灵模式，移除避让样式。
10. 将 Page Widening 的百分比宽度先换算成 scope 内的 px 宽度，再与安全区宽度取较小值。
11. 生成 `#gh-panel-avoidance-styles`，注入主文档 `document.head`。
12. 监听面板和 scope 的 resize，面板 `class/style` 变化，以及页面 resize，使用 `requestAnimationFrame` 合并更新。

安全区宽度按 scope 计算，而不是按 `100vw` 计算：

```text
safe-left = scope-left + reserved-left + left-gap
safe-right = scope-right - reserved-right - right-gap
target-width = min(page-width-in-scope, safe-right - safe-left)
```

对 DeepSeek 这类靠左右 padding 居中的页面，不平移虚拟列表，而是重分配左右 inset：

```text
left-inset = safe-left - scope-left + (safe-width - target-width) / 2
right-inset = scope-right - safe-right + (safe-width - target-width) / 2
```

## DeepSeek 试点

`demo.html` 中 DeepSeek 的实际结构：

- 左侧栏桌面宽度来自 `--sider-width: 261px`，聊天主区域在侧栏右侧。
- `.ds-virtual-list:has(.ds-message)` 是消息滚动区域，示例内 `--dsl-virtual-list-width: 2066px`，已经扣掉左侧栏。
- `.ds-virtual-list-items` 用 `padding-left/right: calc((100% - var(--message-list-max-width)) / 2)` 居中消息列。
- 输入区外层是消息虚拟列表内的 sticky 子节点，CSS 模块类名为 `_871cbca`，同样依赖 `--message-list-max-width` 和左右 padding。
- `.ds-virtual-list-visible-items` 使用 `transform: translateY(...)` 做虚拟列表定位，不能作为水平避让目标。

因此 DeepSeek 配置使用主消息滚动区作为 scope，并同时覆盖消息列表和输入区的左右 padding：

```ts
getPanelAvoidanceConfig() {
  return {
    scopeSelector: ".ds-virtual-list:has(.ds-message)",
    widthSelectors: this.getWidthSelectors(),
    insetSelectors: [
      { selector: ".ds-virtual-list:has(.ds-message) .ds-virtual-list-items" },
      { selector: ".ds-virtual-list:has(.ds-message) > div:has(textarea.ds-scroll-area)" },
    ],
    defaultWidth: "840px",
    gap: 16,
  }
}
```

`minSafeWidth` 和 `minViewportWidth` 使用 `LayoutManager` 的共享默认值。adapter 只有在站点布局确实需要不同阈值时才覆盖这些字段，避免把通用策略误写成站点特化配置。

这里不再使用 `translate`。原因是 DeepSeek 的虚拟列表内部已经用 transform 管理垂直位置，水平平移 `.ds-virtual-list-items` 或 `.ds-virtual-list-visible-items` 会导致消息区和输入区不同步，并可能把左侧内容推出可视区域。

## Doubao 适配

`doubao.html` 中 Doubao 新版结构：

- `#chat-route-layout` 声明 `--content-max-width: 800px`。
- `[data-container-name="main"]` 是扣除左侧栏后的聊天主区域。
- 消息虚拟列表在 `[class*="v_list_scroller"]` 下，消息行内容节点使用 `max-w-(--content-max-width)`。
- 输入区与消息列表同属一个内容列，输入框外层使用 `max-w-[var(--content-max-width)]` 和 `max-w-(--content-max-width)`。
- 虚拟列表行依赖 `transform: translate(...)` 做垂直定位，不能对行本身做水平位移。

因此 Doubao 配置不缩放整个 `main` flex 区域，而是：

1. 使用 `[data-container-name="main"]` 作为 scope，天然兼容左侧栏展开/收起。
2. 覆盖 `#chat-route-layout` 的 `--content-max-width`，并同步覆盖消息/输入区消费该变量的 `max-width` 节点。
3. 对同时包含虚拟列表和输入区的内容列容器增加左右 padding，让消息和输入框一起进入安全区。

## 后续已适配站点

DeepSeek 和 Doubao 之后，智能避让已经扩展到以下站点：

| 站点 | scope | 宽度策略 | inset 策略 | 默认宽度 |
| --- | --- | --- | --- | --- |
| Kimi | 聊天布局容器 | 重算内容列、消息列表、操作区和输入框 `max-width` | 对聊天主区域加左右安全区 | `800px` |
| Yuanbao | 聊天主内容区域 | 通过站点宽度 CSS 变量统一控制消息区和输入区 | 对聊天内容和输入区加左右安全区 | `960px` |
| IMA | 页面内容容器 | 分别重算回复容器和编辑器容器 `width` | 对主区域和输入容器加左右安全区 | `960px` |
| Z.ai | 聊天容器 | 避让时只重算消息宽度 | 消息容器和输入安全区加左右安全区 | `894px` |
| ChatGLM | 对话主区域 | 重算响应容器、消息容器和 Markdown 容器宽度 | 对对话内层容器加左右安全区 | `872px` |
| Qianwen | 千问左侧聊天面板 | 重算消息中心、消息滚动区变量和回答块宽度 | 对聊天内容区加左右安全区 | `800px` |
| Qwen Studio | `.chat-left-panel` | 避让时只重算消息外层宽度 | 消息滚动区和输入安全区加左右安全区 | `800px` |
| Gemini | `bard-sidenav-content` | 避让时重算消息列和输入框宽度 | 消息滚动区和输入宿主加左右安全区 | `760px` |
| ChatGPT | `main#main` | 重算消息列和输入框共用的 thread 内容宽度 | 对消息和输入区外层加左右安全区 | `768px` |
| Claude | `#main-content` | 重算嵌套 `max-w-3xl` 内容列宽度 | 对聊天滚动容器加左右安全区 | `768px` |
| AI Studio | `.chunk-editor-main` | 重算聊天列、消息 turn 和输入框宽度 | 聊天滚动区和输入区加左右安全区，右侧 Run settings 单独向左避让 | `1000px` |
| Grok | `main[data-mcp-app-fullscreen-container]` | 通过 `--content-max-width` 变量统一控制消息区和输入区 | 聊天滚动区和底部输入区加左右安全区 | `768px` |

这些站点都需要同时加入：

- `SiteAdapter.getPanelAvoidanceConfig()`
- `src/utils/storage.ts` 的 `DEFAULT_SETTINGS.layout.panelAvoidance`
- `docs/developer/settings-schema.json`
- `src/tabs/options/pages/SiteSettingsPage.tsx` 的 `PANEL_AVOIDANCE_SUPPORTED_SITE_IDS`

### Kimi

Kimi 的页面宽度由聊天布局容器、内容容器、列表容器和输入框共同约束，不能只覆盖单个消息节点。

适配策略：

- 使用聊天布局容器作为 `scopeSelector`，避免按整屏计算时忽略站点自身侧栏。
- 避让时同步覆盖内容容器、消息列表、操作区和输入框的 `max-width`。
- 对聊天主区域加 `padding-left/right`，让消息区和输入区一起进入安全区。
- 列表容器额外清掉左右 padding，避免站点原始居中 padding 和避让 inset 叠加。

### Yuanbao

Yuanbao 的消息区和输入区共享站点宽度变量，是变量型站点，优先改变量而不是逐个节点覆盖。

适配策略：

- 通过 `:root` 上的宽度变量控制最大内容宽度。
- 用 `min(100%, var(...))` 保证页面宽度控制不会让内容超出父容器。
- 对聊天内容区和输入区分别加左右安全区，保持两者位置一致。

### IMA

IMA 的回复容器和编辑器容器不是同一个宽度消费节点，需要分别声明。

适配策略：

- 使用页面内容容器作为 `scopeSelector`。
- 避让时重算回复容器和编辑器容器 `width`，并保留 `max-width: 100%`、`min-width: 0`。
- 对主区域和输入容器都加左右安全区，避免输入框留在面板下方。

### Z.ai 与 ChatGLM

这两个站点的输入框加宽曾出现“只有变窄有效、加宽被原始最大宽度卡住”的情况。避让配置需要避免把输入框也放进 `widthSelectors` 后再被较小安全宽度二次限制。

适配策略：

- Z.ai 避让时只重算消息内容宽度，输入区通过安全区 padding 跟随位置。
- ChatGLM 避让时重算响应、消息和 Markdown 容器，输入底部容器继续由页面宽度控制处理。
- 代码块、表格等宽内容需要继续使用 `width: 100%`、`table-layout: fixed` 等规则，避免避让后横向溢出。

### Qianwen 与 Qwen Studio

Qianwen 和 Qwen Studio 都存在新版 DOM 结构和嵌套宽度消费，不能简单复制旧版 `[class*="auto-center-wrapper"]` 或输入框 `max-width` 规则。

Qianwen 适配要点：

- 新版内容区使用 `#qianwen-left-panel` 作为 `scopeSelector`。
- 消息区同时覆盖 `#pc-center-wrapper`、`#message-list-scroller` 的 `--message-content-width` 以及回答块宽度。
- 输入框外层带有 inline `max-width: 800px` 和 `--chat-input-visible-shell-*` 变量。页面宽度控制需要同步覆盖这些变量。
- 避让配置不直接给输入框容器加左右 inset，避免输入框自身 `calc(100% - gutter)` 与避让 padding 叠加后被压窄。

Qwen Studio 适配要点：

- 使用 `.chat-left-panel` 作为 `scopeSelector`。
- 消息外层 `.qwen-chat-message` 原始布局带 padding/content-box，宽度控制要同时补 `width: 100%` 和 `box-sizing: border-box`。
- 避让时只重算消息宽度；输入区使用安全区 padding，避免输入框 `max-width` 被安全宽度二次卡住。

### Gemini

Gemini 标准版的消息滚动区和输入区是兄弟节点：消息列在 `infinite-scroller.chat-history` 内通过 `.conversation-container` 限宽，输入区在 `input-container` 内通过 `.input-area-container` 限宽。左侧栏外层是 `bard-sidenav-content`，适合作为避让 scope。

适配策略：

- 使用 `bard-sidenav-content` 作为 `scopeSelector`，按扣除 Gemini 左侧栏后的主内容区计算安全区。
- 避让时同时重算 `.conversation-container` 和 `.input-area-container` 的 `max-width`，让消息列和输入框使用同一个安全区目标宽度。
- 对 `infinite-scroller.chat-history` 和 `input-container` 加左右安全区，让消息区和输入区位置同步。
- 输入框外层仍保留在安全区容器内，避免只改输入框宽度但位置仍落在面板下方。

### ChatGPT

ChatGPT 新版对话页的消息列和输入区都使用 `--thread-content-max-width` 控制内容列宽度，并由带 `--thread-content-margin` 的外层节点提供左右留白。桌面宽度下站点会通过 container query 把内容列从 `40rem` 切到 `48rem`，所以避让配置需要同时覆盖消息 turn 和底部 composer 的同一套宽度消费节点。

适配策略：

- 使用 `main#main` 作为 `scopeSelector`，按 ChatGPT 左侧栏和主内容区之后的可用区域计算安全区。
- 避让时重算 `#thread` 内消费 `--thread-content-max-width` 的消息列和输入框容器，保证聊天内容和输入区宽度一致。
- 对 `#thread` 内带 `--thread-content-margin` 的外层节点加左右安全区，让消息 turn 和 composer 一起进入可见区域。
- 默认宽度使用 `768px`，对应 ChatGPT 桌面默认的 `48rem` 内容列，未开启页面宽度控制时不额外放大到整屏。

### Claude

Claude 当前对话页在 `#main-content` 内使用独立滚动容器，消息区和 sticky 输入区同属外层 `max-w-3xl` 内容列；消息 feed 内还有一层 `max-w-3xl` 用于正文和用户消息对齐。

适配策略：

- 使用 `#main-content` 作为 `scopeSelector`，按扣除 Claude 左侧栏后的主内容区计算安全区。
- 同时覆盖 `#main-content .max-w-3xl` 和旧版兜底的 `.max-w-4xl`，让消息列和输入区共享同一个目标宽度。
- 百分比页面宽度会转为基于视口的绝对上限，避免外层和内层 `max-w-3xl` 叠加后层层收缩。
- 只对 `[data-autoscroll-container="true"]` 加左右安全区，让滚动内容、消息列和 sticky 输入区一起进入可见区域，避免单独给输入区再加 padding 造成输入框比消息列更窄。
- 默认宽度使用 `768px`，对应 Claude 当前 `max-w-3xl` 的桌面内容列。

### AI Studio

AI Studio 的页面是三栏结构：左侧导航在 `layout-wrapper` 外侧，聊天主区域是 `section.chunk-editor-main`，右侧 Run settings 面板是 `ms-right-side-panel`，与聊天主区域同属 `ms-chunk-editor` 的兄弟节点。智能避让不能把整个 `layout-main` 当作可用区域，否则右侧 Run settings 的 300px 宽度会被误算进聊天安全区。

适配策略：

- 使用 `.chunk-editor-main` 作为主 `scopeSelector`，让右侧 Run settings 面板自然从聊天可用宽度中扣除。
- 避让时同时重算 `.chat-session-content`、`.chat-turn-container` 和底部 `footer ms-prompt-box` 的 `max-width`，保证消息区和输入框宽度一致。
- 对 `.chat-container .chat-view-container` 和 `footer` 加左右安全区，避免只移动消息列表而输入框仍停在面板下方。
- 右侧 `ms-right-side-panel` 使用 `ms-chunk-editor` 作为独立计算 scope，并用 `edge` 模式只应用右侧 `margin-right`，让 Run settings 自身也能从 Ophel 面板下方移开。
- 表格继续保持 `width: 100%` 和 `min-width: 100%`，避免页面加宽或避让后表格仍按内容宽度收缩。

### Grok

Grok 的消息列和底部输入区共享 `--content-max-width`、`--content-breakout-max-width` 这组变量；消息 turn、输入框外层再通过 `max-w-[--content-max-width]` 或 `max-w-breakout` 消费它。适配时不能直接命中内部消费节点，否则百分比宽度会在嵌套 max-width 中反复收缩。

适配策略：

- 使用 `main[data-mcp-app-fullscreen-container]` 作为 `scopeSelector`，按扣除 Grok 左侧栏后的主内容区计算安全区。
- 避让时只覆盖定义 `--content-max-width` 的外层变量节点，复用页面宽度控制里避免百分比叠缩的转换逻辑。
- 对聊天滚动区和底部 `max-w-breakout` 输入宿主加左右安全区；输入宿主在避让时放开自身 `max-width`，由内部输入框继续消费 `max-w-breakout`，避免安全区 padding 把输入框压窄。
- 默认宽度使用 `768px`，对应 Grok 桌面最大内容列 `48rem`，未开启页面宽度控制时不额外放大。

## 后续适配建议

优先级建议：

1. Gemini Enterprise：需要验证第三方 Shadow DOM 注入。

每个站点适配前先确认：

- 站点内容列是否有稳定 selector 可作为 scope。
- 宽度是 `max-width`、`width`、CSS 变量，还是左右 padding 控制。
- 目标节点是否使用 `transform` 做虚拟滚动或动画；这类节点不要做水平 `translate`。
- 输入区是否和消息区共享同一宽度变量；如果不共享，需要单独加入 `insetSelectors` 或 `widthSelectors`。
- 站点是否有侧边栏；有侧边栏时必须用内容 scope，不能按 `100vw` 直接计算。

## 验证清单

DeepSeek 试点至少验证：

- 默认页面宽度，右侧 Ophel 面板展开时内容进入左侧安全区。
- 开启 Page Widening 后，正文和输入区都不在面板下方。
- 浏览器缩到半屏时，仍按聊天主区域而不是整屏计算。
- Ophel 面板宽度调整后，安全区同步更新。
- DeepSeek 左侧栏展开/收起后，scope 尺寸变化能同步更新。
- 视口宽度小于共享默认窄屏阈值 768px 时，不注入避让样式。
- 关闭“避让 Ophel 面板”设置后，当前页面立即移除避让样式。
- 面板从右侧切到左侧后，内容反向避让。
- 自动吸附模式下，面板 hover 展开和移走收起都不注入避让样式。
- 长按 Ctrl/Command 进入幽灵模式时，避让样式移除；松开后恢复。
- 扩展版与油猴版均能构建通过。

## 风险

- DeepSeek 如果调整消息列表和输入区的父子关系，composer selector 需要更新。
- 安全区小于 `minSafeWidth` 时当前策略会停止避让，不做自动收起；这是第一阶段有意保留的边界。
- 不同站点可能需要 `insetSelectors`、`widthSelectors` 或二者组合，不能直接复制 DeepSeek 配置。
