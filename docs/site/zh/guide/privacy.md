# 🔒 隐私与数据

本页对应 `PermissionsPage.tsx` 与 `BackupPage.tsx`，聚焦权限、备份、导入导出和数据安全边界。

## 数据存储边界

Ophel 主要使用浏览器扩展本地存储（`chrome.storage.local`）保存数据，不依赖平台侧账号云端。

常见数据模块包括：

- 设置（settings）
- 提示词（prompts）
- 会话记录（conversations）
- 文件夹与标签（folders / tags）
- 阅读历史（readingHistory）
- Claude Session Keys（claudeSessionKeys）

## 权限管理

<a id="settings-permissions"></a>

### 权限类型

| 类型     | 权限            | 用途                          |
| -------- | --------------- | ----------------------------- |
| 必需权限 | `storage`       | 保存配置与本地数据            |
| 可选权限 | `notifications` | 生成完成桌面通知              |
| 可选权限 | `cookies`       | Claude Session Key 读取与切换 |
| 可选权限 | `<all_urls>`    | WebDAV 访问与图片去水印能力   |

### 撤销权限后的联动行为

- 撤销 `notifications`：会自动关闭“桌面通知”功能。
- 撤销 `<all_urls>`：相关依赖能力不可继续使用（如去水印、WebDAV 请求）。

> 说明：权限页支持刷新权限状态，便于与浏览器权限中心保持一致。

## 备份与同步

<a id="settings-backup"></a>

### 本地导出

支持三种 JSON 导出：

- 完整备份（full）
- 仅提示词（prompts）
- 仅设置（settings）

### 本地导入

- 支持文件导入或直接粘贴 JSON
- 导入前会进行结构校验
- 导入确认后覆盖写入并刷新页面生效

### WebDAV

可配置项：

- 服务器地址
- 用户名
- 密码
- 远程目录

可执行动作：

- 保存配置
- 测试连接
- 上传备份
- 查看云端备份列表（恢复/删除）

## 隐私相关功能入口

除了权限和备份，隐私能力还包括：

- 标签页隐私模式（伪装标题）
  - 路径：功能模块 → 标签页 → 隐私模式
- 标签页自动重命名（可关闭）
  - 路径：功能模块 → 标签页 → 自动重命名

## 危险操作

- 清除全部数据会删除本地所有 Ophel 数据并刷新页面。
- 执行前建议先做一次完整导出。

## 相关页面

- [设置总览（体验增强）](/zh/guide/enhancements)
- [快捷键系统](/zh/guide/shortcuts)
