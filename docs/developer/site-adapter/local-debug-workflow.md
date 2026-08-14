# 本地调试工作流（SitePack / 内置 Patch）

面向贡献者与维护者：在**不合并 main、不发布 registry-dist** 的前提下验证适配变更。

## 路径一：新站点 SitePack

1. `pnpm dev` 加载未打包扩展  
2. 打开目标站点 → 使用页内 Wizard，或手写 `registry/sites/<id>.json`  
3. 设置 → SitePacks → 导入本地 JSON / Wizard 保存  
4. 授权域名并刷新目标页  
5. 打开目标站点验证功能是否生效  
6. 导出 JSON 提 PR；评审者用同一 JSON 本地导入复验  

## 路径一附：HTTP 自建站

Wizard、本地 JSON 导入和自定义域名绑定都接受 `http://`，正式构建同样适用：

1. 在 HTTP 自建站（如 `http://127.0.0.1:3080`）打开 Wizard 生成适配包
2. 设置 → SitePacks → 导入本地 JSON，或绑定自定义 `http://` 域名
3. 授权对应 HTTP origin 后刷新目标页验证

registry 分发的适配包仍只允许 HTTPS matches：自建站点包提交时 `matches` 留空，由用户自己绑定域名激活。

## 路径二：内置站点 Patch（如 Ima 选择器热修）

1. 修改 `registry/patches/<site-id>.json`（或从矩阵文档确认可热修字段）  
2. 设置 → SitePacks → Updates → **导入本地补丁**  
3. 打开目标内置站点  
4. 打开目标站点，确认补丁已生效  
5. 通过后提 PR；评审者同样本地导入  
6. 合并后由正式 CI 签名发布给用户  

重置：

- **移除本地补丁**：只去掉 local override，可能回退到远程 patch  
- **重置为内置配置**：清除 local + 忽略 remote  

## 路径三：完整远程更新链路（开发构建）

```bash
pnpm registry:serve
pnpm dev
```

1. 开发构建打开设置 → SitePacks → Updates  
2. 点击 **使用本地 Registry**（请求 `127.0.0.1:8787` 权限，并带 source 覆盖立刻检查）  
3. 页面会显示当前生效源与 revision；失败时展示上次错误  
4. 离开本地模式：点 **恢复默认源**（清缓存 + 拉官方源），或 **清除缓存** 后手动检查  

生产构建不会信任 local-dev 签名密钥。本地 revision 与官方源切换不再互相卡死；同一本地源反复 `registry:serve` 重建（即使 revision 相同）也会接受新内容。

## 路径四：命令式 L1 代码

矩阵中“仍需发版”的能力（输入算法、附件解析、hostname 等）仍需：

1. 改 TypeScript 适配器  
2. `pnpm dev` 真站回归  
3. 正常应用发版  

