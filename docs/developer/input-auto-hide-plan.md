# 清洁模式占位保留与输入框自动隐藏：技术方案

> 状态：进行中工作。两项功能全部落地并稳定后，本文档可删除，机制性结论沉淀到 `architecture.md` / `css-architecture.md`。
>
> 证据来源：`Screen Recording 2026-09-16 at 11.36.42.mov` 逐帧分析 + Better Gemini 扩展（Chrome 商店 ID `hfibhochkdlciljpgbghdmianhbgenab`）CRX 解包源码（`content.css` / `content.js` / `shared.js`）。

## 1. 背景与目标

对比 Better Gemini 的两个能力，Ophel 需要补齐：

1. **清洁模式隐藏 AI 声明时不改变布局占位。** 现状：清洁模式隐藏 Gemini 底部 `hallucination-disclaimer` 等声明后，输入框因布局自动补位而下移。目标：隐藏但保留原占位，输入框位置不动。
2. **输入框自动隐藏。** 闲置时输入框隐藏、原位置让给聊天文字；鼠标移到附近、`Alt+I` 聚焦、插入提示词时重新显示。目标：统一机制，首发仅 Gemini，验证无误后再推广。

## 2. 方案一：清洁模式 `preserveFlow`（保留占位的隐藏）

### 2.1 根因

`LayoutManager.generateCleanModeCSS()`（`src/core/layout-manager.ts`）对 `cleanMode.hide` 中所有选择器一律生成 `display: none !important`，元素被移出布局流。Gemini 底部区域为底部锚定布局，声明元素被删后输入框自然下沉补位。

Better Gemini 的做法是 `display: none` 之后给 `input-container` 补 `margin-bottom: 20px` 硬顶回原位——魔法数字，不采用。

### 2.2 机制设计

在适配器侧 `ZenModeConfig`（`src/adapters/base.ts`）新增字段：

```ts
export interface ZenModeConfig {
  hide?: string[]
  /** 仅在视觉上隐藏但完整保留物理占位与间距（如底部免责声明），避免输入框贴底 */
  preserveFlow?: string[]
  rootClass?: ZenModeRootClassConfig
  styles?: ZenModeStyleRule[]
}
```

`LayoutManager` 的 `generateCleanModeCSS()` / `generateZenModeCSS()`（禅模式合并清洁模式列表，需同步处理）对 `preserveFlow` 生成：

```css
<selector> {
  visibility: hidden !important;
  pointer-events: none !important;
  user-select: none !important;
}
```

`visibility: hidden` 保留元素盒模型占位，不参与命中测试，正是"隐藏但不改变占位"的语义。`hide`（回收空间）与 `preserveFlow`（保留占位）并存，按元素语义选择：横幅、upsell 按钮等留在 `hide`；输入框下方参与布局的声明挪入 `preserveFlow`。

### 2.3 配置迁移

首批迁移的内置站点（各站 `*-config.ts` 的 `cleanMode`，并递增对应 `*_CONFIG_VERSION` 使旧缓存 patch 失效）：

| 站点 | 从 `hide` 挪入 `preserveFlow` |
| --- | --- |
| Gemini | `hallucination-disclaimer` 等 8 个声明类选择器 |
| AI Studio | `ms-hallucinations-disclaimer` |
| ChatGPT | `[data-testid='thread-disclaimer']` |
| Claude | `[data-disclaimer="true"]` |
| ChatGLM | `.policy-wrap, .policy-wrap *` |
| Doubao | `.container-qOgFQp` |
| Ima | `[class*="footTips"]` |
| Kimi | `.chat-bottom .legal-footer, .legal-footer` |
| Yuanbao | `.agent-dialogue__content-copyright` |

### 2.4 与自动隐藏的联动

开启输入框自动隐藏后，输入框脱离文档流（见 §3），声明是否回收空间不再影响输入框位置。此时 `hide` 与 `preserveFlow` 的差异只剩"底部是否留一条空白带"，两个功能互不阻塞、可独立上线。

## 3. 方案二：输入框自动隐藏（浮层化 + 占位释放）

### 3.1 Better Gemini 机制拆解（源码级）

