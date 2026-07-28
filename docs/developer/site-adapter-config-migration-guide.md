# 内置站点适配器配置化迁移手册

本手册用于把现有命令式内置适配器迁移为可接收 L1 配置 patch 的适配器。目标是让易随站点改版变化的 selector 和纯配置可以热修，同时保持输入、导航、导出、解析等算法行为不变。每个站点应独立迁移、独立回归。

## 1. 划定迁移边界

先盘点适配器中的站点数据，并分成两类：

- 可配置：DOM selector、选择器组合、网络 URL pattern、等待/重试数值、宽度规则、Zen/净化隐藏目标等可序列化纯数据。
- 仍需发版：hostname、路径与存储解析、事件编排、DOM 遍历、输入/点击/导航算法、API 响应解析、附件 URL 过滤等命令式行为。

不要为了扩大热修范围把函数、正则执行逻辑或不受约束的任意数据塞进配置。迁移前记录真实站点的基线行为和待回归功能。

## 2. 建立站点配置文件

新建 `src/adapters/<site>-config.ts`，参考 `zai-config.ts` 与 `ima-config.ts`：

1. 定义继承 `BuiltinSiteConfig` 的强类型配置；公共字段使用 `selectors`、`input`、`generating`、`networkMonitor`、`modelSwitcher`、`export`、`widthSelectors`、`zenMode`、`cleanMode` 等既有 schema。
2. 公共 schema 无法表达、但确实需要热修的 selector 放进强类型 `sitePrivateSelectors`。键名表达用途，不表达当前 DOM 实现。
3. 用一个工厂函数从少量基础 selector 派生组合 selector，避免同一字符串散落为多个真值来源。
4. 导出 `XXX_CONFIG_VERSION` 正整数常量和唯一的 `XXX_CONFIG` 默认配置。首个版本从 `1` 开始。
5. 只放可 JSON 序列化的数据；不要放函数、DOM 对象、正则实例或运行时状态。

私有 selector 白名单由默认配置的键自动产生。已经发布的键应保持稳定；删除或重命名键属于默认配置兼容性变化，必须发版并递增配置版本。

## 3. 改造适配器读取路径

在适配器中实现配置化契约：

```ts
private config: SiteConfig = SITE_CONFIG

getBuiltinConfig(): SiteConfig {
  return SITE_CONFIG
}

getBuiltinConfigVersion(): number {
  return SITE_CONFIG_VERSION
}

applyMergedConfig(config: BuiltinSiteConfig): void {
  this.config = config as SiteConfig
}
```

随后逐个替换读取点：

- 方法体在每次调用时读取 `this.config`，不能在构造函数或 class field 中缓存派生 selector。
- 返回可能被调用方修改的数组或对象时创建副本；嵌套数组按需复制。
- 公共字段优先放公共 schema；只把站点专属 selector 放入私有白名单。
- 删除被配置替代的旧常量和内联 selector，避免第二数据源。
- 保留原有控制流、事件顺序、DOM 算法与 fallback 语义；迁移 PR 不顺手重写功能。

完成替换后，用 `rg` 搜索旧常量名和站点 selector 特征，确认没有遗漏的可热修读取点。保留在代码中的 selector 必须能说明其属于 Ophel 自身标记、通用算法或明确的发版边界。

## 4. 注册唯一描述符

在 `src/core/builtin-config-registry.ts` 中登记：

```ts
[
  SITE_IDS.SITE,
  {
    siteId: SITE_IDS.SITE,
    configVersion: SITE_CONFIG_VERSION,
    baseConfig: SITE_CONFIG,
  },
]
```

适配器 getter 与 registry 必须导入同一份默认配置和版本常量，不能复制 descriptor 或再次组装默认配置。启动门闩会按适配器契约加载缓存 patch，远程 registry 校验则通过该 descriptor 获得相同的基线与私有键白名单。

## 5. 校验配置与 patch 语义

至少验证以下规则：

- `validateBuiltinSiteConfig` 接受默认配置，且所有 capability 所需字段完整。
- `resolveSiteConfig` 能把合法 patch 应用到目标站点，错误站点、错误 `baseConfigVersion` 或不兼容应用版本会被跳过。
- 未登记的 `sitePrivateSelectors` 键、删除必需私有键、删除内置 capability 或产生非法合并结果时会显式拒绝。
- 数组是整体替换；对象递归合并；`null` 删除键，但不能使最终配置缺少必需字段。
- 修改内置默认配置时递增 `XXX_CONFIG_VERSION`；旧 patch 自动因基线版本不匹配而失效。

## 6. 回归与交付

每站至少覆盖其原有能力：站点匹配、输入与发送、新对话、生成检测与停止、模型锁定、消息识别、大纲、导出、附件、会话标题/侧栏、宽度、面板避让、Zen/净化模式，以及该站特有能力。扩展与油猴共享的高风险读取路径都要考虑。

推荐检查顺序：

```powershell
pnpm exec prettier --check src/adapters/<site>-config.ts src/adapters/<site>.ts src/core/builtin-config-registry.ts
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

同时新增该站的热修覆盖矩阵，明确“可通过 patch 热修”和“仍需随应用发版”。真实站点回归未完成时，任务状态保持“进行中”，不要仅凭静态检查标记完成。

## 迁移检查清单

- [ ] 配置文件只有一个默认配置和一个单调版本常量。
- [ ] 公共字段与私有 selector 的边界清楚，私有键按用途命名。
- [ ] 适配器实现三个配置化契约方法，启动默认值指向同一配置对象。
- [ ] 所有可热修读取点都从 `this.config` 动态读取，没有构造期派生缓存。
- [ ] 返回给外部的数组/对象已复制，没有让调用方修改默认配置。
- [ ] 旧 selector 常量、内联重复 selector、死代码和重复分支已删除。
- [ ] hostname、存储、解析、输入、导航、导出等命令式算法未被无意改写。
- [ ] `builtin-config-registry.ts` 只登记一个共享 descriptor。
- [ ] 默认配置、私有白名单、capability 保留规则和版本门槛通过校验。
- [ ] 热修覆盖矩阵与任务 CSV 已同步。
- [ ] 聚焦格式、Lint、typecheck、扩展构建、油猴构建和 `git diff --check` 已通过。
- [ ] 已检查最终 diff，没有混入用户改动、生成物或无关格式化。
- [ ] 真实站点回归结果已记录；未完成则任务仍为“进行中”。
