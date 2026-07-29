# DeepSeek 适配器配置化设计

## 目标与边界

DeepSeek 是 P3-06 的首个内置配置化站点。本次迁移让输入、会话入口、消息、大纲、导出、生成按钮、模型状态、宽度、面板避让、Zen/净化和原生大纲扫描依赖的宿主 DOM selector 可以通过 L1 patch 热修，同时保持现有用户行为不变。

只抽取可 JSON 序列化的 selector 与公共配置。hostname、会话/分享路径解析、token 与主题存储、删除 API、虚拟列表扫描和点击时序、附件解析、导出消息合并及分享 API 解析继续留在命令式适配器中。DeepSeek 的面板避让沿用既有约束：历史对话同时调整虚拟消息列表与输入区，新对话页和 Canvas 预览使用 edge inset，不水平平移虚拟列表。

## 方案

保留 `DeepSeekAdapter extends SiteAdapter`，新增强类型 `DeepSeekSiteConfig`。公共 schema 承载 textarea、发送/停止按钮、消息、生成、网络监控、导出、宽度、Zen/净化和 Quick Quote；原生大纲、Canvas、会话入口及其它专属 selector 放入 `sitePrivateSelectors`。适配器默认引用唯一内置配置，并在启动门闩完成后接收校验过的合并配置。

不改为 `DeclarativeAdapter`，因为当前 DSL 无法等价表达虚拟列表全量扫描、原生大纲跳转、分享 API 导出、附件识别和会话删除。也不只迁移公共 selector，否则原生大纲、Canvas 和导出正文仍会保留不可热修的第二数据源。

## 验证与剩余风险

默认配置必须通过私有键白名单与 capability 校验；合法 patch 应即时影响适配器 getter，未知私有键与旧基线版本必须被拒绝或跳过。迁移前后的默认 selector、宽度、导出与网络配置逐项保持一致，并审计适配器中的直接 selector，只保留 Ophel 自身标记、通用 DOM 原语和明确的发版边界。

静态检查与双构建不能替代真实页面回归。DeepSeek 的长会话虚拟滚动、原生大纲、附件导出、会话删除、主题切换、新对话与 Canvas 避让仍需后续在真实站点验证，因此 P3-06 保持“进行中”。
