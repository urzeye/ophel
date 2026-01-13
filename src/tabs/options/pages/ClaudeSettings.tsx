/**
 * Claude 专属设置组件
 * 包含 SessionKey 管理功能
 */
import React, { useState } from "react"

import { useClaudeSessionKeysStore } from "~stores/claude-sessionkeys-store"
import { useSettingsStore } from "~stores/settings-store"
import {
  MSG_CHECK_PERMISSIONS,
  MSG_REQUEST_PERMISSIONS,
  MSG_SET_CLAUDE_SESSION_KEY,
  sendToBackground,
} from "~utils/messaging"
import { showToast } from "~utils/toast"

import { SettingCard, SettingRow } from "../components"

interface ClaudeSettingsProps {
  siteId: string
}

const ClaudeSettings: React.FC<ClaudeSettingsProps> = ({ siteId }) => {
  const { keys, currentKeyId, addKey, deleteKey, setCurrentKey, testKey, setKeys, updateKey } =
    useClaudeSessionKeysStore()
  const { settings } = useSettingsStore()
  const [testing, setTesting] = useState<Record<string, boolean>>({})

  // 获取当前Token
  const currentKey = keys.find((k) => k.id === currentKeyId)

  // 切换Token
  const handleSwitchToken = async (keyId: string) => {
    // 1. 检查cookies权限
    const checkResult = await sendToBackground({
      type: MSG_CHECK_PERMISSIONS,
      permissions: ["cookies"],
    })

    if (!checkResult.hasPermission) {
      // 请求权限
      await sendToBackground({
        type: MSG_REQUEST_PERMISSIONS,
        permType: "cookies",
      })
      showToast("请在弹出窗口中授权Cookie权限", 3000)
      return
    }

    // 2. 设置cookie
    const key = keyId ? keys.find((k) => k.id === keyId)?.key : ""
    await sendToBackground({
      type: MSG_SET_CLAUDE_SESSION_KEY,
      key: key || "",
    })

    // 3. 更新当前选中
    setCurrentKey(keyId)
    showToast(keyId ? "Token已切换,页面将刷新" : "已切换到默认Cookie", 2000)
  }

  // 测试Token有效性
  const handleTestToken = async (id: string) => {
    const key = keys.find((k) => k.id === id)
    if (!key) return

    setTesting((prev) => ({ ...prev, [id]: true }))

    try {
      // 调用Claude API测试
      const response = await fetch("https://claude.ai/api/organizations", {
        headers: {
          Cookie: `sessionKey=${key.key}`,
        },
        credentials: "include",
      })

      if (!response.ok) {
        testKey(id, { isValid: false })
        showToast(`${key.name}: 无效`, 2000)
        return
      }

      const orgs = await response.json()
      if (!orgs || orgs.length === 0) {
        testKey(id, { isValid: false })
        showToast(`${key.name}: 无组织信息`, 2000)
        return
      }

      // 识别账号类型
      const tier = orgs[0]?.rate_limit_tier
      let accountType: any = "Unknown"
      if (tier === "default_claude_max_5x") accountType = "Pro(5x)"
      else if (tier === "default_claude_max_20x") accountType = "Pro(20x)"
      else if (tier === "default_claude_ai") accountType = "Free"
      else if (tier === "auto_api_evaluation") accountType = "API"
      else if (orgs[0]?.capabilities?.includes("claude_max")) accountType = "Pro"

      testKey(id, { isValid: true, accountType })
      showToast(`${key.name}: ${accountType}`, 2000)
    } catch (error) {
      testKey(id, { isValid: false })
      showToast(`${key.name}: 测试失败`, 2000)
    } finally {
      setTesting((prev) => ({ ...prev, [id]: false }))
    }
  }

  // 从浏览器导入当前Cookie
  const handleImportFromBrowser = async () => {
    try {
      // 1. 检查cookies权限
      const checkResult = await sendToBackground({
        type: MSG_CHECK_PERMISSIONS,
        permissions: ["cookies"],
      })

      if (!checkResult.hasPermission) {
        // 请求权限
        await sendToBackground({
          type: MSG_REQUEST_PERMISSIONS,
          permType: "cookies",
        })
        showToast("请在弹出窗口中授权Cookie权限后重试", 3000)
        return
      }

      // 2. 获取当前Cookie
      const cookies = await chrome.cookies.getAll({
        url: "https://claude.ai",
        name: "sessionKey",
      })

      if (!cookies || cookies.length === 0) {
        showToast("未找到当前Cookie", 2000)
        return
      }

      const key = cookies[0].value
      const name = prompt("输入Token名称:", `浏览器导入-${Date.now()}`)
      if (!name) return

      // 添加并测试
      const newKey = addKey({ name, key })
      showToast("已导入,正在测试...", 1500)
      setTimeout(() => handleTestToken(newKey.id), 500)
    } catch (error) {
      showToast("导入失败: " + (error as Error).message, 3000)
    }
  }

  // 导出所有Token
  const handleExportTokens = () => {
    if (keys.length === 0) {
      showToast("暂无Token可导出", 1500)
      return
    }

    const data = JSON.stringify(keys, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `claude-session-keys-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast("已导出", 1500)
  }

  // 导入Token
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
          showToast("无效的JSON格式", 2000)
          return
        }

        // 合并导入(避免重复)
        const existingKeys = new Set(keys.map((k) => k.key))
        const newKeys = imported.filter((k: any) => !existingKeys.has(k.key))

        if (newKeys.length === 0) {
          showToast("没有新Token", 1500)
          return
        }

        setKeys([...keys, ...newKeys])
        showToast(`已导入 ${newKeys.length} 个Token`, 2000)
      } catch (error) {
        showToast("导入失败: " + (error as Error).message, 3000)
      }
    }
    input.click()
  }

  // 添加Token
  const handleAddToken = () => {
    const name = prompt("输入Token名称:")
    if (!name) return

    const key = prompt("输入Session Key (sk-ant-sid...):")
    if (!key) return

    // 验证格式
    if (!/^sk-ant-sid\d{2}-/.test(key)) {
      showToast("无效的Session Key格式", 2000)
      return
    }

    addKey({ name, key })
    showToast("Token已添加", 1500)
  }

  // 删除Token
  const handleDeleteToken = (id: string, name: string) => {
    if (!confirm(`确定删除 ${name}?`)) return
    deleteKey(id)
    showToast("已删除", 1500)
  }

  return (
    <div>
      {/* 当前使用的Token */}
      <SettingCard title="当前使用" description="当前正在使用的 Session Key">
        <div
          style={{
            padding: "16px",
            backgroundColor: "var(--gh-bg-secondary)",
            borderRadius: "8px",
            border: "1px solid var(--gh-border)",
          }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "4px" }}>
                {currentKey ? (
                  <>
                    🔑 {currentKey.name}
                    {currentKey.accountType && (
                      <span
                        style={{
                          marginLeft: "8px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          backgroundColor: "var(--gh-bg)",
                        }}>
                        {currentKey.accountType}
                      </span>
                    )}
                  </>
                ) : (
                  "🌐 默认(浏览器Cookie)"
                )}
              </div>
              <div style={{ fontSize: "12px", color: "var(--gh-text-secondary)" }}>
                {currentKey ? "使用管理的Token" : "使用浏览器默认登录"}
                <span style={{ marginLeft: "12px", opacity: 0.7 }}>
                  💡 提示:支持快捷切换功能(开发中)
                </span>
              </div>
            </div>
            <button
              className="settings-btn settings-btn-primary"
              style={{ padding: "6px 16px", fontSize: "13px" }}
              onClick={() => {
                // 简单切换选择
                const nextIndex = keys.findIndex((k) => k.id === currentKeyId) + 1
                const nextKey = nextIndex < keys.length ? keys[nextIndex] : null
                handleSwitchToken(nextKey?.id || "")
              }}>
              切换
            </button>
          </div>
        </div>
      </SettingCard>

      {/* Token列表 */}
      <SettingCard title="Token 列表" description="管理你的 Claude Session Keys">
        {/* 操作按钮 */}
        <div style={{ marginBottom: "16px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button className="settings-btn settings-btn-primary" onClick={handleAddToken}>
            ➕ 添加
          </button>
          <button className="settings-btn settings-btn-secondary" onClick={handleImportFromBrowser}>
            🌐 从浏览器导入
          </button>
          <button className="settings-btn settings-btn-secondary" onClick={handleImportTokens}>
            📥 导入JSON
          </button>
          <button
            className="settings-btn settings-btn-secondary"
            onClick={handleExportTokens}
            disabled={keys.length === 0}>
            📤 导出JSON
          </button>
        </div>

        {/* Token表格 */}
        {keys.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--gh-text-secondary)" }}>
            暂无Token,点击"添加"创建
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--gh-border)" }}>
                  <th style={{ padding: "12px 8px", textAlign: "left", fontWeight: 600 }}>名称</th>
                  <th style={{ padding: "12px 8px", textAlign: "left", fontWeight: 600 }}>
                    Session Key
                  </th>
                  <th style={{ padding: "12px 8px", textAlign: "left", fontWeight: 600 }}>类型</th>
                  <th style={{ padding: "12px 8px", textAlign: "left", fontWeight: 600 }}>状态</th>
                  <th style={{ padding: "12px 8px", textAlign: "center", fontWeight: 600 }}>
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key, index) => (
                  <tr
                    key={key.id}
                    style={{
                      borderBottom: "1px solid var(--gh-border)",
                      backgroundColor:
                        key.id === currentKeyId ? "rgba(var(--gh-primary-rgb), 0.05)" : undefined,
                    }}>
                    <td style={{ padding: "12px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {key.id === currentKeyId && <span>✓</span>}
                        <span style={{ fontWeight: key.id === currentKeyId ? 500 : 400 }}>
                          {key.name}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 8px", fontFamily: "monospace", fontSize: "12px" }}>
                      {key.key.substring(0, 20)}...
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {key.accountType ? (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            backgroundColor: "var(--gh-bg-secondary)",
                          }}>
                          {key.accountType}
                        </span>
                      ) : (
                        <span style={{ color: "var(--gh-text-secondary)", fontSize: "12px" }}>
                          未测试
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {key.isValid === undefined ? (
                        <span style={{ color: "var(--gh-text-secondary)", fontSize: "12px" }}>
                          -
                        </span>
                      ) : key.isValid ? (
                        <span style={{ color: "#10b981", fontSize: "12px" }}>✓ 有效</span>
                      ) : (
                        <span style={{ color: "#ef4444", fontSize: "12px" }}>✗ 无效</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                        <button
                          className="settings-btn settings-btn-secondary"
                          style={{ padding: "4px 12px", fontSize: "12px" }}
                          onClick={() => handleSwitchToken(key.id)}
                          disabled={key.id === currentKeyId}>
                          使用
                        </button>
                        <button
                          className="settings-btn settings-btn-secondary"
                          style={{ padding: "4px 12px", fontSize: "12px" }}
                          onClick={() => handleTestToken(key.id)}
                          disabled={testing[key.id]}>
                          {testing[key.id] ? "测试中..." : "测试"}
                        </button>
                        <button
                          className="settings-btn settings-btn-secondary"
                          style={{ padding: "4px 12px", fontSize: "12px" }}
                          onClick={() => handleDeleteToken(key.id, key.name)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingCard>
    </div>
  )
}

export default ClaudeSettings
