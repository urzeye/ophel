# feat/site-adapter-pluginization 代码审查报告

- **分支**: `feat/site-adapter-pluginization`
- **提交**: `6fa0f2e3`
- **相对 main 基线**: `0f8f767f`
- **审查日期**: 2026-08-05
- **审查范围**: 分支 diff、关键源码、相关计划文档、已有单元测试
- **未覆盖**: 真实站点浏览器冒烟、商店提交、线上 registry 拉取、完整 typecheck/build

---

## 1. 结论摘要

这次改动把站点适配从“硬编码 15 站”扩展成三层模型：

1. **L1 内置 15 站**：仍为 TypeScript 类适配器；选择器/配置抽到 `*-config.ts`，可被远程 JSON **补丁热修**。
2. **L2 SitePack**：纯 JSON 声明式适配器，走能力门控子集，`siteId` 形如 `pack:<id>`，实例键 `pack:<id>@origin`。
3. **L3 远程可执行插件**：**不支持**。

**总体判断**：

- 方向正确，安全边界清晰（无远程代码执行路径）。
- **15 站结构上兼容，但未做真实页面验证，不能宣称“完全兼容”。**
- 新系统引入的主要风险集中在：显式 origin 绑定硬失败、油猴 `@match` 覆盖缺口、远程 `autoUpdate` 默认开启带来的隐私/审核叙事、以及 sample pack / 选择器质量。

---

## 2. 改动范围与架构

### 2.1 规模

- 约 247 个文件，约 `+42.8k / -5.7k`
- 相对 main 约 122 个提交

### 2.2 运行时链路

- `initAdapterRegistry()` 会在同步 `getAdapter()` 前预加载：
  - 内置站点远程补丁
  - 已启用的 SitePack
- 匹配顺序：**内置优先**，再匹配动态 pack
- **显式 origin 绑定**：
  - 若绑定的 pack 缺失/损坏 → **该 origin 上动态适配器硬禁用**
  - **不会回退**到其他动态适配器
- 远程 registry：
  - 主源：`https://cdn.jsdelivr.net/gh/urzeye/ophel@registry-dist/index.json`
  - 回退：GitHub `registry-dist` raw
  - 校验：Ed25519 签名 + SHA-256 产物 + schema / safe-regex
- 扩展动态注册：
  - 本地打包脚本 + `chrome.scripting.registerContentScripts`
  - 可选 host permissions
- `alarms`：用于 24h 远程配置检查
- `scripting`：来自 Plasmo MAIN-world 注入链路
- `DEFAULT_SETTINGS.remoteConfig.autoUpdate = true`

### 2.3 关键文件

| 领域 | 路径 |
| --- | --- |
| 注册表 | `src/adapters/index.ts` |
| 声明式适配器 | `src/adapters/declarative/adapter.ts` |
| 能力门控 | `src/adapters/feature-capabilities.ts` |
| Pack 管理 | `src/core/pack-manager.ts` |
| 远程配置 | `src/core/remote-config-manager.ts` |
| 签名校验 | `src/core/remote-config-signature.ts` |
| 远程常量 | `src/core/remote-config-constants.ts` |
| 扩展注册 | `src/platform/extension/site-pack-registration.ts` |
| 备份恢复 | `src/core/backup-codec.ts` |
| 后台闹钟/恢复 | `src/background.ts` |
| Manifest / 权限 | `package.json` |
| 油猴 match | `vite.userscript.config.ts` |
| match 覆盖辅助 | `src/platform/userscript-match-coverage.ts` |
| 计划/清单 | `docs/developer/site-adapter/site-adapter-pluginization-plan.md` |
| 审核清单 | `docs/developer/site-adapter/site-pack-review-checklist.md` |
| Sample packs | `registry/sites/{duck-ai,librechat,lobechat,nextchat,open-webui}.json` |

### 2.4 内置 15 站仍在，顺序未变

`gemini-enterprise`, `gemini`, `chatgpt`, `grok`, `aistudio`, `claude`, `deepseek`, `doubao`, `ima`, `chatglm`, `kimi`, `qwen-studio`, `qianwen`, `yuanbao`, `zai`

