
**结论：** 产品分层清楚、近期修过一批长会话导出和面板无障碍，但当前仍有几条会直接伤数据或误发送的逻辑缺陷；UI 上最大的问题是「弹层跑出 Shadow DOM、主题/样式接不上」和「键盘/读屏在高频操作上仍不完整」。下面按严重度排，都对过现码。

这次是静态审查（对照源码、`DESIGN.md`、开放 Issue、既有审计文档），没有在真实 ChatGPT/Gemini 页面里点一遍。运行时复现需要装扩展后走站点。

---

## 总体判断

基础架构是对的：适配器管站点差异，core 管跨站能力，platform 管扩展/油猴，面板跑在 Shadow DOM。问题主要来自功能堆出来的复杂度，而不是方向错了。

已经补上的：

- 设置弹窗有 `role="dialog"`、焦点陷阱、Esc、关闭后还焦点
- 主面板 Tab 有 `tablist` / 方向键 / Home / End
- 三个 Tab 开始共用 `gh-panel-*` 工具栏类
- ChatGPT 长会话导出不再完全静默漏段（会提示不完整）
- 历史「改设置把主题打回 `_default`」那条硬编码已修

还没收口的，按用户能感知的程度分三档。

---

## P1：会丢数据、误发送、或可打进页面的问题

### 1. 扩展存储失败被当成「没有数据」

`src/stores/chrome-adapter.ts` 的 `getItem` / `setItem` / `removeItem` 都不读 `chrome.runtime.lastError`。`get` 失败时回调是空对象，代码把 `undefined` 当成「无持久化数据」并 `resolve(null)`。`set` 配额满或上下文失效也会 `resolve()`，Zustand 以为写成功。

热更新、临时失效、配额错误时，persist 会按空存储水合出默认设置/空会话/空提示词；用户再改任一设置，整份默认对象写回去，覆盖真实数据。油猴路径会 throw，扩展路径是静默伪成功。

### 2. 队列 `sending` 项会绕过「输入框已有内容」保护

`src/core/queue-dispatcher.ts` 的 `tick()` 对 `status === "sending"` 先于 `hasEditorContent()` 处理。`isItemContentInEditor()` 用双向 `includes`：编辑器内容包含队列项、或队列项包含编辑器内容，都算命中。匹配后 `recoverSendingItem` 会再 `insertPrompt` + `submitPrompt`。

发送确认失败后条目停在 `sending`。用户在同一输入框继续改字（「hello」→「hello 再补一句」）仍命中 `includes`。约 2 秒空闲后调度器会把内容写回并发出去。队列开启时 `runWhenHidden: true`，后台标签页也会跑。

### 3. Grok 插入提示词未转义，直接写 `innerHTML`

```1337:1340:src/adapters/grok.ts
if (editor.getAttribute("contenteditable") === "true") {
  editor.innerHTML = `<p>${content}</p>`
```

ChatGPT 同路径有 `escapeHtmlForInsert`，Grok 没有。提示词库、引用选区、队列内容都可以带 HTML。这是 grok.com 页面上下文里的 XSS 入口。

### 4. 提示词队列浮层：样式和主题都可能接不上

设计意图是挂到 `.gh-root` 以读取主题变量：

```499:499:src/components/QueueOverlay.tsx
const targetContainer = document.querySelector(".gh-root") || document.body
```

`.gh-root` 在 Shadow DOM 里，`document.querySelector` 穿不透，实际会落到 `document.body`。

同时：

- `src/contents/ui-entry.tsx` 的 `getStyle()` 只合并了 `style.css` / `conversations.css` / `release-notes.css` / `settings.css`
- 油猴 `vite.userscript.config.ts` 的样式包同样不含 `queue-overlay.css`
- 主题变量写在 Shadow `:host`，自定义主题更不会到 `document.body`

结果：队列胶囊/面板容易掉回浅色 fallback，和当前 24 套主题对不上；油猴端样式文件本身就没打进包。

---

## P2：用户能稳定碰到的功能缺陷

### 5. 大纲跨回合层级错位仍未修

`docs/developer/outline-hierarchy-issue.md` 的方案 C 没落地。`outline-manager.ts` 的 `buildTree` 只按 `relativeLevel` 回溯，不用 `msgId`。隐藏用户提问时，第 2 轮 H3 会挂到第 1 轮 H1 下面，点大纲会跳到另一段对话。

树缓存键也只拼 `text + isBookmarked`，不含 `level` / `id`。流式生成中标题从 h2 变成 h3 时，缩进会冻在旧层级，直到换会话。

### 6. 吸附面板 + 中文输入法：搜索时面板会缩回去（#753）

`useEdgePeekController.ts` 用 `focusout` 清 `isInputFocusedRef`，`mouseleave` 200ms 后按 `:hover` 决定是否缩回。IME 候选框出现时常见两件事同时发生：输入框 `focusout`，指针离开面板落到候选窗。没有 `compositionstart` / `compositionend` 保护。

