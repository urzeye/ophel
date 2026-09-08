# Ophel Atlas 三方代码审查汇总报告

> 来源：Gemini 3.7 全仓审查（`review-gemini37.md`）、Grok 静态审查（`review-grok.md`）、Codex 逐条源码复核。
> 所有条目均经 Codex 对照当前源码（main @ c5b324a4）逐一核实，标注核实结论与证据位置。
> 分级：**P0** 会丢数据 / 误发送 / 可注入；**P1** 用户可稳定遇到的功能缺陷；**P2** 体验、UI 规范、i18n；**P3** 架构、性能、维护性。

---

## 一、P0：数据丢失、误发送、注入风险

### P0-1 扩展存储失败被当成「无数据」，可能覆盖用户真实数据

- **来源**：Grok P1-1 = Gemini #21（两者同一条）
- **位置**：`src/stores/chrome-adapter.ts`（extensionStorageAdapter 的 getItem/setItem/removeItem）
- **现状**：三处 `chrome.storage.local.*` 回调均未检查 `chrome.runtime.lastError`。`get` 失败时回调收到空对象 → `resolve(null)` → Zustand persist 按「无持久化数据」水合出默认值；用户再改任意设置，整份默认对象写回，覆盖真实数据。`set` 配额满或上下文失效同样静默 `resolve()`。油猴路径会 throw，扩展路径是静默伪成功。
- **修复**：三处回调统一检查 `lastError`，失败时 reject，让错误显式暴露。

### P0-2 队列 `sending` 项绕过「输入框已有内容」保护，可能误发送用户编辑中的内容

- **来源**：Grok P1-2
- **位置**：`src/core/queue-dispatcher.ts:207-218`（`isItemContentInEditor`）、`:229`（`recoverSendingItem`）
- **现状**：内容匹配用**双向 `includes`**：编辑器内容包含队列项、或队列项包含编辑器内容均算命中。发送确认失败后条目停在 `sending`；用户在同一输入框继续改字（"hello" → "hello 再补一句"）仍命中，约 2 秒空闲后调度器重新 `insertPrompt` + `submitPrompt`，把用户正在编辑的内容发出去。队列开启时后台标签页也会跑。
- **修复**：恢复发送前改为精确相等匹配（归一化后 `===`），并要求编辑器内容与队列项一致才允许重发。

### P0-3 Grok 插入提示词未转义直接写 `innerHTML`

- **来源**：Grok P1-3 = Gemini #1（同一条）
- **位置**：`src/adapters/grok.ts:1339`
- **现状**：`editor.innerHTML = \`<p>${content}</p>\``。提示词含 `<`、`>`、`&` 时会被解析为 DOM 或丢弃，多行换行也不分段；是 grok.com 页面上下文里的注入入口。ChatGPT 同路径有 `escapeHtmlForInsert`，Grok 没有。
- **修复**：复用转义 + 按 `\n` 分段生成 `<p>`。

### P0-4 `MSG_PROXY_FETCH` 无协议与目标校验

- **来源**：Gemini 架构 #5
- **位置**：`src/background.ts:566-599`
- **现状**：Background 收到消息后直接 `fetch(message.url)` 且 `credentials: "include"`，未限制 `http:`/`https:` 协议，未拦截 localhost / 内网地址。
- **修复**：解析 URL，仅允许 http/https，拒绝内网 IP 与 localhost。

---

## 二、P1：功能缺陷（用户可稳定遇到）

### P1-1 大纲字数统计跨轮次越界（4 个适配器同一族 bug）

- **来源**：Gemini #3 / #11 / #14 / #15；Codex 补充：基类缺陷 + 五处重复实现
- **位置**：
  - `src/adapters/chatgpt.ts:3540-3569`、`src/adapters/zai.ts:612-635`：`foundCurrent` 循环恒假——`startEl` 是 AI 回复内的 h1~h6，与用户提问元素比较 `===`/`contains` 永远不中，`nextUserQuery` 恒为 `null`，字数从当前标题一直累加到最后一个 AI 回复。
  - `src/adapters/grok.ts:2246-2252`：仅查 `parentElement.nextElementSibling`（是紧随的 AI 回复，不是下一个用户消息），同样恒 `null`。
  - `src/adapters/claude.ts:1952-1973`、`src/adapters/gemini.ts:5545`：`headings` 是全对话扁平数组，`nextBoundaryEl`/`nextEl` 可能在 `messageContent` 容器之外；基类 `calculateRangeWordCount`（`src/adapters/base.ts:1161`）**不校验 endEl 是否在容器内**，Range 跨多个轮次消息，字数虚高数倍；endEl 在 startEl 之前时抛错被 catch 静默返回 0。
