# Ophel Atlas 架构参考

本文档介绍仓库的模块划分、双平台构建机制、核心初始化顺序与关键数据流。

- 编码、提交与站点包规范见 [conventions/](./conventions/)。
- Shadow DOM 样式注入与主题机制见 [css-architecture.md](./css-architecture.md)；UI 与视觉规范见根目录 [DESIGN.md](../../DESIGN.md)。

## 1. 技术栈与支持范围

Ophel Atlas 用同一套源码同时构建**浏览器扩展**（Chrome / Firefox）和**油猴脚本**（Greasy Fork 分发）。

- **内置站点（16 个）**：顺序定义在 `src/adapters/builtin.ts`——Gemini Enterprise、Gemini、NotebookLM（`notebook.ts`）、ChatGPT、Grok、AI Studio、Claude、DeepSeek、Doubao、Ima、ChatGLM、Kimi、Qwen Studio（`qwen-studio.ts`，`SITE_IDS` 为 `qwenai`）、Qianwen、Yuanbao、Z.ai。
- **社区扩展站点**：通过 `registry/` 的 SitePack 声明式配置包热插拔支持。

| 类别     | 实现                                                          |
| -------- | ------------------------------------------------------------- |
| 语言与 UI | TypeScript 5.3 + React 18                                     |
| 状态管理 | Zustand 5 + persist（扩展用 `chrome.storage.local`，油猴用 GM） |
| 扩展构建 | Plasmo 0.90（Manifest V3，Chrome + Firefox）                  |
| 油猴构建 | Vite + `vite-plugin-monkey`                                   |
| 样式     | 原生 CSS（无预处理器、无 CSS-in-JS），Shadow DOM 隔离         |
| 工具链   | pnpm 9.15、ESLint 9 (flat config)、Prettier、Husky + commitlint |

## 2. 双平台构建与油猴 Adapter 外置

跨平台差异统一收口在 `src/platform/`（`extension/` 与 `userscript/`），构建期通过 `__PLATFORM__` 切换实现。

### 油猴 adapters vendor

为了守住 Greasy Fork 200 万字符硬限，油猴构建把全部内置站点适配器拆到独立的 `ophel-adapters-vendor-*.js`，通过 `@require` 引入（安装时缓存，不计入脚本本体字符数）：

- **双端顺序一致**：扩展端直接打包 `src/adapters/builtin.ts`；油猴构建用 Vite alias 把 `~adapters/builtin` 替换为 `src/platform/userscript/builtin-adapters.ts`，实例化 vendor 挂载到 `window.__OphelBuiltinAdapters` 上的类。vendor 入口 `src/platform/userscript/adapters-vendor.ts` 的类顺序必须和 `builtin.ts` 一致。
- **有状态模块禁止双份打包**：vendor 与主包是两个独立 bundle。适配器引用有状态共享模块时，必须通过 `window.__OphelAdaptersVendorBridge` 懒解析主包单例（桥接 shim 在 `src/platform/userscript/vendor-bridge/`）。当前桥接清单：`~stores/settings-store`、`~core/watermark-remover`、`~utils/i18n`。新增对有状态模块的引用时，必须评估是否加入桥接。
- **截断远程配置链路**：vendor 中的 `platform.remoteConfig` 会被替换为显式抛错的 `remote-config-stub.ts`，适配器代码不允许直接调用 `platform.remoteConfig.*`。
- **版本握手**：vendor 在 `window.__OphelAdaptersVendorMeta` 注册 `{ version, schemaVersion }`，主包实例化前比对，不匹配则显式报错并停用内置适配器，防止 `@require` 旧缓存静默错配。
- **SRI 与字符数门禁**：构建会为自托管 `@require` / `@resource` URL 追加 `#sha256=` 完整性片段；发布前 `scripts/verify-userscript-assets.mjs` 逐字节校验远端与本地产物。构建末尾检查 `ophel.user.js` 字符数，超过项目闸门（195 万）直接失败，触闸时继续向 vendor / `@resource` 拆分。

## 3. 目录与入口

