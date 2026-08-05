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
   - **DSL 永不引入脚本/表达式字段**。表达不了的站点 → 写代码进主仓成为 L1，或自行 fork 并完整构建 userscript。这是防"表达力蠕变"的铁律，任何 PR 想给 schema 加"一小段 JS"都必须拒绝。
2. **动态注册内容脚本合规**：`chrome.scripting.registerContentScripts` 注册的是**扩展包内**的 JS 文件到新 origin，属于合规操作；需要 manifest 增加 `scripting` 权限（不弹权限警告），host 访问靠已有的 `optional_host_permissions` 运行时授权。
3. **userscript 不提供运行时 L3 代码插件**：P4-01 已完成安全与架构评估，官方主脚本内的远程 `@require`、粘贴/下载后动态执行、page-world 注入和代码插件 registry 均判定为 No-Go；命令式适配器仅支持经 PR 转为 L1，或由用户自行 fork 并完整构建 userscript。详见 [P4-01 评估报告](../plans/2026-07-30-userscript-l3-plugin-evaluation-design.md)。
4. **隐私与遥测**：远程配置拉取为纯 GET 静态 CDN 资源，不携带任何用户数据；P4-04 已完成隐私与平台政策评估，自动或后台健康遥测判定为 No-Go。健康快照继续只存本地，仅在用户主动点击后打开可检查的 GitHub issue 表单，Firefox `data_collection_permissions: none` 与公开“零数据收集”承诺保持不变。详见 [P4-04 评估报告](../plans/2026-07-30-anonymous-health-telemetry-evaluation-design.md)。

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
│ L3 代码级适配器（仅自行 fork 并完整构建 userscript）           │
│    官方主脚本运行时加载已否决；社区适配器经 PR 转为 L1。       │
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
| Prompt 插入 + 发送 | ✅（contenteditable 站点视 spike 结论可能降级，见 §6.3 专项） | `input.mode`（textarea / contenteditable）通用实现 + `submitKey` |
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
  /** 可选多语描述；消费回退链：当前语言 → en → description（P1-12） */
  descriptionI18n?: Record<string, string>
  /** match pattern 数组：必须 https、禁止 <all_urls> 与顶层通配、每包 ≤ 10 条。
   *  通用 ChatUI 包（自部署实例域名不可预知）允许为空数组，此时必须提供 detect，
   *  且仅在用户显式绑定的域名上激活（§6.9 用户级域名绑定）。 */
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
  widthSelectors?: Omit<WidthSelectorConfig, "transformValue">[]  // 函数字段不可 JSON 化，类型层排除
  mermaidSupport?: "native" | "fallback"
  quickQuote?: "enabled" | "native" | "disabled" // 缺省 disabled
  /** 宿主主题联动，缺省 false（能力矩阵 §4.2）；true 时需配 hostThemeToggle 声明 */
  supportsHostThemeSync?: boolean
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
  /** 声明 prompt-insert 能力时必填；纯只读包（仅 outline/zen）可省略 */
  textarea?: string[]
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
registry/
  schema/site-pack.schema.json
  sites/*.json               # L2 适配包源文件
  patches/*.json             # L1 内置站点 selector 热修 patch
  scripts/validate.mjs       # CI 与本地校验（与 validate.ts 同规则）
  scripts/build-dist.mjs     # 生成 dist：index.json（含 sha256）+ 包文件
```

### 6.2 AdapterRegistry 与启动时序（关键设计）

`getAdapter()` 有 9 处同步调用（`App.tsx`、`QuickButtons.tsx` 等），**不改签名、不 async 化**。改为入口预加载 + **registryReady 门闩**：

```ts
// adapters/index.ts（改造后）
const builtinAdapters: SiteAdapter[] = [/* 现有 15 个，顺序不变 */]
let dynamicAdapters: SiteAdapter[] = []
let _registryReady: Promise<void> | null = null

/** 入口 bundle 启动时 await 一次：① 读缓存 patch 注入内置适配器；② 读已启用 pack 实例化 */
export function initAdapterRegistry(): Promise<void> {
  return (_registryReady ??= (async () => {
    const merged = await loadCachedPatches()                 // Phase 0：内置 patch 合并结果
    for (const a of builtinAdapters) applyMergedConfig(a, merged[a.getSiteId()])
    dynamicAdapters = await loadEnabledPacks()               // Phase 1：动态包；校验失败跳过并记录
  })())
}
export const registryReady = () => _registryReady ?? Promise.resolve()

