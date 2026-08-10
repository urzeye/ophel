# SitePack / 内置 Patch 本地调试 DX 技术方案

> 日期：2026-08-09  
> 分支：`feat/site-adapter-pluginization`  
> 背景：社区 PR 与内置 patch 目前难以在合入/发版前完成真站验证；开发 Registry 源因签名与权限链路不完整而几乎不可用。

## 1. 目标

让贡献者和维护者可以在**不合并 main、不发布 registry-dist、不商店发版**的前提下：

1. 本地安装并验证 **内置站点 patch JSON**
2. 用本地 registry 服务验证 **pack + patch 的完整远程更新路径**
3. 在目标站点页内验证 **当前适配配置是否生效**

非目标：

- 不引入远程可执行代码（L3）
- 不让生产构建信任临时/本地签名密钥
- 不改变正式 registry 的 Ed25519 信任模型

## 2. 问题根因

| 路径 | 现状 | 断点 |
| --- | --- | --- |
| SitePack | 本地 JSON 导入 / Wizard 可装 | 评审复现、诊断、油猴 match 仍偏手工 |
| 内置 patch | 只能经签名 registry 生效 | 无 `installLocal`；`pnpm registry:build` 临时 key 不被客户端信任 |
| 开发源 | 仅开发构建可见的 URL 输入框 | 无本地 serve、无 localhost 权限、无一键 force check、验签失败 |

Ima 等 hotfix 矩阵中“可通过 patch 热修”的字段，工程上却无法在合入前闭环验证。

## 3. 方案总览

三层互补，而不是互相替代：

```text
P0  本地 patch 导入/重置     —— 不依赖 registry，直接覆盖内置 config
P0  registry:serve + 开发信任 —— 验证完整远程更新链路
```

优先级：本地 patch 导入 > 本地 registry serve。

## 4. 详细设计

### 4.1 本地 Patch 覆盖（P0）

**存储**

在 `RemoteConfigState` 增加：

```ts
localPatches: Record<string, {
  installedAt: number
  fileName?: string
  patch: SiteConfigPatch
}>
```

- 不升 `storageSchemaVersion`：缺省按 `{}` 解析，兼容旧备份
- 远程 `checkForUpdates` 写回 state 时**必须保留** `localPatches`
- 生效优先级：`localPatches[siteId]` > `active.patches[siteId]` > 内置默认

**API（RemoteConfigManager）**

- `installLocalPatch(patch, { fileName? })`
  - `validateSiteConfigPatch`
  - 对 builtin descriptor 做 merge 校验（与远程 patch 同规则）
  - 写入 `localPatches[targetSiteId]`
- `removeLocalPatch(siteId)`
- `ignorePatch` / 设置页“重置为内置”：同时清除 local + 忽略 remote

**平台**

- `PlatformRemoteConfig.installLocalPatch` / `removeLocalPatch`
- 扩展走 background message；油猴直调 manager
- 变更后向内容脚本广播 reapply，避免必须整页刷新（失败时仍可提示刷新）

**UI**

SitePacks → Updates：

- “导入本地补丁 JSON”
- 活动补丁列表区分 `local` / `registry`
- 本地项可单独移除；重置仍回到纯内置

**安全**

- 与本地 SitePack 导入同级：仅 JSON 配置，无代码执行
- 生产构建也可用（贡献者用正式包测 patch）；文案标明风险与覆盖范围

### 4.2 本地 Registry Serve（P0）

**命令**

```bash
pnpm registry:serve
# 默认 http://127.0.0.1:8787/index.json
```

流程：

1. 使用**固定** dev 密钥签名构建 `registry/dist`
2. 静态托管 dist
3. CORS `*`，仅监听 loopback

**密钥策略**

- keyId：`ophel-registry-local-dev`
- 私钥仅存在于本地 serve/build 脚本
- 公钥仅在 `IS_DEVELOPMENT_BUILD` 时并入信任列表
- 生产构建与 `registry:build:signed` 路径不变

**客户端**

- 开发构建：信任 local-dev key
- 设置页：一键填入 `http://127.0.0.1:8787/index.json` 并立即 `checkForUpdates({ force: true })`
- 扩展：对 localhost registry origin 走 optional host permission 申请（用户手势页）


### 4.3 文档与工作流

新增/更新：

- 本方案
- 贡献者调试手册：SitePack / 内置 patch / 命令式 L1 三条路径
- registry README：补充 `registry:serve` 与本地 patch 导入

推荐流程：

```text
改 registry/patches/<site>.json
  → 设置页导入本地补丁
  → 打开真站验证功能
  → 通过后提 PR
  → 评审者同样本地导入复验
  → 合并后 CI 签名发布给用户
```

## 5. 实施任务与提交切分

1. 文档：本技术方案  
2. 核心：`localPatches` 存储、加载优先级、manager API、测试  
3. 平台 + 设置页：导入/列表/重置 UI、消息广播、i18n  
4. registry：固定 dev key 的 local build + `registry:serve`  
5. 开发源一键应用 + localhost 权限  
6. 贡献者调试文档  
7. 自审、相关检查、推送 GitHub

## 6. 验收标准

- [ ] 不启动正式 registry、不持有生产私钥，也能让内置 patch 在真站生效  
- [ ] 远程更新不会静默清掉本地 patch  
- [ ] 重置可回到纯内置  
- [ ] `pnpm registry:serve` + 开发构建可完整跑通签名更新链路  
- [ ] 生产构建不信任 local-dev key  
- [ ] 11 语 i18n 同步  
- [ ] 相关单测通过；`format` / `lint` / `typecheck` 对改动文件干净  

配套工作流文档：[`local-debug-workflow.md`](./local-debug-workflow.md)。

## 7. 风险

- 本地 patch 长期滞留可能导致“我以为用的是线上配置”：UI 必须明确标记 local  
- localhost 权限在 MV3 需用户手势；一键按钮必须在可见页触发  
- reapply 广播不能覆盖命令式状态机的全部热更新；必要时仍提示刷新页面  
