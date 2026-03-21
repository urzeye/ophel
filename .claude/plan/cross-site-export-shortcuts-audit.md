# 跨站点导出与快捷键实现审计

更新时间：2026-03-21

## 范围

本次为静态代码审计，不是浏览器逐站点实测。审计范围覆盖当前注册的 12 个站点适配器：

- `AI Studio`
- `ChatGLM`
- `ChatGPT`
- `Claude`
- `DeepSeek`
- `Doubao`
- `Gemini`
- `Gemini Enterprise`
- `Grok`
- `Kimi`
- `Qianwen`
- `Z.ai`

重点检查以下能力是否真的实现，还是只是“看起来有代码”：

- 导出对话
- 复制最新回复
- 复制最后一个代码块
- 新会话快捷键
- 停止生成快捷键
- 会话类快捷键（刷新、定位、上一个、下一个）
- 模型选择菜单快捷键
- 聚焦输入框快捷键

## 判定标准

- `专用实现`：快捷键或导出链路明确调用了站点适配器专用方法，或适配器本身有站点专用提取逻辑。
- `通用兜底`：没有站点专用实现，主要靠 `useShortcuts.ts` 里的通用 DOM 查询或基类默认行为。
- `缺失/未接通`：能力入口存在，但调用链没有真正接到站点适配器；或适配器根本没实现对应方法。
- `条件实现`：只在特定页面、特定状态或较弱前提下成立。

## 关键代码入口

- 快捷键入口：`src/hooks/useShortcuts.ts`
- 适配器基类默认实现：`src/adapters/base.ts`
- 会话导出入口：`src/core/conversation/manager.ts`

这几个入口决定了很多“看起来每个站点都写了代码，但快捷键实际上没走到那里”的问题。

## 全局结论

### 1. `复制最新回复` 是 adapter-driven，缺方法就一定失败

`useShortcuts.ts` 的 `copyLatestReply()` 只调用 `adapter.getLatestReplyText()`。  
而 `SiteAdapter` 基类默认返回 `null`。

结论：

- 除 `Doubao` 外，其余 11 个站点都实现了 `getLatestReplyText()`
- `Doubao` 没实现，所以该快捷键在豆包上会直接提示“无可复制内容”

### 2. `复制最后一个代码块` 目前只有 DeepSeek 做了站点专用实现

`useShortcuts.ts` 的 `copyLastCodeBlock()` 先调用 `adapter.getLastCodeBlockText()`，如果没有结果，再用全局 DOM 选择器去扫 `pre code, pre, .code-block code`。

结论：

- `DeepSeek` 已实现 `getLastCodeBlockText()`
- 其他 11 个站点都还是通用兜底
- 这意味着只要站点用了虚拟滚动、非标准代码块 DOM、Shadow DOM、代码块未在可视区，快捷键都可能误判为“未找到代码块”

### 3. `停止生成` 从架构上没有真正按站点接通

`useShortcuts.ts` 的 `stopGeneration()` 直接扫描一组硬编码选择器并点击：

- `[data-testid="stop-button"]`
- `button[aria-label*="Stop"]`
- `button[aria-label*="停止"]`
- `.stop-button`
- `md-icon-button[aria-label*="Stop"]`

它没有调用任何适配器方法，也没有复用各站点已经写好的 `isGenerating()`。

结论：

- 很多适配器虽然实现了 `isGenerating()`，但快捷键本身并没有真正 adapter-driven
- 所以这个能力不是“每个站点都支持”，而是“某些站点恰好被通用选择器碰巧命中”

### 4. `新会话` 从架构上也没有真正按站点接通

`useShortcuts.ts` 的 `newConversation()` 只是向页面派发一个假的 `Ctrl+Shift+O` 键盘事件。  
`base.ts` 虽然有 `getNewChatButtonSelectors()` 和 `bindNewChatListeners()`，但后者只是“监听新会话是否发生”，不是“触发新会话”。

结论：

