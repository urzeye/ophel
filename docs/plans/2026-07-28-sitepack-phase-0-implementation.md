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

## P0-06：Registry dist 构建与发布

### Task 1：统一内置配置描述符

**文件：**

- 新增 `src/core/builtin-config-registry.ts`
- 修改 `src/core/remote-config-runtime.ts`

**步骤：**

1. 将 Z.ai 的 `siteId`、`configVersion`、`baseConfig` 描述符抽到零浏览器依赖模块。
2. RemoteConfigManager 运行时和 registry 校验脚本共同读取该描述符，避免维护两份 patch 白名单与 baseConfigVersion 真值。
3. 运行 `pnpm typecheck`，预期无新增错误。

### Task 2：实现源文件校验与不可变 dist 构建

**文件：**

- 新增 `registry/README.md`
- 新增 `registry/sites/.gitkeep`
- 新增 `registry/patches/.gitkeep`
- 新增 `registry/scripts/validate.mjs`
- 新增 `registry/scripts/build-dist.mjs`
- 修改 `package.json`、`pnpm-lock.yaml`、`.gitignore`

**步骤：**

1. 增加 `tsx` 开发依赖和 `registry:validate`、`registry:build` scripts。
2. `validate.mjs` 直接导入 `src/adapters/declarative/validate.ts`，校验全部 JSON；patch 额外通过共享内置描述符做私有 selector 白名单、baseConfigVersion 与合并结果校验。
3. `build-dist.mjs` 将验证后的 JSON 规范化写入 `packs/<id>/<version>.json` 或 `patches/<siteId>/<patchVersion>.json`，对写出的确切字节计算 SHA-256，并生成排序稳定的 `index.json`。
4. 构建接收单调 `registryRevision`，若提供旧 dist，则拒绝 revision 回退或同一不可变路径字节变化。
5. 用临时 fixture 运行校验和构建冒烟，预期合法包/patch 生成正确索引，非法输入与不可变覆盖显式失败。

### Task 3：发布 registry-dist 分支

**文件：**

- 新增 `.github/workflows/registry-dist.yml`
- 修改 `docs/developer/site-adapter-pluginization-tasks.csv`

**步骤：**

1. main 分支相关路径变更时安装依赖并运行 `pnpm registry:validate`。
2. 使用 main 的 Git commit count 作为单调 revision，读取现有 `registry-dist` 做不可变校验。
3. 构建后以 orphan/force-push 方式更新 `registry-dist`，同时保留历史不可变 artifact。
4. 本地运行格式、Lint、类型检查、registry 构建和双形态应用构建；审查 diff 后提交推送。

## P0-07：Registry PR 校验

**文件：**

- 新增 `.github/workflows/registry-pr.yml`
- 修改 `registry/scripts/validate.mjs`、`src/adapters/declarative/validate.ts`
- 修改 `src/constants/defaults.ts`、`src/constants/index.ts`、`package.json`、`pnpm-lock.yaml`

**步骤：**

1. 复用运行时校验器，并在 registry 校验时注入 `safe-regex2`，覆盖所有正则字段；CSS 黑名单继续由同一校验器执行。
2. 以 `SITE_IDS` 与集中维护的内置 match patterns 拒绝 id/域名冲突，并对 registry 内 SitePack 做 origin 级重叠检查。
3. 使用 `pull_request_target` 只执行主分支可信脚本，将 PR head 仅作为 registry JSON 工作树读取；校验结果更新为单条可读 PR 评论。
4. 用临时 fixture 验证 schema、正则、CSS、内置冲突、包间重叠和重复 id 均能失败并定位到字段。