- **修复**：边界查找改用 `compareDocumentPosition`；基类 `calculateRangeWordCount` 增加 `fallbackContainer.contains(endEl)` 校验，越界时退化为容器末尾。

### P1-2 Z.ai 无用户提问选择器时大纲全部丢失

- **来源**：Gemini #4
- **位置**：`src/adapters/zai.ts:548-550`
- **现状**：`if (!userQuerySelector) return outline` 无条件提前返回，即使只要标题（`includeUserQueries = false`）也返回空数组。
- **修复**：仅在 `includeUserQueries === true` 时才做该阻断。

### P1-3 DeepSeek 流式思考块误识别为用户提问塞进大纲

- **来源**：Gemini #2
- **位置**：`src/adapters/deepseek.ts:555-574`
- **现状**：R1 思考阶段 `.ds-markdown` 未生成，`getAssistantBodyMarkdown` 返回 `null`，未校验消息是否为真实用户消息就 fallback 进用户提问分支，大纲闪烁。
- **修复**：fallback 前校验用户消息元素存在。

### P1-4 `CopyManager` 热更新重建漏传 `adapter`

- **来源**：Gemini #5
- **位置**：`src/core/modules-init.ts:299`（初始化两参）vs `:683`（热更新单参）
- **现状**：热更新后 `this.siteAdapter` 为 `null`，公式定制提取与 Shadow DOM 站点表格复制按钮失效。
- **修复**：补齐第二参数。

### P1-5 WebDAV / Background 原生 `btoa` 遇非 ASCII 崩溃

- **来源**：Gemini #6
- **位置**：`src/core/webdav-sync.ts:669`、`src/background.ts:609`
- **现状**：`btoa` 仅支持 Latin1，用户名/密码含中文或特殊符号直接抛 `InvalidCharacterError` 中断同步。
- **修复**：`btoa(unescape(encodeURIComponent(...)))` 或等价 UTF-8 安全编码。

### P1-6 油猴 Storage Polyfill 单 key `watch` 回调为空

- **来源**：Gemini #7；Codex 补充：实际有调用方
- **位置**：`src/platform/userscript/storage-polyfill.ts:57-60`
- **现状**：单 key 分支的 `GM_addValueChangeListener` 回调体为空，且未接收调用方传入的回调。`useSupportedAiPlatforms`、`useHasUnseenReleaseNotes`、`SitePacksPage` 均用单 key 形式调用——油猴端这些监听全部静默失效。
- **修复**：单 key 分支接收并分发回调。

### P1-7 移除水印下载/复制异常被吞且阻断原生行为

- **来源**：Gemini #8
- **位置**：`src/core/watermark-remover.ts:952-978`
- **现状**：先 `stopImmediatePropagation()`，随后 catch 空 `return`：处理失败时无提示，且原生下载/复制已被阻断，用户点了没反应。
- **修复**：catch 中给出 toast 提示；失败时考虑放行原生行为。

### P1-8 `ModelLocker.start()` 定时器无引用，`stop()`/`relock()` 清不掉

- **来源**：Gemini #9
- **位置**：`src/core/model-locker.ts:56`（`setTimeout` 未存 ID）、`:153`（`stop` 只清 verify/configDebounce）
- **现状**：1.5s 延迟窗口内调用 `stop()`/`relock()`/页面切换，挂起的定时器到期后仍会强制锁定模型，引发非预期切模型弹窗。
- **修复**：保存 `startTimer` 并在 `stop()` 中 `clearTimeout`。

### P1-9 油猴端 Claude SessionKey 读写失效（HttpOnly）

- **来源**：Gemini #10
- **位置**：`src/platform/userscript/index.ts:209-210, 289, 353`；`vite.userscript.config.ts:629` 已申请 `GM_cookie` 权限但代码从未调用
- **现状**：`sessionKey` 是 HttpOnly Cookie，`document.cookie` 读不到也写不进，油猴端 Claude 多 Key 切换整体失效。
- **修复**：改用 `GM_cookie.get` / `GM_cookie.set`（注意 GM_cookie 能力差异与降级路径，改动需覆盖读取、写入、切换三处）。

