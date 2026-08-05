# SitePack contribution / SitePack 贡献

> Use this template only for `registry/sites/*.json`. Read the [registry guide](https://github.com/urzeye/ophel/blob/main/registry/README.md) and [review checklist](https://github.com/urzeye/ophel/blob/main/docs/developer/site-adapter/site-pack-review-checklist.md) first.
>
> 本模板仅用于 `registry/sites/*.json`。提交前请阅读 registry 指南与审核清单。

## Site / 站点

- Site name / 站点名称:
- Public URL / 公共网址:
- Manifest path / 文件路径: `registry/sites/`
- SitePack ID / 包 ID:
- Related issue / 关联 Issue:

## Tested environment / 测试环境

- Ophel version / Ophel 版本:
- Browser and version / 浏览器及版本:
- Tested origin(s) / 已测试域名:
- Account or rollout notes, without private data / 账号或灰度说明（不得包含隐私数据）:

## Declared and tested capabilities / 已声明并验证的能力

Check only capabilities present in the manifest and verified on the real site.
仅勾选 manifest 已声明且在真实站点验证通过的能力。

- [ ] `outline`
- [ ] `outline-user-queries`
- [ ] `conversation-list`
- [ ] `export-basic`
- [ ] `model-lock`
- [ ] `generation-detect`
- [ ] `new-chat`
- [ ] `stop-generation`
- [ ] `width`
- [ ] `zen`
- [ ] `clean`
- [ ] `prompt-insert`
- [ ] `reading-history`

Describe any limitation, fallback, or capability intentionally not declared:
请说明限制、fallback 或有意不声明的能力：

## Evidence / 验证证据

- Screenshots or recording / 截图或录屏:
- Selector stability evidence (`data-*`, `aria-*`, semantic structure, etc.) / 选择器稳定性依据:
- Relevant network request shape, with all sensitive values removed / 相关网络请求结构（必须移除敏感值）:

## Contributor checklist / 贡献者检查

- [ ] I copied the repository example and removed fields that the site does not use.
- [ ] `pnpm registry:validate` passes.
- [ ] `pnpm registry:build` passes and I did not commit `registry/dist/`.
- [ ] The ID is unique; `matches` are HTTPS, narrow, and do not overlap built-in or existing packs.
- [ ] `version` was incremented for an update, and `minAppVersion` is the earliest tested compatible version.
- [ ] Every declared capability has its required fields and real-site evidence above.
- [ ] Selectors avoid generated classes, broad page containers, and language-specific visible text where a stable attribute exists.
- [ ] Regex, path templates, and CSS stay within the documented safety boundary.
- [ ] The JSON contains no secrets, cookies, tokens, account data, internal URLs, scripts, expressions, or remote resource loading.
- [ ] I reviewed `docs/developer/site-adapter/site-pack-review-checklist.md` and documented any item that cannot be exercised.