export function getAdapter(): SiteAdapter | null {
  for (const a of builtinAdapters) if (a.match()) return a      // 内置优先，零成本短路
  for (const a of dynamicAdapters) if (a.match()) return a
  return null
}
```

- **两段能力分属两个阶段**（回应"阶段依赖不闭环"）：Phase 0 只需 `loadCachedPatches()` + 内置注入这一段（P0-13"内置 patch 启动门闩"），使 zai 热修在 Phase 0 即可端到端生效，**不依赖动态包加载**；`loadEnabledPacks()` 是 Phase 1 才引入的第二段。二者共用同一 `initAdapterRegistry()` 但可分期落地。
- 需要 await 的入口：`src/contents/main.ts`、`src/contents/ui-entry.tsx`、`src/platform/userscript/entry.tsx`（各 bundle 模块实例独立，须各自初始化）。`monitor-entry.ts` 若消费 adapter 同样处理。
- **启动竞态**（回应现状 `App.tsx:407` 空依赖 `useMemo`、`main.ts:455` 一次性 + `ophelInitialized` 守卫，首次 `null` 不会恢复）：
  - `main.ts` / `ui-entry.tsx` 的 bootstrap 首行 `await initAdapterRegistry()` 后再执行 `getAdapter()` 与挂载；Plasmo UI 入口在 registry 就绪前**不渲染 App**（用一层 gate 组件 await `registryReady()`）。
  - detect 型激活依赖 DOM 特征，可能在 `document_idle` 时尚未渲染 → 需在门闩内提供**有限时长的 MutationObserver 重试**（上限时长 + 次数），超时仍未命中则显式记录（供健康自检），不无限观察。
- **匹配冲突规则**：内置 > 用户 explicit 绑定 > registry detect 命中 > pack 静态 matches（详见 §6.9.1）；一个 origin 同时只激活一个 adapter；v1 禁止 pack 声明与内置站点重叠的 matches（CI 拒绝）——修改内置站点的唯一通道是 patch。

### 6.3 DeclarativeAdapter 方法映射

`DeclarativeAdapter extends SiteAdapter`，构造函数接收校验后的 `SitePackManifest`。分四类：

| 类别 | 方法（示例） | 实现 |
| --- | --- | --- |
| 直接映射 | `match`（matches + detect）、`getSiteId`（`"pack:" + id`）、`getName/getThemeColors/getTextareaSelectors/getSubmitButtonSelectors/getNewChatButtonSelectors/getStopButtonSelectors/getResponseContainerSelector/getChatContentSelectors/getUserQuerySelector/getExportConfig/getNetworkMonitorConfig/getModelSwitcherConfig/getZenModeConfig/getCleanModeConfig/getWidthSelectors/getSubmitKeyConfig/getQuickQuoteSupportMode/getAssistantMermaidSupportMode` | 读 manifest 字段返回 |
| 基类通用实现直接继承 | `findTextarea/lockModel/startNewConversation/stopGeneration/loadAllConversations/getVisibleAnchorElement/restoreScroll/getLastCodeBlockText/getSessionName` 等 | 无需覆盖 |
| DSL 原语驱动 | `insertPrompt/clearTextarea`（input.mode 双策略：textarea 走 value setter + input 事件；contenteditable 见下方专项说明）；`extractOutline`（responseContainer 内 h1-h6 + userQuery，文档序排序、排除 `.gh-` 容器、复用基类字数统计）；`getConversationList/getConversationObserverConfig/navigateToConversation`（由 `conversation` 字段映射生成 extractInfo/getTitleElement 闭包）；`getConversationTitle`（`conversation.activeMatch` 定位当前项 + `titleSelector` 取标题，兜底走基类 `extractConversationTitleFromDocumentTitle`）；`isGenerating`（existsSelectors 可见性）；`isNewConversation/getSessionId/isSharePage/getNewTabUrl`（session 配置） | Phase 1 逐个实现 |
| 不支持（保持基类缺省） | `deleteConversationOnSite/extractExportBundle/extractFormulaCopySource/toggleTheme` 等 | 返回缺省值，UI 按 capabilities 隐藏入口 |

> **abstract 方法齐备性**：`SiteAdapter` 的 `abstract` 方法（如 `getConversationTitle()`）DeclarativeAdapter **必须全部显式实现**，否则 TS 编译不过。P1-01 需先枚举 base.ts 全部 abstract 成员，逐一归入上表某一类，不允许遗漏。

**contenteditable 输入专项（L2 命门，P1-02 首日 spike）**：`execCommand("insertText")` 已废弃，且在 Lexical（ChatGPT 即是）、ProseMirror、Slate 等受控编辑器上常出现"文字可见但框架状态未同步，发送为空"；直接改 `textContent` 更会破坏编辑器内部状态。策略：

1. 顺序尝试：派发 `beforeinput`（`inputType: "insertText"`，多数现代框架监听）→ `execCommand("insertText")` → 每步后**回读校验**（编辑器内容确含插入文本且提交按钮变为可用）；
2. 校验失败即判定插入不可用，**不做 `textContent` 静默兜底**——让失败显式暴露（面板提示"该站点暂不支持自动插入"），避免半残状态；
3. P1-02 验证矩阵：原生 textarea / 原生 contenteditable / Lexical / ProseMirror 各至少 1 个真实站点；spike 结论决定 L2 能力矩阵中"Prompt 插入 + 发送"对 contenteditable 站点是否降级标注。

### 6.4 配置三层合并（`merge.ts`）

用于两个场景：① L1 内置站点 selector 热修；② L2 pack 的用户本地微调（远期）。

```
最终 config = deepMerge(内置默认值, 远端 patch, 用户本地覆盖)
```

合并规则（必须写成单测锁定）：**对象深合并；数组整体替换（不做元素级合并，避免歧义）；显式 `null` 表示删除该键**。

**patch 结构与版本兼容**（回应"旧缓存 patch 覆盖新版内置修复"）：

```jsonc
{
  "targetSiteId": "zai",
  "patchSchemaVersion": 1,       // patch DSL 版本
  "patchVersion": 2,             // 自身版本，整数递增
  "baseConfigVersion": 3,        // 目标内置 config 的版本；不匹配则不应用（防止改版后覆盖回旧值）
  "minAppVersion": "1.1.8",
  "maxAppVersion": "1.3.0",      // 可选：内置已修复后用上界淘汰旧 patch
  "config": { /* SitePack 同构局部字段 + 该站私有 selector 白名单 */ }
}
```

- 每个已配置化内置站点带一个单调递增的 `configVersion` 常量；patch 的 `baseConfigVersion` 必须等于当前内置值才应用，否则跳过并记日志。**新版扩展内置修复即 bump configVersion，旧 patch 自动失效**，无需等云端下线。
- **两级校验**：先校验 patch 局部合法（同 §8.2 白名单），再对 `deepMerge` **合并结果**做完整 SitePack 校验——防止"局部 patch 合法但删了必填键导致合并结果非法"。

**L1 热修覆盖范围（回应"热修范围高估"）**：现有 zai 等站的易变 selector（`THINKING_CONTAINER_SELECTOR`、附件卡片、导出容器、`toggleTheme` 目标等）**不在公共 SitePack schema 内**，是改版重灾区。因此内置站点配置化时，除公共 schema 字段外，额外抽出一份**该站点私有 selector 白名单**（`sitePrivateSelectors: Record<string, string | string[]>`，键为该站点已知的私有 selector 名，运行时读取处改为查此表）。patch 的 `config.sitePrivateSelectors` 只允许覆盖该站已登记的键（CI 按站点 allowlist 校验），使思维链/附件/导出 selector 同样可热修，而不放开任意键。**每个内置站点的热修覆盖矩阵在其配置化 PR 中显式列出**（哪些 selector 可热修、哪些仍需发版）。

L1 侧接入方式：每个已配置化的内置适配器把 selector 等纯数据抽为文件内 `const XXX_CONFIG: SitePackSelectors & …` 常量，方法体从 `this.config` 读取。**未配置化的适配器完全不受影响**（渐进迁移）。

**构造时序（关键约束）**：内置适配器在模块顶层同步实例化，而 patch 存于 platform storage（扩展端异步读取），构造时拿不到合并结果。因此约定：

1. 构造时 `this.config = XXX_CONFIG`（内置默认值），适配器**永远可用**，不依赖异步初始化；
2. `initAdapterRegistry()` 读到缓存 patch 后，对已构造实例调用 `applyMergedConfig(resolveSiteConfig(siteId, XXX_CONFIG))` 注入合并结果（在任何 `getAdapter()` 消费前完成，见 §6.2 入口 await）；
3. 方法体只经 `this.config` 读取，禁止在构造函数中把 config 派生值缓存为其他字段（否则注入后不生效）。

不选择"延迟实例化内置适配器"方案：对现有 15 站侵入更大，且 patch 读取失败时会连内置行为一起阻塞。

### 6.5 RemoteConfigManager

- **源**（按顺序 fallback）：
  1. `https://cdn.jsdelivr.net/gh/urzeye/ophel@registry-dist/index.json`
  2. `https://raw.githubusercontent.com/urzeye/ophel/registry-dist/index.json`