---

## 3. 15 站兼容性

### 3.1 结论

**结构兼容，不等于运行时完全兼容。**

证据：

- 仍是 class-based 适配器
- `siteId` 未改
- UI 能力强制只作用于非 builtin
- 抽样（ChatGPT / Claude / Gemini / Doubao / Yuanbao）显示 conversation id / url / active 语义是“配置抽取”，不是语义重写

### 3.2 抽样细节

#### ChatGPT

- 路径模板仍为 `/c/{id}`
- active 仍走 `[data-active]`
- 正则来自 config
- URL 通过 `new URL(path, getNewTabUrl())` 构造，base 仍是 `https://chatgpt.com`

#### Doubao

- active 判定迁到 CSS `activeMatch`
- `getActiveConversationRow()` 仍保留 sessionId fallback

#### Yuanbao

- 双 ID 逻辑仍在 class 侧（`CHAT_PATH_PATTERN`）
- `urlTemplate "/chat/{id}"` 与 `agentId/sessionId` 拼接配合使用
- **双 ID 语义保留**

### 3.3 残留风险

1. **config 间接化风险**：`new RegExp(...)`、`matches(activeMatch)`、`urlTemplate`、CSS 选择器从 class 内联迁到 config 后，存在拼写/转义/语义漂移空间。
2. **远程补丁静默改行为**：成功应用的 builtin patch 可不发版就改变 15 站选择器。
3. **无真实页面冒烟**：本次审查未打开真实 ChatGPT/Claude/Gemini 等页面验证。

### 3.4 healthCheck 现状

- 最新提交中 **runtime 已移除**
- `src/` 与 tests 中无 `healthCheck` 残留
- FAQ 仍提到健康检查告警报告 → **文档滞后**

---

## 4. 新引入 bug / 回归风险

按严重度排序。

### P1

#### 1) 显式 origin 绑定 miss → 硬失败，无动态回退

- 绑定 pack 缺失、损坏、未启用时，该 origin **禁用全部动态适配器**
- 不会尝试其他 pack
- 用户感知：站点“突然没了插件能力”，排查成本高

#### 2) 油猴 `@match` 仍只覆盖 15 内置站

- 自定义 SitePack 需要用户自行补 match
- UI 有 coverage helper，但不是自动解决
- 扩展侧通过动态 content script + optional host 更顺；油猴侧是明确短板

### P2

#### 3) 远程 `autoUpdate` 默认 true

- 安装后/后台可能主动联网
- 对隐私说明、商店审核叙事不友好，需要明确“拉的是签名数据清单，不是远程代码”

#### 4) 内置 config 间接化残留回归风险

- 正则、activeMatch、urlTemplate、CSS selector 从内联迁到 config
- 单测覆盖有限，真实 DOM 变化仍可能漏检

#### 5) 成功远程补丁会静默改变 15 站选择器

- 有签名/哈希保护，但仍是“无发版行为变更”
- 坏补丁或错误签名源一旦过检，影响面是全体用户

#### 6) Sample pack 选择器脆弱

- 例：LobeChat 提交按钮依赖 SVG path
- Open WebUI `matches: []`，必须靠 binding 才能生效
- 这些更像 demo 质量，不是生产级稳定适配

#### 7) 能力上限可能被误判为 bug

- DeclarativeAdapter 只支持能力门控子集
- 用户可能以为“装了 pack 就该有内置站同级能力”

### P3

#### 8) health-check 文档 / FAQ 残留

- 功能已删，文档仍提

#### 9) 计划文档部分过时

- 最终决策是“不做 auto-detect binding”，部分 plan 文案可能仍残留旧设想

---

## 5. SitePack / 插件系统风险

### 5.1 安全边界（正面）

- **无远程代码执行路径**（L3 明确不做）
- 有 Ed25519 签名 + SHA-256 + schema/safe-regex 校验
- origin 隔离靠 instance key：`pack:<id>@origin`
- 备份包含 packs / bindings / overrides
- 备份排除 remote-state 与 registration runtime
- restore 会触发 reconcile
- 权限拒绝会回滚；revoke 清理有测试覆盖

