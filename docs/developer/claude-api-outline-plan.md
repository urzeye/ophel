# Claude.ai API 数据源大纲与导出适配方案

> 状态：已实施（分支 `feat/claude-api-outline`，大纲 + 导出均已落地，实机冒烟待做）
> 证据样本追加：`claude-curl-response-2.json`（含 HTML canvas 两版、用户上传图片与 markdown 文档；本地参考，勿提交）
> 参考实现：DeepSeek API 数据源（`src/utils/outline-api-source.ts`、`src/adapters/deepseek-history-outline.ts`、`src/adapters/deepseek-history-export.ts`、`src/adapters/deepseek.ts`）
> 证据样本：`claude-demo.html`（本地参考，勿提交）、`claude-curl.sh` / `claude-curl-response.json`（含登录态，勿提交）

## 1. 背景与目标

Claude 长对话走 rocksteady 虚拟滚动（`[data-rocksteady-sizer]`），离屏消息从 DOM 卸载，
大纲标题/用户提问随之消失。现有方案是首次进入对话时全量滚动回填（`collectClaudeVirtualOutline`），
慢且抢滚动。DeepSeek 已验证的更好路径：直接请求站点历史消息接口，从 markdown 解析标题与用户提问。

目标：

1. 大纲数据源切换为 Claude 会话接口，常规路径不再全量滚动回填（保留为兜底）；
2. （第二阶段）导出走接口全量 markdown，无法证明完整/可忠实还原时回退现有 DOM 快照导出。

## 2. 样本分析结论

### 2.1 接口（claude-curl.sh / claude-curl-response.json）

```
GET /api/organizations/{orgId}/chat_conversations/{conversationId}
    ?tree=True&rendering_mode=messages&render_all_tools=true
    &include_inline_comparison=true&consistency=strong
```

- `orgId`：cookie `lastActiveOrg`（用户已确认）。适配器已有 `getActiveOrganizationId()`，
  扩展端 cookie 优先、油猴端 API 优先，直接复用；另复用 `buildNativeDeleteHeaders` 的
  anthropic-* 请求头读取逻辑（抽成通用 `buildNativeApiHeaders`）。
- 响应顶层：`uuid`、`name`、`updated_at`、`current_leaf_message_uuid`、`chat_messages[]`。
- 消息字段：`uuid`、`parent_message_uuid`（根消息为哨兵值
  `00000000-0000-4000-8000-000000000000`）、`sender`（`human`/`assistant`）、
  `index`（0 起连续序号）、`content[]` 块、`attachments[]`、`files[]`、`stop_reason`、`truncated`。
- content 块类型（样本统计 40 条消息）：`text` 51、`thinking` 1、`tool_use` 11、
  `tool_result` 11、`token_budget` 11。正文 markdown 在 `type:"text"` 块的 `text` 字段。
- 样本为单链（无重生旁支），40 条消息 `index` 连续 0..39，`current_leaf_message_uuid`
  即最后一条。接口无 version 字段，变更检测须自建签名（见 4.4）。
- 第二样本确认的附件/工具形态：
  - 用户图片在 `files[]`：`file_kind/file_uuid/file_name/preview_url`，
    `preview_url` 为同源 org 作用域下载地址（带会话 cookie 可下载原图）；
  - 用户文本附件在 `attachments[]`：`file_name/extracted_content`（全文）；
  - `create_file` 即 Artifact/文档机制：`tool_use.input.file_text` 为完整源码、
    `input.path` 为 `/mnt/user-data/outputs/` 路径；配套 `present_files` 的
    `tool_result.content[].type=="local_resource"` 给显示名与 mime_type（按 file_path 对应）；
  - canvas「改版」实为新 path 新文件（非同 path 编辑）；`bash_tool`/`view` 为
    分析工具过程，DOM 导出不包含。

### 2.2 DOM（claude-demo.html，dframe 布局）

- 滚动容器 `[data-autoscroll-container="true"]`（config 已有）；虚拟列表结构：
  `div[role=feed]` → `[data-rocksteady-sizer]`（config `virtualSizer`）内：
  顶部 `data-testid=transcript-spacer`（占位 13287px）+ 挂载行 + 底部 backing。