- **流程**：拉 `index.json`（小文件）→ **`registryRevision` 单调校验**（低于本地缓存版本视为 CDN 陈旧缓存，忽略并改用备源；防 jsDelivr 返回"成功但过期"导致 fallback 永不触发）→ 与本地缓存 diff → 仅拉取有更新的包/patch 文件（不可变版本路径，§7.1）→ 对照 index 中的 **sha256 校验** → 两级校验（§6.4：局部 + 合并结果）→ **全部通过后原子写入 active 快照**；任一环节失败则保留 **last-known-good**（哈希合法但运行时校验失败的新包不得覆盖旧工作版本）→ 通知 AdapterRegistry 下次加载生效（当前页提示"刷新后生效"）。
- **节奏**：扩展端 background `chrome.alarms` 每 24h（manifest `permissions` 需增 `"alarms"`，无权限警告；当前源 manifest 没有该权限）；userscript 端启动时节流检查（间隔 ≥ 24h）；设置页"立即检查"按钮直连该流程。
- **独立 registry transport（不复用 `platform.fetch`）**：现有扩展端 `platform.fetch()` 走 `MSG_PROXY_FETCH`，background 侧 `credentials: "include"` 且把响应转成 Data URL（为图片代理设计，`background.ts:300`），无法用于 registry JSON。新建独立通道：扩展端 background **原生 `fetch`**（`credentials: "omit"`；jsDelivr/raw 均带 `Access-Control-Allow-Origin: *`，无需新增 host 权限），options/content 侧经 `src/utils/messaging.ts` 新增常量请求 background 执行检查；userscript 端走 `GM_xmlhttpRequest`（`@connect: *` 已开放）。
- **降级**：两源均失败 → 静默使用本地缓存（last-known-good），设置页显示上次成功时间。
- **快速止损（kill-switch）**：错误 patch 影响面大于错误 pack（会改坏内置站点），仅靠"发 revert patch"回滚太慢且依赖拉取节奏。三条通道：
  1. `index.json` 的 patch/pack 条目支持 `"disabled": true`：客户端下次拉到 index 即让对应缓存条目失效（**非即时**：受 24h 轮询与 CDN 缓存影响，发布后需 purge jsDelivr 缓存）；
  2. 设置页站点级提供「重置为内置配置」按钮：清除该站点已缓存 patch 并即时回退内置默认值（刷新后生效），同时记录 `(targetSiteId, patchVersion)` **本地忽略标记**——防止下一轮自动更新把同一坏 patch 重新拉回；更高的 `patchVersion` 发布后忽略标记自动解除；
  3. dev 构建允许通过设置覆盖 registry 源 URL（仅 dev），用于 staging 演练与止损验证（P0-11）。