### P1-10 `VariableInputDialog` 多行 textarea 按 Enter 直接提交

- **来源**：Gemini #12
- **位置**：`src/components/VariableInputDialog.tsx:101-105`
- **现状**：外层 `handleKeyDown` 对 `Enter && !shiftKey` 一律 `preventDefault + submit`；输入框却是自适应多行 textarea（最高 200px），设计意图与键盘行为不一致，用户无法换行。
- **修复**：焦点在 textarea 内时允许原生换行，保留 Ctrl/Cmd+Enter 提交。

### P1-11 Background 切 Key 无差别重定向所有 Claude 标签页

- **来源**：Gemini #13
- **位置**：`src/background.ts:902, 992-995, 1208`
- **现状**：`tabs.query({ url: "*://claude.ai/*" })` 全量刷新跳首页，其他标签页未保存草稿丢失。
- **修复**：优先只刷新 `sender.tab.id`。

### P1-12 `scroll-lock-main.ts` 漏配通义千问 / 百炼 matches

- **来源**：Gemini #16
- **位置**：`src/contents/scroll-lock-main.ts:12-29`（对比 `ui-entry.tsx` matches 含 `qianwen.com`）
- **现状**：主世界滚动锁定脚本不注入通义千问国内版与百炼控制台，滚动锁定在这些站点静默失效。
- **修复**：补齐 `qianwen.com`、`tongyi.aliyun.com`、`bailian.console.aliyun.com` matches。

### P1-13 `ShortcutManager` 在 Shadow DOM 输入时误判（事件 Retargeting）

- **来源**：Gemini #17
- **位置**：`src/core/shortcut-manager.ts:91-109`
- **现状**：事件冒泡出 Shadow Root 后 `e.target` 被重定向为宿主元素（`DIV`），输入框判定失效；配置了无修饰键快捷键的用户在面板输入框打字会被拦截。
- **修复**：改用 `e.composedPath()[0]` 取真实目标。

### P1-14 `MarkdownFixer` 正则替换破坏 LaTeX / HTML 属性

- **来源**：Gemini #18
- **位置**：`src/core/markdown-fixer.ts:100-152`
- **现状**：只保护 code 块；`$x**2 + y**2$` 这类公式或属性中的 `**` 会被替换为 `<strong>`，破坏 KaTeX 渲染或标签结构。
- **修复**：增加 `$...$` / `$$...$$` 占位保护。

### P1-15 `QueueDispatcher.stop()` 无法取消 10 分钟提交后等待轮询

- **来源**：Gemini #19；Codex 补充：轮询本身是 CPU 热点
- **位置**：`src/core/queue-dispatcher.ts:57-60, 296-341`
- **现状**：`stop()` 只停 `pollingTasks`，`postSubmitWaitPromise` 的 while 循环脱缰跑到超时；且 `getConversationActivitySignature` 每 500ms 对整段对话做全量 `textContent` 序列化。
- **修复**：引入停止标记，`stop()` 时退出循环。

### P1-16 `PromptManager.init()` 等待 hydration 无超时兜底

- **来源**：Gemini #20
- **位置**：`src/core/prompt-manager.ts:36-45`
- **现状**：极端情况下 `_hasHydrated` 永不置真，`init()` 永久挂起阻塞初始化链路。
- **修复**：参考 `ReadingHistoryManager` 加 3000ms 超时兜底。

### P1-17 队列浮层 Portal 落到 `document.body`，主题变量丢失

- **来源**：Grok P1-4（Codex 修正其细节表述）
- **位置**：`src/components/QueueOverlay.tsx:499`
- **现状**：`document.querySelector(".gh-root")` 穿不透 Shadow DOM（`.gh-root` 在 `App.tsx:3293`，位于 Plasmo Shadow 内），恒落到 `document.body`。自定义主题变量注入在 Shadow `:host`，浮层掉回默认色。文件 165-175 行注释与实现自相矛盾。`queue-overlay.css` 不在 `ui-entry.tsx` 的 `getStyle()` 合并列表、也不在油猴手工样式包中（组件内 import 在油猴端会被 vite-plugin-monkey 注入 document.head，扩展端不进 Shadow——基础样式可能生效，丢的是主题变量）。
- **修复**：经 `host.shadowRoot.querySelector(".gh-root")` 挂载（`PromptsTab.tsx:984` 已有正确范式），并把 `queue-overlay.css` 纳入 `getStyle()` 与油猴样式包。