- 挂载行 `[data-testid="transcript-row"]`，带 `data-rs-index` / `data-index`
  （config `virtualRow` = `[data-rs-index][data-index]`），行内 `role=article` 有
  `aria-setsize=40` / `aria-posinset`（config `virtualArticle`）。样本 40 条总消息仅挂载 21 行。
- 行上没有消息 uuid，只有位置序号。样本验证 `data-rs-index` 与接口消息 `index` 一一对应
  （row 19 = assistant = 消息 index 19）。
- 顶部有 sr-only「Load earlier messages」按钮：前端自身对更早消息分页，接口本次返回全量；
  超长对话接口是否截断未知 → 风险 R1。
- `data-testid=chat-stale-nav-*` 是导航外壳（stale navigation frame）的骨架/屏蔽层，
  `chat-column-body` 挂在 `chat-stale-nav-body` 内，与大纲无关，无需处理。

### 2.3 与 DeepSeek 的关键差异

| 维度 | DeepSeek | Claude |
| --- | --- | --- |
| 行与消息映射 | DOM 行带 `data-virtual-list-item-key` = message_id | 行只有位置序号 `data-rs-index` |
| 消息 id | 数值 message_id/parent_id | uuid 字符串 |
| 变更检测 | session.version | 无 version，自建签名 |
| 分支切换检测 | 挂载行 id 不在分支 id 集合即过期 | 位置序号在分支切换后不变，位置法检测不到 |
| 现有兜底 | 纯 DOM 扫描 | 已有滚动回填缓存机制（可保留作兜底） |

## 3. 总体设计

核心决策：API 数据直接填充现有 `outlineItemCache`，不大改大纲归并/定位链路。

Claude 现有缓存条目 `ClaudeOutlineCacheEntry`（id 形如 `claude-message:{messageIndex}:heading:{order}`
/ `claude-message:{messageIndex}:user`）本身就是按 messageIndex 键控的完整大纲数据源，
`mergeCachedClaudeOutlineItems`（归并）、`resolveCachedClaudeOutlineTarget`（按估算位置滚动定位）、
`findUserQueryElement` 已全部就绪。API 解析产物与缓存条目同构（messageIndex = 分支位置序号），
填充后整条下游链路零改动。这比 DeepSeek 的 `mergeByBranchMessageOrder` 方案 C 更省：
DeepSeek 没有这套缓存才新建归并，Claude 复用现有管线即可。

数据流：

```
extractOutline()
  ├─ maybeRefreshApiOutline()          # 新增：过期判定 → 拉取 → 重建 API 缓存条目
  │    └─ fetch chat_conversations → parseClaudeHistoryOutline()
  │         → 差异重建 outlineItemCache 中 source=api 的条目
  │         → 数据变化时 postMessage(EVENT_OUTLINE_DATA_UPDATED)
  ├─ DOM 扫描已挂载行（现有逻辑不变，updateClaudeOutlineCache 精化同 id 条目）
  └─ mergeCachedClaudeOutlineItems()   # 现有逻辑不变
```

滚动回填降级为兜底：仅当 API 不可用（未登录/orgId 缺失/解析熔断）时才走
`scheduleClaudeVirtualOutlineScan()`，行为与今天一致。

## 4. 关键设计点

### 4.1 分支解析（uuid → 位置序号）

`resolveActiveBranch`（outline-api-source.ts）要求数值 `message_id/parent_id`。
不改共享工具，在 Claude 解析器内做 id 预映射：

1. 按数组顺序为每条消息分配临时数值 id（数组下标），建 `uuid → int` 表；
2. `parent_message_uuid` 映射为父临时 id（哨兵零 uuid 映射为 undefined）；
3. `current_leaf_message_uuid` 映射为临时 id，调 `resolveActiveBranch` 得激活分支；
4. 分支重编号：分支内位置 `0..N-1` 作为全链路统一「messageIndex」，
   与 DOM `data-rs-index` 对齐（样本已验证）。

### 4.2 过期判定（位置语义 + 粘性强制重拉信号）

- `isApiOutlineStale` 直接复用：`branchMessageIds = [0..N-1]`、`maxMessageId = N-1`、
  `mountedIds` = 挂载行 `data-rs-index` 集合。新增消息（尾部出现 ≥N 的行）、
  贴底尾部删除均可检出，语义与 DeepSeek 一致。
