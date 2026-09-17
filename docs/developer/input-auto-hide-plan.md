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

### 3.2 Ophel 通用机制

站点差异收敛为适配器声明，机制全部沉淀在 `LayoutManager`（与 zen/clean 同处，复用样式注入与 Shadow DOM 注入链路）：

```ts
export interface AutoHideInputConfig {
  /** 输入区域整体容器选择器；应自带"活跃输入"判定（如 Gemini 排除新对话页零态居中输入） */
  container: string
  /** 滚动容器内占位 spacer 高度 px，缺省 33 */
  spacerHeight?: number
  /** 站点附加规则（如释放会话容器 min-height、关闭底部渐变遮罩） */
  styles?: ZenModeStyleRule[]
}

// SiteAdapter 基类默认返回 null = 不支持；子类按需覆盖
getAutoHideInputConfig(): AutoHideInputConfig | null
```

工作流程：

1. `updateAutoHideInput(enabled)` 由 `modules-init.ts` 按站点设置驱动（含热更新路径）。
2. 启用时：注入宿主样式（`<html>` 挂 `gh-auto-hide-input` 类作用域）→ 测量并浮层化（挂 `gh-ahi-float`，写 CSS 变量）→ 挂监听与 observer。
3. 隐藏判定（挂/摘 `gh-ahi-hidden`）：指针距视口底迟滞显隐；容器 `:focus-within`（CSS 层兜底）+ `focusin`（JS 层立即响应）；**输入框已有未发送内容时强制显示**（监听 `input` 事件，优于 Better Gemini 的行为）。
4. 滚动容器末尾维护 spacer div；停用时全部清理（监听器、observer、spacer、CSS 变量、样式标签）。

既有基建的直接复用：

- `Alt+I` 聚焦（`useShortcuts.ts` 的 `focusInput`）与各适配器 `insertPrompt()` 先 `editor.focus()` 的实现，使"聚焦/插入提示词时显示"由 `:focus-within` 免费覆盖——前提是隐藏态用 transform+opacity 而非 `display:none`（元素保持可聚焦）。
- 滚动容器复用 `SiteAdapter.getScrollContainer()` 的通用回退链。
- 设置形态与 `cleanMode` 同构：`layout.autoHideInput: Record<string, { enabled: boolean }>`，接入 `DEFAULT_SETTINGS`、`settings-normalize`、`settings-selectors`、备份恢复（随 layout 整体序列化，无额外迁移）。

### 3.3 联动与边界

- **面板避让 / 页面宽度 / 用户问题宽度**：这些功能改变输入框位置或宽度，其应用路径末尾追加一次防抖重测量（与 `schedulePanelAvoidanceUpdate` 同节奏）。
- **SPA 换 DOM**（发送消息后输入框重建、新对话页切换）：MutationObserver 侦测容器断连，防抖后重新测量挂载；零态居中输入不浮层化（选择器自带排除）。
- **触屏设备**：`pointer: coarse` 时永不隐藏，避免无 hover 场景下输入框不可达。
- **双平台**：不依赖扩展专有 API，扩展与油猴共用同一代码路径；样式注入走 `document.head`，Shadow DOM 注入沿用 `refreshShadowInjection` 路径。
- **首发放量**：仅 Gemini 适配器返回配置；站点设置页开关用站点白名单（同 `PANEL_AVOIDANCE_SUPPORTED_SITE_IDS` 模式）门控，其余站点不显示入口。

## 4. SitePack（JSON 适配包）可行性分析

结论：**两个能力都可以对 SitePack 开放，均为纯声明式扩展，不需要函数字段。**

- **`preserveFlow`**：天然可用。`ZenModeConfig` 是声明式配置面的一部分，`validate.ts` 的选择器数组校验与 `registry/schema/site-pack.schema.json` 的 `zenMode` 定义同步加入 `preserveFlow` 字段后，JSON 包即可声明。本方案将其纳入第一批改动。
- **自动隐藏输入框**：机制在核心侧，SitePack 只需声明 `autoHideInput: { container, spacerHeight?, styles? }` 配置块 + 能力标记（如 `auto-hide-input` capability，参考 `zen`/`clean` 的 schema 条件约束）。字段全部为字符串/数字/结构化样式规则，可 JSON 序列化、可被现有 `validateSelectorArray` / `validateZenMode` 体系校验。
- **约束与风险**（开放前需逐站验证）：
  - 站点输入框必须是底部停靠布局；居中零态输入需在选择器层排除，否则浮层化后位置异常。
  - `container` 必须选中"整体容器"而非输入框本身，否则浮层后工具行、附件预览等残留原位。
  - 输入框位于 Shadow DOM 内的站点不支持（测量与 `position: fixed` 坐标系跨 Shadow 边界不可靠），选择器解析不到时功能自动关闭。
  - 依赖 `:has()` 的排除写法不新增浏览器基线负担（项目现有配置已大量使用 `:has()`）。

## 5. 普适性论证

站点间差异（输入框 DOM 结构、停靠方式、零态页面、滚动容器）全部收敛到 3 个声明字段（`container` / `spacerHeight` / `styles`）加 1 个通用回退（滚动容器）。核心机制（测量、浮层、迟滞显隐、聚焦兜底、内容兜底、observer 重同步、spacer）不写任何站点名。新站点接入 = 适配器返回一个配置对象加实测验证；SitePack 接入 = JSON 增加一个配置块。

## 6. 实施拆分

| 分支 | 内容 | 验证 |
| --- | --- | --- |
| `docs/input-auto-hide-plan` | 本文档 | docs-only，CI 按 paths-ignore 跳过 |
| `feat/clean-mode-preserve-flow` | 方案一全部内容（机制 + 9 站配置迁移 + 版本递增 + 测试 + changelog） | format / lint / typecheck / test / registry:validate / build |
| `feat/gemini-auto-hide-input` | 方案二全部内容（机制 + Gemini 首发 + 设置/UI/i18n 11 语言 + changelog），基于上一分支 | 同上 + `build:userscript`（触及核心初始化与样式注入） |

PR 均创建为 Draft。