项目使用 `~` 作为 `src/` 的路径别名（配置在 `tsconfig.json` 和 `vite.userscript.config.ts`）。

| 目录 / 文件       | 职责                                           | 关键文件                                                                                                  |
| ----------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/adapters/`   | 站点适配器与声明式配置校验                     | `base.ts`, `builtin.ts`, `index.ts`, `feature-capabilities.ts`, `declarative/`, 各站点 `*.ts` / `*-config.ts` |
| `src/core/`       | 核心业务管理器与远程配置/SitePack 运行时       | `modules-init.ts`, `extension-bootstrap.ts`, `theme-manager.ts`, `layout-manager.ts`, `outline-manager.ts`, `conversation/`, `webdav-sync.ts`, `network-monitor.ts` |
| `src/components/` | Shadow DOM 内 React UI 与共享控件              | `App.tsx`, `MainPanel.tsx`, `OutlineTab.tsx`, `ConversationsTab.tsx`, `PromptsTab.tsx`, `SettingsModal.tsx`, `ui/`, `global-search/` |
| `src/stores/`     | Zustand 持久化状态（11 个 store）              | `settings-store.ts`, `conversations-store.ts`, `prompts-store.ts`, `prompt-chains-store.ts`, `folders-store.ts`, `tags-store.ts` 等 |
| `src/contents/`   | Plasmo Content Script 入口（isolated + main）  | `ui-entry.tsx`（单 UI 入口）, `monitor-entry.ts`, `aistudio-preload.ts`, `aistudio-rpc-main.ts`, `scroll-lock-main.ts`, `gemini-watermark-main.ts` 等 |
| `src/platform/`   | 扩展 / 油猴平台抽象层                          | `types.ts`, `index.ts`, `extension/`, `userscript/`                                                       |
| `src/tabs/`       | 扩展独立页面                                   | `options.tsx`, `options/pages/`, `perm-request.tsx`                                                       |
| `src/styles/`     | 原生 CSS、主题变量、内联弹窗样式、原生主题适配 | `theme-variables.css`, `conversations.css`, `settings.css`, `release-notes.css`, `queue-overlay.css`, `*-inline.ts`, `native-theme-adapters/` |
| `src/utils/`      | 通用工具与主题预置                             | `i18n.ts`, `storage.ts`, `messaging.ts`, `dom-toolkit.ts`, `exporter.ts`, `themes/`, `panel-lazy-styles.ts` |
| `src/constants/`  | 常量、默认配置、快捷键与设置路由               | `defaults.ts`, `ui.ts`, `shortcuts.ts`, `tools-menu.ts`                                                   |
| `src/hooks/`      | React Hooks                                    | `useDraggable.ts`, `useEdgePeekController.ts`, `useShortcuts.ts`, `useFirstRunPanelTour.ts`, `useImageExport.ts` |
| `src/locales/`    | 应用内 11 语种 i18n 源文件                     | `zh-CN/`, `zh-TW/`, `en/`, `ja/`, `ko/`, `it/`, `de/`, `es/`, `fr/`, `pt/`, `ru/`                         |
| `locales/`        | 扩展 Manifest 11 语种 `_locales` 资源          | `zh_CN/messages.json` … `pt_BR/messages.json`                                                             |
| `registry/`       | SitePack 注册表与内置热修 patch                | `sites/`, `patches/`, 校验与构建脚本                                                                      |
| `docs/`           | 开发者文档、多语种 README 与素材               | `developer/`, `readmes/`（用户文档站独立维护在 `ophel-docs`，发布于 `https://ophel.app/docs`）            |

### 关键运行入口

| 入口                      | 路径                                | 说明                                           |
| ------------------------- | ----------------------------------- | ---------------------------------------------- |
| Content Script UI 单入口  | `src/contents/ui-entry.tsx`         | 启动核心、注入首屏样式并挂载 Shadow DOM React App |
| 核心启动编排              | `src/core/extension-bootstrap.ts`   | 初始化适配器与核心模块                         |
| Background Service Worker | `src/background.ts`                 | 通知、代理请求、WebDAV、权限、远程配置与数据维护 |
| Popup 页面                | `src/popup.tsx`                     | 扩展工具栏弹窗                                 |
| Options 页面              | `src/tabs/options.tsx`              | 独立设置页面                                   |
| 油猴脚本入口              | `src/platform/userscript/entry.tsx` | Vite 构建入口与 Shadow DOM 挂载                |