- 分支切换（重新生成/左右切换版本）位置不变、内容变，位置法检测不到，补两个
  粘性信号（置位后直到一次成功拉取才清除，避免被冷却/单飞闸门吞掉）：
  1. 生成结束：`isGenerating()` 下降沿。重新生成与编辑必经过生成态，
  2. 标题漂移：挂载行的标题与缓存同 id 条目文本不可调和（相等或互为前缀
     视为截断/渲染差异，如 200 字符截断、KaTeX 重复）——覆盖不经过生成态的
     版本切换；不限于 API 归属条目，DOM 归属条目同样参与（`<`/`>` 切换
     不经过生成态，首轮挂载后漂移检测不能短路）。
  已放弃的方案：用户提问文本指纹。重生分支叉在 assistant 消息上，用户提问文本
  跨分支不变，检测不到；且 DOM 提问文本混有附件名，误报率高。
- 拉取闸门复用 `shouldAttemptApiOutlineFetch`（单飞/生成中跳过/冷却/熔断）。
  与 DeepSeek 的差异：网络/HTTP 失败同样计入熔断计数——Claude 有滚动回填兜底，
  连续失败时需要让它启动。

### 4.3 缓存条目重建策略

- 接口数据是激活分支结构的真值。每次拉取成功：先按新分支展开全部条目 id，
  不在其中的缓存条目（含 DOM 归属）一律清除——编辑/重新生成截断分支后，
  旧位置条目已成为无法跳转的僵尸，仍挂载的行会在下次 extract 由
  `updateClaudeOutlineCache` 重建精确值；
- 同 id 且文本可调和的 DOM 归属条目保留（DOM 的 wordCount 是精确值，API 条目
  是 `markdownPlainLength` 估算值）；文本不可调和说明分支/版本已切换，
  以接口为准替换并转回 API 归属（`apiOutlineEntryIds` 记录当前值为 API 来源的
  条目，供记账与调试）；
- 会话切换清缓存走现有 `ensureClaudeOutlineCacheSession`，同步清空 API 状态。

### 4.4 变更检测签名

接口无 version。签名 = `{branch.length}:{current_leaf_message_uuid}:{conversation.updated_at}`，
变化才重建条目并 `postMessage(EVENT_OUTLINE_DATA_UPDATED)` 触发大纲刷新。

### 4.5 接口截断处理（风险 R1）

超长对话接口可能只返回尾部窗口（DeepSeek 导出已踩过分页坑）：

- 判定：分支链顶消息的 `parent_message_uuid` 不是哨兵零 uuid → 历史被截断。
- 大纲：仍可用，按尾部对齐换算 messageIndex：
  `messageIndex = 分支位置 + (aria-setsize - branch.length)`，`aria-setsize` 读挂载行
  （现有 `getClaudeVirtualMessageCount`）。对不上（aria-setsize 缺失或更小）则整份判解析失败。
- 导出：直接判不可用，回退 DOM 快照路径（同 DeepSeek 导出的完整性哲学：
  静默缺开头比不用接口更伤）。

### 4.6 导出

`parseClaudeHistoryExport`：激活分支 → 消息序列。

- 用户消息：`text` 块拼接为正文；`files[]` 图片以 `![name](preview_url)` 输出
  （zip 时经 `addImageExportAsset` 入 bundle）；`attachments[]` 按现有
  `exportAttachmentsLabel` 列表输出（zip 且 extracted_content 非空时写成
  `assets/files` 文档资产并链接）；
- 助手消息：按块顺序产出有序片段——`text` 为正文；`create_file` 为文档片段
  （markdown 文档按 `formatClaudeDocumentInlineContent` 同规则内联，zip 时走
  `createMarkdownDocumentAssetLink`；html 等其他源码以 `~~~ext` 围栏代码块内联；
  缺 `file_text` 的二进制为 `[Artifact: name]` 占位符；同 path 重复创建仅
  最后一次保留正文，早前版本降级为占位符）；`thinking` 块在 includeThoughts 时
  按现有 `> [Thoughts]` 引用块格式输出（标题取首个 summary）；
  `bash_tool`/`view`/`present_files`/`tool_result`/`token_budget` 及未知
  tool_use 一律跳过（DOM 导出本就不含工具过程，保持等价）；
