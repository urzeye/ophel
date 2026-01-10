# Ophel 快捷键系统设计方案

## 1. 多浏览器兼容

| 浏览器  | 快捷键配置地址                         |
| ------- | -------------------------------------- |
| Chrome  | `chrome://extensions/shortcuts`        |
| Edge    | `edge://extensions/shortcuts`          |
| Firefox | `about:addons` → 齿轮 → 管理扩展快捷键 |

---

## 2. 全局快捷键 (2 个)

| 命令           | Win     | Mac        | 功能                       |
| -------------- | ------- | ---------- | -------------------------- |
| `open-ai-site` | `Alt+G` | `Option+G` | 打开 AI 站点（URL 可配置） |
| `toggle-panel` | `Alt+P` | `Option+P` | 切换面板显示/隐藏          |

---

## 3. 页面级快捷键

### 导航类

| 功能     | Win     | Mac        |
| -------- | ------- | ---------- |
| 去顶部   | `Alt+T` | `Option+T` |
| 去底部   | `Alt+B` | `Option+B` |
| 返回锚点 | `Alt+Z` | `Option+Z` |
| 定位当前 | `Alt+L` | `Option+L` |

### 面板类

| 功能     | Win     | Mac        |
| -------- | ------- | ---------- |
| 切换面板 | `Alt+P` | `Option+P` |
| 切换主题 | `Alt+D` | `Option+D` |
| 打开设置 | `Alt+,` | `Option+,` |

### 大纲类

| 功能          | Win           | Mac              |
| ------------- | ------------- | ---------------- |
| 刷新大纲      | `Alt+R`       | `Option+R`       |
| 展开/折叠全部 | `Alt+E`       | `Option+E`       |
| 展开到 1 级   | `Alt+Shift+1` | `Option+Shift+1` |
| 展开到 2 级   | `Alt+Shift+2` | `Option+Shift+2` |
| 展开到 3 级   | `Alt+Shift+3` | `Option+Shift+3` |
| 显示用户问题  | `Alt+Q`       | `Option+Q`       |
| 上一个标题    | `Alt+↑`       | `Option+↑`       |
| 下一个标题    | `Alt+↓`       | `Option+↓`       |

### 会话类

| 功能         | Win            | Mac              |
| ------------ | -------------- | ---------------- |
| 新会话       | `Ctrl+Shift+O` | `Cmd+Shift+O`    |
| 刷新会话列表 | `Alt+Shift+R`  | `Option+Shift+R` |

### 编辑类

| 功能         | Win            | Mac           |
| ------------ | -------------- | ------------- |
| 导出对话     | `Ctrl+Shift+E` | `Cmd+Shift+E` |
| 复制最新回复 | `Ctrl+Shift+C` | `Cmd+Shift+C` |
| 锁定滚动     | `Alt+S`        | `Option+S`    |

---

## 4. 设置结构 (`settings.shortcuts`)

```typescript
interface ShortcutBinding {
  key: string
  alt?: boolean // Win Alt / Mac Option
  ctrl?: boolean // Win Ctrl
  meta?: boolean // Mac Cmd
  shift?: boolean
}

interface ShortcutsSettings {
  enabled: boolean
  globalUrl: string
  keybindings: Record<string, ShortcutBinding>
}
```

---

## 5. UI 功能

- **冲突检测**：录入时检测冲突，显示警告
- **恢复默认**：提供"恢复默认快捷键"按钮

---

## 6. 文件结构

```
src/
├── constants/shortcuts.ts
├── stores/settings-store.ts  # shortcuts 字段
├── core/shortcut-manager.ts
└── components/SettingsModal/ShortcutsSection.tsx
```
