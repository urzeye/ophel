import React, { useId, useRef, useState } from "react"

import { DeleteIcon } from "~components/icons"
import { Tooltip } from "~components/ui"
import { useSettingsStore } from "~stores/settings-store"
import { SettingCard } from "~tabs/options/components"
import type { HiddenPathRule } from "~types/settings"
import { compileHiddenPathRule, parseHiddenPathInput } from "~utils/hidden-paths"
import { t } from "~utils/i18n"

interface HiddenPathsSiteCardProps {
  /** 配置存储 key：内置站点为 siteId，社区适配包为站点实例 key */
  siteKey: string
  /** 当前页面路径：仅在面板里、且选中的正是当前站点时传入；独立设置页没有当前页面 */
  currentPath?: string
}

const NO_RULES: HiddenPathRule[] = []

const ERROR_KEYS = {
  invalidUrl: "hiddenPathsInvalidUrl",
  invalidRegex: "hiddenPathsInvalidRegex",
  duplicate: "hiddenPathsDuplicate",
} as const

type InputError = keyof typeof ERROR_KEYS

/** 单个站点的隐藏页面规则列表，由站点设置页按当前选中的站点渲染；分组标题由页面提供 */
export const HiddenPathsSiteCard: React.FC<HiddenPathsSiteCardProps> = ({
  siteKey,
  currentPath,
}) => {
  const { settings, setSettings } = useSettingsStore()
  const [input, setInput] = useState("")
  const [regex, setRegex] = useState(false)
  const [error, setError] = useState<InputError | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const hintId = useId()

  if (!settings) return null

  const rules = settings.hiddenPaths[siteKey] ?? NO_RULES
  const parsed = input.trim() ? parseHiddenPathInput(input, regex) : null
  const pendingRule = parsed && "rule" in parsed ? parsed.rule : null
  // 添加后当前页面会立刻隐藏面板（连同这个设置窗口），提前说明，免得以为出错了
  const hidesCurrentPage = Boolean(
    currentPath && pendingRule && compileHiddenPathRule(pendingRule)?.test(currentPath),
  )

  // 规则清空后由 normalizeSettings 移除该站点条目
  const saveRules = (next: HiddenPathRule[]) =>
    setSettings({ hiddenPaths: { ...settings.hiddenPaths, [siteKey]: next } })

  const editInput = (value: string) => {
    setInput(value)
    setError(null)
  }

  const addRule = (event: React.FormEvent) => {
    event.preventDefault()
    if (!parsed) return
    if ("error" in parsed) {
      setError(parsed.error)
      return
    }

    const { rule } = parsed
    if (rules.some((item) => item.pattern === rule.pattern && item.regex === rule.regex)) {
      setError("duplicate")
      return
    }
    saveRules([...rules, rule])
    editInput("")
    inputRef.current?.focus()
  }

  const fillCurrentPage = () => {
    if (!currentPath) return
    editInput(currentPath)
    inputRef.current?.focus()
  }

  // 输入框下方只占一行：错误 > 命中当前页面的提醒 > 写法说明
  const getHint = (): { text: string; tone?: "is-error" | "is-notice" } => {
    if (error) return { text: t(ERROR_KEYS[error]), tone: "is-error" }
    if (hidesCurrentPage) return { text: t("hiddenPathsHidesCurrentPage"), tone: "is-notice" }
    return { text: t(regex ? "hiddenPathsRegexHint" : "hiddenPathsHint") }
  }
  const hint = getHint()

  return (
    <SettingCard settingId="site-settings-hidden-paths" description={t("hiddenPathsDesc")}>
      {rules.length > 0 && (
        <ul className="settings-hidden-paths-list">
          {rules.map((rule, index) => (
            <li key={`${rule.regex}:${rule.pattern}`} className="settings-hidden-paths-item">
              <code className="settings-hidden-paths-pattern">{rule.pattern}</code>
              {rule.regex && (
                <span className="settings-pack-badge">{t("hiddenPathsRegexBadge")}</span>
              )}
              {!compileHiddenPathRule(rule) && (
                <span className="settings-pack-badge danger">{t("hiddenPathsInvalidRegex")}</span>
              )}
              <Tooltip content={t("delete")} triggerClassName="settings-hidden-paths-remove">
                <button
                  type="button"
                  className="settings-pack-icon-btn ghost danger"
                  aria-label={`${t("delete")}: ${rule.pattern}`}
                  onClick={() => saveRules(rules.filter((_, i) => i !== index))}>
                  <DeleteIcon size={15} />
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}

      <form className="settings-hidden-paths-form" onSubmit={addRule}>
        <input
          ref={inputRef}
          type="text"
          className="settings-input settings-hidden-paths-input"
          value={input}
          onChange={(event) => editInput(event.target.value)}
          placeholder={t(regex ? "hiddenPathsRegexPlaceholder" : "hiddenPathsPlaceholder")}
          aria-label={t("hiddenPathsTitle")}
          aria-invalid={error !== null}
          aria-describedby={hintId}
          autoComplete="off"
          spellCheck={false}
        />
        <Tooltip content={t("hiddenPathsUseRegex")}>
          <button
            type="button"
            className="settings-pack-icon-btn settings-hidden-paths-regex-toggle"
            aria-pressed={regex}
            aria-label={t("hiddenPathsUseRegex")}
            onClick={() => {
              setRegex(!regex)
              setError(null)
            }}>
            .*
          </button>
        </Tooltip>
        {currentPath && (
          <button
            type="button"
            className="settings-btn settings-btn-secondary settings-btn-sm"
            onClick={fillCurrentPage}>
            {t("hiddenPathsUseCurrentPage")}
          </button>
        )}
        <button
          type="submit"
          className="settings-btn settings-btn-primary settings-btn-sm"
          disabled={!parsed}>
          {t("add")}
        </button>
      </form>

      <p
        id={hintId}
        className={`settings-hidden-paths-hint ${hint.tone ?? ""}`.trim()}
        aria-live="polite">
        {hint.text}
      </p>
    </SettingCard>
  )
}

export default HiddenPathsSiteCard