- **时间字段约定**：storage 与 index 中所有时间字段（`generatedAt`、`lastCheck` 等）一律使用 **Unix 毫秒时间戳（number）**，不使用 ISO `T/Z` 字符串。

### 6.6 PackManager

- 安装来源：registry 浏览列表 / 本地 JSON 文件导入（导入必须过 validate + 风险确认弹窗）。
- 存储 key（platform storage）：`sitepacks/installed`（包体 + 元数据：来源、安装时间、启用状态）、`sitepacks/origin-bindings`（用户级域名绑定，§6.9.1）、`sitepacks/remote-state`（index 缓存、lastCheck、last-known-good、本地忽略标记）、`siteconfig/overrides`（用户本地覆盖，远期）。预留 `storageSchemaVersion` 做迁移。
- 更新策略：registry 来源的包随 RemoteConfigManager 自动更新（可关）；本地导入的包不自动更新。
- 卸载：清理包体 + 该站点 settings/会话数据残留提示（可选保留）+ 按引用计数注销动态注册的内容脚本（Phase 2）。
- **数据生命周期闭环（回应"备份仅覆盖固定 Zustand keys"）**：本地导入包、`origin-bindings`、用户覆盖均属**用户数据**，但现有备份只处理 `ZUSTAND_KEYS` 固定 7 项（`defaults.ts:11`）。需单列任务（P1-16）规定：
  - 本地包 + 绑定纳入备份/WebDAV 同步范围（**registry 远端缓存 `remote-state` 排除在备份外**，可重新拉取）；
  - 恢复到另一浏览器时，动态域名权限需重新申请（授权不可随数据迁移）；
  - "清除全部数据"必须先注销动态注册脚本、再清存储；
  - 备份 schema 版本化与旧备份兼容迁移。

### 6.7 capabilities 与 UI 联动

- **不复用现有 `getCapabilities()`**：`SiteAdapter.getCapabilities(): AdapterCapabilities` 已存在且返回 `{ layout?: LayoutCapability }`，被 `LayoutManager`（`layout-manager.ts:111`）实际消费——语义是"结构化能力对象"，不能改成字符串能力集合。新增独立方法 `getFeatureCapabilities(): Set<SitePackCapability>`（或 `hasFeature(cap)`）承载 §4.2 的功能开关，与 `getCapabilities()` 并存互不干扰。
- **内置适配器不能缺省全量 true**：现状已有 5 个站点不支持会话管理（`ConversationsTab.tsx:165`：ChatGLM/Z.ai/Qianwen/Qwen Studio/ima）。为 15 个内置适配器建**真实能力表**（每站显式声明支持的 feature 集合，迁移期可先用现有 `unsupportedSiteLabels` 等既有判断反推），`getFeatureCapabilities()` 返回该表；DeclarativeAdapter 返回 manifest 声明。
- 改造点：`SiteSettingsPage.tsx`（各设置卡片按能力显隐）、面板 `QuickButtons`/`MainPanel` 功能按钮、`ConversationsTab`（无 `conversation-list` 时隐藏站点会话区，取代现有 `unsupportedSiteLabels` 硬编码）。
- 分级文案：L2 站点设置页顶部显示"社区适配包（核心功能）"徽标 + 说明链接，管理预期。

### 6.8 站点身份与动态 siteId 全链路

**站点实例身份（回应"通用包多实例数据串线"）**：同一通用包（如 `pack:open-webui`）可绑定多个自部署 origin，若仅用 `getSiteId() = "pack:open-webui"` 作数据键，不同实例会**共享主题/设置/阅读历史/会话归属**；更严重的是 `conversations-store.ts:64` 直接以原始 `conv.id` 为键，两个实例出现相同会话 ID 会**互相覆盖**。因此区分三层身份：

| 概念 | 含义 | 用途 |
| --- | --- | --- |
| `packId` | `"pack:open-webui"` | 适配实现与更新身份（一个包一份代码/配置） |
| `siteInstanceKey` | `packId` + `origin`（内置站点即 siteId 本身） | 设置/主题/阅读历史/会话归属的**数据分区键** |
| 会话存储键 | `siteInstanceKey` + 原始会话 ID 的复合键 | 防跨实例会话 ID 碰撞覆盖 |

- 内置站点 `siteInstanceKey === siteId`，行为不变；仅通用包（多 origin）需要复合键。
- **这涉及现有会话/设置 store 的键结构变更与数据迁移**，不是 P1-08"放宽 siteId 类型"能覆盖的，单列任务（P1-15）并预留 storageSchemaVersion 迁移。

**动态 siteId 类型放宽**：