- 所有站点都没有真正实现“快捷键 -> 适配器 -> 新对话按钮点击”这条链路
- 当前行为更像是“希望页面自己也监听了同一组快捷键”

### 5. 导出能力不等于导出质量一致

几乎所有站点都有 `getExportConfig()`，但导出可靠性差异很大：

- `DeepSeek`：目前唯一明确补了导出期虚拟滚动快照
- `Gemini` / `Qianwen` / `Z.ai`：有导出生命周期钩子，但主要是思维链展开、标记或导出上下文控制
- `AI Studio`：有用户文本缓存和 side-channel 恢复，但没有像 DeepSeek 那样做完整 assistant 虚拟滚动补齐
- `Grok`：导出配置里直接写了选择器“基于猜测”，风险最高

### 6. 会话类快捷键依赖三件套，不是单一函数存在就算实现

会话类快捷键至少依赖：

- `getConversationList()`
- `getConversationObserverConfig()`
- `navigateToConversation()`

结论：

- 大多数站点链路是完整的
- `ChatGLM`、`Qianwen` 缺少完整会话链路，所以“刷新会话列表 / 定位 / 上一个 / 下一个会话”不能算真正接通

### 7. 模型选择菜单是 adapter-driven，但不是每个站点都有

`showModelSelector()` 调用的是 `adapter.clickModelSelector()`，而后者依赖 `getModelSwitcherConfig()`。

结论：

- 大多数站点已接通
- `AI Studio`、`DeepSeek` 没有这条链路
- `Z.ai` 只在新会话页可用

### 8. `聚焦输入框` 是当前最完整的一类快捷键

`focusInput()` 只依赖 `adapter.findTextarea()`，而所有适配器都定义了 `getTextareaSelectors()`。

结论：

- 12 个站点都可以算“已实现基础能力”
- 真实体验仍受站点输入框结构影响，但从代码链路上看，比复制/停止生成/新会话要完整得多

## 导出与复制能力矩阵

| 站点 | 导出 | 复制最新回复 | 复制最后一个代码块 | 备注 |
| --- | --- | --- | --- | --- |
| DeepSeek | 专用实现，含导出期虚拟滚动快照 | 专用实现 | 专用实现 | 当前全仓最完整 |
| AI Studio | 基础实现；有用户文本缓存和 side-channel，但无完整 assistant 虚拟滚动补齐 | 专用实现 | 通用兜底 | 导出强于纯配置站点，但弱于 DeepSeek |
| Doubao | 基础实现 | 缺失/未接通 | 通用兜底 | `getLatestReplyText()` 未实现 |
| ChatGLM | 较强；有专用 assistant Markdown 提取 | 专用实现 | 通用兜底 | 导出质量预计较好 |
| Z.ai | 较强；有专用 assistant 提取和导出生命周期钩子 | 专用实现 | 通用兜底 | 生命周期主要处理思维链与导出标记 |
| Gemini | 较强；有专用 assistant 提取和导出生命周期钩子 | 专用实现 | 通用兜底 | 生命周期主要处理 thought 展开 |
| Gemini Enterprise | 基础到中等；支持 Shadow DOM，但未见专用 assistant 导出提取 | 专用实现 | 通用兜底 | 导出可靠性建议后续实测 |
| ChatGPT | 基础实现 | 专用实现 | 通用兜底 | `getLatestReplyText()` 旁边留有 `TODO`，稳健性一般 |
| Claude | 较强；有专用 assistant 提取 | 专用实现 | 通用兜底 | 基础链路较完整 |
| Grok | 基础实现，但导出选择器带“基于猜测”注释 | 专用实现 | 通用兜底 | 导出风险最高，建议优先实测 |
| Kimi | 较强；有专用 assistant Markdown 提取 | 专用实现 | 通用兜底 | 复制最新回复链路完整 |
| Qianwen | 较强；有专用 assistant 提取和导出生命周期钩子 | 专用实现 | 通用兜底 | 生命周期主要处理思维链导出开关 |

## 会话与快捷键能力矩阵

