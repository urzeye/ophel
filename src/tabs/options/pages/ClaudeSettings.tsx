/**
 * Claude 专属设置组件
 * 包含 SessionKey 管理功能
 */
import React, { useState } from "react"

import {
  CheckIcon,
  CopyIcon,
  ExportIcon,
  GlobeIcon,
  ImportIcon,
  InfoIcon,
  PlusIcon,
  RefreshIcon,
  ShieldCheckIcon,
} from "~components/icons"
import { ConfirmDialog, DialogOverlay, InputDialog, Tooltip } from "~components/ui"
import { BATCH_TEST_CONFIG, SITE_IDS, TOAST_DURATION, VALIDATION_PATTERNS } from "~constants"
import { platform } from "~platform"
import { useClaudeSessionKeysStore } from "~stores/claude-sessionkeys-store"
import { t } from "~utils/i18n"
import {
  MSG_CHECK_CLAUDE_GENERATING,
  MSG_CHECK_PERMISSIONS,
  MSG_REQUEST_PERMISSIONS,
  sendToBackground,
} from "~utils/messaging"
import { showToast } from "~utils/toast"

import { SettingCard } from "../components"

interface ClaudeSettingsProps {
  siteId: string
}

// 对话框状态类型
type DialogState =
  | { type: "none" }
  | { type: "add" }
  | { type: "import-name"; sessionKey: string }
  | { type: "delete"; id: string; name: string }

// 只露出固定前缀与末 4 位：足以区分不同 key，又不在界面上展示可直接使用的凭证
const maskSessionKey = (key: string): string =>
  key.length > 20 ? `${key.slice(0, 12)}••••••••${key.slice(-4)}` : `••••••••${key.slice(-4)}`

const getKeyStatus = (isValid: boolean | undefined): { tone: string; labelKey: string } => {
  if (isValid === undefined) return { tone: "is-muted", labelKey: "claudeKeyUntested" }
  return isValid
    ? { tone: "is-success", labelKey: "claudeKeyValid" }
    : { tone: "is-danger", labelKey: "claudeKeyInvalid" }
}

