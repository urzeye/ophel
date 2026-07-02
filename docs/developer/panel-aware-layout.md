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

## 后续适配建议

优先级建议：

1. ChatGPT：复用已有 `getWidthSelectors()`，吸收 PR #722 的可见面板判断，不新增 content script。
2. Claude：主内容列选择器较集中，适合第二个验证站点。
3. Gemini / Gemini Enterprise：需要同时验证普通 DOM 与第三方 Shadow DOM 注入。
4. Grok / Qwen Studio：存在 CSS 变量或嵌套宽度消费，适配时优先只改外层变量，避免层层百分比收缩。

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