### P1-18 弹层统一 Portal 到 `document.body` + `gh-dialog-styles` ID 冲突

- **来源**：Grok P2-10 = Gemini UI#4（部分重叠）
- **位置**：`src/components/ui/Dialog.tsx:103, 168`、`src/components/ConversationDialogs.tsx:99, 165`
- **现状**：导出、对话对话框、变量输入等均 `createPortal(..., document.body)`，自定义主题失效；两处都注入 `id="gh-dialog-styles"`，先到先赢，后挂载组件的整份 CSS 被跳过。
- **修复**：区分样式 ID（小改动先修冲突）；弹层挂回 Shadow 内（改动面大，见 CSV 取舍）。

### P1-19 独立 Options 页缺「全局搜索」「快捷键」两个一级入口

- **来源**：Grok P2-11
- **位置**：`src/tabs/options.tsx`（仅 8 个页面 import）；`src/tabs/options/pages/GlobalSearchPage.tsx`、`ShortcutsPage.tsx` 文件存在未接入
- **修复**：补导航项与路由渲染，对齐面板设置顺序。

### P1-20 设置跨上下文同步 100ms 窗口内丢失本地写入

- **来源**：Grok P2-9
- **位置**：`src/stores/settings-store.ts:387-404`
- **现状**：`onChanged` 触发后 `isUpdatingFromStorage = true`，`setTimeout(100)` 才清除；窗口内面板侧任何 `setSettings` 的 persist 写入被直接丢弃。与历史「改设置把主题打丢」同族。
- **修复**：改为基于内容比对的精确回写抑制，而非时间窗口（改动需谨慎，见 CSV）。

### P1-21 大纲跨轮回层级错位（`buildTree` 不按 msgId 断代）

- **来源**：Grok P2-5（方案见 `docs/developer/outline-hierarchy-issue.md` 方案 C）
- **位置**：`src/core/outline-manager.ts:1120-1150`（buildTree 纯按 relativeLevel 栈回溯）、`:1055`（树缓存键只拼 `text + isBookmarked`，不含 level/id）
- **现状**：隐藏用户提问时第 2 轮 H3 会挂到第 1 轮 H1 下；流式中标题层级变化时缩进冻结。
- **修复**：buildTree 引入 msgId 断代；缓存键补 level/id。改动面中等。

### P1-22 吸附面板 + 中文输入法：候选框出现时面板缩回（#753）

- **来源**：Grok P2-6
- **位置**：`src/hooks/useEdgePeekController.ts`（`focusout` 即清焦点标记，无 composition 保护）
- **现状**：IME 候选框出现时输入框 focusout + 指针落候选窗，200ms 后按 `:hover` 缩回。微软拼音/搜狗必现，英文输入法不出现。
- **修复**：`compositionstart/end` 期间保持展开；输入框聚焦时不按 `:hover` 缩回。

### P1-23 DeepSeek 长对话导出仍用步进扫描 + overlap 合并

- **来源**：Grok P2-8
- **位置**：`src/adapters/deepseek.ts:2374, 2682`（`mergeExportMessageBatch`）
- **现状**：批次缺头/尾时整批 append（重复）或对不上（漏段）；ChatGPT/豆包已有挂载确认路径。
- **修复**：对齐 ChatGPT 的挂载确认 + 完整性提示路径。改动面大。

### P1-24 `OutlineManager` 无 `destroy()`，事件/Store 订阅泄漏

- **来源**：Gemini 架构 #1
- **位置**：`src/core/outline-manager.ts`（构造函数订阅 `window` message 与 bookmark store，无清理）；`src/components/App.tsx:470`（useMemo 实例化，无卸载清理）
- **修复**：实现 `destroy()` 并在 App 侧用 useEffect 管理生命周期。

### P1-25 `ThemeManager.destroy()` 未注销系统主题媒体查询监听

- **来源**：Gemini 架构 #2
- **位置**：`src/core/theme-manager.ts:100-110`（addEventListener）、`:1274-1277`（destroy 未 remove）
- **修复**：destroy 中 `removeEventListener("change", this.handleSystemChange)`。

