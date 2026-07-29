# ChatGPT 适配器配置化设计

## 目标与边界

ChatGPT 是 P3-07 大站批次的第一个配置化站点。本次迁移让输入与操作按钮、会话侧栏、消息与 Codex Task、生成状态、网络监控、模型菜单、实时 DOM 导出、附件与图片、Deep Research、原生 TOC、页面宽度、Canvas 与库文件 fullscreen shell 面板避让、Zen/Clean Mode、Mermaid 和 Quick Quote 依赖的宿主 selector 可以通过 L1 patch 热修，同时保持现有用户行为不变。

只抽取可 JSON 序列化且有真实运行时读取点的 selector 与公共配置。hostname、会话/分享路由、`localStorage._account` 解析、access token 与删除 API、UI 删除点击和等待流程、虚拟滚动导出与去重排序、附件 URL 安全过滤、原生 TOC hover/PointerEvent 与缓存时序、Turn/Message ID 解析、大纲缓存、模型名称解析与锁定点击编排、主题切换控制流继续留在命令式适配器中。Ophel 自身的 `data-gh-*`、`.gh-*` 和动态属性 selector 也不进入远程配置。

## 方案

保留 `ChatGPTAdapter extends SiteAdapter`，新增强类型 `ChatGPTSiteConfig`。公共 schema 承载输入、会话字段映射、生成状态、网络监控、模型切换、导出、页面宽度、Zen/Clean Mode、Mermaid、Quick Quote 与宿主主题同步；ChatGPT 专属的输入有效性、删除菜单、Codex Task、Markdown、附件/图片、Deep Research、原生 TOC、Canvas/库文件避让和模型状态 selector 放入 47 个 `sitePrivateSelectors` 白名单键。适配器默认引用唯一内置配置，并在启动门闩完成后接收校验过的合并配置。

不改为 `DeclarativeAdapter`，因为当前 DSL 无法等价表达账户隔离、原生删除 API、长会话虚拟滚动导出、附件安全过滤、TOC hover 与缓存、大纲稳定排序、模型本地化信号和主题切换编排。也不只迁移公开 getter，否则导出、会话删除、原生 TOC、模型状态和面板避让仍会保留不可热修的第二 selector 数据源。

布局采用 preserve 模式：页面宽度与面板避让继续走现有 `LayoutManager` 链路，Canvas、Deep Research iframe 和库文件 fullscreen shell 的安全区结构不变；不新增 CSS、主题源或 Shadow DOM 注入路径，也不修改 `ui-entry.tsx` 的 body 延迟挂载和 MutationObserver 重挂载逻辑。

## 验证与剩余风险

默认配置必须通过 capability 与私有键白名单校验；合法 patch 应动态影响适配器读取，未知/删除私有键与旧基线版本必须被拒绝或跳过。迁移前后的默认输入、会话、消息、生成、模型、导出、原生 TOC、宽度、面板避让和模式配置逐项保持等价，并确认全部 47 个私有 selector 都有运行时消费点。

静态检查与双构建不能替代真实页面回归。普通会话与长会话、置顶和普通侧栏项、原生/API 删除、Codex Task、Deep Research、附件与图片导出、TOC 展开和跳转、模型锁定、新对话、停止生成、Canvas、库文件 fullscreen shell、页面宽度和主题切换仍需后续在真实站点验证，因此 P3-07 继续保持“进行中”。