- 排查 33 个耦合文件：settings 各处 `Record<siteId, T>` 结构本身兼容任意 string key，重点是放宽收紧类型（如 `SiteSettingsPage.tsx` 的 `keyof typeof …` → `string`）与新增 `isBuiltinSiteId()` 工具。
- `SUPPORTED_AI_PLATFORMS`（全局搜索/会话归属使用）：PackManager 提供 `getDynamicPlatforms()` 合并进消费方；图标缺省用站点 favicon（`https://{host}/favicon.ico`）+ 首字母兜底。

### 6.9 新域名激活（Phase 2）

**扩展端**（动态注册，合规；基础能力已前移至 P1-17，本节为完整形态）：

1. `scripting` 权限**已由 Plasmo 自动注入**（MAIN world 脚本注册需要），无需手动增加；host 访问靠已有的 `optional_host_permissions: ["<all_urls>"]` 运行时授权。
2. 安装含未授权域名的 pack → 复用 `perm-request.tsx` 请求 origin。
3. **两类脚本分开处理**（Plasmo 构建事实）：普通 ISOLATED world 内容脚本（`main` / `ui-entry`）在 `chrome.runtime.getManifest().content_scripts` 中，可读取 js/css 产物路径；MAIN world 脚本（`monitor-entry` / `scroll-lock-main` 等）**不在 manifest**，由 Plasmo 生成的 `static/background/main-world-scripts.ts` 经 `registerContentScripts` 注册，产物路径需从该注册表取得。动态注册时按 **world × runAt 分组**生成注册项（`persistAcrossSessions: true`），**注入单位是 origin 而非 pack**（detect 池多个 pack 共享同一 origin 时只注入一套脚本）。
4. **引用计数**：一个 origin 可能被多个绑定/包引用；卸载单个 pack 只减少计数，计数归零才注销注册与提示撤权。启动时对账（`getRegisteredContentScripts` 与绑定表一致性校验）。
5. `background.ts` 的 `OPHEL_TARGET_URLS` 等硬编码站点列表改为"静态列表 + 动态绑定合并"。
6. 验证 `web_accessible_resources`（KaTeX 字体等，matches 已是 `<all_urls>`）在动态 origin 上可加载（P1-17 spike 项）。
7. Firefox 验证项：MV3 下 host permission 全部默认 optional，授权交互与 Chrome 不同，需专项回归（任务 P2-09）。

**userscript 端**（无法运行时扩 `@match`）：提供设置页指引 + 文档，教用户在 Tampermonkey「设置 → 包含/排除」加 User matches；检测到已装 pack 的域名未被覆盖时展示带复制按钮的提示。

### 6.9.1 用户级域名绑定（通用 ChatUI 包的激活模型）

pack 的 `matches` 是静态声明（禁通配、≤10 条），无法覆盖 Open WebUI / LobeChat 等**任意自部署域名**。因此自定义域名不通过修改 pack matches 实现，而是引入 pack 之外的**用户级绑定表**（PackManager 管理，存 `sitepacks/origin-bindings`）：

- 结构：`{ origin: string, mode: "explicit" | "detect", packId?: string }`。
  - `explicit`：用户把某 origin 显式绑定到指定 pack，该 origin 上只激活它；
  - `detect`：该 origin 进入"探测池"，页面加载后对所有已启用、含 `detect` 规则的包按 detect 判定激活。
- 通用包允许 `matches: []`，但**必须提供 `detect`**（CI 与运行时校验联动），只能经用户绑定激活，永不自动出现在未授权域名。
- **激活优先级**（解决"单 origin 单启用包"与 detect 多命中的冲突）：内置适配器 > 用户 explicit 绑定 > detect 命中（多个命中时按已安装时间序取第一个，并在面板提示可切换）> pack 静态 matches。
- 添加域名入口：设置页手动输入 origin → 授权（`perm-request.tsx`）→ 动态注册内容脚本 → 选择绑定模式；解绑/撤权时联动注销。

### 6.10 选择器健康自检（Phase 2）

- 时机：adapter 激活后延迟 8s（且 DOM ready、非新对话页）检查核心选择器命中：`textarea`、`responseContainer`、（会话页时）`chatContent`。
- 防抖：结果写入 storage，**连续 2 次页面加载失败**才提示，避免偶发误报。
- 提示：面板顶部黄条「该站点适配可能已失效」+ 按钮 [检查配置更新]（触发 RemoteConfigManager）/ [报告问题]（预填 issue 模板：站点、扩展版本、配置版本、失效选择器列表）。
- L2 站点提示区分两种原因：本地包版本落后于 registry → 提示"适配包有更新可安装"；已是最新（或本地导入包，不自动更新）→ 提示"站点可能已改版"并引导报告/更新导入，避免 [检查配置更新] 对本地导入包造成困惑。
- 内置与 L2 适配器共用此机制——这让"改版感知"从用户报障变为主动发现。

### 6.11 适配向导（Phase 3 概要）

- 入口：已授权但无适配的站点上，面板显示「为此站点创建适配」；设置页也有入口。
- 流程：逐步点选 → 输入框 → 发送按钮 → 对话容器 → 用户消息 → AI 回复 →（可选）会话列表项/新对话按钮 → 每步即时校验（命中数、唯一性）→ 完成后**大纲实时预览** → 保存为本地 pack（立即生效）→ 导出 JSON / 复制并打开预填 PR 页面。
- 选择器生成优先级：`data-testid` > `id` > `aria-*` > 稳定类名组合；过滤 CSS-Modules/utility hash 类（如 `/[a-f0-9]{5,}/`）；生成后做唯一性验证与祖先链收缩。拾取 overlay 复用面板 Shadow DOM 体系，避免污染宿主页。

