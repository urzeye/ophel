# 会话导出管道优化与多轮/思维链治理技术方案

> 创建日期：2026-08-21  
> 涉及模块：`src/core/conversation/manager.ts`、`src/utils/exporter.ts`、`src/adapters/*`、`src/stores/settings-store.ts`、`src/tabs/options/pages/FeaturesPage.tsx`  
> 关联需求：[GitHub Issue #841](https://github.com/urzeye/ophel/issues/841)、多站点思维链多段输出治理、连续同角色标题治理

---

## 1. 背景与目标

### 1.1 现状与痛点

1. **思维链导出碎片化（多 `[Thoughts]` 引用框）**：
   在部分站点（如含联网搜索、多步推理等）中，页面 DOM 将思维链分为了多个 `<p>` 或多个 `.markdown` 容器，或者 API 返回了多个思考分片。适配器提取时对每个子块都单独包裹了 `> [Thoughts]`，导致导出的 Markdown/TXT 中出现**连续多个带 `[Thoughts]` 标签的引用框**，排版极其割裂。
2. **思考块独立成条导致连续多个 `## 🤖 模型` 标题**：
   部分站点在 DOM 结构或 API 提取时将思维链容器与正文容器拆分为了两个同级的 Assistant 节点，导致最终导出的文档中出现一个纯思维链的 `## 🤖 模型` 标题，紧接着又出现一个正文的 `## 🤖 模型` 标题。
3. **缺少对话序号（Issue #841）**：
   导出的 Markdown/TXT 文件仅有角色名，长对话无法快速定位具体是第几轮交互，用户难以直观按序号检索或比对。
4. **Markdown 分割线自定义（Issue #841）**：
   导出的 Markdown 固定写死了 `---`，部分用户希望能够自定义分割线字符（如 `***`、`✦ ✦ ✦` 或空字符）以减轻视觉疲劳。
5. **思维链隐藏即时控制（Issue #841）**：
   虽然全局设置中有 `includeThoughts` 开关，但用户在导出具体某次对话时通常需要**即时切换**，缺乏页面级便捷交互入口。

### 1.2 总体设计原则

* **分层防御、极简规则**：在 `utils/exporter.ts` 构建高内聚、低复杂度的纯函数清洗管道，避免逐个站点修补，且严守安全边界，不搞模糊或有副作用的复杂合并。
* **小步提交、低风险拆分**：将纯数据清洗逻辑、设置项扩展、全新页面 UI 交互拆分为独立 PR，确保每个改动具备最小闭环、零回归风险。

---

## 2. 核心架构设计

### 2.1 极简且安全的同角色/思维链合并管道

为彻底杜绝虚拟列表漏采或乱序时的误合并风险，采用**极简且严格的判定策略**：

```mermaid
flowchart TD
    Raw[适配器抓取 / API 导出的原始消息序列] --> Normalizer[Message Stream Normalizer]
    
    subgraph Normalizer [极简消息清洗管道]
        T1[1. 思维链统一聚合：合并连续的 > [Thoughts] 块] --> T2[2. 极简合并：连续 Assistant 且前一条为纯思维链]
    end
    
    Normalizer --> Exporter[Exporter 格式化引擎]
    Exporter --> Output[Markdown / HTML / JSON / TXT]
```

#### 极简合并规则（Zero-Side-Effect）：

1. **用户（User）消息一律不合并**：
   * 严格保留所有用户输入，绝对不把多条提问糅合在一起。
2. **连续 Assistant 仅在“前一条为纯思维链”时合并**：
   * 若连续两条均为 `assistant` 角色，且前一条消息内容**全部为 `> [Thoughts]` 纯思维链**：
     * 将前一条的思维链内容作为前缀，拼接到后一条 Assistant 正文前面，融合成一个完整的 Assistant Turn。
   * **其余所有情况（如连续两条实质性正文、多版本重试回答、虚拟列表漏采等）一律保持原样，不做任何合并**，彻底杜绝数据串味或误删。
3. **通用思维链聚合器（Thought Block Consolidator）**：
   * 无论何处出现的连续 `> [Thoughts]\n> ...\n\n> [Thoughts]\n> ...`，自动提取内部段落并合并为一个唯一的标准引用块：
     ```markdown
     > [Thoughts]
     > 第一段思考...
     >
     > 第二段思考...
     ```
   * 彻底消除同一个回答内出现多个 `[Thoughts]` 标签的问题。

---

### 2.2 对话轮次序号（Turn-based Indexing）

采用**按对话轮次（Turn-based）单调递增**的方式编排序号，契合 Markdown 大纲（TOC）结构：

```markdown
## 1. 🙋 用户
用户的第一轮提问...

---

## 1. 🤖 DeepSeek
模型的完整回答...

---

## 2. 🙋 用户
用户的追问...

---

## 2. 🤖 DeepSeek
模型的第二轮回答...
```

* **配置控制**：通过 `metadata.showIndex` 传入格式化函数，当开启时在角色标题前添加 `N. ` 前缀。

---

### 2.3 Markdown 分割线自定义

* 仅针对 Markdown 格式导出（HTML 导出保持默认规范，无需用户关心）。
* 设置项提供字符串输入框 `exportMarkdownDivider`，默认值为 `"---"`。
* 用户可根据喜好自由输入任意分割线文本（如 `***`、`✦ ✦ ✦`、`───` 等）或清空。

---

## 3. PR 拆分与实施计划

> **2026-08-23 更新（评审后调整）**：原三 PR 拆分（#862 / #863 / #864）在实际落地时发现强耦合——
> #862 引用了 #863 才定义的设置类型导致独立编译失败，且评审修复横跨三个层面。
> 仓库采用 squash 合并，叠加式 PR 会产生冲突维护成本，因此最终**合并为单个 PR（#864）**交付，
> 内部仍以分层 commit 保持可审性。
>
> 评审修复一并纳入：思维链链式合并（多段分片场景）、分段导出接入统一清洗管道、
> 弹窗打开时重新同步设置快照、剪贴板格式纳入弹窗、JSON 下序号选项禁用提示、
> 新增「导出前显示选项弹窗」开关（`exportShowDialog`，默认开启，关闭后恢复一键直出）。
> 会话列表右键/批量菜单的导出入口同步收敛：取消中间格式子菜单层，点击「导出…」直接打开
> 导出选项弹窗（经 `ophel:openExportDialog` 事件复用 App 层入口逻辑）；分段导出经弹窗内
> 「分段导出…」链接与工具箱菜单触达，会话菜单不再单列。

```
单 PR 内部分层 commit：
  1. 底层核心: 消息归一化管道与通用思维链/纯思考块合并
  2. 设置与国际化: Issue #841 对话序号与自定义分割线配置、导出弹窗开关、Options UI 与 11 语言 i18n
  3. 独立 UI Feature: 页面交互式导出弹窗
```

---

### Phase 1 (PR 1)：底层核心清洗与思维链优化

**目标**：纯逻辑层治理，全站一次性解决多 `[Thoughts]` 块与纯思维链独立成标题的问题。

#### 变更清单
1. **`src/utils/exporter.ts`**：
   - 新增 `consolidateThoughtBlocks(content: string): string`：通用思维链去重合并函数（在所有格式导出前调用）。
   - 新增 `normalizeExportMessages(messages: ExportMessage[]): ExportMessage[]`：仅对连续 Assistant 且前一条为纯思维链的场景执行合并。
   - `formatToMarkdown`、`formatToTXT`、`formatToHTML` 支持 `showIndex` 与 `customDivider` 可选参数。
2. **`src/core/conversation/manager.ts`**：
   - 在 `withConversationExportData` 中集成清洗管道，保障所有导出路径统一受益。
3. **`src/adapters/deepseek.ts` (及部分主流适配器)**：
   - 优化 `extractThoughtBlockquotesFromMessage`，将所有思考节点先汇总后再做单次 `formatAsThoughtBlockquote` 包装。

---

### Phase 2 (PR 2)：Issue #841 设置项与多语言

**目标**：完成 Issue #841 的设置项扩展（对话序号开关 + Markdown 自定义分割线输入框），并提供 11 种语言支持。

#### 变更清单
1. **`src/types/settings.ts`**：
   - `ExportSettings` 新增：
     - `exportShowIndex?: boolean`（默认 `false`）
     - `exportMarkdownDivider?: string`（默认 `"---"`）
2. **`src/constants/default-settings.ts`**：
   - `DEFAULT_SETTINGS.export` 增加上述默认值。
3. **`src/utils/settings-normalize.ts`**：
   - 补充两个新设置项的规范化与回退处理。
4. **`src/tabs/options/pages/FeaturesPage.tsx`**：
   - 在“导出设置”卡片中新增：
     - 对话序号开关：`exportShowIndexLabel` / `exportShowIndexDesc`
     - Markdown 分割线自定义输入框：`exportMarkdownDividerLabel` / `exportMarkdownDividerDesc`
5. **`src/locales/*/index.ts`**：
   - 同步 11 种语言（zh-CN, zh-TW, en, ja, ko, it, de, es, fr, pt-BR, ru）的新增文案。
6. **`docs/developer/settings-schema.json`**：
   - 同步更新 JSON Schema。

---

### Phase 3 (PR 3)：页面交互式导出菜单/弹窗（独立 UI Feature）

**目标**：在页面端提供即时交互导出弹窗/菜单，支持用户在导出前即时调整格式（MD/HTML/JSON/TXT）、是否包含思维链、是否显示序号等。

#### 交互与设计规范
* 严格遵循根目录 `DESIGN.md` 中的 UI 规范（Shadow DOM 隔离、CSS 变量 `--gh-*`、统一圆角与动效）。
* 导出参数支持“临时生效”，不污染全局默认设置。

#### 变更清单
1. **`src/components/ExportDialog.tsx` (或 `PageExportMenu.tsx`)**：
   - 页面端即时导出面板组件（格式选择、思维链勾选、序号勾选、ZIP 打包勾选、立即导出按钮）。
2. **`src/components/MainPanel.tsx` / `src/components/QuickButtons.tsx`**：
   - 接入新导出面板触发入口。
3. **`src/core/conversation/manager.ts`**：
   - 支持接收单次即时覆盖参数执行导出。

---

## 4. 验收与质量检查

每个 PR 在交付前需完成以下检查闭环：

```bash
# 1. 格式化检查
pnpm format:check

# 2. Lint 代码检查
pnpm lint:check

# 3. TypeScript 类型检查
pnpm typecheck

# 4. Chrome 扩展构建验证
pnpm build

# 5. 油猴脚本构建验证
pnpm build:userscript
```