### 5.2 产品 / 运行时风险

| 风险 | 说明 | 级别 |
| --- | --- | --- |
| 绑定硬失败 | 绑定 miss 后该 origin 动态能力全关 | P1 |
| 油猴 match 缺口 | 自定义站需要用户补 `@match` | P1 |
| 默认自动更新 | 后台联网 + 审核叙事成本 | P2 |
| 能力子集误解 | pack 能力 < 内置站，易被当 bug | P2 |
| sample 质量 | 选择器脆弱 / 空 matches | P2 |
| 文档滞后 | healthCheck / plan 文案 | P3 |

### 5.3 备份恢复

已确认方向正确：

- 需要跨设备迁移的 pack 状态进入备份
- 运行时注册态 / remote-state 不进备份
- restore 后 reconcile，避免“备份里有 pack，运行时没注册”

---

## 6. 商店 / GreasyFork 审核风险

### 6.1 Chrome / Firefox 扩展

新增/相关权限：

- `alarms`：远程配置周期检查
- `scripting`：Plasmo MAIN-world / 动态 content script 注册
- 既有 `optional_host_permissions: ["<all_urls>"]`：给 pack 动态 host 用
- Firefox `data_collection_permissions.required: ["none"]` 仍在

**审核叙事建议（可对齐 CWS）**：

- 远程拉取的是**签名后的数据清单 / 选择器配置**，不是可执行远程代码
- 动态脚本注册基于**本地打包脚本** + 用户授予的 optional host
- 需要在隐私政策 / 商店说明中写清：
  - 拉取什么
  - 拉取频率（约 24h）
  - 失败时本地如何降级
  - 用户如何关闭 autoUpdate

**风险点**：

- `autoUpdate=true` 默认值会放大“为什么一安装就联网”的审核疑问
- `<all_urls>` optional 必须强调“按需申请，不是默认全开”

### 6.2 GreasyFork

既有事实：

- 已有 `@connect *`
- 已有 CDN `@require`

本分支：

- 远程 JSON 配置在“无 eval / 无远程代码”前提下通常可接受
- **主要风险不是自动拒审**，而是：
  - 自定义 pack 的 match 支持体验
  - 文档是否清楚告诉用户如何补 match
  - 远程更新说明是否足够透明

---

## 7. 测试与验证缺口

### 7.1 已跑且通过

```text
pnpm exec vitest run \
  tests/core/pack-manager.test.ts \
  tests/core/backup-codec.test.ts \
  tests/core/remote-config-signature.test.ts \
  tests/platform/extension/site-pack-registration.test.ts \
  tests/adapters/declarative/adapter.test.ts
```

结果：`5 files / 43 tests passed`

覆盖面：

- pack 管理
- 备份编解码
- 远程签名
- 扩展侧动态注册
- 声明式适配器基础行为

### 7.2 未跑 / 未验证

- 完整 `pnpm typecheck`
- 完整 `pnpm build` / `pnpm build:userscript`
- 15 站真实页面冒烟
- 线上 registry 拉取与签名链路
- 商店提交流程
- 油猴自定义 pack 的 match 实操路径

### 7.3 建议补的验证（上线前）

1. **15 站最小冒烟矩阵**
   - 面板注入
   - 会话列表识别
   - active 会话
   - 打开/跳转会话 URL
   - 输入框定位 / 发送（若该站支持）
2. **绑定失败路径**
   - 绑定不存在 pack
   - 绑定损坏 pack
   - 期望：该 origin 动态能力关闭，且 UI 有明确错误，而不是静默空白
3. **油猴自定义站**
   - 安装 pack 后无 match → helper 提示
   - 用户补 match 后可注入
4. **远程更新开关**
   - autoUpdate on/off
   - 签名失败 / 哈希失败 / schema 失败
5. **备份恢复 round-trip**
   - packs + bindings + overrides 恢复后可 reconcile

---

## 8. 上线前建议

### 必须处理（建议合并前）

1. **绑定 miss 的用户可见错误**  
   现在是硬失败；至少要有明确状态文案与恢复路径（清除绑定 / 重装 pack）。