| 站点 | 会话类快捷键 | 新会话 | 停止生成 | 模型选择菜单 | 聚焦输入框 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| DeepSeek | 专用实现 | 缺失/未接通 | 缺失/未接通 | 缺失/未接通 | 已实现 | 新会话和停止生成都还是全局通用逻辑 |
| AI Studio | 专用实现 | 缺失/未接通 | 缺失/未接通 | 缺失/未接通 | 已实现 | 模型菜单未接到快捷键链路 |
| Doubao | 专用实现 | 缺失/未接通 | 缺失/未接通 | 专用实现 | 已实现 | 模型菜单已接通 |
| ChatGLM | 缺失/未接通 | 缺失/未接通 | 缺失/未接通 | 专用实现 | 已实现 | 缺会话列表观察与导航链路 |
| Z.ai | 专用实现 | 缺失/未接通 | 缺失/未接通 | 条件实现 | 已实现 | 模型菜单只在新会话页可用 |
| Gemini | 专用实现 | 缺失/未接通 | 缺失/未接通 | 专用实现 | 已实现 | 停止生成目前只是通用选择器可能碰巧生效 |
| Gemini Enterprise | 专用实现 | 缺失/未接通 | 通用兜底 | 专用实现 | 已实现 | 通用 stop 选择器较可能命中，但不是 adapter-driven |
| ChatGPT | 专用实现 | 缺失/未接通 | 通用兜底 | 专用实现 | 已实现 | stop 选择器与站点 DOM 重叠较多 |
| Claude | 专用实现 | 缺失/未接通 | 通用兜底 | 专用实现 | 已实现 | stop 可能部分可用，但仍属通用逻辑 |
| Grok | 专用实现 | 缺失/未接通 | 通用兜底 | 专用实现 | 已实现 | stop 可能部分可用，但仍属通用逻辑 |
| Kimi | 专用实现 | 缺失/未接通 | 缺失/未接通 | 专用实现 | 已实现 | 站点已写 `isGenerating()`，但快捷键没接过去 |
| Qianwen | 缺失/未接通 | 缺失/未接通 | 缺失/未接通 | 专用实现 | 已实现 | 缺会话列表链路 |

## 各站点详细说明

### DeepSeek

- 已补齐导出期虚拟滚动快照，解决导出 Markdown 样式丢失问题
- 已专门修复 `复制最新回复`
- 已专门修复 `复制最后一个代码块`
- 目前是最接近“站点专用能力完整闭环”的适配器
- 仍未解决架构级问题：`新会话`、`停止生成`、`模型选择菜单`

### AI Studio

- 优点是做了用户文本缓存、字数缓存、side-channel 恢复
- 这类补偿主要服务于用户文本、大纲和部分虚拟滚动场景
- 但助手回复导出仍没有像 DeepSeek 一样在导出前做完整快照或 hydration
- `复制最后一个代码块` 仍没有站点专用实现

### Doubao

- 导出与会话管理基本有
- 模型选择菜单也有专用实现
- 最明显缺口是 `复制最新回复` 没接通
- 如果后续要优先修一个小而确定的问题，豆包补 `getLatestReplyText()` 收益很高

### ChatGLM

- 导出链路不错，assistant 侧有专用 Markdown 提取
- `复制最新回复` 已实现
- 但会话类快捷键未真正成立，因为缺完整会话链路
- `复制最后一个代码块` 仍只有通用兜底

### Z.ai

- 导出、自定义 assistant 提取、思维链处理整体比较完整
- `复制最新回复` 已接通
- 会话类快捷键已接通
- 模型菜单只在新会话页生效，是一个明显的条件限制

### Gemini

- 导出能力较强，导出生命周期会主动展开 thought
- `复制最新回复`、会话类、模型菜单都已接通
- `复制最后一个代码块` 无专用实现
- `停止生成` 仍未真正 adapter-driven

### Gemini Enterprise

- 会话类、复制最新回复、模型菜单都已接通
- 导出使用 Shadow DOM 查询，但未见专用 assistant 导出提取逻辑
- `停止生成` 通用兜底较可能成功，但依然不是正规链路