---

## 7. Registry（主仓）

### 7.1 目录与发布

- 源文件在 `main` 分支 `registry/` 目录（§6.1）；push 到 main 触发 GH Actions：`validate.mjs` 全量校验 → `build-dist.mjs` 生成 `index.json`（含每个文件的 version/matches/sha256/minAppVersion 摘要 + 单调 `registryRevision`）→ 用 GitHub Actions secret 中的 Ed25519 私钥签名 index 原始字节并生成 `index.sig.json` → **强制推送到 `registry-dist` 分支**（独立分支：jsDelivr 缓存可单独 purge，registry 更新不产生 main 提交噪音、不触发 release 流程）。
- **不可变发布**（回应"可变分支混合读取"）：包/patch 写入按版本命名的不可变路径（如 `packs/duck-ai/3.json`），`index` 引用固定路径；客户端按 `registryRevision` 判断是否需要刷新，避免 index 与包文件读到不同 commit。
- `index.json` 结构：

```json
{
  "generatedAt": 1784678400000,
  "schemaVersion": 1,
  "registryRevision": 42,
  "packs": [{ "id": "duck-ai", "version": 3, "minAppVersion": "1.2.0", "matches": ["https://duck.ai/*"], "file": "packs/duck-ai/3.json", "sha256": "…", "disabled": false }],
  "patches": [{ "targetSiteId": "zai", "patchVersion": 2, "baseConfigVersion": 3, "minAppVersion": "1.1.8", "maxAppVersion": "1.3.0", "file": "patches/zai/2.json", "sha256": "…", "disabled": false }]
}
```

- 时间字段一律 Unix 毫秒时间戳（§6.5 约定），不使用 ISO `T/Z` 字符串。

- `index.sig.json` 为严格分离签名 envelope：`schemaVersion: 1`、`algorithm: "Ed25519"`、`keyId`、128 位小写十六进制签名。签名直接覆盖落盘的 `index.json` 原始字节，避免 Node 与浏览器分别实现 canonical JSON。客户端内置带 `registryRevision` 有效范围的公钥 keyring，先验签、后解析 index、再按已认证的 SHA-256 校验包；签名失败只尝试备源或保留 last-known-good，不允许无签名降级。

- `disabled: true` 为紧急止损开关（§6.5，非即时，受轮询 + CDN 缓存约束）：客户端下次拉到即让对应缓存条目失效，用于问题 patch/pack 的下线。

### 7.2 贡献流程

- PR 模板（新增 `.github/PULL_REQUEST_TEMPLATE/site-pack.md`）：站点名/URL、测试过的功能勾选表（对应 capabilities）、截图。
- CI 校验（PR 触发，任务 P0-07）：schema 合法、id 唯一且不与内置冲突、matches 不与内置/已有包重叠、正则可编译且长度合规、CSS 黑名单、capabilities 与字段齐备性。
- 审核 checklist（`docs/developer/site-adapter/site-pack-review-checklist.md`，随 P0-12 产出）：人工在目标站点冒烟核心能力后合并。**审核一份 JSON 的成本远低于审核千行级 TS 适配器 PR，这是社区扩展可持续的关键。**

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
| 恶意 CSS（UI 欺骗、`url()` 数据外带） | `zenMode/cleanMode.styles.extraCss`、`widthSelectors.extraCss` | 字段长度 ≤ 2000；**归一化**（解码 CSS 转义如 `\75 rl(`、去注释、折叠空白、小写化）后黑名单 `url(`、`@import`、`expression(`、`javascript:`；CI + 运行时双重校验，绕过样例进测试用例 |
| ReDoS | `idFrom.regex`、`session.idFromPathRegex` 等 | 长度 ≤ 200；编译失败即拒；CI 跑 safe-regex 类检查；运行时仅对短输入（pathname/属性值）执行 |
| CDN 或 `registry-dist` 分支篡改 | jsDelivr/raw/发布分支 | Ed25519 验证 `index.json` 原始字节，内置公钥是信任根；已认证 index 中的 SHA-256 再校验每个不可变包。双源仅作**可用性 fallback**，任一签名失败均不降级接受无签名数据 |
| 恶意本地导入包 | 用户导入第三方 JSON | 同一校验器 + 风险确认弹窗（明示：适配包可修改页面样式与 Ophel 在该站点的行为，仅导入可信来源）|
| 表达力蠕变演变为远程代码 | schema 演进 | §3 红线：schema 永不加脚本/表达式字段，PR 审核硬性拒绝 |
| 域名劫持内置站点 | pack matches 覆盖内置域名 | CI + 运行时双重拒绝；修改内置只能走 patch 通道 |
| confused-deputy：远程 selector 驱动自动点击宿主危险按钮 | `newChatButton`/`stopButton`/`submitButton` 等被指向"删除会话/账户/发送"类元素并被自动触发 | 自动 `click()` 仅限白名单语义按钮，且限定在 §4.2 声明的能力范围内；导出/删除等破坏性操作永不由 L2 声明式自动触发（保持 L1 专属）；向导/健康自检对"选择器指向 body/大范围容器"给出告警 |

### 8.2 校验器统一约束（单一实现源）