- 输入容器（`input-container:has(> fieldset:not(.is-zero-state))`）改为 `position: fixed` 浮层，JS 量出自然位置的 `top/left/width/底部留白` 写入 CSS 变量；内部布局完全不动。
- 隐藏态：`transform: translateY(calc(100% + 28px)); opacity: 0.01; pointer-events: none;`，300ms 过渡；`:focus-within` 强制显示。
- 滚动容器内追加一个隐形 spacer div（33px，配合隐藏声明时 66px），保持滚动度量稳定、最后一条消息不贴屏幕底边。
- 聊天容器 `min-height: 0` 释放、底部渐变遮罩关闭，文字贯通到底。
- 显示/隐藏判定：`pointermove` 距视口底 ≤210px 显示、≥390px 隐藏（迟滞 + 50ms 节流）；`focusin/focusout` 同步；触屏设备（`pointer: coarse`）永不隐藏。
- 重同步：ResizeObserver 观察输入容器、window resize、MutationObserver 侦测 SPA 重建 DOM；测量前临时移除浮层类并强制 reflow 读取自然位置。

> 实现教训（已修复）：**ResizeObserver 不能在每次测量后 disconnect + 重挂**。重挂会重置上报基线，对每个"新"观察目标必投一次初始通知，形成 测量→重挂→初始通知→防抖重测量 的自激回路（约 8Hz），表现为输入框快速跳变。正确做法：同一容器元素只观察一次，仅容器身份变化时重挂；测量在同一任务内摘/挂浮层类，帧末尺寸净变化为零，不会触发自通知。

> 实现教训（已修复）：**document 级监听必须过滤 Ophel 自身 UI 的事件**。`focusin`/`focusout`/`input`/`pointermove` 均为 composed 事件，穿透 Shadow DOM 后 target 被重定向为宿主元素（`plasmo-csui` / `#ophel-userscript-root` 等）。不过滤时，面板内的聚焦、打字、悬停会被当成页面交互驱动输入框显隐，造成与 Ophel UI 交互时输入框闪现。约定见下条：冻结而非重估。

> 实现教训（已修复）：**DOM 聚焦不能单独作为唤出信号**。`:focus-within` 是纯 CSS 状态、focusin/focusout 不产生 DOM 变更，两者都绕过了基于 MutationObserver 的排查手段。Gemini 会在窗口重获焦点、编辑器失焦后做程序化 focus（自动重聚焦），无门槛的 `container:focus-within { 强制显示 }` 规则会被这些焦点抖动触发，表现为切回标签页、与 Ophel UI 交互时输入框闪现（此时 Ophel 侧事件与页面焦点发生拉锯）。正确做法：删除 CSS 的 `:focus-within` 兜底，JS 侧聚焦唤出必须紧跟真实页面手势（pointerdown/keydown 时间窗内才落闩）；草稿与指针接近仍是独立唤出通道。

> 实现教训（已修复）：**显隐决策不能对每个原始事件立即应用——冻结 + 显示立即/隐藏防抖**。页面获得焦点、弹出/关闭 Ophel 设置弹窗、插入提示词填变量时的"极速闪现"根因是结构性的：一次用户动作会扇出成一串时序不同的求值（focusin 同步、focusout 延迟一拍、pointermove 节流 50ms、window blur、input 捕获），各自拿着不同的输入（陈旧 lastPointer vs 无指针、门闩刚被清除）得出相反结论，而每次翻转都播 300ms transform/opacity 过渡。逐事件立即应用 = 闪现。正确做法（`updateAutoHideVisibility` 为唯一决策入口）：
>
> 1. **冻结**：指针悬停在 Ophel UI 上、焦点在 Ophel UI 内、或窗口失焦（`document.hasFocus()` 为 false）时保持现状不做任何翻转——此前"指针进 Ophel UI 按离开页面隐藏 / 焦点进 Ophel UI 按无指针重估隐藏"正是开弹窗时输入框滑走、弹窗边缘鼠标移动时来回闪的直接原因；
> 2. **门闩跨窗口失焦与 Ophel UI 焦点保留**：focusout 延迟判定中，仅焦点落到页面其他元素才清门闩；切窗口/开关弹窗后编辑器重聚焦即恢复原显隐，全程零翻转；
> 3. **显示立即、隐藏防抖**：显示结论立即生效并取消待隐藏；隐藏结论须在 `AUTO_HIDE_HIDE_DELAY_MS`（200ms）内持续成立才落地，抖动窗口内的相反结论取消它，一连串矛盾求值被收敛为一次最终状态。
>
> 门闩保留方案依赖的 Chrome 事件时序已用 Playwright + CDP（`Emulation.setFocusEmulationEnabled`）实测：窗口失焦时 `focusout`（activeElement）先于 `window blur` 派发，且两个时刻 `document.hasFocus()` 均已为 false（含 setTimeout 延迟判定），focusout 延迟判定可可靠识别窗口失焦；重获焦点时 `window focus` 先于 activeElement 的 `focusin` 派发，DOM 焦点全程保留在编辑器上。

