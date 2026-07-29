# AI Studio 适配器配置化设计

## 目标与边界

AI Studio 是 P3-07 大站批次的最后一个配置化站点。本次迁移让输入与操作按钮、时间线滚动条、普通消息、三栏布局与 Run settings 避让、模型选择侧栏、Library 会话列表与 UI 删除、图片/文件附件、Thought、Markdown/代码块规范化、长会话导出和大纲依赖的宿主 selector 可以通过 L1 patch 热修，同时保持现有用户行为不变。

只抽取可 JSON 序列化且有真实运行时读取点的 selector 与公共配置。hostname、`/prompts/*` 与 `/app/prompts/*` 路由语义、动态会话 ID selector、用户自定义发送键读取、Library 跳转与缓存、删除关键词和点击/等待时序、未启用的原生 RPC 删除编排、API key/认证处理、附件 URL 安全过滤、长会话 turn 挂载与重试状态机、快照属性、模型缓存和主题切换控制流继续留在命令式适配器中。Ophel 自身的 `.gh-*`、`data-gh-*`，以及不承载站点语义、只用于通用遍历的 `button`、`main`、`script`、`tr`、`h1-h6` 等原语也不进入远程配置。

`src/contents/aistudio-preload.ts` 在 document-start 阶段把设置预写入 AI Studio 的 `localStorage`，属于站点专属 L1 代码，不能通过配置替代。本仓库的 Flutter iframe 主世界滚动脚本只匹配 Gemini 域名，AI Studio 当前没有对应注入链路；本次不扩展或改动该脚本。

## 方案

保留 `AIStudioAdapter extends SiteAdapter`，新增强类型 `AIStudioSiteConfig`。公共 schema 承载输入、会话字段映射、生成状态、模型切换、导出、页面宽度、Zen/Clean Mode、Mermaid、Quick Quote 与宿主主题同步声明；AI Studio 专属的时间线、标题来源、布局与 Run settings、模型侧栏、Library、删除菜单、消息 chunk、附件、Thought、Markdown/代码块、长会话挂载和主题事件目标 selector 放入 `sitePrivateSelectors` 精确白名单。

适配器持有唯一的 `this.config`，默认引用内置配置，并在配置门闩完成后接收校验过的合并结果。所有可热修 selector 在调用时读取 `this.config`，不复制为模块级站点常量或长期缓存。Ophel 导出快照属性继续由代码动态组合，避免把插件自有 DOM 当成宿主 selector 暴露给 patch。

不改为 `DeclarativeAdapter`，因为当前 DSL 无法等价表达 AI Studio 的用户发送键偏好、模型侧栏开合与恢复、Library SPA 导航、UI 删除熔断、认证/RPC 候选、附件资源安全、Thought 合并、turn 内部虚拟挂载、导出重试与快照排序。也不只迁移公开 getter，否则时间线、Library、模型、附件和长会话导出仍会保留不可热修的第二 selector 数据源。

布局继续采用现有三栏策略：聊天正文以 `.chunk-editor-main` 为 scope，重算消息列、turn 和输入框宽度；聊天滚动区与 footer 使用 edge 安全区；`ms-chunk-editor` 作为独立 scope 只向右侧避让。Run settings 不作为聊天主区域 obstacle，模型滑出侧栏与 Material dialog 继续作为浮层 obstacle。默认宽度、16px 间距、表格拉伸和 CSS 属性保持不变。本次不新增 CSS 文件、主题变量或 Shadow DOM 注入路径，扩展与油猴继续共用同一适配器读取链路。

## 验证与剩余风险

默认配置必须通过 capability 与私有键白名单校验；合法 patch 应动态影响适配器读取，未知/删除私有键与旧基线版本必须被拒绝或跳过。迁移前后的输入、时间线、会话标题、滚动、宽度、面板避让、模型锁定与列表、Library、删除、附件、Thought、大纲、生成检测、新对话、主题和长会话导出配置逐项保持等价，并确认所有私有 selector 都有运行时消费点。

静态检查与双构建不能替代真实页面回归。普通/分享会话、旧新版时间线、长会话、纯附件与混合附件、Thought、Library 桌面/移动布局、批量删除、模型面板展开/收起、Run settings、零态输入、表格、主题切换、document-start 预加载以及扩展/油猴环境仍需后续在真实站点验证。完成代码迁移后 P3-07 仍按任务表标准保留“进行中”，直到四大站完整真实回归通过。