### P1-26 `NumberInput` 在 Shadow DOM 中焦点检测失效

- **来源**：Gemini 架构 #4
- **位置**：`src/components/ui/NumberInput.tsx:122`
- **现状**：`document.activeElement` 在 Shadow 下指向 host，恒不等于内部 input。
- **修复**：改用 `inputRef.current.getRootNode().activeElement`。

---

## 三、P2：UI 规范、可访问性、i18n

| # | 问题 | 位置 | 来源 | 核实 |
|---|---|---|---|---|
| P2-1 | 引用未定义 CSS 变量 `--gh-primary-rgb`，批量测试高亮静默失效 | `src/tabs/options/pages/ClaudeSettings.tsx:568` | Gemini UI#1 | 真实 |
| P2-2 | QuickQuote Chip 深色宿主对比度约 2.3:1（硬编码 `#2563eb` / `rgba(66,133,244,.07)`） | `src/components/QuickQuoteActions.tsx:340-344` | Gemini UI#2 | 真实 |
| P2-3 | 下拉菜单选中项文字硬编码 `#ffffff` | `src/components/ui/SelectDropdown.tsx:345` | Gemini UI#3 / Grok | 真实 |
| P2-4 | 功能图标用 Emoji（钥匙/警告/加号/定位/对话/灯泡/星光等），违反 DESIGN.md 3.2/5.5 | `ClaudeSettings.tsx`、`OutlineTab.tsx:534`、`QuickButtons.tsx:939`、`GlobalSearchResultItemView.tsx:139` | Gemini UI#5 / Grok | 真实 |
| P2-5 | `<button>` 嵌套在 `<a>` 内（HTML5 禁止交互元素嵌套） | `src/tabs/options/pages/AboutPage.tsx:133,155,178,200,303,318,333,348` | Gemini UI#6 | 真实 |
| P2-6 | 大量 icon-only 按钮无 `aria-label`，热区 24x24 / 22x22 低于 32x32 | `MainPanel.tsx`、`QuickButtons.tsx`、`ShortcutsPage.tsx:139`、`VariableInputDialog.tsx:158` | Gemini UI#7 / Grok UI#3 | 真实 |
| P2-7 | `AppearancePage` 用原生阻塞式 `confirm()` | `src/tabs/options/pages/AppearancePage.tsx:209` | Gemini UI#8 | 真实 |
| P2-8 | 通用 `DialogOverlay` 无 `role="dialog"` / `aria-modal` / 焦点陷阱 / 关闭还焦点 | `src/components/ui/Dialog.tsx`、`ConversationDialogs.tsx` | Grok UI | 真实 |
| P2-9 | 全局搜索 Tab/Shift+Tab 被劫持切分类，模糊开关、帮助、筛选 chips 均 Tab 不到 | `src/components/global-search/useGlobalSearchKeyboard.ts:83` | Grok UI | 真实 |
| P2-10 | div 冒充按钮（大纲层级圆点、标签筛选、队列折叠胶囊），键盘不可达 | `OutlineTab.tsx`、`ConversationsTab.tsx`、`QueueOverlay.tsx` | Grok UI | 真实 |
| P2-11 | 提示词编辑器 Esc 只能关平台选择器，关不了编辑器；预览/导入弹窗缺 Esc | `PromptsTab.tsx` | Grok UI | 真实 |
| P2-12 | 拖拽无键盘替代（面板 Tab、设置排序、文件夹、Chain、快捷按钮） | 多处 | Grok UI | 真实 |
| P2-13 | 工具箱打开旋转（tools-spin）、未读红点脉冲（pulse-red） | `src/style.css` | Grok UI | 保留设计（按明确需求保留既有视觉动效） |
| P2-14 | Tooltip 固定深色玻璃不跟 24 套主题 | tooltip 样式 | Grok UI | 真实 |
| P2-15 | 失败反馈几乎全靠 2-3s toast，错误不可复制 | 全局 | Grok UI | 真实（方向性改进） |
| P2-16 | 三个 Tab 工具栏不统一（对话未进 tool-stack、大纲 28px 旧类、搜索 30/32 混用） | 三个 Tab | Grok UI | 真实 |
| P2-17 | 免责声明装饰性 emoji + 硬编码蓝紫渐变 | 相关组件 | Grok UI | 真实 |
| P2-18 | 提示词分类删除硬编码中文回退 `"未分类"` | `src/stores/prompts-store.ts:76`、`src/core/prompt-manager.ts:74` | Gemini 五#1 | 真实 |
| P2-19 | 散落硬编码文案：「队列为空…」「当前使用」`"No options"` `aria-label="active search filters"` | `QueueOverlay.tsx:581`、`ClaudeSettings.tsx:716`、`SelectDropdown.tsx:309`、`GlobalSearchOverlay.tsx:286` | Gemini 五#2 | 真实 |
| P2-20 | `collapseRunSettings` 缺 `DEFAULT_SETTINGS` 与 settings-schema.json 同步 | `src/constants/default-settings.ts`、`docs/developer/settings-schema.json` | Gemini 五#3 | 真实 |
| P2-21 | `getOutlineSources()` 大纲源名称硬编码「对话」「文档」 | `src/adapters/base.ts:1250`、`declarative/adapter.ts:667,759-765`、`claude.ts:1787`、`gemini.ts:2705` | Gemini #22 | 真实 |
| P2-22 | 生产代码残留 `[DEBUG]` 日志 | `src/components/OutlineTab.tsx:428,442` | Grok P3 | 真实 |

