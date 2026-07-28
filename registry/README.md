# Ophel SitePack Registry

`registry/sites/` 保存当前版本的声明式 SitePack，`registry/patches/` 保存内置适配器配置 patch。两类源文件都必须是现有 TypeScript 运行时校验器可接受的 JSON；构建脚本不会维护第二套规则。

## 文件约定

- 普通文件使用 `*.json`。
- 需要通过 registry kill switch 停用的当前版本改名为 `*.disabled.json`；JSON 内容本身不增加 `disabled` 字段。
- 同一 pack `id` 或 patch `targetSiteId` 只能存在一份当前源文件。
- 版本升级时修改当前源文件中的 `version` / `patchVersion`。发布分支会保留旧版本的不可变路径。

## 本地命令

```bash
pnpm registry:validate
pnpm registry:build
```

PR 校验 workflow 会从受信任的主分支脚本读取 PR 中的源文件；本地复现时可指定候选目录：

```bash
pnpm registry:validate -- --registry-root /path/to/registry
```

生成物写入 `registry/dist/`，只用于本地检查和 `registry-dist` 分支发布，不提交到 main。