> 实现教训（已修复，真实浏览器复现确认）：**摘/挂浮层类会重置 transition，每次重测量都把隐藏动画从头重播——这是"干什么都闪"的最终根因**。`syncAutoHideLayout` 测量前摘浮层类、强制 reflow、再挂回；强制 reflow 会把"无浮层"的中间计算样式（transform: none、opacity: 1）提交为 transition 起点，任务末重挂类后浏览器从可见态重新播 300ms 隐藏动画。于是任何触发重测量的页面动态（Angular 重渲染、流式输出、布局抖动、RO 初始通知）都表现为输入框重新出现再滑出。修复（已用 Playwright + 真实扩展构建 + 模拟 Gemini DOM 验证）：①测量全程在 `<html>` 挂 `gh-ahi-no-anim`（`transition: none !important`），且**重挂浮层类后、摘 no-anim 前再强制一次 reflow 提交最终样式**，否则中途提交的中间态仍会成为动画起点；②可见态改为纯自然文档流（不浮层、不测量、不挂类），仅隐藏态浮层化，显示过渡结束 350ms 后摘浮层类落回文档流——可见时页面任何动态都碰不到输入框。
>
> 复现环境备注：Plasmo CSUI 宿主内的全屏遮罩（如首启免责声明 `disclaimer-modal-overlay`、各类模态框）是 `pointer-events: auto`，命中测试会把全视口的指针事件重定向到宿主，`isOphelUiEvent` 全部判为 Ophel UI（此时冻结显隐正是期望行为）。用全新 profile 复现时必须先置 `hasAgreedToTerms: true`，否则免责声明遮罩一直盖住页面，所有指针交互都被冻结逻辑吞掉。

> 实现教训（已修复）：**草稿出现要压倒冻结立即唤出**。插入无变量提示词后 toast 已提示"已插入"但输入框要等用户移动鼠标才出现（感知 3-4 秒）：指针冻结是粘性的，插入动作发生在 Ophel UI 内、不落手势门闩，insertPrompt 写入编辑器后的 input 事件虽到场，但冻结把整个求值挡在门外。修复：`updateAutoHideVisibility` 先查草稿再查冻结——页面草稿是明确的输入意图，直接解除指针冻结并唤出。
>
> 性能备注：MutationObserver 回调在每次 childList 变异批次都触发（流式输出期间很频繁），`:has()` 重校验只在容器断连或容器自身/父链/子树结构变化时执行，无关区域的变异只做几次 `contains()` 引用比较；容器不存在时只在有新节点加入的批次才调度重解析。可见态零测量零布局写入，整套机制对页面的持续开销约等于几次属性比较。

> 实现教训（已修复）：**滚动末尾占位不能用真实 DOM 节点注入站点滚动容器**。初版 spacer 是 appendChild 到滚动容器的隐形 div——对 Gemini 的 `infinite-scroller` 可用，但很多站点用虚拟滚动/框架 reconcile 严格管理子节点，外来 DOM 节点会干扰索引渲染、被站点脚本移出或触发多余的 MutationObserver 批次。修复：占位改为注入样式表里的 `scrollContainer::after` 伪元素（挂 `gh-ahi-float` 类作用域），伪元素不是 DOM 节点，站点的 children 枚举、reconcile、MutationObserver 全部看不到它，对虚拟滚动列表免疫；未配置 `scrollContainer` 的站点不占位，行为显式。例外边界：站点滚动容器自身已占用 `::after` 时会样式竞争，用 `spacerHeight: 0` 在配置级关闭占位即可。
>
> 配套加固（同批落地）：草稿判定从 LayoutManager 下沉为 `SiteAdapter.hasInputDraft()` 可覆写钩子（站点差异回到适配器层）；迟滞带改为双重防护——校验器拒绝 `hideDistancePx <= revealDistancePx` 且强制 `container` 必填，运行时用 `Math.max(hide, reveal + 1)` 钳制，SitePack 配错也不可能消掉迟滞让抖动回归。