> 注意：凡涉及新增/修改文案的条目（P2-6、P2-18、P2-19、P2-21 等），按仓库规则必须一次性同步 11 种语言（`src/locales/*/index.ts`）。

---

## 四、P3：架构、性能、安全基线

| # | 问题 | 位置 | 来源 | 核实 |
|---|---|---|---|---|
| P3-1 | Trusted Types 恒等策略 `createHTML: (s) => s`，油猴还可能装 pass-through default policy | `src/utils/trusted-types.ts:53,87` | Grok P3 | 真实（合规绕行性质，非漏洞本身） |
| P3-2 | WebDAV 恢复非原子：`Promise.all(storage.set)` 失败不回滚，叠加存储吞错 | `src/core/backup-codec.ts:360` | Grok P3 | 真实 |
| P3-3 | 多处 `postMessage(..., "*")` 不校验 origin，同窗口脚本可干扰滚动锁/批量挂载 | `chatgpt-perf-manager.ts:114`、`scroll-lock-manager.ts:71`、`network-monitor.ts:426-428`、`iframe-scroll-main.ts:65`、`gemini-mystuff-bridge.ts:335` | Grok P3 | 真实 |
| P3-4 | 阅读进度恢复仍 `loadAll: true`，长对话全量滚动加载 | `src/hooks/useShortcuts.ts:116` | Grok P3 | 真实 |
| P3-5 | Gemini 提问 ID 绑 `jslog` 正则，站点一改书签/大纲 ID 全失效 | `src/adapters/gemini.ts:595-614` | Grok P3 | 真实（无更稳定替代前的固有风险） |
| P3-6 | ChatGPT 空闲观察器常驻：`document.body` `subtree + characterData`；`network-monitor` 对命中 fetch `response.clone()` 读全量 body；多路 1s/2s/3s 轮询（#787 / #889） | `src/core/chatgpt-perf-manager.ts:130-135`、`src/core/network-monitor.ts:172` | Grok P2-7 | 真实 |
| P3-7 | `ConversationsTab` store snapshot 与 4 组 useState 双重镜像，级联重渲染 | `src/components/ConversationsTab.tsx:152-193` | Gemini 架构 #3 | 真实 |
| P3-8 | 大文件膨胀：`App.tsx` 约 3800 行、`PromptsTab.tsx` 约 3700、`style.css` 约 4770、`settings.css` 约 5600 | - | Grok P3 | 真实（拆分是大重构，不单独立项） |
| P3-9 | outline-manager 残留 TODO 注释 + 硬编码 `GH_MONITOR_START/COMPLETE` 字符串（messaging.ts 已有常量） | `src/core/outline-manager.ts:253-261` | Gemini #23 | 真实 |
| P3-10 | 新增：`ui-entry.tsx` remount 观察器常驻不释放：Next.js 站点 `document.body` MutationObserver 无 disconnect、无上限，叠加 4 次固定延迟重试 | `src/contents/ui-entry.tsx` mountShadowHost | Codex | 真实 |
| P3-11 | 新增：大纲字数边界逻辑在 5 个适配器重复实现（其中 3 处同 bug），应收敛基类统一实现 | chatgpt / zai / grok / claude / gemini | Codex | 真实（随 P1-1 一并修） |
| P3-12 | 新增：`calculateRangeWordCount` catch 静默返回 0，掩盖 Range 异常，违反「错误显式暴露」 | `src/adapters/base.ts:1161-1181` | Codex | 真实（随 P1-1 一并修） |
| P3-13 | 韩文在油猴更新后乱码（#748）：GM 存字符串编码 / 资源 charset 可疑，但无坏样本无法钉死 | 油猴存储与资源链路 | Grok P2-12 | 证据不足，暂不定案 |