## 4. 常用命令

要求 Node.js >= 18、pnpm >= 9.15。完整脚本见 `package.json`。

```bash
# 开发
pnpm dev                        # 扩展开发（Chrome）
pnpm dev:firefox                # 扩展开发（Firefox）
pnpm build:userscript:local     # 油猴本地调试构建（资源指向 127.0.0.1）
pnpm serve:userscript:assets    # 启动油猴本地资源服务（需保持运行）

# 检查与校验
pnpm format:check               # Prettier 检查（格式化用 pnpm format）
pnpm lint:check                 # ESLint 检查（自动修复用 pnpm lint）
pnpm typecheck                  # TypeScript 类型检查
pnpm adapters:validate          # 校验全部内置站点配置
pnpm registry:validate          # 校验 SitePack 与远程 patch
pnpm prepare:locale-assets      # 开发服务运行期间改完文案后刷新语言资源

# 构建与打包
pnpm build                      # Chrome 扩展
pnpm build:firefox              # Firefox 扩展
pnpm build:safari               # Safari 实验构建（尚未真机验收）
pnpm build:userscript           # 油猴脚本
pnpm package                    # 打包 Chrome（package:firefox / package:all 同理）
```

## 5. 核心机制详解

### 5.1 适配器层（`src/adapters/`）

`SiteAdapter` 抽象基类约定单站接口：`match()` / `getSiteId()` / `getName()`（识别）、`getTextareaSelectors()` / `insertPrompt()`（输入）、`extractOutline()`（大纲）、`getConversationList()` / `navigateToConversation()`（对话）、`getExportConfig()`（导出）、`lockModel()`（模型锁定，通用流程在基类）。

站点适配器与 SitePack 的命名分层、校验红线与版本规则统一维护在 [conventions/site-pack.md](./conventions/site-pack.md)。

#### API 数据源大纲与导出（虚拟滚动 / 懒加载站点）

消息列表虚拟滚动或服务端懒加载的站点，可直接读取站点历史消息接口来补全大纲和导出，替代纯 DOM 滚动扫描。站无关能力集中在 `src/utils/outline-api-source.ts`（分支回溯、过期判定、拉取闸门、分支归并）和 `src/utils/outline-heading-cache.ts`（标题解析、清洗、哈希）；单站文件只负责把 payload 解析为通用结构。

新站点接入清单：

1. 解析器返回继承 `ApiOutlineSourceData` 的数据（`sessionId` / `branchMessageIds` / `maxMessageId`）；导出完整性要求严于大纲，无法证明完整时返回 `null` 回退 DOM 收集。
2. 虚拟滚动站点在 config `traits` 声明 `virtualOutlineFill: true` 并递增 `*_CONFIG_VERSION`；跳转刷新与高亮重算由 `usesVirtualOutlineFill()` / `hasPositionlessOutlineNodes()` 门控。服务端懒加载但 DOM 不卸载的站点（如 Qwen Studio）不要声明该 trait。
3. 拉取统一走 `shouldAttemptApiOutlineFetch` 闸门（单飞、生成中跳过、冷却、解析失败熔断），切会话重置计数；数据就绪后 `postMessage(EVENT_OUTLINE_DATA_UPDATED)` 触发大纲刷新。
4. 大纲条目默认按 `mergeByBranchMessageOrder` 归并：已挂载项以 DOM 为准，接口只补未挂载项；回填项用 `navigationId` 携带精确定位标识。纯附件提问无文本时，文案回退为首个附件文件名。
5. 接口域名与附件 CDN 按最小授权加入 `package.json` 的 `host_permissions`（油猴端 `connect: ["*"]` 无需调整）。

