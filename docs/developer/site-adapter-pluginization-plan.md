# 站点适配插件化实施方案（SitePack）

> 创建日期：2026-07-22
> 关联 Issue：[#184](https://github.com/urzeye/ophel/issues/184)
> 分析范围：`src/adapters/`、`src/contents/`、`src/platform/`、`src/tabs/options/`、`package.json`（manifest）、`vite.userscript.config.ts`
> 任务拆分：同目录 [`site-adapter-pluginization-tasks.csv`](./site-adapter-pluginization-tasks.csv)
>
> **已确认的决策**：
>
> 1. 接受 L2 声明式适配包只提供功能子集（官方适配 = 全功能，社区适配包 = 核心功能，UI 明示分级）；
> 2. Registry 托管于主仓（`registry/` 目录 + CI 发布到 `registry-dist` 分支，不建独立仓库）。

---

## 1. 背景与目标

### 1.1 痛点

- 已支持 15 个站点，适配代码约 **3.5 万行**（单个适配器 1000～4900 行），全部硬编码在 `src/adapters/` 中，依赖 hostname 匹配激活（`src/adapters/index.ts:25`）。
- 站点一次改版就需要：重新分析 DOM → 修改适配器 → 回归验证 → **等待商店审核发版**（Chrome 审核有时数天），期间用户功能失效。
- 用户持续请求适配新站点（#184），每个新站点都是一份长期维护负债，目前已宣布暂停扩展新站点。

### 1.2 目标

1. **热修通道**：站点改版后，无需发版即可云端下发选择器修复（存量 15 站维护降本的主要手段）。
2. **声明式适配包（SitePack）**：新站点可以用一份纯 JSON 配置完成核心功能适配，云端下发、用户自装、社区 PR 贡献。
3. **用户自助**：支持添加自定义域名 + 页内适配向导，把"求适配的用户"转化为"贡献配置的用户"。
4. **同构站点杠杆**：为 Open WebUI / LobeChat 等开源 ChatUI 提供按 DOM 特征探测的通用适配包，一份配置覆盖大量自部署实例。

### 1.3 非目标（明确不做）

- ❌ **扩展形态下发/执行任何远程代码**（含"脚本字段"式 DSL），见 §3 红线。
- ❌ L2 覆盖 SiteAdapter 全部能力面（附件导出、思维链提取、站点 API 删除会话等保持 L1 专属）。
- ❌ v1 支持第三方 registry 源（仅官方源 + 本地文件导入，降低攻击面，后续再评估）。
- ❌ 重写现有 15 个适配器（渐进配置化，行为不变）。

---

## 2. 现状分析

### 2.1 代码规模与耦合点

| 事实 | 位置 | 对方案的影响 |
| --- | --- | --- |
| 适配器 15 个共约 3.5 万行，大量命令式逻辑（Shadow DOM、Flutter iframe、附件导出、API 删会话） | `src/adapters/*.ts` | 纯声明式 DSL 无法覆盖全部 → 分层体系（§4） |
| `SiteAdapter` 基类已大量"配置驱动"：`ModelSwitcherConfig`、`NetworkMonitorConfig`、`ZenModeConfig`、`ExportConfig` 等为纯数据，通用实现在基类（`lockModel`、`startNewConversation`、`loadAllConversations`…） | `src/adapters/base.ts` | L2 schema 直接复用这些接口形状，成本低 |
| `getCapabilities()` 声明式迁移刚起步（仅 ima 使用） | `base.ts:653` | 能力分级 UI 联动在此基础上扩展 |
| `getAdapter()` 为**同步**函数，9 处调用（`main.ts:455`、`App.tsx:407` 等） | `src/adapters/index.ts:46` | 不能改成 async，需"入口预加载 + 同步匹配"设计（§6.2） |
| `SITE_IDS` 常量耦合 33 个文件 / 157 处，部分 TS 类型收紧为 `keyof typeof SITE_IDS` | `src/constants/defaults.ts:115` | 动态 siteId 需要类型放宽与逐点排查（§6.8） |
| matches 硬编码 6 处：manifest `host_permissions`、4 个宽匹配内容脚本（`main.ts` / `ui-entry.tsx` / `monitor-entry.ts` / `scroll-lock-main.ts`）、userscript `@match` | `package.json:116`、`src/contents/`、`vite.userscript.config.ts:446` | 新域名需动态注册（扩展）/ 用户匹配（油猴）（§6.9） |
| 站点专属 MAIN world 预注入脚本（`aistudio-preload`、`yuanbao-monaco-main`、`gemini-canvas-main` 等） | `src/contents/` | 此类能力**不可配置化**，永远属于 L1 |
| 已有 `optional_host_permissions: ["<all_urls>"]` + `chrome.permissions.request` 流程（`perm-request.tsx`） | `package.json:136`、`src/tabs/perm-request.tsx` | 动态授权地基已就位，直接复用 |
| 双分发形态：Plasmo MV3 扩展 + vite-plugin-monkey 油猴脚本，平台抽象层 `src/platform/` | `package.json` scripts | 网络/存储实现走平台抽象（fetch vs `GM_xmlhttpRequest`） |

### 2.2 同类先例（证明模式可行且商店合规）

| 项目 | 模式 | 借鉴点 |
| --- | --- | --- |
| uBlock Origin | 云端滤镜列表（纯数据） | registry + 多源下发 + 本地规则 |
| Dark Reader | per-site fixes 配置，内置默认 + 云端更新 + 用户本地覆盖 + PR 回流 | **与本方案的三层合并完全同构**，是主要参照 |
| 沉浸式翻译 | 站点规则 JSON，内置 + 云端 + 用户自定义 | 规则版本化、能力开关 |
| Stylus | 用户导入第三方样式需确认 | 本地导入的风险提示交互 |

---

## 3. 硬约束与设计红线

1. **MV3 远程代码禁令**：Chrome Web Store 与 Firefox AMO 均禁止扩展获取并执行远程代码，且政策明确把"解释执行的语言"计算在内。因此：
   - 云端只能下发**声明式配置数据**（选择器、正则、开关、字段映射）；
   - **DSL 永不引入脚本/表达式字段**。表达不了的站点 → 写代码进主仓成为 L1，或走 userscript 形态的 L3。这是防"表达力蠕变"的铁律，任何 PR 想给 schema 加"一小段 JS"都必须拒绝。
2. **动态注册内容脚本合规**：`chrome.scripting.registerContentScripts` 注册的是**扩展包内**的 JS 文件到新 origin，属于合规操作；需要 manifest 增加 `scripting` 权限（不弹权限警告），host 访问靠已有的 `optional_host_permissions` 运行时授权。
3. **userscript 形态无远程代码限制**，但 v1 仍与扩展保持同一套数据方案，代码级 L3 插件仅作为远期评估项（P4-01）。
4. **隐私**：远程配置拉取为纯 GET 静态 CDN 资源，不携带任何用户数据，不影响 Firefox `data_collection_permissions: none` 声明；设置页提供开关与说明。

---

## 4. 总体架构：三层适配体系

```
┌────────────────────────────────────────────────────────────┐
│ L1 内置全功能适配器（代码，随版本发布）                        │
│    现有 15 站。逐步"配置化"：selector 等抽为结构化默认值，      │
│    获得云端热修能力；命令式逻辑保留在代码中。                   │
├────────────────────────────────────────────────────────────┤
│ L2 声明式适配包 SitePack（JSON 数据）                        │
│    来源：官方 registry 下发 / 用户本地导入 / 适配向导生成。    │
│    由通用 DeclarativeAdapter 解释执行，提供功能子集。          │
├────────────────────────────────────────────────────────────┤
│ L3 代码级适配器（仅 userscript 形态 / 自行构建，远期）         │
│    社区代码适配器通过 PR 进主仓"转正"为 L1。                  │
└────────────────────────────────────────────────────────────┘
```

### 4.1 数据流

```
主仓 registry/sites/*.json + registry/patches/*.json
        │  CI 校验 + 构建（sha256、index.json）
        ▼
registry-dist 分支  ──→  jsDelivr（主源）/ raw.githubusercontent（备源）
        │  RemoteConfigManager 定时/手动拉取，完整性校验
        ▼
platform storage 缓存（packs + patches + index 元数据）
        │  入口 initAdapterRegistry() 预加载（同步匹配前完成）
        ▼
AdapterRegistry：内置适配器（合并 patch 后的 config） + DeclarativeAdapter 实例
        │  getAdapter()（保持同步，签名不变）
        ▼
core 各 Manager / React 面板（按 capabilities 显隐功能）
```

### 4.2 L2 能力矩阵（决定 schema 范围与 UI 分级文案）

| 功能 | L2 支持 | 实现方式 |
| --- | --- | --- |
| 面板 / Prompt 词库 / 会话文件夹 / 全局搜索 | ✅ | 站点无关，天然可用 |
| Prompt 插入 + 发送 | ✅ | `input.mode`（textarea / contenteditable）通用实现 + `submitKey` |
| 大纲（AI 回复标题 h1-h6） | ✅ | 响应容器内通用提取 |
| 大纲（用户提问节点） | ✅ | `selectors.userQuery` |
| 页面加宽 / Zen 模式 / 净化模式 | ✅ | 纯配置（已有接口形状） |
| 新对话 / 停止生成 | ✅ | 基类通用实现 + 按钮选择器 |
| 模型锁定 | ✅ | `ModelSwitcherConfig` 纯配置，基类 `lockModel` 通用实现 |
| 生成状态检测 | ✅ | 网络监控 urlPatterns + DOM existsSelectors |
| 会话列表读取 / 文件夹收纳 / SPA 跳转 | ✅ | `conversation` DSL（§5 字段映射） |
| 导出 Markdown（基础，无附件） | ✅ | `ExportConfig` |
| 阅读位置恢复 / 书签锚点 / 标签页重命名 / 最新回复复制 | ✅ | 基类通用实现，依赖上述选择器 |
| Mermaid 渲染 | ✅ | pack 声明 `native/fallback`，缺省 `native`（不干预） |
| Quick Quote | ⚠️ 默认 disabled | 锚点注入有崩页风险（Qianwen 前车之鉴），pack 可显式声明 enabled |
| 宿主主题联动 | ⚠️ 默认关闭 | 仅支持通用 class 切换声明，缺省 `supportsHostThemeSync=false` |
| 会话删除（API/UI 自动化） | ❌ L1 专属 | 站点 API 各异，无法声明式表达 |
| 附件/思维链/Artifact 导出 | ❌ L1 专属 | 命令式逻辑 |
| 公式源码精准提取 | ❌（有通用 KaTeX 兜底） | CopyManager 兜底路径仍可用 |
| MAIN world 预注入类能力 | ❌ L1 专属 | 无法动态化（政策 + 时序） |

---

## 5. SitePack Schema v1

### 5.1 TS 类型定义（`src/adapters/declarative/types.ts`）

```ts
/** 顶层清单。除 selectors 外均可省略，省略即"该能力不可用/使用缺省行为" */
export interface SitePackManifest {
  /** 固定为 1；扩展忽略高于自身支持的 schemaVersion */
  schemaVersion: 1
  /** ^[a-z0-9-]{2,40}$，全局唯一，运行期以 "pack:" 前缀隔离内置 SITE_IDS */
  id: string
  /** 包版本，整数递增 */
  version: number
  /** 低于该扩展版本时拒绝启用（semver 字符串） */
  minAppVersion: string
  name: string
  /** 可选多语名称，如 { "zh-CN": "...", "en": "..." } */
  nameI18n?: Record<string, string>
  description?: string
  /** match pattern 数组：必须 https、禁止 <all_urls> 与顶层通配、每包 ≤ 10 条 */
  matches: string[]
  /** 可选：按 DOM 特征激活（同构开源 ChatUI 用），命中任一条即激活 */
  detect?: SiteDetectRule[]
  theme?: { primary: string; secondary: string }
  /** 能力声明，驱动 UI 显隐（§6.7），未声明的能力一律隐藏入口 */
  capabilities: SitePackCapability[]
  selectors: SitePackSelectors
  input?: SitePackInputConfig
  conversation?: SitePackConversationConfig
  generating?: SitePackGeneratingConfig
  session?: SitePackSessionConfig
  networkMonitor?: NetworkMonitorConfig          // 复用 base.ts 现有接口
  modelSwitcher?: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export?: ExportConfig                          // 复用 base.ts 现有接口
  zenMode?: ZenModeConfig                        // 复用（extraCss 受 §8 限制）
  cleanMode?: ZenModeConfig
  widthSelectors?: WidthSelectorConfig[]         // 复用（transformValue 函数字段除外）
  mermaidSupport?: "native" | "fallback"
  quickQuote?: "enabled" | "native" | "disabled" // 缺省 disabled
}

export type SitePackCapability =
  | "outline" | "outline-user-queries" | "conversation-list" | "export-basic"
  | "model-lock" | "generation-detect" | "new-chat" | "stop-generation"
  | "width" | "zen" | "clean" | "prompt-insert" | "reading-history"

export interface SiteDetectRule {
  /** 页面存在该选择器即判定命中 */
  selectorExists?: string
  /** <meta name="generator" content=...> 包含该子串 */
  metaGenerator?: string
}

export interface SitePackSelectors {
  textarea: string[]                 // 必填
  submitButton?: string[]
  responseContainer?: string         // 大纲/观察目标容器
  chatContent?: string[]             // 消息级元素（滚动锚点/书签）
  userQuery?: string
  assistantResponse?: string
  newChatButton?: string[]
  stopButton?: string[]
  scrollContainer?: string[]         // 缺省用基类通用探测
  sidebarScrollContainer?: string
}

export interface SitePackInputConfig {
  mode: "textarea" | "contenteditable"
  submitKey?: "Enter" | "Ctrl+Enter"
}

/** 会话列表字段映射：替代 L1 中 extractInfo/getTitleElement 函数 */
export interface SitePackConversationConfig {
  itemSelector: string
  /** id 提取：attr 取属性值（缺省 "href"），regex 第 1 捕获组为 id */
  idFrom: { attr?: string; regex: string }
  titleSelector?: string             // 缺省取 item 的 textContent
  /** 以 / 开头的同源路径模板，{id} 占位 */
  urlTemplate: string
  /** 判定激活项：item 匹配该选择器即为当前会话 */
  activeMatch?: string
  /** SPA 跳转策略：click-item 模拟点击列表项（失败回退 location），location 直接跳转 */
  navigationStrategy?: "click-item" | "location"
  shadow?: boolean
}

export interface SitePackGeneratingConfig {
  /** 任一选择器存在且可见 → 正在生成（通常用停止按钮） */
  existsSelectors: string[]
}

export interface SitePackSessionConfig {
  /** 从 pathname 提取会话 id 的正则（第 1 捕获组），缺省用基类"最后一段路径" */
  idFromPathRegex?: string
  /** 命中任一 pattern（对 pathname 做正则匹配）→ 新对话页 */
  newConversationPathPatterns?: string[]
  /** 分享页 pathname 前缀，缺省 "/share/" */
  sharePathPrefix?: string
  /** 新标签页 URL（相对路径），缺省 origin */
  newTabPath?: string
}
```

### 5.2 设计要点

- **接口形状最大化复用 `base.ts` 现有 Config**（`NetworkMonitorConfig`、`ModelSwitcherConfig`、`ExportConfig`、`ZenModeConfig`、`WidthSelectorConfig`），避免出现两套平行概念；含函数字段的接口（如 `WidthSelectorConfig.transformValue`、`ConversationObserverConfig.extractInfo`）在 schema 中以**受限映射原语**替代。
- `capabilities` 是**契约**而非注释：运行时按它显隐 UI；CI 校验声明的能力与所需字段是否齐备（例如声明 `conversation-list` 必须提供 `conversation` 配置）。
- 所有"提取函数"类扩展点收敛为 4 类原语：**选择器**、**属性名**、**捕获组正则**、**路径模板**。v2 前不新增原语种类。

### 5.3 示例包（假想 Duck.ai）

```json
{
  "schemaVersion": 1,
  "id": "duck-ai",
  "version": 1,
  "minAppVersion": "1.2.0",
  "name": "Duck.ai",
  "nameI18n": { "zh-CN": "Duck.ai" },
  "matches": ["https://duck.ai/*", "https://duckduckgo.com/*"],
  "theme": { "primary": "#de5833", "secondary": "#f7f7f7" },
  "capabilities": ["prompt-insert", "outline", "outline-user-queries", "generation-detect", "new-chat", "stop-generation", "width", "zen", "export-basic"],
  "selectors": {
    "textarea": ["textarea[name='user-prompt']"],
    "submitButton": ["button[type='submit'][aria-label*='Send']"],
    "responseContainer": "main section[data-area='chat']",
    "chatContent": ["article[data-message]"],
    "userQuery": "article[data-message='user']",
    "assistantResponse": "article[data-message='assistant']",
    "newChatButton": ["button[aria-label*='New chat']"],
    "stopButton": ["button[aria-label*='Stop']"]
  },
  "input": { "mode": "textarea", "submitKey": "Enter" },
  "generating": { "existsSelectors": ["button[aria-label*='Stop']"] },
  "session": { "newConversationPathPatterns": ["^/(\\?.*)?$"] },
  "export": {
    "userQuerySelector": "article[data-message='user']",
    "assistantResponseSelector": "article[data-message='assistant']",
    "turnSelector": null,
    "useShadowDOM": false
  },
  "zenMode": { "hide": ["header nav", "aside[data-area='sidebar']"] }
}
```

---

## 6. 核心模块设计

### 6.1 新增目录与文件

```
src/adapters/declarative/
  types.ts            # §5 schema 类型
  validate.ts         # 运行时校验器（白名单键 + 约束，见 §8）
  merge.ts            # 三层配置合并器
  adapter.ts          # DeclarativeAdapter extends SiteAdapter
  registry.ts         # AdapterRegistry：预加载已装包 → 实例化 → 注入匹配链
src/core/
  remote-config-manager.ts   # 远程 index/包/patch 拉取、缓存、TTL、完整性校验
  pack-manager.ts            # 安装/更新/卸载/启用禁用/冲突检查
  health-check-manager.ts    # 选择器健康自检（Phase 2）
registry/
  schema/site-pack.schema.json
  sites/*.json               # L2 适配包源文件
  patches/*.json             # L1 内置站点 selector 热修 patch
  scripts/validate.mjs       # CI 与本地校验（与 validate.ts 同规则）
  scripts/build-dist.mjs     # 生成 dist：index.json（含 sha256）+ 包文件
```

### 6.2 AdapterRegistry 与启动时序（关键设计）

`getAdapter()` 有 9 处同步调用（`App.tsx`、`QuickButtons.tsx` 等），**不改签名、不 async 化**。改为入口预加载：

```ts
// adapters/index.ts（改造后）
const builtinAdapters: SiteAdapter[] = [/* 现有 15 个，顺序不变 */]
let dynamicAdapters: SiteAdapter[] = []

/** 入口 bundle 启动时 await 一次：读 storage 中已启用 pack + patch 合并结果 */
export async function initAdapterRegistry(): Promise<void> {
  dynamicAdapters = await loadEnabledPacks()  // 校验失败的包跳过并记录
}

export function getAdapter(): SiteAdapter | null {
  for (const a of builtinAdapters) if (a.match()) return a      // 内置优先，零成本短路
  for (const a of dynamicAdapters) if (a.match()) return a
  return null
}
```

- 需要 await 的入口：`src/contents/main.ts`、`src/contents/ui-entry.tsx`、`src/platform/userscript/entry.tsx`（各 bundle 模块实例独立，须各自初始化）。`monitor-entry.ts` 若消费 adapter 同样处理。
- **匹配冲突规则**：内置 > 用户本地包 > registry 包；一个 origin 同时只允许启用一个 pack（安装时检查并提示）；v1 禁止 pack 声明与内置站点重叠的 matches（CI 拒绝）——修改内置站点的唯一通道是 patch。

### 6.3 DeclarativeAdapter 方法映射

`DeclarativeAdapter extends SiteAdapter`，构造函数接收校验后的 `SitePackManifest`。分四类：

| 类别 | 方法（示例） | 实现 |
| --- | --- | --- |
| 直接映射 | `match`（matches + detect）、`getSiteId`（`"pack:" + id`）、`getName/getThemeColors/getTextareaSelectors/getSubmitButtonSelectors/getNewChatButtonSelectors/getStopButtonSelectors/getResponseContainerSelector/getChatContentSelectors/getUserQuerySelector/getExportConfig/getNetworkMonitorConfig/getModelSwitcherConfig/getZenModeConfig/getCleanModeConfig/getWidthSelectors/getSubmitKeyConfig/getQuickQuoteSupportMode/getAssistantMermaidSupportMode` | 读 manifest 字段返回 |
| 基类通用实现直接继承 | `findTextarea/lockModel/startNewConversation/stopGeneration/loadAllConversations/getVisibleAnchorElement/restoreScroll/getLastCodeBlockText/getSessionName` 等 | 无需覆盖 |
| DSL 原语驱动 | `insertPrompt/clearTextarea`（input.mode 双策略：textarea 走 value setter + input 事件；contenteditable 走 focus + `execCommand("insertText")` + textContent 兜底）；`extractOutline`（responseContainer 内 h1-h6 + userQuery，文档序排序、排除 `.gh-` 容器、复用基类字数统计）；`getConversationList/getConversationObserverConfig/navigateToConversation`（由 `conversation` 字段映射生成 extractInfo/getTitleElement 闭包）；`isGenerating`（existsSelectors 可见性）；`isNewConversation/getSessionId/isSharePage/getNewTabUrl`（session 配置） | Phase 1 逐个实现 |
| 不支持（保持基类缺省） | `deleteConversationOnSite/extractExportBundle/extractFormulaCopySource/toggleTheme` 等 | 返回缺省值，UI 按 capabilities 隐藏入口 |

### 6.4 配置三层合并（`merge.ts`）

用于两个场景：① L1 内置站点 selector 热修；② L2 pack 的用户本地微调（远期）。

```
最终 config = deepMerge(内置默认值, 远端 patch, 用户本地覆盖)
```

合并规则（必须写成单测锁定）：**对象深合并；数组整体替换（不做元素级合并，避免歧义）；显式 `null` 表示删除该键**。patch 文件结构 = `{ targetSiteId, patchVersion, minAppVersion, config: <SitePack 同构局部字段> }`。

L1 侧接入方式：每个已配置化的内置适配器把 selector 等纯数据抽为文件内 `const XXX_CONFIG: SitePackSelectors & …` 常量，构造时经 `resolveSiteConfig(siteId, XXX_CONFIG)` 拿合并结果，方法体从 `this.config` 读取。**未配置化的适配器完全不受影响**（渐进迁移）。

### 6.5 RemoteConfigManager

- **源**（按顺序 fallback）：
  1. `https://cdn.jsdelivr.net/gh/urzeye/ophel@registry-dist/index.json`
  2. `https://raw.githubusercontent.com/urzeye/ophel/registry-dist/index.json`
- **流程**：拉 `index.json`（小文件）→ 与本地缓存版本 diff → 仅拉取有更新的包/patch 文件 → 对照 index 中的 **sha256 校验** → 写入 platform storage → 通知 AdapterRegistry 下次加载生效（当前页提示"刷新后生效"）。
- **节奏**：扩展端 background `chrome.alarms` 每 24h；userscript 端启动时节流检查（间隔 ≥ 24h）；设置页"立即检查"按钮直连该流程。
- **平台抽象**：扩展走 background `fetch`（CDN 域名无需 host 权限即可 fetch？——**不行，跨域 fetch 需要权限或 CORS**；jsDelivr/raw 均带 `Access-Control-Allow-Origin: *`，content/background fetch 可直接使用，无需新增 host 权限）；userscript 走 `GM_xmlhttpRequest`（`@connect: *` 已开放）。
- **降级**：两源均失败 → 静默使用本地缓存，设置页显示上次成功时间。

### 6.6 PackManager

- 安装来源：registry 浏览列表 / 本地 JSON 文件导入（导入必须过 validate + 风险确认弹窗）。
- 存储 key（platform storage）：`sitepacks/installed`（包体 + 元数据：来源、安装时间、启用状态）、`sitepacks/remote-state`（index 缓存、lastCheck）、`siteconfig/overrides`（用户本地覆盖，远期）。预留 `storageSchemaVersion` 做迁移。
- 更新策略：registry 来源的包随 RemoteConfigManager 自动更新（可关）；本地导入的包不自动更新。
- 卸载：清理包体 + 该站点 settings 残留提示（可选保留）+ 动态注册的内容脚本注销（Phase 2）。

### 6.7 capabilities 与 UI 联动

- `DeclarativeAdapter.getCapabilities()` 返回 manifest 声明；同时新增细粒度查询 `hasCapability(cap)`（内置适配器缺省全量返回 true，保持现状）。
- 改造点：`SiteSettingsPage.tsx`（各设置卡片按能力显隐）、面板 `QuickButtons`/`MainPanel` 功能按钮、`ConversationsTab`（无 `conversation-list` 时隐藏站点会话区）。
- 分级文案：L2 站点设置页顶部显示"社区适配包（核心功能）"徽标 + 说明链接，管理预期。

### 6.8 动态 siteId 全链路

- `getSiteId()` 返回 `"pack:duck-ai"` 形式，天然避开内置 id 冲突。
- 排查 33 个耦合文件：settings 各处 `Record<siteId, T>` 结构本身兼容任意 string key，重点是放宽收紧类型（如 `SiteSettingsPage.tsx:343` 的 `keyof typeof settings.layout.cleanMode` → `string`）与新增 `isBuiltinSiteId()` 工具。
- `SUPPORTED_AI_PLATFORMS`（全局搜索/会话归属使用）：PackManager 提供 `getDynamicPlatforms()` 合并进消费方；图标缺省用站点 favicon（`https://{host}/favicon.ico`）+ 首字母兜底。

### 6.9 新域名激活（Phase 2）

**扩展端**（动态注册，合规）：

1. manifest `permissions` 增加 `"scripting"`（无权限警告）。
2. 安装含未授权域名的 pack → 复用 `perm-request.tsx` 请求 origin（`optional_host_permissions: ["<all_urls>"]` 已具备）。
3. background 从 `chrome.runtime.getManifest().content_scripts` 读取 `main` / `ui-entry` / `monitor-entry` / `scroll-lock-main` 对应的 js/css 产物路径，`chrome.scripting.registerContentScripts({ id, matches, js, css, runAt, persistAcrossSessions: true })` 注册到新 origin——**不依赖构建产物文件名稳定性**。
4. 启动时校验动态注册列表与已装包一致（`getRegisteredContentScripts` 对账）；卸载包/撤销权限时注销。
5. Firefox 验证项：MV3 下 host permission 全部默认 optional，授权交互与 Chrome 不同，需专项回归（任务 P2-09）。

**userscript 端**（无法运行时扩 `@match`）：提供设置页指引 + 文档，教用户在 Tampermonkey「设置 → 包含/排除」加 User matches；检测到已装 pack 的域名未被覆盖时展示带复制按钮的提示。

### 6.10 选择器健康自检（Phase 2）

- 时机：adapter 激活后延迟 8s（且 DOM ready、非新对话页）检查核心选择器命中：`textarea`、`responseContainer`、（会话页时）`chatContent`。
- 防抖：结果写入 storage，**连续 2 次页面加载失败**才提示，避免偶发误报。
- 提示：面板顶部黄条「该站点适配可能已失效」+ 按钮 [检查配置更新]（触发 RemoteConfigManager）/ [报告问题]（预填 issue 模板：站点、扩展版本、配置版本、失效选择器列表）。
- 内置与 L2 适配器共用此机制——这让"改版感知"从用户报障变为主动发现。

### 6.11 适配向导（Phase 3 概要）

- 入口：已授权但无适配的站点上，面板显示「为此站点创建适配」；设置页也有入口。
- 流程：逐步点选 → 输入框 → 发送按钮 → 对话容器 → 用户消息 → AI 回复 →（可选）会话列表项/新对话按钮 → 每步即时校验（命中数、唯一性）→ 完成后**大纲实时预览** → 保存为本地 pack（立即生效）→ 导出 JSON / 复制并打开预填 PR 页面。
- 选择器生成优先级：`data-testid` > `id` > `aria-*` > 稳定类名组合；过滤 CSS-Modules/utility hash 类（如 `/[a-f0-9]{5,}/`）；生成后做唯一性验证与祖先链收缩。拾取 overlay 复用面板 Shadow DOM 体系，避免污染宿主页。

---

## 7. Registry（主仓）

### 7.1 目录与发布

- 源文件在 `main` 分支 `registry/` 目录（§6.1）；push 到 main 触发 GH Actions：`validate.mjs` 全量校验 → `build-dist.mjs` 生成 `index.json`（含每个文件的 version/matches/sha256/minAppVersion 摘要）→ **强制推送到 `registry-dist` 分支**（独立分支：jsDelivr 缓存可单独 purge，registry 更新不产生 main 提交噪音、不触发 release 流程）。
- `index.json` 结构：

```json
{
  "generatedAt": "2026-07-22T00:00:00Z",
  "schemaVersion": 1,
  "packs": [{ "id": "duck-ai", "version": 3, "minAppVersion": "1.2.0", "matches": ["https://duck.ai/*"], "file": "sites/duck-ai.json", "sha256": "…" }],
  "patches": [{ "targetSiteId": "zai", "patchVersion": 2, "minAppVersion": "1.1.8", "file": "patches/zai.json", "sha256": "…" }]
}
```

### 7.2 贡献流程

- PR 模板（新增 `.github/PULL_REQUEST_TEMPLATE/site-pack.md`）：站点名/URL、测试过的功能勾选表（对应 capabilities）、截图。
- CI 校验（PR 触发，任务 P0-07）：schema 合法、id 唯一且不与内置冲突、matches 不与内置/已有包重叠、正则可编译且长度合规、CSS 黑名单、capabilities 与字段齐备性。
- 审核 checklist（`docs/developer/site-pack-review-checklist.md`，随 P0-12 产出）：人工在目标站点冒烟核心能力后合并。**审核一份 JSON 的成本远低于审核千行级 TS 适配器 PR，这是社区扩展可持续的关键。**

### 7.3 版本策略

| 字段 | 语义 |
| --- | --- |
| `schemaVersion` | DSL 版本。扩展只消费 ≤ 自身支持的版本，高版本包静默跳过（列表中置灰提示"需升级扩展"） |
| `version` / `patchVersion` | 包/补丁自身版本，整数递增，驱动增量更新 |
| `minAppVersion` | 低于此扩展版本不启用（防止依赖新原语的包在老版本上半残运行） |

---

## 8. 安全模型

### 8.1 威胁分析

| 威胁 | 途径 | 对策 |
| --- | --- | --- |
| 恶意 CSS（UI 欺骗、`url()` 数据外带） | `zenMode/cleanMode.styles.extraCss`、`widthSelectors.extraCss` | 字段长度 ≤ 2000；归一化后黑名单 `url(`、`@import`、`expression(`、`javascript:`；CI + 运行时双重校验 |
| ReDoS | `idFrom.regex`、`session.idFromPathRegex` 等 | 长度 ≤ 200；编译失败即拒；CI 跑 safe-regex 类检查；运行时仅对短输入（pathname/属性值）执行 |
| CDN 单文件篡改 | jsDelivr/raw | 包文件与 index 中 sha256 比对；index 本身信任 HTTPS + 双源交叉 |
| 恶意本地导入包 | 用户导入第三方 JSON | 同一校验器 + 风险确认弹窗（明示：适配包可修改页面样式与 Ophel 在该站点的行为，仅导入可信来源）|
| 表达力蠕变演变为远程代码 | schema 演进 | §3 红线：schema 永不加脚本/表达式字段，PR 审核硬性拒绝 |
| 域名劫持内置站点 | pack matches 覆盖内置域名 | CI + 运行时双重拒绝；修改内置只能走 patch 通道 |

### 8.2 校验器统一约束（`validate.ts` 与 `registry/scripts/validate.mjs` 共用规则）

- 包文件 ≤ 64KB；数组字段长度 ≤ 50；选择器字符串 ≤ 500 字符。
- 未知键一律拒绝（白名单制，防止未来字段被老版本静默误读）。
- `matches`：`^https://`、禁 `<all_urls>`/`https://*/*`、≤ 10 条。
- `urlTemplate`/`newTabPath` 必须以 `/` 开头（锁定同源）。
- `id`：`^[a-z0-9-]{2,40}$`。
- 校验实现优先用手写轻量校验器（避免引入 ajv 增加包体；`effect` 已在依赖中，若用 `effect/Schema` 需评估 bundle 影响后决定，二选一在 P0-01 定案）。

---

## 9. 阶段划分

> 详细任务、依赖与工作量见 [`site-adapter-pluginization-tasks.csv`](./site-adapter-pluginization-tasks.csv)。规模口径：S ≈ 0.5–1 人日，M ≈ 1–3，L ≈ 3–5，XL ≥ 5。

### Phase 0：Schema 地基 + 云端热修通道（性价比最高，先行）

- **范围**：schema 类型与校验器、三层合并器、RemoteConfigManager、registry 目录与 CI、zai/ima 两站配置化试点、设置页更新区块。
- **不做**：DeclarativeAdapter、新站点、任何 UI 大改。
- **验收（DoD）**：
  1. zai/ima 配置化后全功能回归通过（行为零变化）；
  2. 发布一个 zai 测试 patch，自动（≤24h）与手动两条路径均能让用户侧 selector 生效，且可回滚（发布 revert patch）；
  3. registry PR 的 CI 校验可拦截全部 §8.2 非法样例。
- **风险**：jsDelivr 国内可用性波动 → 双源 fallback 已覆盖；合并语义歧义 → 单测锁定。

### Phase 1：DeclarativeAdapter + SitePack 安装闭环

- **范围**：DeclarativeAdapter 全部映射、AdapterRegistry 启动时序、PackManager、动态 siteId 放宽、capabilities UI 联动、适配包管理页、首个官方包（Duck.ai，回应 #184 社区请求）。
- **验收（DoD）**：
  1. Duck.ai 以纯 JSON 从设置页安装后，能力矩阵 ✅ 项全部可用（大纲/插入发送/宽度/Zen/基础导出/新对话/停止/生成检测）；
  2. 未声明能力在设置页与面板完全不可见，站点设置页显示"社区适配包"分级徽标；
  3. 本地导入非法包被校验器拒绝并给出可读错误；合法包需经风险确认。
- **风险**：动态 siteId 放宽遗漏（157 处引用）→ 专项任务 P1-08 逐文件排查 + typecheck 把关。

### Phase 2：自定义域名 + 通用 ChatUI 包 + 健康自检

- **范围**：`scripting` 权限与动态注册、授权流程、userscript 指引、detect 探测原语、Open WebUI / LobeChat / LibreChat / NextChat 官方包、HealthCheckManager、跨浏览器回归。
- **验收（DoD）**：
  1. 扩展端用户可添加任意 https 域名并安装 pack，重启浏览器后注册持久有效，卸载包后注册与权限清理干净；
  2. Open WebUI/LobeChat 包在各自 demo 实例上核心能力可用（一份包覆盖任意自部署域名）；
  3. 人为破坏 selector 后，两次加载内出现失效提示，且 [检查配置更新] 可在 patch 发布后自动恢复。
- **风险**：Firefox 动态注册/授权差异 → 专项验证任务；Plasmo manifest 读取产物路径为关键假设，P2-01 首日先做 spike 验证。

### Phase 3：适配向导 + 存量配置化收尾

- **范围**：元素拾取 overlay、selector 生成器、引导流程与实时预览、导出/PR 引导、剩余 13 个内置站点分三批配置化、（可选）公开分享页 Playwright 冒烟 CI。
- **验收（DoD）**：
  1. 无技术背景用户可在未适配站点通过向导得到可用大纲并导出合法 pack；
  2. ≥ 12 个内置站点具备 selector 热修能力；
  3. （可选项落地时）冒烟 CI 能在 selector 断言失败时自动开 issue。
- **风险**：向导生成的选择器质量 → 生成器单测 + 每步即时校验兜底；大站（gemini/chatgpt/claude）配置化回归成本高 → 放最后一批、独立回归。

### Phase 4（远期 backlog，均先出评估报告再决定实施）

- userscript 形态 L3 代码插件机制；AI 辅助生成 pack 草稿；registry 包签名（Ed25519）；匿名健康遥测（涉及隐私政策与 AMO `data_collection` 声明变更，默认不做）。

### 阶段依赖

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4(可选)
   └─ P0-08/09 试点亦是 Phase 3 存量迁移的模板
```

---

## 10. 全局风险与对策

| 风险 | 等级 | 对策 |
| --- | --- | --- |
| 商店审核质疑远程配置 | 中 | 仅数据无代码，提交审核说明引用 Dark Reader/uBlock 先例；配置拉取可在设置中关闭 |
| DSL 表达力蠕变 | 高 | §3 红线写入 CONTRIBUTING；原语只允许 4 类（选择器/属性/捕获正则/路径模板） |
| L2 与 L1 双体系漂移 | 中 | 内置站点渐进吃同一套 config（dogfooding），schema 演进必须先有内置消费者 |
| 用户预期错位（L2 功能残缺感） | 中 | capabilities 驱动 UI 彻底隐藏不可用项 + "社区适配包"分级徽标与说明 |
| 维护者带宽（单人项目） | 高 | 严格按 Phase 交付，Phase 0 独立成环即有热修收益；任何阶段可安全暂停 |
| 站点改版仍需人工分析 DOM | - | 本方案只降低分发/贡献成本；健康自检（P2-08）+ 冒烟 CI（P3-08）缩短感知链路 |

---

## 11. 附录：对现有代码的改造点速查

| 文件 | 改动 | 阶段 |
| --- | --- | --- |
| `src/adapters/index.ts` | 拆分内置/动态列表，新增 `initAdapterRegistry()`，`getAdapter()` 签名不变 | P1 |
| `src/contents/main.ts` / `ui-entry.tsx` / `platform/userscript/entry.tsx` | bootstrap 首行 `await initAdapterRegistry()` | P1 |
| `src/adapters/zai.ts`、`ima.ts`（试点）→ 其余 13 站 | selector 抽为 config 常量 + `resolveSiteConfig` 合并 | P0 / P3 |
| `src/constants/defaults.ts` | `SITE_IDS` 保留；新增 `isBuiltinSiteId()`；`SUPPORTED_AI_PLATFORMS` 支持动态合并 | P1 |
| `src/tabs/options/pages/SiteSettingsPage.tsx` 等 | siteId 类型放宽为 string；按 capabilities 显隐 | P1 |
| `package.json` manifest | `permissions` 增 `"scripting"` | P2 |
| `src/background.ts` | RemoteConfigManager 定时任务、动态注册模块 | P0 / P2 |
| `.github/workflows/` | registry 校验 + dist 发布 workflow | P0 |
