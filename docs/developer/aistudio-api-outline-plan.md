# AI Studio API 数据源大纲适配方案

> 状态：分析完成，待实施（分支 `feat/aistudio-api-outline`）
> 参考实现：DeepSeek/Claude API 数据源（`src/utils/outline-api-source.ts`、
> `src/adapters/deepseek-history-outline.ts`、`src/adapters/claude-history-outline.ts`、
> `docs/developer/claude-api-outline-plan.md`）
> 证据样本：`curl-chat.sh` / `curl-response.json`（15 轮纯文本对话）、
> 含附件会话 curl（图片 + 文件）、`cookies.json`；以上均含登录态，**勿提交**

## 1. 背景与目标

DeepSeek/Claude 已用站点 API 数据源替代纯 DOM 扫描大纲（1.2.9），两者都是 RESTful。
AI Studio 是 Google 内部 RPC（grpc-web 的 JSON 映射，`content-type: application/json+protobuf`），
本方案验证其可行性并给出落地设计。

两个前置问题均已实测闭环：

1. 响应里能否解析出完整对话内容？——能，且无分页、无分支，比 DeepSeek/Claude 都简单（§2）。
2. 请求凭证哪些必传、如何获取？——必传仅 4 项，全部可在扩展内获得（§3）。

## 2. 接口与响应结构

### 2.1 请求

```
POST https://alkalimakersuite-pa.clients6.google.com/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/ResolveDriveResource
body: ["<promptId>"]        // 裸 ID，不带 "prompts/" 前缀（注意 DeletePrompt 用的是全名）
```

- `promptId` 即 URL `/prompts/<id>` 的 id（`getSessionId()` 已返回裸 id）。
- RPC origin 的 `alkalimakersuite-<xx>-clients<N>` 前缀会变：复用适配器现有
  `resolveRpcOriginsFromPerformance()` 发现逻辑 + `AISTUDIO_FALLBACK_RPC_ORIGIN` 兜底。
- 页面自身在打开/刷新历史会话时就会调此接口（Network 面板可见），属于读路径常态调用。

### 2.2 响应结构

外层为单元素数组，prompt 对象共 14 个槽位：

| 槽位 | 内容 |
| --- | --- |
| `[0]` | 资源名 `"prompts/<id>"` |
| `[3]` | 运行参数（模型 `models/gemini-3-flash-preview`、温度等） |
| `[4]` | 元数据：`[0]` 标题、`[4]` 更新信息（`[4][0]` 为最后更新时间戳 `["1790062476",1000000]` 秒+纳秒，实测晚于末条 chunk 时间，`[4][1]` 为作者）、`[11]` 属性键值对（`promptType=CHUNKED_PROMPT` 等） |
| `[13]` | **对话本体**：`[13][0]` 为 chunk 数组（顺序即对话顺序）；`[13][1]` 是当前输入框草稿（空文本 user chunk），解析时跳过 |

### 2.3 chunk 结构（37 槽位，43+10 条样本全量验证）

| 槽位 | 含义 | 判别力 |
| --- | --- | --- |
| `[0]` | 完整 markdown 全文（非流式分片；`[29]` 只是同文本的分片副本，忽略） | 空文本 = 附件 chunk / 草稿 / 错误 chunk |
| `[8]` | 角色 `"user"` / `"model"` | 确定 |
| `[16]` | `=== 1` → 正式回答 | 15+3 条回答全部命中 |
| `[19]` | `=== 1` → 思考链 chunk（英文 thought summary） | 11+2 条思考全部命中；**不要用 `[25]===-1`**（有思考样本该位为 null） |
| `[18]` | token 数 | 参考用 |
| `[28]` | 错误文案（实测出现 `"An internal error has occurred."`，此时 `[0]` 为空） | 错误 chunk 判别 |
| `[32]` | 秒+纳秒时间戳 | 仅部分 chunk 有，不可依赖 |

解析规则：

- 用户提问：`[8]==="user"` 且 `[0]` 非空。
- 正式回答：`[8]==="model"` 且 `[19]!==1` 且 `[0]` 非空（思考链不参与大纲解析）。
- 跳过：`[13][1]` 草稿组、空文本错误 chunk、附件 chunk（见 §4）。
- 历史为**线性单链**（AI Studio 无 DeepSeek 式 parent_id 重生旁支），不需要
  `resolveActiveBranch`；chunk 无显式 id，用位置序号作 messageIndex（同 Claude 方案）。
- 完整性：接口一次返回全量，无分页参数；15 问 15 答 11 思考逐条核对无缺漏。
  超长对话是否截断未验证（风险 R2）。

## 3. 凭证实测结论（2026-09-28，40+ 次删减重放）

**必传仅 4 项**，其余头全部可去（`referer`、`user-agent`、`x-user-agent`、
`x-goog-authuser`、`x-browser-validation`、`x-client-data`、`x-goog-ext-*`、`sec-*` 等均验证非必需）：

| 必传项 | 缺失时的表现 | 扩展中获取方式 |
| --- | --- | --- |
| 登录 cookie | 401 missing credential | 不用读；`fetch` 带 `credentials:"include"` 浏览器自动附带（HttpOnly 无影响） |
| `authorization: SAPISIDHASH <ts>_<sha1>` | 401 | 本地计算 `sha1("${ts} ${SAPISID} ${origin}")`；`SAPISID` 非 HttpOnly，`document.cookie` 可读 |
| `x-goog-api-key` | 403 unregistered caller | 公开站点 key：`WIZ_global_data.SNlM0e`（仅 main world 可见）或 localStorage/script 扫描 |
| `origin: https://aistudio.google.com` | 401 invalid credentials | 页面上下文发请求时浏览器自动携带 |