已接入站点的关键差异：

- **DeepSeek**（`deepseek-history-outline.ts` / `deepseek-history-export.ts`）：首发参考实现；提问条目按“是否产出 DOM 条目”决定是否回填，纯附件提问行由接口补齐。
- **Claude**（`claude-history-outline.ts`、`claude.ts`）：DOM 虚拟行无 uuid、只有 `data-rs-index`，内部把 uuid 预映射为分支位置序号（历史截断时按 `aria-setsize` 尾部对齐，对不上判解析失败）；补充“生成结束”和“同 id 标题漂移”两个强制重拉信号；回填直接写站点原有 `outlineItemCache`，不走 `mergeByBranchMessageOrder`。
- **AI Studio**（`aistudio-history-outline.ts`、`aistudio.ts`）：走 Google 内部 RPC（`ResolveDriveResource`，线性单链无分支）；因 SAPISIDHASH 校验 Origin，请求经 main world 桥（`src/core/aistudio-rpc-bridge.ts` + `src/contents/aistudio-rpc-main.ts`，油猴端挂 `unsafeWindow`）代发，无需为 RPC 加 `host_permissions`；认证与删除链路共用 `src/utils/google-rpc-auth.ts`；序号与时间线滚动条 1-based 提问序号一致；导出附件通过平台 fetch 通道从 `drive.usercontent.google.com` 获取以避开页面 CORS。
- **Grok**（`grok-history-outline.ts` / `grok-history-export.ts`、`grok.ts`）：两段接口——先拉 `response-node` 分支骨架，再按 `load-responses` 批量（20 条/批）取正文，树签名未变跳过正文拉取；激活叶节点优先 URL `rid`，否则取末尾；DOM 行自带 `response-<uuid>`，回填提问复用同 id 保持收藏稳定；跳转只走 probe + bisect 滚动挂载（失败回退文本搜索）；导出要求恰有单根且每个节点取到正文，剥离 `<grok:render>`，图片取 `cardAttachmentsJson` 最终版本，思考步骤与工具过程不参与导出。
- **Qwen Studio**（`qwen-studio-history-outline.ts`、`qwen-studio.ts`）：服务端懒加载、不声明 `virtualOutlineFill`；接口分页拉取 `data.chat.history`，必须从 `currentId` 完整回溯到 `parentId === null` 根才算成功，不猜残缺链；网络/鉴权失败（如 token 过期返回 `Unauthorized`）不计熔断，仅解析失败熔断；侧边栏无对话 ID，订阅期间通过下方 NetworkMonitor 复用页面自己的 `GET /api/v2/chats/` 轮询同步对话列表。

#### 页面响应转发（NetworkMonitor）

页面本身会发请求、Ophel 只需复用响应体的场景（如 Qwen Studio 对话列表），不要另起轮询，统一由 main world 单例 `src/core/network-monitor.ts` 持有唯一的 fetch / XHR hook，服务两类互不干扰的消费方：

- **生成检测**：`TabManager.start()` 发送 `EVENT_MONITOR_INIT`（与是否开启自动重命名标签页无关，完成通知、提示音、窗口置顶都依赖它），产出 `EVENT_MONITOR_START` / `EVENT_MONITOR_COMPLETE`，收到 `EVENT_MONITOR_READY` 时重发。
- **响应转发**：通过 `EVENT_MONITOR_CAPTURE_REGISTER` / `UNREGISTER` 管理规则，命中同源 2xx 请求后经 `EVENT_MONITOR_RESPONSE` 转发响应体文本，不参与生成检测。

> hook 在首个消费方出现时安装且不再卸载。**禁止另起第二套 fetch / XHR hook**，否则卸载时写回的“原始 fetch”会冲掉后装的那套。

接入规则：