### 3.2 Ophel 通用机制

站点差异收敛为适配器声明，机制全部沉淀在 `LayoutManager`（与 zen/clean 同处，复用样式注入与 Shadow DOM 注入链路）：

```ts
export interface AutoHideInputConfig {
  /** 输入区域整体容器选择器；应自带"活跃输入"判定（如 Gemini 排除新对话页零态居中输入） */
  container: string
  /** 滚动容器选择器（可逗号列表），以 ::after 伪元素在滚动末尾占位；缺省不占位 */
  scrollContainer?: string
  /** 滚动容器内占位 spacer 高度 px，缺省 33 */
  spacerHeight?: number
  /** 指针距视口底部 <= 该值时显示输入框，缺省 210 */
  revealDistancePx?: number
  /** 指针距视口底部 >= 该值时隐藏输入框，须大于 revealDistancePx 形成迟滞，缺省 revealDistancePx + 180 */
  hideDistancePx?: number
  /** 隐藏态在容器自身高度之外额外下移的偏移 px，缺省 28 */
  hiddenOffsetPx?: number
  /** 浮层 z-index，缺省 30 */
  zIndex?: number
  /** 站点附加规则（如释放会话容器 min-height、关闭底部渐变遮罩） */
  styles?: ZenModeStyleRule[]
}

// SiteAdapter 基类默认返回 null = 不支持；子类按需覆盖
getAutoHideInputConfig(): AutoHideInputConfig | null

// 草稿判定（明确的输入意图，驱动立即唤出）；默认按编辑器文本非空判定，
// 编辑器有预填内容/占位文本残留的站点覆写本方法，否则会永不隐藏
hasInputDraft(): boolean
```

工作流程：

1. `updateAutoHideInput(enabled)` 由 `modules-init.ts` 按站点设置驱动（含热更新路径）。
2. 启用时：注入宿主样式（`<html>` 挂 `gh-auto-hide-input` 类作用域）→ 挂监听与 observer。**可见态保持纯自然文档流**（不浮层、不测量）；只有判定隐藏时才测量自然位置并浮层化（挂 `gh-ahi-float`，写 CSS 变量）。
3. 隐藏判定（`setAutoHideHidden` 唯一出口）：指针距视口底迟滞显隐；真实页面手势后的 `focusin` 落闩唤出；**输入框已有未发送内容时强制显示**（监听 `input` 事件，优于 Better Gemini 的行为）。显示过渡结束后摘浮层类落回文档流；隐藏态的重测量全程挂 `gh-ahi-no-anim` 关闭过渡。
4. 滚动末尾占位用注入样式表里的 `scrollContainer::after` 伪元素（挂 `gh-ahi-float` 类作用域，只在浮层化期间生效），**不往站点滚动容器注入真实 DOM 节点**：伪元素不进站点的 children/reconcile 范围、不触发 MutationObserver，对虚拟滚动列表安全。停用时全部清理（监听器、observer、CSS 变量、样式标签）。

既有基建的直接复用：

- `Alt+I` 聚焦（`useShortcuts.ts` 的 `focusInput`）与各适配器 `insertPrompt()` 先 `editor.focus()` 的实现，使"聚焦/插入提示词时显示"由 `:focus-within` 免费覆盖——前提是隐藏态用 transform+opacity 而非 `display:none`（元素保持可聚焦）。
- 滚动末尾占位只需站点在配置里给出 `scrollContainer` 选择器；草稿判定收敛在 `SiteAdapter.hasInputDraft()`（默认按编辑器文本非空判定），有预填内容的站点覆写该方法即可。
- 设置形态与 `cleanMode` 同构：`layout.autoHideInput: Record<string, { enabled: boolean }>`，接入 `DEFAULT_SETTINGS`、`settings-normalize`、`settings-selectors`、备份恢复（随 layout 整体序列化，无额外迁移）。

### 3.3 联动与边界