---

## 五、误报与已排除项

| 条目 | 结论 | 说明 |
|---|---|---|
| 历史二.6「提示词备份遗漏 folders 与 tags」 | 误报 | `Prompt` 模型用 `category: string`，folders/tags 属对话体系；`BACKUP_TYPE_KEYS.prompts` 已完整覆盖提示词数据。Gemini 判断正确，Codex 复核确认。 |
| Grok P1-4「queue-overlay.css 未打进包」 | 部分修正 | 组件内 `import` 会被油猴构建注入 document.head；真正丢失的是 Shadow `:host` 主题变量与挂载层级，见 P1-17。 |
| Grok P2-12 韩文乱码 | 存疑 | 见 P3-13，复现条件苛刻且缺关键证据，暂按「不存在」处理，不立项修复。 |

---

## 六、修复路线

修复任务拆分与取舍（优先级 x 复现难度 x 改动面）见 `docs/developer/fix-tasks.csv`，逐项修复、逐项提交，便于后期排查回滚。总体顺序：

1. **P0**：存储 lastError、队列精确匹配、Grok 转义、proxy 校验——改动小、伤害大。
2. **P1 小改动**：CopyManager 参数、btoa、watch 回调、ModelLocker、zai 提前返回、DeepSeek 校验、scroll-lock matches、ShortcutManager、VariableInputDialog、NumberInput、ThemeManager/OutlineManager destroy、PromptManager 超时、切 Key 限 sender tab、水印 toast。
3. **P1 结构性**：大纲字数边界（基类统一修）、QueueDispatcher 停止、队列浮层挂载、Options 补页。
4. **P2**：i18n 硬编码（11 语言同步）、CSS 变量、a11y 标签、Emoji 替换、ConfirmDialog。
5. **缓修/不修**：改动面大而收益小的（弹层全量回 Shadow、DeepSeek 导出重写、拖拽键盘替代、大文件拆分）、复现苛刻的（韩文乱码）。

---

## 七、复审发现与实测决策（2026-09-03）

38 项修复完成后进行全量实测与代码复审，针对实测中暴露的交互与架构问题进行了二次处理与决策定案：

### 1. 关键决策与回退记录

| 任务 / 编号 | 改动项 | 决策 | 涉及文件 | 根因与详细理由 |
|---|---|---|---|---|
| **P1-10 / R-5** | VariableInputDialog 变量输入框 Enter 键行为 | **已回退** | `src/components/VariableInputDialog.tsx` | 原审查认为多行 textarea 应允许 Enter 换行、改由 Ctrl/Cmd+Enter 提交。实测发现：① 在 Mac 环境下 textarea 聚焦时 `Cmd+Enter` 存在快捷键失效问题；② 破坏了老用户输入完内容直接按 `Enter` 快速提交的原有流畅习惯，导致必须手动点击“确定”按钮。**决定撤销此改动，完全恢复按 Enter 直接提交**。 |
| **P1-17 / R-2 / R-7** | QueueOverlay 队列浮层挂载与样式体系 | **已回退挂载改动，恢复页面级完整样式** | `src/components/QueueOverlay.tsx`<br>`src/contents/ui-entry.tsx`<br>`vite.userscript.config.ts` | 原先为了让队列浮层读取 Shadow 主题变量，将其改挂载到 Shadow DOM 内并删除了页面级 CSS 导入。该改造引发了连锁结构性缺陷：<br>① **弹窗样式完全丢失**：队列内的“批量导入弹窗”（`DialogOverlay`）挂载于主页面 `document.body`，因无法穿透 Shadow DOM 读取 CSS，导致弹窗完全失去样式，退化为无布局的裸 HTML 结构；<br>② **全屏事件穿透**：Shadow 根容器 `.gh-root` 默认 `pointer-events: none`，导致队列胶囊与面板点击无响应；<br>③ **Click-outside 误判**：Shadow DOM 事件 Retargeting 导致在面板内点击“批量导入”按钮时，`handleClickOutside` 误判为点击外部而直接收起浮层。<br>**决定彻底回退 P1-17 的 Shadow 挂载改造**，恢复 `QueueOverlay.tsx` 的页面级 `queue-overlay.css` 导入与 `document.body` 挂载，仅保留纯数据层发送逻辑修复（P0-2 精确匹配）与 i18n 国际化文案修复。 |
| **P1-5** | WebDAV 与 Background 凭证 UTF-8 安全 Base64 编码 | **确认保留（100% 兼容历史数据）** | `src/utils/encoding.ts`<br>`src/core/webdav-sync.ts`<br>`src/background.ts` | 经排查：本地 Settings Store 持久化保存的是明文 `username`/`password`，仅在发送 HTTP 请求时动态编码；对于所有纯 ASCII 凭证，`btoaUtf8` 输出与原生 `btoa` 完全一致，仅消除了含中文或特殊字符时的 `InvalidCharacterError` 崩溃，无任何数据迁移或不兼容问题。 |
| **P2-13 / R-6** | 工具箱展开旋转与未读红点脉冲动画 | **明确设计保留** | `src/style.css` | 按明确设计需求保留原有视觉动效与反馈，撤销对 `style.css` 动画规则的移除。 |

