# 大纲层级错位问题分析与解决方案 (Outline Hierarchy Mismatch)

## 1. 背景 (Context)

在 Ophel 的大纲功能中，为了提供纯净的阅读体验，通过配置 `showUserQueries: false` 可以隐藏用户的提问，仅展示 AI 的回复内容。

此时，大纲的生成逻辑是：
1.  **输入**：从 DOM 中提取所有 `H1` - `H6` 节点（忽略 User Query）。
2.  **处理**：基于这些 Header 的层级（Level）构建树形结构。
3.  **输出**：一个连续的、层级嵌套的大纲树。

## 2. 问题 (Problem)

当**跨越对话回合（Conversation Turns）**时，可能会出现逻辑上不合理的层级嵌套，被称为**“跨回合层级错位”**。

**典型场景**：
*   **第 1 轮回复**：AI 使用了 **H1** 作为顶级标题（例如：“项目介绍”）。
*   **第 2 轮回复**：AI 由于本次内容的层级较低，或模型输出不稳定，最高只使用了 **H3**（例如：“细节补充”中的一个小点）。
*   **当前表现**：由于没有“用户提问”作为分割，大纲构建算法会向回寻找父节点。它发现前一个最近的更高层级标题是第 1 轮的 **H1**，于是错误地将第 2 轮的 **H3** 挂载为第 1 轮 **H1** 的**子孙节点**。

**后果**：
*   **语义错误**：第 2 轮回复明明是新的话题，却被归类为第 1 轮话题的子集。
*   **导航困惑**：用户点击看起来是“子标题”的节点，结果跳转到了页面底部的全新对话区域。

## 3. 原因 (Root Cause)

目前的树构建算法（`Core/OutlineManager.ts` -> `buildTree`）是**上下文无关**的单纯层级堆叠算法。

它遵循的唯一规则是：
> 如果当前节点 Level > 前一个节点 Level，则视为子节点；否则向上回溯寻找最近的父级。

算法**缺失了“对话边界”（Boundary）的信息**。它假设整个文档是一篇连续的文章，而实际上 ChatGPT/Gemini 的页面是由多个独立的“文章片段”（Turns）组成的序列。

## 4. 解决方案 (Solutions)

既然代码底层（Adapter）已经具备了感知 `msgId`（消息 ID）或 `UserQuery`（用户提问）的能力，我们可以利用这一信息进行逻辑阻断。

### 方案 A：虚拟根节点 (Visual Separator)
*   **原理**：在检测到 `msgId` 变化时，插入一个虚拟节点。
*   **逻辑**：
    *   在构建树之前，先对列表进行预处理。
    *   发现 `prev.msgId !== current.msgId` 时，人为插入一个 `GhostNode`（虚拟节点，无内容或仅显示分割线）。
    *   强制后续节点挂载在这个 GhostNode 下，或者让 GhostNode 强制中断层级。
*   **缺点**：UI 上难以处理。如果显示分割线，会破坏大纲的紧凑感；如果不显示，GhostNode 可能会导致缩进错乱。

### 方案 B：层级提升 (Level Promotion / Auto-Hoisting)
*   **原理**：强制让每一轮对话的“最高级标题”在视觉上都作为“第一级”展示。
*   **逻辑**：
    *   以 `msgId` 为界，将节点列表切分为多个 Group。
    *   计算每个 Group 内部的最小 Level（例如 Group B 最小是 H3）。
    *   对 Group B 内所有节点进行 `level -= (minLevel - 1)` 的运算，强行把 H3 提升为 H1。
*   **缺点**：**严重破坏语义**。用户看到的是一级标题，点击跳转过去发现原文只是个三级标题，会产生认知失调。且修改了原始数据，可能引发其他 Bug。

### 方案 C：隐式分组 / 禁止跨代认亲 (Implicit Grouping / No Cross-Parenting) —— 【推荐】

*   **原理**：利用 `msgId` 作为硬性约束，禁止“跨消息 ID”的父子归属。
*   **逻辑**：
    *   修改 `buildTree` 算法。
    *   在寻找父节点（`findParent`）的逻辑中，增加一个判断条件：
        ```typescript
        // 伪代码
        if (potentialParent.msgId !== currentNode.msgId) {
            // 拒绝认贼作父
            return null; // 找不到同消息的父节点 -> 自己成为根节点
        }
        ```
*   **表现**：
    *   第 1 轮的 H1 是根节点。
    *   第 2 轮的 H3，由于找不到同 `msgId` 的 H1/H2 父节点，也会被强行处理为**根节点**。
*   **优点**：
    *   **逻辑严谨**：彻底解决了归属错误。
    *   **语义保留**：H3 依然是 H3，只是在大纲树中位于顶层。
    *   **实施简单**：仅需修改 `OutlineManager` 的一处判断逻辑。

## 5. 推荐方案实施指南 (Implementation Guide)

建议采用 **方案 C**。

**关键数据准备**：
确保 `SiteAdapter` 在提取大纲时，无论是否显示 User Query，都必须为每个 `OutlineItem` 正确填充 `id` 相关的元数据，或者显式增加一个 `turnId` / `msgId` 字段。（目前 `id` 格式通常包含 `msgId`，可尝试解析，或者直接加字段）。

**代码修改点 (`src/core/outline-manager.ts`)**：

在 `buildTree` 方法中：

```typescript
function buildTree(items: OutlineItem[]) {
  const root = ...;
  const stack = [root];

  for (const item of items) {
    // 1. 确定当前 item 的 msgId (需要解析 item.id 或新增字段)
    const currentMsgId = parseMsgId(item.id);

    // 2. 寻找父节点时的回溯逻辑修改
    let parent = stack[stack.length - 1];
    
    // 原有逻辑：仅判断 level
    // while (parent.level >= item.level && parent !== root) ...

    // 新逻辑：判断 level AND msgId
    while (
      parent !== root && 
      (
        parent.level >= item.level ||       // 层级不满足，必须回溯
        parent.msgId !== currentMsgId       // 消息ID不匹配，必须回溯（禁止跨代）
      )
    ) {
      stack.pop();
      parent = stack[stack.length - 1];
    }
    
    // ... 挂载节点 ...
  }
}
```

**注意**：
*   当 `showUserQueries: true` 时，UserQuery 节点本身就是该 Turn 的根，后续 Headings 会自然挂载在 UserQuery 下（如果是 H1 则可能并列，视具体实现而定）。方案 C 主要针对 `showUserQueries: false` 的场景。
*   需要确认 `OutlineItem` 的 `id` 字段是否足够稳定且包含 `msgId`。如果现在的 `id` 生成逻辑复杂，建议在 `OutlineItem` 接口中显式增加 `groupId` 或 `turnId` 字段用于此逻辑。