这和 #753 的报告一致：微软拼音/搜狗输入中文会自动吸附回去，英文不会；点固定面板可绕过。默认模式已改成悬浮，但选「自动吸附」的用户仍会踩到。

### 7. ChatGPT 空闲观察器 + 内存残留（#787 / #889）

`chatgpt-perf-manager.ts` 在流式优化开启时（默认开）对 `document.body` 做 `subtree + characterData: true`，空闲也一直开。`network-monitor.ts` 会对匹配的 fetch `response.clone()` 再读完整段 body。大纲 item cache 按会话累加，只在换会话清空。

#889 页内收藏触发展开提问文本，changelog 写了未发布修复，Issue 仍开着。#787 油猴闲置 15–20% CPU/GPU 仍然对得上：URL 1s 轮询、会话 3s 轮询、油猴挂载 2s interval、Shadow 表格 1s 扫描、Mermaid 2s rescan、工具箱打开时无限旋转、部分主题背景无限动画。

### 8. DeepSeek 长会话导出仍用 overlap 合并

ChatGPT/豆包主路径已有挂载确认和完整性提示。DeepSeek 主路径仍是步进扫描 + `mergeExportMessageBatch`；AI Studio/豆包锚点失败时还会退回盲扫。批次缺头/尾会整批 append（重复）或对不上（漏段）。

### 9. 设置跨上下文同步会丢 100ms 内的本地写入

Options 页写入触发 `onChanged` 后，`settings-store.ts` 把 `isUpdatingFromStorage = true`，`setTimeout(100)` 才清掉。这 100ms 内面板里任何 `setSettings` 的 persist `setItem` 直接 return。和历史「改别的设置把主题打丢」同类，根因从 `_default` 变成了丢写。

主题 `skipNextDetection` 只跳过一次 mutation。站点常先改 `html` 再改 `body`，第二次检测可能把错误 mode 写回 settings。

### 10. 弹层 Portal 到 `document.body`，自定义主题失效

导出、会话对话框、提示词编辑器、通用 `DialogOverlay` 都 `createPortal(..., document.body)`。`ThemeManager` 把预置变量写到 `:root`，自定义 CSS 以 `:host` 注入 Shadow。自定义主题在面板里生效，一打开导出/编辑就回到默认色。

`Dialog.tsx` 和 `ConversationDialogs.tsx` 都往 `document.head` 写 `id="gh-dialog-styles"`。谁先注入，后到的整份 CSS 被跳过——会话弹窗或通用确认框可能没样式。

### 11. 独立 Options 页少了两个一级入口

面板设置有 10 项（含全局搜索、快捷键）。`src/tabs/options.tsx` 只有 8 项，不渲染 `GlobalSearchPage` / `ShortcutsPage`。从扩展 Options 进设置的用户会以为没有这两项；深链落到 Options 也会找不到页。导航顺序也不一样（弹窗是「基本 → 外观 → 功能」，Options 是「基本 → 功能 → … → 外观」）。

### 12. 韩文在油猴更新后乱码（#748）

用户数据（提示词、文件夹、备注）和界面文案都报过。现码里有几处相关风险，但还不能单点定论：

- 油猴 persist 把 Zustand JSON **字符串**丢给 `GM_setValue`；脚本更新后若 GM 返回值的编码/解析方式变了，CJK 会变成 mojibake，再被写回就永久坏
- 界面文案走 `GM_getResourceText` + `JSON.parse`，资源 charset 不对时韩文 UI 也会坏
- Inter 的 `unicode-range` 故意不含韩文，靠 `Malgun Gothic` 回退；这更像渲染问题，解释不了「重写就好、一更新又坏」

需要一份坏掉的 backup JSON 才能钉死是存储还是资源编码。

---

## P3：维护性和安全基线

| 问题 | 证据 |
| --- | --- |
| Trusted Types 是恒等策略 | `trusted-types.ts`：`createHTML: (s) => s`；油猴还可能装 pass-through `default` policy |
| WebDAV 恢复非原子 | `backup-codec.ts` `Promise.all(storage.set)`，失败不回滚，再叠加存储吞错 |
| `postMessage(..., "*")` 不校验 origin | 滚动锁、ChatGPT 批量挂载可被同窗口脚本关掉 |
| 阅读进度恢复仍 `loadAll: true` | 长会话为了回到底部会把全部历史滚上来；5s 超时还假标 `_hasHydrated` |
| Gemini 提问 ID 绑 `jslog` 正则 | 站点一改，书签和大纲 ID 全失效 |
| 大文件仍在膨胀 | `App.tsx` ~3800 行、`PromptsTab.tsx` ~3700、`style.css` ~4770、`settings.css` ~5600 |
| 生产代码留了 DEBUG 日志 | `OutlineTab.tsx` 复制失败打 `[DEBUG]` |

开放 Issue 对照：

