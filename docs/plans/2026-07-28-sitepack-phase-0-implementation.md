# SitePack Phase 0 基础层实施计划

> 当前分支：`feat/site-adapter-pluginization`

## 目标

先完成声明式站点配置的最小基础闭环，为后续远端配置、registry 构建和 Z.ai 配置化提供稳定接口。本批对应 P0-01、P0-02、P0-04；按当前开发优先级，Vitest 基建与单元测试后置，但保留可直接补测的纯函数边界。

## 技术决策

- 运行时校验采用手写轻量 TypeScript，不引入 Ajv 或 `effect/Schema`，避免内容脚本 bundle 膨胀。
- `validate.ts` 不依赖 DOM、Chrome API、platform 或 store，后续 registry Node 脚本直接复用同一实现。
- L2 `SitePackManifest` 只包含公共声明字段；L1 内置配置通过独立 `BuiltinSiteConfig` 增加 `sitePrivateSelectors`，并在合并时按站点白名单校验。
- 合并按层增量校验：每层先做局部校验，再校验合并后的完整配置；非法层显式拒绝并保留上一份有效配置。

## 实施步骤

1. 新增 `src/adapters/declarative/types.ts`，定义 SitePack v1、内置配置、patch 与深层覆盖类型。
2. 新增 `src/adapters/declarative/validate.ts`，实现未知键拒绝、结构/长度限制、能力依赖、正则与 CSS 安全校验。
3. 新增 `src/adapters/declarative/merge.ts`，实现对象深合并、数组替换、`null` 删除、版本门槛和逐层完整校验。
4. 增加目录出口并记录校验技术选型；运行相关格式、Lint、类型检查，审查 diff 后提交推送。

## 后续提交边界

- 第一批：SitePack schema、校验器、合并器基础层。
- 第二批：RemoteConfigManager 与 registry transport/存储骨架。
- 第三批：registry dist 构建或 Z.ai 配置化，按第一批接口稳定性选择较小闭环。