- **单一真值源**：TS 类型（`types.ts`）+ 运行时校验（`validate.ts`）+ CI 校验 + JSON Schema 四者若各自维护必然漂移。约定：`validate.ts` 写成**零浏览器依赖的纯模块**，`registry/scripts/validate.mjs` 直接 import 同一模块执行（tsx/esbuild 跑 TS 即可），**不重写规则**；JSON Schema（P0-03）仅作编辑器提示的派生物，CI 用示例包对两者做交叉一致性检查。
- 包文件 ≤ 64KB；数组字段长度 ≤ 50；选择器字符串 ≤ 500 字符。
- 未知键一律拒绝（白名单制，防止未来字段被老版本静默误读）。
- **patch 与 pack 走同一校验器**：patch 的 `config` 局部字段（含 extraCss、regex）攻击面与 pack 相同，CI 与运行时均复用 `validate.ts` 同一套白名单与约束，不允许旁路。
- `matches`：`^https://`、禁 `<all_urls>`/`https://*/*`、≤ 10 条；允许空数组，但空 matches 必须同时提供 `detect`（通用 ChatUI 包，仅经用户域名绑定激活，见 §6.9.1）。
- `urlTemplate`/`newTabPath`：以单个 `/` 开头且第二字符不得为 `/`（拦截 `//evil.example` 协议相对 URL）；运行时以 `new URL(filled, location.origin)` 构造后**断言 `origin` 与当前页一致**才导航；`{id}` 填充值经 `encodeURIComponent`。
- `theme.primary/secondary`：仅接受 `^#[0-9a-fA-F]{3,8}$` 颜色字面量。
- `id`：`^[a-z0-9-]{2,40}$`。
- `extraCss`：v1 采用归一化黑名单（§8.1）+ 长度上限 + registry 人工审核 + 本地导入风险弹窗；属性/值允许列表作为 v2 加固项（残余风险已记录，Phase 4 评估）。
- **P0-01 技术定案**：采用手写轻量 TypeScript 校验器，不引入 Ajv 或 `effect/Schema`。实现保持零浏览器依赖，由运行时与 registry Node 校验脚本直接复用同一 `validate.ts`，避免额外 bundle 成本和规则漂移。

---

## 9. 阶段划分

> 详细任务、依赖与工作量见 [`site-adapter-pluginization-tasks.csv`](./site-adapter-pluginization-tasks.csv)。规模口径：S ≈ 0.5–1 人日，M ≈ 1–3，L ≈ 3–5，XL ≥ 5。

### Phase 0：Schema 地基 + 云端热修通道（性价比最高，先行）

- **前置**：项目当前无正式测试体系，而校验器/合并器的 DoD 依赖单测 → 新增 P0-00 引入 vitest 最小测试基建（仅针对纯逻辑模块，不做 UI 测试），避免 P0-02 被迫顺手搭基建、diff 失焦。
- **范围**：测试基建、schema 类型与校验器（单一实现源）、三层合并器（含 patch 版本兼容）、RemoteConfigManager（独立 transport、`alarms` 权限、last-known-good、disabled 止损、本地忽略标记）、**内置 patch 启动门闩（P0-13：`initAdapterRegistry()` 第一段 + 三入口 await，使热修在本阶段端到端生效）**、registry 目录与 CI（不可变发布）、zai 单站配置化试点、设置页更新区块（含站点级"重置为内置配置"）。
- **不做**：DeclarativeAdapter、新站点、任何 UI 大改。为控制单人项目 Phase 0 体量（原 ~21.5 人日），以下任务后移：JSON Schema 文件（原 P0-03）与贡献者文档（原 P0-12）并入 Phase 1 registry 开放（P1-11）；ima 第二试点（原 P0-09）移至 Phase 1 初，作为迁移手册的通用性验证。
- **验收（DoD）**：
  1. zai 配置化后全功能回归通过（行为零变化）；
  2. 发布一个 zai 测试 patch，自动（≤24h）与手动两条路径均能让用户侧 selector 生效，且可回滚（revert patch + index `disabled` 止损 + 本地重置按钮三条路径均验证）；
  3. registry PR 的 CI 校验可拦截全部 §8.2 非法样例（含 CSS 转义绕过样例）。
- **风险**：jsDelivr 国内可用性波动 → 双源 fallback 已覆盖；合并语义歧义 → 单测锁定。

### Phase 1：DeclarativeAdapter + SitePack 安装闭环

- **范围**：DeclarativeAdapter 全部映射（含全部 abstract 方法）、AdapterRegistry 动态包加载段 + registryReady 门闩、PackManager、动态 siteId 放宽、**站点实例身份与数据迁移（P1-15）**、**数据生命周期/备份闭环（P1-16）**、`getFeatureCapabilities` 独立能力 API + 内置真实能力表、capabilities UI 联动、适配包管理页、首个官方包（Duck.ai，回应 #184 社区请求）。
- **最小动态注入前移**：Duck.ai 是全新域名，现有内容脚本只注入硬编码站点。因此把**扩展端最小动态授权 + origin 级脚本注册**（原 Phase 2 的 P2-01/P2-02 核心）前移为 Phase 1 依赖（P1-17），否则 Duck.ai 无法在真实浏览器激活、DoD 不成立。detect 池、通用包、多 origin 等复杂能力仍留 Phase 2。
- **验收（DoD）**：
  1. Duck.ai 以纯 JSON 从设置页安装 → 授权域名 → 动态注册 → 刷新后能力矩阵 ✅ 项全部可用（大纲/插入发送/宽度/Zen/基础导出/新对话/停止/生成检测）；
  2. 未声明能力在设置页与面板完全不可见（走 `getFeatureCapabilities`），内置站点 UI 无任何变化（含现有 5 个不支持会话管理站点行为不变），站点设置页显示"社区适配包"分级徽标；
  3. 本地导入非法包被校验器拒绝并给出可读错误；合法包需经风险确认；导入包 + 绑定纳入备份，清除数据时先注销动态脚本。