---

### 2. 复审问题汇总明细

| 编号 | 问题 | 位置 | 性质 | 最终处置 |
|---|---|---|---|---|
| R-1 | Grok 多行提示词队列恢复失配：P0-3 段落化插入后 contenteditable 的 `textContent` 读回为段落无分隔拼接（`line1line2`），而 `normalizeContent` 把 `\n` 折叠为空格，P0-2 的精确匹配对多行内容永远失配。`recoverSendingItem` 误判"输入框已清空"，把仍在编辑器里的内容标记 sent 并移出队列（静默丢任务，不会重发，方向安全）。ChatGPT 本就是段落化插入，属同类存量问题 | `src/core/queue-dispatcher.ts` × `src/adapters/grok.ts` | 新引入回归 | 已修：匹配时追加"去全部空格"压缩等价比较 |
| R-2 | QueueOverlay 删除页面级 CSS 导入导致批量导入弹窗丢失样式退化为裸 HTML | `src/components/QueueOverlay.tsx` | 新引入回归 | 已回退：恢复 `import "~styles/queue-overlay.css"`，浮层与弹窗统一在 `document.body` 消费全局样式 |
| R-3 | 代理校验 IPv6 环回漏网：WHATWG URL 规范下 `new URL("http://[::1]/").hostname` 返回带方括号的 `[::1]`，`hostname === "::1"` 永不命中；`0.0.0.0` 等写法也未覆盖。风险面小（消息只能来自已注入的 content script），但名单有洞 | `src/background.ts` | 修复不彻底 | 已修：补 `[::1]`/`[::]` 与 `0.0.0.0` 匹配 |
| R-4 | ui-entry 重挂载观察器 5 秒断连的回归窗口：原实现永久观察 body 兜底，现 `max(delays)+2000` 后断连；慢网络下水合晚于 5 秒且清除 host 时面板不再重挂载。概率低，但方向是回归 | `src/contents/ui-entry.tsx` | 修复引入的边界回退 | 缓修：可改为"挂载成功后稳定观察 N 秒再断连"，需实测权衡 |
| R-5 | 变量输入框 Enter 改为换行、Ctrl/Cmd+Enter 提交：改变老用户习惯且 Mac 键位不灵敏 | `src/components/VariableInputDialog.tsx` | 有意行为变化 | 已回退：恢复 Enter 直接提交 |
| R-6 | 工具箱展开旋转（tools-spin）与未读红点脉冲（pulse-red）动画：按明确设计需求保留原有视觉动效与反馈，撤销对 style.css 的动画移除 | `src/style.css` | 明确设计保留 | 保留：恢复动画定义与调用 |
| R-7 | 队列浮层挂进 Shadow 产生 pointer-events 穿透与 click-outside 误判 | `src/styles/queue-overlay.css` × `QueueOverlay.tsx` | 新引入回归 | 已回退：挂载回归 document.body，彻底消除穿透与误判 |