- 完整性门槛（仅这两条回退 DOM）：4.5 的截断判定 + leaf 未收录 + 分支非空。
- 集成点：`prepareConversationExport` 先尝试 `collectApiExportMessages`（zip 打包时
  带 `ExportAssetCollector`），成功则跳过快照/文档面板/思考块收集（state 标记
  `usedApiExport`，恢复逻辑短路），`extractExportMessages` 直接返回接口消息；
  `extractExportBundle` 返回 collector 收集的图片/文档资产。

## 5. 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/adapters/claude-history-outline.ts` | 新增。`parseClaudeHistoryOutline`：载荷 → 分支解析 → headingsByMessageIndex / userQueries / 字数估算 / 截断标记 |
| `src/adapters/claude-history-export.ts` | 新增（第二阶段）。`parseClaudeHistoryExport` + 保守可用性门槛 |
| `src/adapters/claude.ts` | `maybeRefreshApiOutline` 状态机（镜像 deepseek.ts 的同名实现）；API 条目重建；内容指纹比对；`scheduleClaudeVirtualOutlineScan` 改为仅 API 不可用时触发；导出 API 优先路径 |
| `src/adapters/claude-config.ts` | `traits` 加 `virtualOutlineFill: true`；`CLAUDE_CONFIG_VERSION` 7 → 8 |
| `tests/adapters/claude-history-outline.test.ts` | 新增。合成载荷：单链、重生旁支、截断、空文本提问、content 块混杂 |
| `tests/adapters/claude-history-export.test.ts` | 新增（第二阶段） |
| `docs/developer/architecture.md` | 「API 数据源大纲与导出」小节补 Claude 位置映射差异说明 |

不改动：`outline-api-source.ts`（id 预映射在解析器内消化）、`package.json`
（`https://claude.ai/*` 已在 host_permissions，附件同源无需新增）、消息常量
（`EVENT_OUTLINE_DATA_UPDATED` 已有）。

注意：`claude-demo.html`、`claude-curl.sh`、`claude-curl-response.json` 含用户数据与登录态，
仅作本地参考，禁止提交；测试用合成 fixture，不用真实响应落盘。

## 6. 风险与缓解

- R1 超长对话接口截断 → 4.5 尾部对齐 / 导出回退，实机长对话验证；
- R2 分支切换位置法检测不到 → 4.2 生成下降沿 + 标题漂移双信号；已知残留：
  切换到一个从未挂载过的历史版本且其标题恰好与现分支同位置一致时检测不到
  （与改动前行为一致，不劣化）；
- R3 `data-rs-index` 语义随站点改版漂移（如把非消息行计入序号）→ 挂载行同时带
  `data-testid=transcript-row` 与 `data-rs-index` 才采信；指纹比对作为二次校验，
  漂移会表现为持续指纹不一致，熔断后回退滚动回填，行为不劣于现状；
- R4 orgId 获取失败（cookie 缺失）→ `getActiveOrganizationId` 已有三级回退，
  最终失败则静默走 DOM + 滚动回填；
- R5 附件/Artifact 形态已经两个真实样本验证；残留未知：同 path 编辑工具
  （update_file 类）未观察到（按「同 path 仅取最后一次」兜底）、二进制文档
  无 file_text（输出占位符，与 DOM 路径等价）。

## 7. 实施步骤

1. `claude-history-outline.ts` 解析器 + 单测（纯函数先行）；
2. claude.ts 接入：状态机 + 缓存重建 + 指纹比对 + 滚动回填降级为兜底；
3. config traits + version，跑全量测试与 typecheck；
4. 第二阶段：导出解析器 + 集成 + 单测（已完成）；
5. 实机冒烟：长对话大纲完整性、定位跳转、重新生成后大纲刷新、导出对比 DOM 路径。

## 8. 验证计划

- 单测：解析器合成载荷全覆盖；适配器现有 claude 测试不回归；
- `pnpm test` / `pnpm typecheck`；触及导出路径后补 `pnpm build:userscript`；
- 实机：claude.ai 长对话（100 条以上）大纲完整性与滚动回填对比、离屏条目定位、
  重新生成/编辑分支切换后刷新、未登录窗口降级行为。