const ClaudeSettings: React.FC<ClaudeSettingsProps> = ({ siteId }) => {
  const { keys, currentKeyId, addKey, deleteKey, setCurrentKey, testKey, setKeys } =
    useClaudeSessionKeysStore()
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [dialog, setDialog] = useState<DialogState>({ type: "none" })
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null)

  const [isBatchTesting, setIsBatchTesting] = useState(false)
  const [batchProgress, setBatchProgress] = useState("")

  const isClaudeSite = siteId === SITE_IDS.CLAUDE

  // 获取当前 Session Key
  const currentKey = keys.find((k) => k.id === currentKeyId)

  // 关闭对话框
  const closeDialog = () => setDialog({ type: "none" })

  // 复制 Session Key（带反馈动画）
  const handleCopyKey = async (keyId: string, keyValue: string) => {
    try {
      await navigator.clipboard.writeText(keyValue)
      setCopiedKeyId(keyId)
      showToast(t("claudeKeyCopied"), TOAST_DURATION.SHORT)
      // 1.5秒后恢复图标
      setTimeout(() => setCopiedKeyId(null), TOAST_DURATION.SHORT)
    } catch {
      showToast(t("claudeKeyCopyFailed"), TOAST_DURATION.SHORT)
    }
  }

  // 切换 Session Key（带检测）
  const handleSwitchToken = async (keyId: string) => {
    // 禁止切换到空值
    if (!keyId) {
      showToast(t("claudePleaseSelectKey"), TOAST_DURATION.SHORT)
      return
    }

    // 如果点击的是当前使用的，提示无需切换
    if (keyId === currentKeyId) {
      showToast(t("claudeAlreadyUsing"), TOAST_DURATION.SHORT)
      return
    }

    // 1. 检查cookies权限 (仅当平台支持动态权限时)
    if (platform.hasCapability("permissions")) {
      if (typeof chrome.permissions !== "undefined") {
        // Options 页面直接调用 chrome.permissions API（request 已授权时不弹窗直接返回 true）
        const granted = await chrome.permissions.request({
          permissions: ["cookies"],
        })
        if (!granted) {
          showToast(t("claudeRequestPermission"), TOAST_DURATION.LONG)
          return
        }
      } else {
        // Content Script fallback
        const checkResult = await sendToBackground({
          type: MSG_CHECK_PERMISSIONS,
          permissions: ["cookies"],
        })
        if (!checkResult.hasPermission) {
          await sendToBackground({
            type: MSG_REQUEST_PERMISSIONS,
            permType: "cookies",
          })
          showToast(t("claudeRequestPermission"), TOAST_DURATION.LONG)
          return
        }
      }
    }

    // 2. 设置cookie（使用平台抽象）
    const key = keyId ? keys.find((k) => k.id === keyId)?.key : ""
    await platform.setClaudeSessionKey(key || "")

    // 3. 更新当前选中
    setCurrentKey(keyId)
    showToast(t("claudeKeySwitched"), TOAST_DURATION.MEDIUM)
  }

  // 提取单个 Key 的测试逻辑，以便单独调用或批量调用
  const performTestKey = async (
    id: string,
    keyName: string,
    keyValue: string,
    showToastMsg: boolean = true,
  ) => {
    // 安全检测：如果正在生成则拒绝测试（仅扩展环境）
    if (platform.hasCapability("tabs")) {
      try {
        const checkResult = await sendToBackground({
          type: MSG_CHECK_CLAUDE_GENERATING,
        })
        if (checkResult.isGenerating) {
          if (showToastMsg) showToast(t("claudeGenerating"), TOAST_DURATION.LONG)
          return false // 不能测试
        }
      } catch {
        // 检测失败时允许继续
      }
    }

    setTesting((prev) => ({ ...prev, [id]: true }))

    try {
      // 使用平台抽象测试 key
      const result = await platform.testClaudeSessionKey(keyValue)

      if (result.isValid) {
        testKey(id, { isValid: true, accountType: result.accountType })
        if (showToastMsg) showToast(`${keyName}: ${result.accountType}`, TOAST_DURATION.MEDIUM)
        return true
      } else {
        testKey(id, { isValid: false })
        if (showToastMsg) showToast(`${keyName}: ${t("claudeKeyInvalid")}`, TOAST_DURATION.MEDIUM)
        return false
      }
    } catch {
      testKey(id, { isValid: false })
      if (showToastMsg)
        showToast(
          `${keyName}: ${t("claudeKeyTest")} ${t("claudeKeyInvalid")}`,
          TOAST_DURATION.MEDIUM,
        )
      return false
    } finally {
      setTesting((prev) => ({ ...prev, [id]: false }))
    }
  }

  // 测试 Session Key 有效性
  const handleTestToken = async (id: string) => {
    const key = keys.find((k) => k.id === id)
    if (!key) return
    await performTestKey(id, key.name, key.key, true)
  }

  // 批量检测
  const handleBatchTest = async () => {
    if (keys.length === 0) return
    if (isBatchTesting) return

    setIsBatchTesting(true)
    let validCount = 0
    let invalidCount = 0

    try {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        // 如果中途离开页面或组件卸载，这里可能需要额外处理取消逻辑，但目前简单版即可
        setBatchProgress(
          t("claudeBatchTesting")
            .replace("{current}", String(i + 1))
            .replace("{total}", String(keys.length)),
        )

        // 执行测试，不弹Toast
        const isValid = await performTestKey(key.id, key.name, key.key, false)
        if (isValid) validCount++
        else invalidCount++

        // 间隔 500ms
        if (i < keys.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_TEST_CONFIG.INTERVAL_MS))
        }
      }
      showToast(
        t("claudeBatchTestDone")
          .replace("{valid}", String(validCount))
          .replace("{invalid}", String(invalidCount)),
        TOAST_DURATION.LONG,
      )
    } catch {
      showToast(t("claudeBatchTestFailed"), TOAST_DURATION.MEDIUM)
    } finally {
      setIsBatchTesting(false)
      setBatchProgress("")
    }
  }

  // 从浏览器导入当前Cookie
  const handleImportFromBrowser = async () => {
    try {
      // 权限检查仅在扩展环境
      if (platform.hasCapability("permissions")) {
        if (typeof chrome.permissions !== "undefined") {
          // Options 页面直接调用 chrome.permissions API（request 已授权时不弹窗直接返回 true）
          const granted = await chrome.permissions.request({
            permissions: ["cookies"],
          })
          if (!granted) {
            showToast(t("claudeRequestPermission"), TOAST_DURATION.LONG)
            return
          }
        } else {
          // Content Script fallback
          const checkResult = await sendToBackground({
            type: MSG_CHECK_PERMISSIONS,
            permissions: ["cookies"],
          })
          if (!checkResult.hasPermission) {
            await sendToBackground({
              type: MSG_REQUEST_PERMISSIONS,
              permType: "cookies",
            })
            showToast(t("claudeRequestPermission"), TOAST_DURATION.LONG)
            return
          }
        }
      }

      // 使用平台抽象获取 session key
      const result = await platform.getClaudeSessionKey()

      if (!result.success) {
        showToast(result.error || t("claudeNoCookieFound"), TOAST_DURATION.MEDIUM)
        return
      }

      const existingKey = keys.find((k) => k.key === result.sessionKey)
      if (existingKey) {
        showToast(t("claudeTokenExists").replace("{name}", existingKey.name), TOAST_DURATION.MEDIUM)
        return
      }

      setDialog({
        type: "import-name",
        sessionKey: result.sessionKey!,
      })
    } catch (error) {
      showToast(t("claudeKeyCopyFailed") + ": " + (error as Error).message, TOAST_DURATION.LONG)
    }
  }

  // 导出所有 Session Key
  const handleExportTokens = () => {
    if (keys.length === 0) {
      showToast(t("claudeNoTokensToExport"), TOAST_DURATION.SHORT)
      return
    }

    const data = JSON.stringify(keys, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = `claude-session-keys-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    showToast(t("claudeExported"), TOAST_DURATION.SHORT)
  }

  // 导入 Session Key
  const handleImportTokens = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/json"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const imported = JSON.parse(text)

        if (!Array.isArray(imported)) {
          showToast(t("claudeInvalidJSON"), TOAST_DURATION.MEDIUM)
          return
        }

        const existingKeys = new Set(keys.map((k) => k.key))
        const newKeys = imported.filter((k: any) => !existingKeys.has(k.key))

        if (newKeys.length === 0) {
          showToast(t("claudeNoNewTokens"), TOAST_DURATION.SHORT)
          return
        }

        setKeys([...keys, ...newKeys])
        showToast(
          t("claudeImported").replace("{count}", String(newKeys.length)),
          TOAST_DURATION.MEDIUM,
        )
      } catch (error) {
        showToast(t("claudeInvalidJSON") + ": " + (error as Error).message, TOAST_DURATION.LONG)
      }
    }
    input.click()
  }

  // 添加 Session Key
  const handleAddToken = () => {
    setDialog({ type: "add" })
  }

  // 添加 Session Key - 确认
  const handleAddTokenConfirm = (name: string, key: string) => {
    if (!name.trim()) {
      showToast(t("claudeNameRequired"), TOAST_DURATION.SHORT)
      return
    }

    if (!key.trim()) {
      showToast(t("claudeKeyRequired"), TOAST_DURATION.SHORT)
      return
    }

    if (!VALIDATION_PATTERNS.CLAUDE_KEY.test(key)) {
      showToast(t("claudeKeyInvalidFormat"), TOAST_DURATION.MEDIUM)
      return
    }

    if (keys.some((k) => k.key === key)) {
      showToast(t("claudeKeyExists"), TOAST_DURATION.MEDIUM)
      return
    }

    addKey({ name: name.trim(), key: key.trim() })
    showToast(t("claudeKeyAdded"), TOAST_DURATION.SHORT)
    closeDialog()
  }

  // 从浏览器导入 - 完成命名
  const handleImportComplete = (name: string) => {
    if (!name.trim()) {
      showToast(t("claudeNameRequired"), TOAST_DURATION.SHORT)
      return
    }

    const dialogState = dialog as { type: "import-name"; sessionKey: string }
    const newKey = addKey({ name: name.trim(), key: dialogState.sessionKey })

    // 自动设为当前使用（因为这就是浏览器当前正在用的 key）
    setCurrentKey(newKey.id)

    showToast(t("claudeKeyImported"), TOAST_DURATION.SHORT)
    closeDialog()
    setTimeout(() => handleTestToken(newKey.id), BATCH_TEST_CONFIG.INTERVAL_MS)
  }

  // 删除 Session Key
  const handleDeleteToken = (id: string, name: string) => {
    setDialog({ type: "delete", id, name })
  }

  const confirmDelete = () => {
    const dialogState = dialog as { type: "delete"; id: string; name: string }
    deleteKey(dialogState.id)
    showToast(t("claudeKeyDeleted"), TOAST_DURATION.SHORT)
    closeDialog()
  }

  return (
    <div>
      {/* Session Key 管理（合并后的卡片） */}
      <SettingCard
        title={t("claudeSessionKeyTitle")}
        description={t("claudeSessionKeyDesc")}
        settingId="claude-session-keys">
        {/* 当前使用状态：切换统一由下方每行的「使用」完成 */}
        <div className="settings-claude-current">
          <span className="settings-claude-current-label">{t("claudeCurrentUsing")}</span>
          {currentKey ? (
            <span className="settings-claude-current-key">
              <strong>{currentKey.name}</strong>
              {currentKey.accountType && (
                <span className="settings-claude-type-badge">{currentKey.accountType}</span>
              )}
            </span>
          ) : (
            <span className="settings-claude-current-empty">{t("claudeNoKeySelected")}</span>
          )}
          {!isClaudeSite && (
            <span className="settings-claude-site-hint">
              <InfoIcon size={14} />
              {t("claudeNotOnSiteHint")}
            </span>
          )}
        </div>

        {/* 操作栏：空间不足时换行，长语言下不会溢出 */}
        <div className="settings-claude-toolbar">
          <button
            type="button"
            className="settings-btn settings-btn-primary"
            onClick={handleAddToken}
            disabled={isBatchTesting}>
            <PlusIcon size={16} />
            {t("claudeAddKey")}
          </button>

          <button
            type="button"
            className="settings-btn settings-btn-secondary"
            onClick={handleBatchTest}
            disabled={keys.length === 0 || isBatchTesting}>
            {isBatchTesting ? (
              <RefreshIcon size={16} className="settings-spin" />
            ) : (
              <ShieldCheckIcon size={16} />
            )}
            {isBatchTesting ? batchProgress : t("claudeBatchTest")}
          </button>

          {/* 从浏览器导入按钮仅在扩展环境显示（油猴脚本无法读取 HttpOnly cookie） */}
          {platform.hasCapability("cookies") && (
            <Tooltip content={t("claudeNotOnSiteHint")} disabled={isClaudeSite}>
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={handleImportFromBrowser}
                disabled={!isClaudeSite || isBatchTesting}>
                <GlobeIcon size={16} />
                {t("claudeImportFromBrowser")}
              </button>
            </Tooltip>
          )}

          <button
            type="button"
            className="settings-btn settings-btn-secondary"
            onClick={handleImportTokens}
            disabled={isBatchTesting}>
            <ImportIcon size={16} />
            {t("claudeImportJSON")}
          </button>

          <button
            type="button"
            className="settings-btn settings-btn-secondary"
            onClick={handleExportTokens}
            disabled={keys.length === 0 || isBatchTesting}>
            <ExportIcon size={16} />
            {t("claudeExportJSON")}
          </button>
        </div>

        {/* Token 列表 */}
        {keys.length === 0 ? (
          <div className="settings-claude-empty">
            <strong>{t("claudeNoKeys")}</strong>
            <span>{t("claudeNoKeysHint")}</span>
          </div>
        ) : (
          <div className="settings-claude-key-list">
            {keys.map((key) => {
              const isCurrent = key.id === currentKeyId
              const isCopied = copiedKeyId === key.id
              const status = getKeyStatus(key.isValid)

              return (
                <div
                  key={key.id}
                  className={`settings-claude-key${isCurrent ? " is-current" : ""}`}>
                  <div className="settings-claude-key-info">
                    <div className="settings-claude-key-title">
                      <span className="settings-claude-key-name">{key.name}</span>
                      {isCurrent && (
                        <span className="settings-claude-using-badge">{t("claudeKeyUsing")}</span>
                      )}
                      {key.accountType && (
                        <span className="settings-claude-type-badge">{key.accountType}</span>
                      )}
                    </div>
                    <div className="settings-claude-key-value">
                      <code>{maskSessionKey(key.key)}</code>
                      <Tooltip content={isCopied ? t("claudeCopied") : t("claudeCopyKey")}>
                        <button
                          type="button"
                          className="settings-claude-copy-btn"
                          aria-label={t("claudeCopyKey")}
                          onClick={() => handleCopyKey(key.id, key.key)}>
                          {isCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="settings-claude-key-actions">
                    <span className={`settings-status-badge ${status.tone}`}>
                      {t(status.labelKey)}
                    </span>
                    <Tooltip
                      content={
                        isCurrent
                          ? t("claudeAlreadyUsing")
                          : !isClaudeSite
                            ? t("claudeNotOnSiteHint")
                            : t("claudeKeyUse")
                      }>
                      <button
                        type="button"
                        className="settings-btn settings-btn-secondary settings-btn-sm"
                        onClick={() => handleSwitchToken(key.id)}
                        disabled={!isClaudeSite || isCurrent}>
                        {isCurrent ? t("claudeKeyUsing") : t("claudeKeyUse")}
                      </button>
                    </Tooltip>
                    <button
                      type="button"
                      className="settings-btn settings-btn-secondary settings-btn-sm settings-claude-test-btn"
                      aria-label={t("claudeKeyTest")}
                      onClick={() => handleTestToken(key.id)}
                      disabled={testing[key.id]}>
                      {testing[key.id] ? (
                        <RefreshIcon size={14} className="settings-spin" />
                      ) : (
                        t("claudeKeyTest")
                      )}
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-danger settings-btn-sm"
                      onClick={() => handleDeleteToken(key.id, key.name)}>
                      {t("claudeKeyDelete")}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SettingCard>

      {/* 对话框 */}
      {dialog.type === "add" && (
        <AddKeyDialog onConfirm={handleAddTokenConfirm} onCancel={closeDialog} />
      )}

      {dialog.type === "import-name" && (
        <InputDialog
          title={t("claudeImportNameTitle")}
          defaultValue={`Import-${new Date().toLocaleDateString()}`}
          placeholder={t("claudeImportNamePlaceholder")}
          onConfirm={handleImportComplete}
          onCancel={closeDialog}
        />
      )}

      {dialog.type === "delete" && (
        <ConfirmDialog
          title={t("claudeDeleteConfirmTitle")}
          message={t("claudeDeleteConfirmMsg").replace("{name}", dialog.name)}
          confirmText={t("claudeKeyDelete")}
          danger
          onConfirm={confirmDelete}
          onCancel={closeDialog}
        />
      )}
    </div>
  )
}

interface AddKeyDialogProps {
  onConfirm: (name: string, key: string) => void
  onCancel: () => void
}

// 弹窗 portal 到宿主页 body，设置页样式不可用，字段样式来自共享 Dialog 的 gh-dialog-* 类
const AddKeyDialog: React.FC<AddKeyDialogProps> = ({ onConfirm, onCancel }) => {
  const [name, setName] = useState("")
  const [key, setKey] = useState("")
  const nameInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  const handleConfirm = () => {
    onConfirm(name, key)
  }

  return (
    <DialogOverlay onClose={onCancel}>
      <div className="gh-dialog-title">{t("claudeAddKey")}</div>

      <div className="gh-dialog-fields">
        <label className="gh-dialog-field">
          <span className="gh-dialog-label">{t("claudeKeyNameLabel")}</span>
          <input
            ref={nameInputRef}
            type="text"
            className="gh-dialog-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("claudeAddKeyNamePlaceholder")}
            onKeyDown={(e) =>
              e.key === "Enter" && document.getElementById("claude-key-input")?.focus()
            }
          />
        </label>

        <label className="gh-dialog-field">
          <span className="gh-dialog-label">Session Key</span>
          <input
            id="claude-key-input"
            type="text"
            className="gh-dialog-input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t("claudeAddKeyValuePlaceholder")}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
          />
        </label>
      </div>

      <div className="gh-dialog-buttons">
        <button className="gh-dialog-btn gh-dialog-btn-secondary" onClick={onCancel}>
          {t("cancel")}
        </button>
        <button className="gh-dialog-btn gh-dialog-btn-primary" onClick={handleConfirm}>
          {t("confirm")}
        </button>
      </div>
    </DialogOverlay>
  )
}

export default ClaudeSettings
