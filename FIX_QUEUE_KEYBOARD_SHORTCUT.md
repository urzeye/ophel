# 提示词队列快捷键问题修复报告

## 问题描述

用户报告了两个相关的键盘快捷键问题：

### 问题 1：队列输入框硬编码了 Enter 键发送

提示词队列浮层里的输入框提示文案写的是"按 Enter 发送或排队"，但实际行为与用户设置的发送快捷键不一致：

- 不管用户在设置中选择了 `Enter` 还是 `Ctrl+Enter` 作为发送快捷键
- 队列输入框中按 Enter 都是换行，无法发送

### 问题 2：Mac 平台键盘检测问题

在 Mac 上将发送快捷键设置为 `Ctrl+Enter` 后：

- 按 `Ctrl+Enter` 仍然是换行（应该发送）
- 用户测试发现原生网站在 Mac 上也是用 Ctrl 键，不是 Command 键

## 根本原因分析

### 原因 1：键盘事件处理器未读取设置

在 `src/components/QueueOverlay.tsx:324` 的 `handleKeyDown` 函数中：

```typescript
// 修复前（硬编码）
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      handleSubmit()
    }
    // ...
  },
  [handleSubmit], // ❌ 没有依赖 submitShortcut
)
```

虽然组件读取了 `submitShortcut` 设置（第 71-73 行）：

```typescript
const submitShortcut = useSettingsStore(
  (state) => state.settings.features?.prompts?.submitShortcut ?? "enter",
)
```

但这个变量**只用于传递给 dispatcher 发送消息时使用**，并没有用于控制键盘事件的响应逻辑。

### 原因 2：误认为 Mac 需要特殊映射

最初误以为 Mac 平台需要将 `Ctrl` 映射为 `Command`，但**用户测试发现原生网站在 Mac 上也是使用 Ctrl 键**，不需要特殊映射。

问题仍然是队列输入框硬编码了 Enter 键，没有检查 `ctrlKey` 状态。

## 修复方案

### 修复 1：让 handleKeyDown 遵守 submitShortcut 设置

```typescript
// 修复后
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // 根据 submitShortcut 设置判断是否应该发送
      const needsModifier = submitShortcut === "ctrlEnter"
      const hasModifier = e.ctrlKey

      // submitShortcut 为 "enter" 时：仅 Enter 发送，Ctrl+Enter 换行
      // submitShortcut 为 "ctrlEnter" 时：仅 Ctrl+Enter 发送，Enter 换行
      const shouldSubmit = needsModifier ? hasModifier : !hasModifier

      if (shouldSubmit) {
        e.preventDefault()
        e.stopPropagation()
        handleSubmit()
      }
      // 如果不应该发送，让 Enter 正常换行（不 preventDefault）
    }
    // ...
  },
  [handleSubmit, submitShortcut], // ✅ 添加 submitShortcut 依赖
)
```

**核心逻辑：**

- `needsModifier`：用户设置为 `ctrlEnter` 时需要 Ctrl 键
- `hasModifier`：检测 `e.ctrlKey` 是否按下（Mac 和非 Mac 都检查 ctrlKey）
- `shouldSubmit`：
  - 如果需要修饰键，则必须有 Ctrl 键才发送
  - 如果不需要修饰键，则必须没有 Ctrl 键才发送（避免 Ctrl+Enter 误触发）

### 修复 2：动态显示快捷键提示

添加计算属性显示当前的发送快捷键：

```typescript
const submitKeyDisplay = React.useMemo(() => {
  if (submitShortcut === "ctrlEnter") {
    return "Ctrl+Enter"
  }
  return "Enter"
}, [submitShortcut])
```

更新 UI 文案：

1. **输入框 placeholder**：`输入提示词，${submitKeyDisplay} 直接发送...`
2. **空队列提示**：`队列为空，输入内容后按 ${submitKeyDisplay} 发送或排队`
3. **发送按钮 title**：显示 `submitKeyDisplay`

## 修复效果

### 场景 1：发送快捷键设置为 Enter

- ✅ 按 `Enter` → 发送
- ✅ 按 `Shift+Enter` → 换行
- ✅ 按 `Ctrl+Enter` → 换行（不会发送）
- ✅ 提示文案显示 "按 Enter 发送"

### 场景 2：发送快捷键设置为 Ctrl+Enter（所有平台）

- ✅ 按 `Enter` → 换行
- ✅ 按 `Shift+Enter` → 换行
- ✅ 按 `Ctrl+Enter` → 发送
- ✅ 提示文案显示 "按 Ctrl+Enter 发送"

## 技术要点

### 为什么不需要 Mac 平台特殊处理？

**用户测试发现**：在 AI 网站（Gemini、ChatGPT、Claude 等）上，**Mac 平台原生也是使用 Ctrl 键**，不是 Command 键。

所以队列输入框应该统一检查 `e.ctrlKey`，不需要区分平台：

```typescript
const hasModifier = e.ctrlKey // Mac 和非 Mac 都检查 ctrlKey
```

这与原生网站的行为保持一致。

### 为什么 shouldSubmit 的逻辑是 `needsModifier ? hasModifier : !hasModifier`？

这是一个异或（XOR）逻辑：

- 当设置要求修饰键时，必须按下修饰键
- 当设置不要求修饰键时，必须不按修饰键

否则会出现以下问题：

- 如果用 `needsModifier && hasModifier`，则 `Enter` 设置下按 `Enter` 不会发送（因为 `false && false = false`）
- 如果用 `needsModifier || hasModifier`，则 `Enter` 设置下按 `Ctrl+Enter` 也会发送（因为 `false || true = true`）

正确的逻辑应该是：

- `submitShortcut = "enter"`：只有纯 `Enter` 才发送 → `!hasModifier`
- `submitShortcut = "ctrlEnter"`：只有 `Ctrl/Cmd+Enter` 才发送 → `hasModifier`

## 修改文件

- `src/components/QueueOverlay.tsx`
  - 修改 `handleKeyDown` 函数，检查修饰键状态
  - 添加 `submitKeyDisplay` 计算属性
  - 更新输入框 placeholder、空队列提示、按钮 title

## 测试建议

### 手动测试清单

1. **所有平台（Windows/Linux/Mac）**

   - [ ] 设置 → 发送快捷键 → 选择 "Enter"
     - [ ] 队列输入框按 Enter → 应发送
     - [ ] 队列输入框按 Ctrl+Enter → 应换行
     - [ ] 提示文案显示 "Enter"
   - [ ] 设置 → 发送快捷键 → 选择 "Ctrl + Enter"
     - [ ] 队列输入框按 Enter → 应换行
     - [ ] 队列输入框按 Ctrl+Enter → 应发送
     - [ ] 提示文案显示 "Ctrl+Enter"

2. **特殊情况**
   - [ ] Shift+Enter 在任何设置下都应换行
   - [ ] 设置切换后立即生效，无需刷新页面
   - [ ] AI 生成中和空闲时的 placeholder 都正确显示快捷键

## 总结

这个 bug 的根本原因是**队列输入框硬编码了 Enter 键行为**：

- 设置读取逻辑 ✅ 正确
- 键盘事件处理逻辑 ❌ 硬编码，未使用设置

修复方案是让键盘事件处理器遵守用户的快捷键设置，统一检查 `e.ctrlKey`（所有平台一致）。

**重要发现**：AI 网站在 Mac 上原生也是使用 Ctrl 键，不需要映射为 Command 键。