- **风险**：contenteditable 插入策略成功率（§6.3 专项）→ P1-02 首日 spike 验证编辑器框架矩阵，结论回写能力矩阵；动态 siteId 放宽遗漏（157 处引用）→ P1-08 逐文件排查 + typecheck + 用 `pack:` 前缀假 id 全链路运行时冒烟；启动竞态 → registryReady 门闩 + App 延迟渲染（§6.2）；会话/设置键结构迁移影响存量数据 → P1-15 迁移单测 + 旧数据兼容。

### Phase 2：自定义域名（通用场景）+ 通用 ChatUI 包 + 健康自检

- **范围**：detect 探测原语与延迟激活（MutationObserver 重试）、多 origin 通用包、origin 级注册的**引用计数**与 `OPHEL_TARGET_URLS` 动态化、userscript 指引、Open WebUI / LobeChat / LibreChat / NextChat 官方包、HealthCheckManager、跨浏览器回归。（`scripting` 权限已由 Plasmo 自动注入，非本阶段新增；基础动态注册已在 P1-17 落地，本阶段扩展到多包/detect。）
- **验收（DoD）**：
  1. 扩展端用户可添加任意 https 域名并安装 pack，重启浏览器后注册持久有效；一个 origin 被多包绑定时脚本只注入一套，卸载单个包按引用计数保留仍被使用的注册，全部解绑后注册与权限清理干净；
  2. Open WebUI/LobeChat 包（`matches: []` + detect，经用户域名绑定激活）在各自 demo 实例上核心能力可用；同一域名多包 detect 命中时按 §6.9.1 优先级激活且可切换；detect 依赖的 DOM 延迟渲染时在门闩重试窗口内仍能激活；
  3. 人为破坏 selector 后，两次加载内出现失效提示（区分"包过旧"与"站点改版"），且 [检查配置更新] 可在 patch 发布后自动恢复。
- **风险**：Firefox 动态注册/授权差异 → 专项验证任务；MAIN world 脚本不在 `content_scripts` 而在 background 注册表、需按 world/runAt 分组注册 → P2-01 首日 spike 验证（含 `web_accessible_resources` 对动态 origin 生效性）。

### Phase 3：适配向导 + 存量配置化收尾

- **范围**：元素拾取 overlay、selector 生成器、引导流程与实时预览、导出/PR 引导、剩余 13 个内置站点分三批配置化、（可选）公开分享页 Playwright 冒烟 CI。
- **验收（DoD）**：
  1. 无技术背景用户可在未适配站点通过向导得到可用大纲并导出合法 pack；
  2. ≥ 12 个内置站点具备 selector 热修能力；
  3. （可选项落地时）冒烟 CI 能在 selector 断言失败时自动开 issue。
- **风险**：向导生成的选择器质量 → 生成器单测 + 每步即时校验兜底；大站（gemini/chatgpt/claude）配置化回归成本高 → 放最后一批、独立回归。

### Phase 4（远期评估项，均先出报告再决定实施）

- **P4-01**：userscript L3 代码插件机制判定为 **No-Go**，官方主脚本不实现运行时代码插件；详见 [评估报告](../plans/2026-07-30-userscript-l3-plugin-evaluation-design.md)。
- **P4-02**：AI 辅助生成 pack 草稿已完成隐私优先的剪贴板原型与评估，内置模型供应商仍为 No-Go；详见 [评估报告](../plans/2026-07-30-site-adapter-ai-draft-evaluation.md)。
- **P4-03**：registry Ed25519 签名链路已评估并实施；详见 [设计记录](../plans/2026-07-30-registry-ed25519-signing-design.md)。
- **P4-04**：匿名健康遥测判定为 **No-Go**，继续采用本地健康自检与用户主动报告；详见 [评估报告](../plans/2026-07-30-anonymous-health-telemetry-evaluation-design.md)。

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
| `package.json` manifest | `permissions` 增 `"alarms"`（`scripting` 已由 Plasmo 因 MAIN world 脚本自动注入，无需手动加） | P0 |
| `src/background.ts` | RemoteConfigManager 定时任务与 registry transport（P0）；`OPHEL_TARGET_URLS` 动态合并 + 动态注册模块（P1-17 基础 / P2 多包扩展） | P0 / P1 / P2 |
| `src/stores/conversations-store.ts` 等 | 站点实例身份复合键与存量数据迁移（§6.8） | P1 |
| `src/constants/defaults.ts`（`ZUSTAND_KEYS`） | 本地包与域名绑定纳入备份/恢复范围（§6.6） | P1 |
| `.github/workflows/` | registry 校验 + dist 发布 workflow | P0 |