### ChatGPT

- 会话类、模型菜单、导出都在
- `复制最新回复` 有实现，但源码旁边明确留了 `TODO`
- 这意味着它不是“完全没写”，而是“写了，但作者自己也知道还不够稳”
- `复制最后一个代码块` 仍无专用逻辑

### Claude

- 导出、复制最新回复、会话类、模型菜单都比较完整
- `extractAssistantResponseText()` 已做专用处理
- `复制最后一个代码块` 仍无专用逻辑
- `停止生成` 可能被通用 selector 命中，但不是专门实现

### Grok

- 会话类、复制最新回复、模型菜单都已接通
- 最大问题在导出配置，源码里自己标注了“这里的选择器是基于推测的”
- 所以 Grok 不是“完全没实现”，而是“实现存在明显不确定性”

### Kimi

- 导出、自定义 assistant Markdown 提取、复制最新回复、会话类、模型菜单都具备
- 代码成熟度整体不错
- 但 `复制最后一个代码块` 仍没补站点专用实现
- `停止生成` 也还是没有真正走适配器链路

### Qianwen

- 导出和 assistant 提取都不错，还有导出生命周期控制思维链
- `复制最新回复` 与模型菜单已接通
- 主要缺口在会话类快捷键没有完整链路
- `复制最后一个代码块` 同样还是通用兜底

## 架构级问题清单

以下问题不是“某一个站点写漏了”，而是“当前架构就容易让多个站点一起失效”：

### P0

1. 为 `新会话` 增加真正的适配器接口
   - 建议新增 `adapter.startNewConversation()` 或同类公开方法
   - 不要再依赖伪造 `Ctrl+Shift+O`

2. 为 `停止生成` 增加真正的适配器接口
   - 建议新增 `adapter.stopGeneration()`
   - 不要再只扫全局硬编码 selector

3. 为更多站点补 `getLastCodeBlockText()`
   - 优先级建议：`AI Studio`、`ChatGPT`、`Claude`、`Gemini`、`Kimi`、`Qianwen`
   - 这些站点都已有成熟回复提取逻辑，补代码块提取的收益很直接

### P1

1. 为 `Doubao` 补 `getLatestReplyText()`
2. 为 `ChatGLM`、`Qianwen` 补完整会话链路
3. 为 `AI Studio`、`DeepSeek` 评估是否需要模型菜单快捷键支持

### P2

1. 实测 `Grok` 导出选择器是否可靠
2. 评估 `Gemini Enterprise` 导出在 Shadow DOM 场景下的真实质量
3. 清理 `ChatGPT getLatestReplyText()` 里的 `TODO`

## 未展开项

### `锁定滚动`

本次没有把 `toggleScrollLock` 作为站点适配器能力逐站点评分。  
原因是它主要依赖外层传入的 `onToggleScrollLock`，不是典型的 adapter-driven 功能。

另外，当前代码中也没有发现任何站点覆写 `supportsScrollLock()`。

### 主题、设置、面板类快捷键

这些能力大多不依赖当前站点消息 DOM，因此不在本次“导出 + 回复复制 + 会话 + 输入框”审计核心范围内。

## 最终判断

如果把“是否真正实现”定义为“用户按下快捷键后，逻辑会稳定地走到该站点专用能力”，那么当前仓库的真实情况是：

- `DeepSeek`：目前最完整
- `AI Studio`：补偿逻辑很多，但并没有完全补齐虚拟滚动导出
- `Doubao`：复制最新回复明确缺失
- `ChatGLM`、`Qianwen`：会话类快捷键不完整
- 除 `DeepSeek` 外，其余所有站点的 `复制最后一个代码块` 都仍然偏脆弱
- 所有站点的 `新会话` 都没有真正接通
- 所有站点的 `停止生成` 都没有真正 adapter-driven

所以，DeepSeek 暴露出来的问题不是个例，而是把仓库里一类全局薄弱点放大了。