| Issue | 现状 |
| --- | --- |
| #889 ChatGPT 内存 | changelog 写了未发布修复；观察器和 cache 仍在 |
| #787 闲置 CPU | 多路 1s/2s/3s 轮询 + ChatGPT 整页 characterData，仍在 |
| #753 IME 吸附 | 代码仍无 composition 保护 |
| #748 韩文乱码 | 证据不足，存储/资源编码可疑 |
| #885 tooltip | 已做一轮，Issue 故意留着继续打磨 |
| #674 主题闪、#654 iframe | wontfix |

---

## UI / 交互：对照 `DESIGN.md` 还缺什么

**design read：** 高频工具面板，`preserve` 模式。适用 `DESIGN.md` 4 布局、5 组件/可访问性、6 动效、7 状态、9 实现约束。

### 已经变好的

三个 Tab 的搜索框骨架开始统一；会话筛选/清除已是真 `button`；快捷按钮空闲旋转已去掉；设置弹窗和主面板 Tab 的基础无障碍已补。

### 键盘和读屏（优先）

1. **通用 Dialog 不像对话框。** `DialogOverlay` 没有 `role="dialog"`、焦点陷阱、关闭后还焦点。导出、分段导出、变量输入全受影响。
2. **全局搜索把 Tab 劫持了。** `Tab` / `Shift+Tab` 用来切分类并 `preventDefault`，模糊搜索开关、帮助、筛选 chips 都 Tab 不到。主层也不是 `dialog`。
3. **大量 icon-only 没有名字。** 快捷按钮组完全没有 `aria-label`；主面板主题/新标签/设置按钮也没有。Tooltip 不能当名字。
4. **用 div 冒充按钮。** 大纲层级圆点、会话标签筛选项、队列折叠胶囊都是 `div + onClick`，键盘打不开。
5. **提示词编辑器 Esc 只关平台选择器，关不了编辑器本身。** 预览、导入弹窗同样缺 Esc/焦点管理。
6. **拖拽几乎没有键盘替代。** 面板 Tab、设置排序、文件夹、Chain、快捷按钮位置都只能鼠标拖。DESIGN 和架构计划都要求至少一种非鼠标路径。

### 每天都能看到的摩擦

1. **三个 Tab 工具栏仍不齐。** 会话没进 `gh-panel-tool-stack`，自己复制了一套底边；大纲图标按钮还是 28px 旧类；搜索高度 30/32 混用。
2. **工具箱打开仍无限旋转，未读红点仍脉冲。** 直接违反 DESIGN 6.3「禁止无目的常驻动画」。`prefers-reduced-motion` 里关了，默认用户仍看到转和跳。
3. **Tooltip 固定深色玻璃**（`rgba(24,24,28,0.94)` + 白字），不跟 24 套主题。#885 已减少遮挡，位置偏好和主题色还没做。
4. **失败几乎全靠 toast。** 导出失败、同步失败、权限提示都是 2–3 秒不可聚焦浮层，错误复制不了。破坏性操作该用确认框，表单失败该用 inline。
5. **设置页过载。** 功能模块一个页面 9 个二级 Tab，没有「常用 / 当前站点」。用户改一项要先猜一级导航，再扫一排 Tab。
6. **点击热区偏小。** Header 图标 24×24，搜索动作 22×22，低于规范的 32×32。
7. **免责声明用了装饰性 ✨ 和硬编码蓝紫渐变**，不跟主题，也违反「不用 emoji 当信息」。

### 主题和样式债

- `Button` / `Input` 变体走内联样式，`transition: all`，组件内没有完整 hover/active/focus-visible
- `SelectDropdown` 选中项文字写死 `#ffffff`
- 大纲层级滑杆、导入弹窗、Chain 编辑仍大量 inline
- 自定义主题进不了 body 弹层（见 P2-10）

---

## 建议修的顺序

不要做 CSS 大拆分或一次重写 `App.tsx`。按用户伤害排：

1. **存储 `lastError`：** 失败要显式暴露，禁止把空结果当「无数据」再 persist 默认值
2. **队列 `sending` 恢复：** 先检查输入框是否被用户改过；匹配改为精确相等，不要 `includes`
3. **Grok `innerHTML`：** 复用 ChatGPT 的 `escapeHtmlForInsert`
4. **队列浮层：** 挂到 Shadow 里的 `.gh-root`（参考 `PromptsTab` 的 `host.shadowRoot.querySelector`），并把 `queue-overlay.css` 加进 `getStyle()` 和油猴样式包
5. **IME 吸附：** composition 期间保持 peek；输入框仍聚焦时不要按 `:hover` 缩回
6. **共享 Dialog：** 语义 + 焦点 + 拆开 `gh-dialog-styles`；Options 补上全局搜索和快捷键
7. **`buildTree` 按 msgId 断代**；ChatGPT 观察器收到消息容器，空闲关掉 `characterData`

UI 小步可以跟：快捷按钮 `aria-label`、队列胶囊改 `button`、去掉 `tools-spin` / `pulse-red`、三个 Tab 收进同一套 tool-stack。

如果你希望下一步直接修，建议从上面 1–4 开，每条都能单独验证，不会搅成一次大重构。