1. isolated world 统一使用 `src/utils/network-response-capture.ts` 的 `subscribeNetworkResponses(rule, onResponse)`（自动处理 `EVENT_MONITOR_READY` 重发与取消注销）。
2. 规则为 `{ id, method, pathPattern }`，`id` 用 `{siteId}:{用途}`，只匹配同源请求，`pathPattern` 匹配不含 query 的 pathname；规则不放进 `NetworkMonitorConfig`（校验器白名单会拦截）。
3. 只转发 2xx、文本/JSON 响应且上限 4M 字符；超限或非文本类型跳过并告警。
4. 转发内容视为不可信文本，由站点自行解析校验；分页响应只能新增/更新，不得据此删除本地记录。
5. 站点 origin 须列入 `src/contents/monitor-entry.ts` 的 `matches`（油猴端统一初始化）。对话列表类数据通过 `SiteAdapter.onConversationListChange()` 触发增量同步（快照刷新本身不回调，避免吃掉手动/首次全量同步的新增计数）。

### 5.2 核心模块初始化（`src/core/modules-init.ts`）

`initCoreModules()` 按顺序初始化以下 **13 个管理器**（`adapter.getEnhancementMode() === "minimal"` 时只初始化第 1、3 项；异步步骤间检查 `ctx.isStale()` 防止 SPA 导航后重复建实例）：

1. **ThemeManager** — 主题管理（light / dark / system + 24 套预置 + 自定义样式）
2. **MarkdownFixer** — AI 回复 Markdown 渲染修复
3. **LayoutManager** — 页面宽度、提问宽度、禅模式、净化模式、自动隐藏输入框
4. **CopyManager** — LaTeX 公式复制、表格复制
5. **TabManager** — 生成完成通知、标签页自动重命名、隐私模式
6. **WatermarkRemover** — Gemini / Gemini Enterprise 去水印
7. **UsageCounterManager** — 本地使用量统计与预估
8. **ReadingHistoryManager** — 阅读历史记录与位置恢复（异步）
9. **ModelLocker** — 模型自动锁定
10. **ScrollLockManager** — 滚动锁定
11. **UserQueryMarkdownRenderer** — 用户提问 Markdown 渲染
12. **AssistantMermaidRenderer** — AI 回复 Mermaid 兜底渲染（异步）
13. **ChatGptPerfManager** — ChatGPT 长对话渲染性能优化

独立管理的其他核心模块：`ConversationManager`、`OutlineManager`、`PromptManager`、`PromptChainRunner`、`QueueDispatcher`、`WebDAVSyncManager`、`ShortcutManager`、`InlineBookmarkManager`、`NetworkMonitor`、`PackManager`、`RemoteConfigManager`、`GeminiMystuffBridge`。

所有模块通过 `subscribeModuleUpdates()` 响应设置变更热更新。

### 5.3 状态管理（`src/stores/`）

全部使用 Zustand + persist（扩展走 `chrome.storage.local`，油猴走同步 GM 存储适配）：

`settings-store`、`conversations-store`、`prompts-store`、`prompt-chains-store`、`folders-store`、`tags-store`、`queue-store`、`anchor-store`、`bookmarks-store`、`reading-history-store`、`claude-sessionkeys-store`（共 11 个 store；`chrome-adapter.ts` 为存储适配层）。

### 5.4 全局搜索（`src/components/global-search/`）

支持 `type:`、`folder:`、`tag:`、`is:`、`level:`、`date:` 语法过滤，拆分为 `syntax.ts`（解析）、`useGlobalSearchData.ts`（数据聚合）、`useGlobalSearchKeyboard.ts`（键盘导航）、`useGlobalSearchPreview.ts`（预览）、`useGlobalSearchSyntax.ts`（高亮与补全）。

### 5.5 Background 消息与跨世界事件（`src/utils/messaging.ts`）

当前共定义 **32 个 `MSG_*` 扩展消息常量**与 **13 个 `EVENT_*` 跨世界窗口事件常量**：