- **面板避让 / 页面宽度 / 用户问题宽度**：这些功能改变输入框位置或宽度，其应用路径末尾追加一次防抖重测量（与 `schedulePanelAvoidanceUpdate` 同节奏）。
- **SPA 换 DOM**（发送消息后输入框重建、新对话页切换）：MutationObserver 侦测容器断连，防抖后重新测量挂载；零态居中输入不浮层化（选择器自带排除）。
- **触屏设备**：`pointer: coarse` 时永不隐藏，避免无 hover 场景下输入框不可达。
- **指针移出窗口**：鼠标从视口内移出窗口（窗口仍聚焦）后不再有 `pointermove`，`lastPointer` 停留在移出前的位置；若停在底部显示区，输入框会保持显示。这是有意的 fail-visible 方向（宁可不藏、绝不误藏），切窗口/失焦路径由 window blur 冻结逻辑接管。
- **双平台**：不依赖扩展专有 API，扩展与油猴共用同一代码路径；样式注入走 `document.head`，Shadow DOM 注入沿用 `refreshShadowInjection` 路径。
- **首发放量**：仅 Gemini 适配器返回配置；站点设置页开关用站点白名单（同 `PANEL_AVOIDANCE_SUPPORTED_SITE_IDS` 模式）门控，其余站点不显示入口。

## 4. SitePack（JSON 适配包）可行性分析

结论：**两个能力都可以对 SitePack 开放，均为纯声明式扩展，不需要函数字段。**

- **`preserveFlow`**：天然可用。`ZenModeConfig` 是声明式配置面的一部分，`validate.ts` 的选择器数组校验与 `registry/schema/site-pack.schema.json` 的 `zenMode` 定义同步加入 `preserveFlow` 字段后，JSON 包即可声明。本方案将其纳入第一批改动。
- **自动隐藏输入框**：机制在核心侧，SitePack 只需声明 `autoHideInput: { container, scrollContainer?, spacerHeight?, styles? }` 配置块。`container` 为必填（校验器强制），`hideDistancePx` 必须大于 `revealDistancePx`（校验器与运行时双重防护，迟滞带是防抖动的硬前提）。字段全部为字符串/数字/结构化样式规则，可 JSON 序列化、可被现有 `validateSelectorString` / `validateZenStyle` 体系校验。
- **约束与风险**（开放前需逐站验证）：
  - 站点输入框必须是底部停靠布局；居中零态输入需在选择器层排除，否则浮层化后位置异常。
  - `container` 必须选中"整体容器"而非输入框本身，否则浮层后工具行、附件预览等残留原位。
  - 输入框位于 Shadow DOM 内的站点不支持（测量与 `position: fixed` 坐标系跨 Shadow 边界不可靠），选择器解析不到时功能自动关闭。
  - 依赖 `:has()` 的排除写法不新增浏览器基线负担（项目现有配置已大量使用 `:has()`）。
  - 零态/活跃态切换必须伴随 DOM 重建。重同步的 MutationObserver 只观察 `childList`，不观察属性变化：站点若原地切换 class（如 `is-zero-state`）而不重建输入区 DOM，`:has()` 匹配状态的变化不会被侦测，浮层状态会滞留到下一次 childList 变异或 resize 才纠正。接入新站点时需实测确认该站点的页面切换是 DOM 重建式（Gemini 是）。

## 5. 普适性论证

站点间差异（输入框 DOM 结构、停靠方式、零态页面、滚动容器）全部收敛到声明字段（`container` / `scrollContainer` / `spacerHeight` / `styles`）加 1 个可覆写适配器钩子（`hasInputDraft()`，编辑器有预填内容的站点用）。核心机制（测量、浮层、迟滞显隐、聚焦兜底、内容兜底、observer 重同步、伪元素占位）不写任何站点名。新站点接入 = 适配器返回一个配置对象加实测验证；SitePack 接入 = JSON 增加一个配置块。

## 6. 实施拆分

| 分支 | 内容 | 验证 |
| --- | --- | --- |
| `docs/input-auto-hide-plan` | 本文档 | docs-only，CI 按 paths-ignore 跳过 |
| `feat/clean-mode-preserve-flow` | 方案一全部内容（机制 + 9 站配置迁移 + 版本递增 + 测试 + changelog） | format / lint / typecheck / test / registry:validate / build |
| `feat/gemini-auto-hide-input` | 方案二全部内容（机制 + Gemini 首发 + 设置/UI/i18n 11 语言 + changelog），基于上一分支 | 同上 + `build:userscript`（触及核心初始化与样式注入） |

PR 均创建为 Draft。