2. **油猴 match 缺口文档与 UI 提示**  
   自定义 pack 不可用时，直接告诉用户缺的是 match，而不是“适配器坏了”。
3. **远程 autoUpdate 默认策略再确认**  
   若坚持默认 true，商店说明/隐私文案必须同步；否则考虑默认 false 或首次 opt-in。
4. **清理 healthCheck 文档残留**  
   FAQ / 相关说明与代码对齐。

### 强烈建议

5. 对 ChatGPT / Claude / Gemini / Doubao / Yuanbao 做一轮真实 DOM 冒烟。
6. 审查 sample packs 质量； fragile selector 不要作为“官方可用”暗示。
7. 跑一遍 `typecheck + build + build:userscript`。
8. 确认 plan 文档与最终“无 auto-detect binding”决策一致。

### 可接受延后

9. Declarative 能力扩展（更多接近 builtin 的能力）
10. 更细的 selector 健康度观测（若未来重做，需避免再引入误导性 healthCheck 噪音）

---

## 9. 一句话结论

方向正确、安全边界清楚（不做远程代码）；15 站通过配置抽取在结构上保留，**但未证明运行时完全兼容**。上线前最该盯的是：**origin 绑定硬失败、油猴 match 缺口、默认远程 autoUpdate 的审核/隐私叙事，以及 sample pack / 选择器质量**。

---

## 10. 关键文件索引

### 核心实现

- [`src/adapters/index.ts`](../../src/adapters/index.ts)
- [`src/adapters/declarative/adapter.ts`](../../src/adapters/declarative/adapter.ts)
- [`src/adapters/feature-capabilities.ts`](../../src/adapters/feature-capabilities.ts)
- [`src/core/pack-manager.ts`](../../src/core/pack-manager.ts)
- [`src/core/remote-config-manager.ts`](../../src/core/remote-config-manager.ts)
- [`src/core/remote-config-signature.ts`](../../src/core/remote-config-signature.ts)
- [`src/core/remote-config-constants.ts`](../../src/core/remote-config-constants.ts)
- [`src/platform/extension/site-pack-registration.ts`](../../src/platform/extension/site-pack-registration.ts)
- [`src/core/backup-codec.ts`](../../src/core/backup-codec.ts)
- [`src/background.ts`](../../src/background.ts)
- [`src/platform/userscript-match-coverage.ts`](../../src/platform/userscript-match-coverage.ts)
- [`vite.userscript.config.ts`](../../vite.userscript.config.ts)
- [`package.json`](../../package.json)

### 文档 / 清单

- [`docs/developer/site-adapter/site-adapter-pluginization-plan.md`](./site-adapter-pluginization-plan.md)
- [`docs/developer/site-adapter/site-pack-review-checklist.md`](./site-pack-review-checklist.md)

### Sample packs

- `registry/sites/duck-ai.json`
- `registry/sites/librechat.json`
- `registry/sites/lobechat.json`
- `registry/sites/nextchat.json`
- `registry/sites/open-webui.json`

### 已跑测试

- `tests/core/pack-manager.test.ts`
- `tests/core/backup-codec.test.ts`
- `tests/core/remote-config-signature.test.ts`
- `tests/platform/extension/site-pack-registration.test.ts`
- `tests/adapters/declarative/adapter.test.ts`

---

## 附录 A：审查方法与边界

本次审查基于：

1. 分支与 main 的 diff / 提交范围
2. 关键运行时源码阅读
3. 15 站配置抽取抽样
4. SitePack / remote config / registration / backup 链路阅读
5. 既有单元测试执行结果

**明确不是**：

- 完整 QA 签收
- 商店审核预审结论
- 真实站点兼容性担保

所有“可能回归”均按代码路径与设计语义推断；未跑真实页面处已标注为验证缺口。

## 附录 B：优先级定义

- **P1**：高概率直接影响主路径可用性，或造成难排查的硬失败
- **P2**：中等风险；在特定平台、配置、远程更新或 pack 质量条件下触发
- **P3**：文档/认知/体验噪音，短期不阻塞主路径，但会增加维护与支持成本