其他实测要点：

- SAPISIDHASH 算法经「现场重算 → 200」验证正确，且会过期，须每次请求现算。
  适配器现有 `buildSapisidHashToken()` 实现的就是此算法。
- auth 头只保留 `SAPISIDHASH` 一段即可（`SAPISID1PHASH/3PHASH` 非必需）。
- 实测最小 cookie 集合 4 个：`SAPISID`、`__Secure-1PAPISID`、`__Secure-1PSID`、
  `__Secure-1PSIDTS`（`SAPISID`/`__Secure-1PAPISID` 为 hash 校验对，后两个为会话凭证）；
  完整 cookie 集里跟踪类（NID/AEC/ENID）、SIDCC/PSIDCC、SID 族均非必需。
- **关键实现约束**：SAPISIDHASH 校验绑定 Origin，而扩展 content script 发起跨域 fetch 时
  浏览器会把 Origin 改成扩展源（`chrome-extension://…`），校验必然失败。
  因此请求必须在 **main world**（页面上下文）发起，cookie 也按 same-site 规则自动附带。

## 4. 附件结构与 blob 链接分析

含附件会话实测结论：**没有加密**，附件以 Drive 文件 ID 形式内联在 chunk 里：

| chunk 槽位 | 内容 | 样本 |
| --- | --- | --- |
| `[1]` | 图片附件 ID 数组 | `["1o5LxYDU9-4HELPHHq0bSiQf00vhtxegy"]` |
| `[3]` | 文件附件 ID 数组 | `["1iwgUh8OUVM537HX1dEWxW_a4dcl9k28u"]` |

- 附件 chunk 的 `[0]` 文本为空，`[18]` token 数很大（图片 1105 / 文件 1141），
  `[32]` 时间戳与相邻文本 chunk 相同（同一轮提问拆成多个 chunk）。
- 这些 ID 是 **Google Drive 文件 ID**（AI Studio 把上传文件存进用户 Drive，
  prompt 本身就是 Drive 资源——接口名 `ResolveDriveResource` 即此意）。
- `blob:https://aistudio.google.com/70a60b51-…` 与服务端**没有任何映射关系**：
  前端下载文件字节后调用 `URL.createObjectURL()` 生成的内存对象 URL，
  UUID 每次会话随机生成，仅当前页面会话有效。对应关系是
  「chunk 里的 Drive file ID → 前端下载 → createObjectURL → blob UUID」。
- 元数据 `hasImages` 不可靠：含图片的会话该标志仍为 `"false"`，不要用它判断附件。

附件内容实测可下载（仅带 cookie）：

```
GET https://drive.usercontent.google.com/download?id=<fileId>&export=download&authuser=0
```

- 图片：直接 200 `image/png`（实测 169451 字节原图）。
- 文件：首次返回「病毒扫描警告」HTML 页，需解析页内表单的 `uuid`/`at` 字段，
  二次请求追加 `confirm=t&uuid=<>&at=<>` 才返回原始字节（实测成功拿到脚本全文）。
- 备选路径：`GenerateAccessToken` RPC 换 OAuth token 后走 Drive API v3
  `files/<id>?alt=media`（页面加载时确实会调 `GenerateAccessToken`），未实测，
  仅当 usercontent 路径失效时再启用。

大纲场景不需要附件内容（空文本 chunk 按无文本提问处理：计入 queryIndex 但不进大纲，
同 DeepSeek 约定）；附件下载链路是给后续「接口导出」阶段备用的。

## 5. 实施计划

1. 新增 `src/adapters/aistudio-history-outline.ts` 解析器，输出 `ApiOutlineSourceData` 形态：
   - messageIndex = chunk 位置序号（`[13][0]` 数组下标）；
   - 变更检测签名：chunk 数 + 元数据最后更新时间戳（prompt 对象 `[4][4][0]`）+ 末条 chunk 文本长度；
   - 跳过草稿组 / 思考 chunk / 错误 chunk / 附件 chunk（§2.3 规则）。
2. 拉取链路：main world 代发 fetch（Origin 约束，§3），结果 postMessage 回 isolated world；
   复用现有 `buildGoogleAuthorizationHeader` / `resolveGoogleApiKey` /
   `resolveRpcOriginsFromPerformance`（从删除逻辑中抽出共用）。
3. `aistudio-config.ts` traits 加 `virtualOutlineFill`（并递增 `AISTUDIO_CONFIG_VERSION`）。
4. `package.json` host_permissions 增加 `https://*.clients6.google.com/*`
   （参照 `files.deepseeksvc.com` 先例放 host_permissions）。
5. 接线沿用既有契约：过期判定/拉取闸门（`isApiOutlineStale` / `shouldAttemptApiOutlineFetch`）、
   数据更新后 postMessage `EVENT_OUTLINE_DATA_UPDATED`。
6. 验证：`pnpm typecheck` + `pnpm test` + `pnpm build`，实机冒烟覆盖
   纯文本对话 / 含附件对话 / 生成中跳过 / 会话切换。

## 6. 风险与未验证点

- R1：SAPISIDHASH 跨会话稳定性——`shouldUseNativeDeleteApi()` 注释标记其
  "highly dynamic and currently unstable across sessions"（DeletePrompt 因此被禁用）。
  本次读路径实测正常，但需实机长测；失效兜底 = 退化为现有纯 DOM 扫描。
- R2：超长对话接口是否截断未验证。
- R3：freeform prompt（非 `CHUNKED_PROMPT`）的响应结构未验证。
- R4：main world 代发的消息通道需与现有 main world 基建（`aistudio-preload.ts` 等）对齐。
- R5：附件下载的两步病毒扫描确认流增加导出阶段复杂度；大纲阶段不涉及。
