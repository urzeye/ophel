# Ophel Atlas 设置页与设置弹窗

本文档记录当前 Options Page 与面板内设置弹窗的实际实现。早期独立设置页设计稿已不再作为实现依据；涉及设置 UI 的任务应以本文件、`DESIGN.md`、`src/utils/storage.ts` 和对应页面源码为准。

## 1. 当前入口

- `src/components/SettingsModal.tsx`：内容脚本中的设置弹窗，渲染在扩展 Shadow DOM 内，复用 `src/tabs/options/pages/*` 页面组件。
- `src/tabs/options.tsx`：独立 Options 页面入口，加载 `tabs/options.html`，用于扩展独立窗口、权限请求窗口等场景。
- `src/tabs/options.css`：独立页面样式入口，导入 `src/styles/theme-variables.css` 与 `src/styles/settings.css`。
- `src/contents/ui-entry.tsx`：面板与设置弹窗的 Shadow DOM 样式入口，通过 `data-text:~styles/settings.css` 注入设置页共享样式。

## 2. 导航结构

### 2.1 设置弹窗

`SettingsModal.tsx` 使用 `NAV_IDS` 和本地 `NAV_ITEMS` 组织一级导航：

- 基本设置：`GeneralPage`
- 外观主题：`AppearancePage`
- 功能模块：`FeaturesPage`
- 站点配置：`SiteSettingsPage`
- 全局搜索：`GlobalSearchPage`
- 快捷键位：`ShortcutsPage`
- 数据管理：`BackupPage`
- 权限管理：`PermissionsPage`
- 关于：`AboutPage`

油猴脚本环境没有 Chrome permissions API，`platform.hasCapability("permissions")` 为 false 时隐藏权限管理入口。

### 2.2 独立 Options 页面

`src/tabs/options.tsx` 当前提供：

- 基本设置：`GeneralPage`
- 功能模块：`FeaturesPage`
- 站点设置：`SiteSettingsPage`
- 外观主题：`AppearancePage`
- 备份与同步：`BackupPage`
- 权限管理：`PermissionsPage`
- 关于：`AboutPage`

独立页面检测不到内容脚本中的 `__ophelThemeManager` 时，会隐藏外观主题入口；油猴脚本环境同样隐藏权限管理入口。

### 2.3 深链与设置搜索

- 深链解析集中在 `src/constants/ui.ts` 的 `resolveSettingsNavigateDetail()`。
- 设置搜索索引使用同文件中的 `SETTING_ID_ROUTE_MAP`、`SETTING_ID_ROUTE_RULES`、`SETTING_ID_ALIASES` 和 `SETTINGS_SEARCH_ITEMS`。
- 新增或移除设置项时，必须同步设置项的 `settingId`、路由规则、搜索索引、i18n 文案和页面控件。

## 3. 页面组件分工

- `GeneralPage`：语言、面板行为、快捷按钮、工具箱菜单。
- `FeaturesPage`：大纲、会话、提示词、标签页行为、提醒、内容增强、阅读历史和用量统计。
- `SiteSettingsPage`：页面布局、模型锁定、Gemini/AI Studio/ChatGPT/Claude 等站点专属设置。
- `GlobalSearchPage`：全局搜索触发方式、模糊搜索和提示词回车行为。
- `ShortcutsPage`：快捷键总开关、全局 URL 和各动作绑定。
- `AppearancePage`：主题同步、预置主题和自定义样式。
- `BackupPage`：本地备份/恢复、WebDAV 配置与同步操作。
- `PermissionsPage`：扩展权限状态与可选权限申请/撤销。

## 4. 设置数据流

- 默认值定义在 `src/utils/storage.ts` 的 `DEFAULT_SETTINGS`。
- 运行时状态由 `src/stores/settings-store.ts` 管理，使用 Zustand persist 写入平台存储。
- 扩展端使用 `chrome.storage.local`；油猴端使用平台存储适配器，GM API 的同步读取不要包成 Promise。
- `settings-store.ts` 监听跨上下文 storage 变化，并通过 `_syncVersion` 触发 UI 更新。
- 旧数据兼容集中在 `normalizeSettings()`：旧快捷按钮字段会迁移到 `quickButtons`；已移除的未实现设置不应继续进入当前设置结构。

## 5. 样式与主题约束

- 设置页共享样式放在 `src/styles/settings.css`；独立页面额外通过 `src/tabs/options.css` 引入基础主题变量。
- 面板内设置弹窗样式必须通过 `src/contents/ui-entry.tsx` 的 `getStyle()` 注入 Shadow DOM。
- 颜色、边框、阴影和交互态优先使用 `--gh-*` 主题变量。
- 新增样式文件时，必须确认扩展 Shadow DOM 和独立 Options 页面是否都需要引入。
- 不要在设置页组件中新增大段内联样式；必要的运行时几何值除外。

## 6. 权限管理

- Content Script 不能直接调用 `chrome.permissions.request`。
- 设置弹窗发出权限请求时，Background 打开独立权限请求窗口。
- Options/权限请求页在扩展上下文中触发 Chrome 原生授权弹窗。
- 权限撤销后，Background 负责关闭依赖该权限的功能并同步 storage。

## 7. 平台差异

- 扩展端和油猴端共享大部分设置 UI，但权限、通知、跨域请求和默认开关可能不同。
- `watermarkRemoval`、通知和部分 AI Studio 内容增强默认值会根据 `isUserscriptPlatform()` 分支确定。
- 文档中的 `settings-schema.json` 以扩展端默认值为静态示例；油猴端差异以源码中的 `DEFAULT_SETTINGS` 平台分支为准。

## 8. 修改清单

设置 UI 变更至少检查：

1. `src/utils/storage.ts` 的类型与 `DEFAULT_SETTINGS`
2. `src/stores/settings-store.ts` 的归一化和旧数据兼容
3. 对应 `src/tabs/options/pages/*` 页面控件
4. `src/constants/ui.ts` 的设置深链、别名和搜索索引
5. `src/locales/*/index.ts` 的 11 种语言文案
6. `docs/developer/settings-schema.json`
7. 涉及样式时检查 `DESIGN.md`、`src/styles/settings.css`、`src/tabs/options.css` 和 `src/contents/ui-entry.tsx`