| 类别       | 常量前缀 / 代表常量                                                                                                                    | 用途                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 通知与导航 | `MSG_SHOW_NOTIFICATION`, `MSG_FOCUS_TAB`, `MSG_OPEN_OPTIONS_PAGE`, `MSG_OPEN_URL`, `MSG_EXTENSION_UPDATE_AVAILABLE`, `MSG_START_NEW_CONVERSATION` | 桌面通知、标签聚焦、打开页面、发起新对话   |
| 代理与同步 | `MSG_PROXY_FETCH`, `MSG_WEBDAV_ACTION`, `MSG_WEBDAV_REQUEST`                                                                           | 绕过 CORS 的代理抓取与 WebDAV 同步         |
| 远程配置   | `MSG_CHECK_REMOTE_CONFIG`, `MSG_GET_REMOTE_CONFIG_STATE`, `MSG_IGNORE/INSTALL_LOCAL/REMOVE_LOCAL/CLEAR/RESET/REAPPLY_REMOTE_CONFIG_*`  | 内置配置热修 patch 检查、本地导入与回滚    |
| 权限与站点包 | `MSG_CHECK_PERMISSION(S)`, `MSG_REQUEST/REVOKE_PERMISSIONS`, `MSG_ENSURE_SITE_PACK_*`, `MSG_RECONCILE_SITE_PACK_REGISTRATIONS`         | 可选权限申请/撤销、SitePack 动态域名注册   |
| 数据维护   | `MSG_CLEAR_ALL_DATA`, `MSG_RESTORE_DATA`                                                                                               | 清除或恢复后通知各上下文重置/重载          |
| 站点专项   | `MSG_SET/TEST/GET_CLAUDE_SESSION_KEY`, `MSG_CHECK_CLAUDE_GENERATING`, `MSG_SWITCH_NEXT_CLAUDE_KEY`, `MSG_GET_AISTUDIO_MODELS`          | Claude 账号切换检测、AI Studio 模型列表    |
| 跨世界事件 | `EVENT_MONITOR_*`（7 个）、`EVENT_OUTLINE_*`（2 个）、`EVENT_GEMINI_MYSTUFF_*`（2 个）、`EVENT_EXTENSION_UPDATE_AVAILABLE`、`EVENT_PAGE_URL_CHANGE` | Main World 与 Isolated World 通信          |

### 5.6 国际化与扩展产物编码门禁

- **双体系 11 语种**：应用内文案源文件在 `src/locales/<lang>/index.ts`，扩展 manifest 文案在 `locales/<lang>/messages.json`。
- **扩展端语言资源外置**：构建前由 `scripts/prepare-locale-assets.ts` 生成 `assets/locales/messages.json`（Git 忽略，避免内联进每个 JS 触发 Firefox AMO 单文件 5MB 上限），运行时通过 `initI18n()` 加载，英文静态兜底。渲染入口和依赖文案的 store 播种必须等 `initI18n()` 就绪；油猴端走 GM `@resource`，两端统一对齐 `initI18n()`。开发服务运行中改文案后执行 `pnpm prepare:locale-assets` 或重启。
- **产物非字符编码检查**：Chrome 扩展加载器会拒绝含 Unicode noncharacter 的内容脚本。KaTeX Lexer 正则中的 `\uFFFF` 会被 Parcel 重打印为字面字符，已用 `patches/katex@*.patch` 在依赖源码侧修复；`build` / `build:firefox` 末尾执行 `scripts/check-bundle-encoding.ts` 冒烟，回潮直接构建失败。

## 6. 关键数据流

- **启动挂载**：支持站点命中 → `ui-entry.tsx`（或油猴 `entry.tsx`）→ `extension-bootstrap.ts` 初始化适配器 → `initCoreModules()` → Shadow DOM 挂载 `App.tsx`。
- **设置热更新**：设置 UI → `useSettingsStore.updateNestedSetting()` → Zustand persist → 平台存储 → `subscribeModuleUpdates()` 推送到各管理器。
- **对话管理**：`ConversationObserverConfig` 监听 DOM（或 NetworkMonitor 转发响应）→ `ConversationManager` 聚合 → `conversations-store` 持久化。
- **WebDAV 同步**：`WebDAVSyncManager` → `MSG_WEBDAV_REQUEST` → Background 代理（油猴走 `GM_xmlhttpRequest`）→ WebDAV 服务器。
