# Gemini 适配器配置化设计

## 目标与边界

Gemini 是 P3-07 大站批次的第三个配置化站点。本次迁移让输入与操作按钮、会话侧栏与删除菜单、普通/分享消息、生成状态、网络监控、模型入口、My Stuff 卡片、图片与文件导出、Drive 预览、Deep Research、Canvas、页面宽度、preserve 面板避让、Zen/Clean Mode 和 Markdown 修复依赖的宿主 selector 可以通过 L1 patch 热修，同时保持现有用户行为不变。

只抽取可 JSON 序列化且有真实运行时读取点的 selector 与公共配置。hostname、`/u/<n>` 多账号路由、账号邮箱解析、My Stuff 记录匹配与同步、会话 ID 规范化、删除关键词和点击/等待时序、长会话加载、附件 URL 与 MIME 安全处理、图片水印处理、Canvas Monaco bridge 与代码拼接、Deep Research/Drive/Canvas 生命周期、大纲缓存和主题切换控制流继续留在命令式适配器中。Ophel 自身的 `.gh-*`、`data-ophel-*`、动态 ID/href selector，以及不承载站点语义、只用于通用遍历的 `button`、`img`、`a`、`h1-h6` 原语也不进入远程配置。

## 方案

保留 `GeminiAdapter extends SiteAdapter`，新增强类型 `GeminiSiteConfig`。公共 schema 承载输入、会话字段映射、生成状态、网络监控、模型切换、导出、页面宽度、Zen/Clean Mode、Mermaid、Quick Quote 与宿主主题同步；Gemini 专属的账号候选、My Stuff、会话展开与删除、Markdown、分享页、图片/文件、Drive、Deep Research、Canvas、模型名称和 preserve 布局 selector 放入 `sitePrivateSelectors` 精确白名单。长组合 selector 使用受限数组存储，由适配器在调用时组合，避免超过单 selector 长度限制。

`GeminiMyStuffEnhancer` 通过 `getConfig: () => GeminiSiteConfig` 动态读取同一份适配器配置，不缓存 selector，也不复制默认值。适配器默认引用唯一内置配置，并在启动门闩完成后接收校验过的合并配置。

不改为 `DeclarativeAdapter`，因为当前 DSL 无法等价表达多账号隔离、UI 删除熔断、My Stuff 同步、长会话导出、Drive 文档提取、图片资源处理、Canvas/Monaco 和 Deep Research 生命周期。也不只迁移公开 getter，否则删除、My Stuff、导出和沉浸面板仍会保留不可热修的第二 selector 数据源。

布局采用 preserve 模式：`bard-sidenav-content` 与 `main.chat-app` 回退、聊天列、消息/输入安全区、零态输入和沉浸模式右侧 edge inset 保持原有结构；Deep Research、Canvas 和 Drive 查看器继续由自身沉浸布局管理，不新增 `obstacleSelectors`。本次不新增 CSS 文件、主题源或 Shadow DOM 注入路径，扩展与油猴继续共用同一适配器读取链路。

## 验证与剩余风险

默认配置必须通过 capability 与私有键白名单校验；合法 patch 应动态影响适配器读取，未知/删除私有键与旧基线版本必须被拒绝或跳过。迁移前后的输入、会话、删除、消息、生成、模型、My Stuff、导出、Drive、Deep Research、Canvas、宽度、面板避让和模式配置逐项保持等价，并确认所有私有 selector 都有运行时消费点。

静态检查与双构建不能替代真实页面回归。普通会话与长会话、多账号、会话加载和删除、My Stuff 媒体/文档、图片和附件导出、Drive 预览、Deep Research App/分享页、Canvas 文档/代码/Monaco/分享 Artifact、沉浸面板、零态输入、主题切换以及扩展/油猴环境仍需后续在真实站点验证，因此 P3-07 继续保持“进行中”。
