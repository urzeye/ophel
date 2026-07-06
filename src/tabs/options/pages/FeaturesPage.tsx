/**
 * 功能模块页面
 * 包含：标签页、提醒、内容处理、大纲、会话、模型锁定、阅读历史
 * 使用顶部 Tab 切换
 */
import React, { useCallback, useEffect, useState } from "react"

import { FeaturesIcon } from "~components/icons"
import { Button, NumberInput, PlaceholderInput, SelectDropdown } from "~components/ui"
import { FEATURES_TAB_IDS, NOTIFICATION_SOUND_PRESETS, SITE_IDS } from "~constants"
import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { MSG_CHECK_PERMISSIONS, MSG_REQUEST_PERMISSIONS, sendToBackground } from "~utils/messaging"
import type { ExportPackaging, FormulaCopyFormat } from "~utils/storage"
import {
  aggregateUsageEvents,
  getUsageEvents,
  getUsageMetricValue,
  watchUsageCounterState,
  type UsageHistoryBucket,
  type UsageHistoryGranularity,
  type UsageHistoryMetric,
} from "~utils/usage-monitor-storage"
import { showToast, showToastThrottled } from "~utils/toast"

import { PageTitle, SettingCard, SettingRow, TabGroup, ToggleRow } from "../components"

interface FeaturesPageProps {
  siteId: string
  initialTab?: string
}

interface LazyInputProps {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
}

const LazyInput: React.FC<LazyInputProps> = ({
  value,
  onChange,
  placeholder,
  className,
  style,
}) => {
  const [localValue, setLocalValue] = useState(value)

  // 当外部 value 变化时（如重置），同步到 localValue
  React.useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleBlur = () => {
    if (localValue !== value) {
      onChange(localValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBlur()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <input
      type="text"
      className={className}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      style={style}
    />
  )
}

const UsageHistoryChart: React.FC<{ siteId: string }> = ({ siteId }) => {
  const [granularity, setGranularity] = useState<UsageHistoryGranularity>("day")
  const [metric, setMetric] = useState<UsageHistoryMetric>("requestTokens")
  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    siteId === "_default" ? "all" : siteId,
  )
  const [buckets, setBuckets] = useState<UsageHistoryBucket[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  const siteOptions = React.useMemo(
    () => [
      { id: "all", label: t("usageMonitorChartSiteAll") },
      { id: SITE_IDS.GEMINI, label: "Gemini" },
      { id: SITE_IDS.GEMINI_ENTERPRISE, label: "Gemini Enterprise" },
      { id: SITE_IDS.CHATGPT, label: "ChatGPT" },
      { id: SITE_IDS.CLAUDE, label: "Claude" },
      { id: SITE_IDS.GROK, label: "Grok" },
      { id: SITE_IDS.AISTUDIO, label: "AI Studio" },
      { id: SITE_IDS.DEEPSEEK, label: "DeepSeek" },
      { id: SITE_IDS.DOUBAO, label: "Doubao" },
      { id: SITE_IDS.IMA, label: "ima" },
      { id: SITE_IDS.CHATGLM, label: "ChatGLM" },
      { id: SITE_IDS.KIMI, label: "Kimi" },
      { id: SITE_IDS.QIANWEN, label: "Qianwen" },
      { id: SITE_IDS.QWENAI, label: "Qwen Studio" },
      { id: SITE_IDS.ZAI, label: "Z.ai" },
    ],
    [],
  )

  const selectedSiteLabel =
    siteOptions.find((site) => site.id === selectedSiteId)?.label || t("usageMonitorChartSiteAll")

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const events = await getUsageEvents({
        siteId: selectedSiteId === "all" ? undefined : selectedSiteId,
      })
      setBuckets(aggregateUsageEvents(events, granularity))
    } finally {
      setLoading(false)
    }
  }, [granularity, selectedSiteId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const unwatch = watchUsageCounterState(() => {
      void refresh()
    })
    return () => unwatch()
  }, [refresh])

  useEffect(() => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    const scrollToRight = () => {
      container.scrollLeft = container.scrollWidth
    }
    scrollToRight()
    const rafId = window.requestAnimationFrame(scrollToRight)
    return () => window.cancelAnimationFrame(rafId)
  }, [granularity, buckets.length])

  const values = buckets.map((bucket) => getUsageMetricValue(bucket, metric))
  const maxValue = Math.max(1, ...values)
  const latestValue = values[values.length - 1] ?? 0
  const metricLabel =
    metric === "requestTokens"
      ? t("usageMonitorChartMetricRequest")
      : metric === "roundTripTokens"
        ? t("usageMonitorChartMetricRoundTrip")
        : metric === "loadedConversationTokens"
          ? t("usageMonitorChartMetricConversation")
          : metric === "loadedOutputTokens"
            ? t("usageMonitorChartMetricOutput")
            : t("usageMonitorChartMetricCount")
  const bucketPixelWidth = granularity === "month" ? 72 : granularity === "hour" ? 48 : 44
  const chartWidth =
    buckets.length > 1 ? Math.max(640, 40 + (buckets.length - 1) * bucketPixelWidth + 48) : 640
  const chartHeight = 220
  const padding = { top: 16, right: 12, bottom: 32, left: 18 }
  const innerWidth = chartWidth - padding.left - padding.right
  const innerHeight = chartHeight - padding.top - padding.bottom
  const stepX = buckets.length > 1 ? innerWidth / (buckets.length - 1) : innerWidth
  const labelStep =
    granularity === "month"
      ? 1
      : granularity === "hour"
        ? 2
        : Math.max(2, Math.ceil(buckets.length / 10))

  const points = buckets.map((bucket, index) => {
    const x = padding.left + stepX * index
    const value = getUsageMetricValue(bucket, metric)
    const ratio = value / maxValue
    const y = padding.top + innerHeight - ratio * innerHeight
    return { x, y, value, label: bucket.label }
  })

  const linePath =
    points.length > 0
      ? points
          .map(
            (point, index) =>
              `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
          )
          .join(" ")
      : ""

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${(padding.top + innerHeight).toFixed(2)} L ${points[0].x.toFixed(2)} ${(padding.top + innerHeight).toFixed(2)} Z`
      : ""

  const hoveredBucket =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < buckets.length
      ? buckets[hoveredIndex]
      : null
  const hoveredPoint =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < points.length
      ? points[hoveredIndex]
      : null
  const previousHoveredBucket =
    hoveredIndex !== null && hoveredIndex > 0 && hoveredIndex - 1 < buckets.length
      ? buckets[hoveredIndex - 1]
      : null
  const hoveredMetricValue = hoveredBucket ? getUsageMetricValue(hoveredBucket, metric) : 0
  const previousMetricValue = previousHoveredBucket
    ? getUsageMetricValue(previousHoveredBucket, metric)
    : 0
  const hoveredDelta =
    previousHoveredBucket && hoveredBucket ? hoveredMetricValue - previousMetricValue : null

  const formatBucketTime = (bucket: UsageHistoryBucket): string => {
    const start = new Date(bucket.startAt)
    const end = new Date(bucket.endAt - 1)

    if (granularity === "hour") {
      const date = `${start.getFullYear()}/${`${start.getMonth() + 1}`.padStart(2, "0")}/${`${start.getDate()}`.padStart(2, "0")}`
      return `${date} ${`${start.getHours()}`.padStart(2, "0")}:00 - ${`${end.getHours()}`.padStart(2, "0")}:59`
    }

    if (granularity === "day") {
      return `${start.getFullYear()}/${`${start.getMonth() + 1}`.padStart(2, "0")}/${`${start.getDate()}`.padStart(2, "0")}`
    }

    return `${start.getFullYear()}/${`${start.getMonth() + 1}`.padStart(2, "0")}`
  }

  const tooltipWidth = 220
  const viewportWidth = scrollRef.current?.clientWidth || chartWidth
  const scrollOffset = scrollRef.current?.scrollLeft || 0
  const tooltipLeft =
    hoveredPoint && viewportWidth > tooltipWidth
      ? Math.min(
          viewportWidth - tooltipWidth - 8,
          Math.max(8, hoveredPoint.x - scrollOffset - tooltipWidth / 2),
        )
      : 8
  const tooltipTop = hoveredPoint && hoveredPoint.y > 110 ? Math.max(8, hoveredPoint.y - 94) : 8
  const chartColors = {
    grid: "var(--gh-border, #e5e7eb)",
    area: "var(--gh-user-query-bg, rgba(66, 133, 244, 0.08))",
    line: "var(--gh-primary, #4285f4)",
    guide: "var(--gh-border-active, #6366f1)",
    axis: "var(--gh-text-secondary, #6b7280)",
    text: "var(--gh-text, #374151)",
    cardBg: "var(--gh-card-bg, #ffffff)",
    secondaryBg: "var(--gh-bg-secondary, #f9fafb)",
    border: "var(--gh-border, #e5e7eb)",
    activeBorder: "var(--gh-border-active, #6366f1)",
    shadow: "var(--gh-shadow-sm, 0 1px 3px rgba(0,0,0,0.1))",
  }

  return (
    <div
      style={{
        marginTop: "14px",
        padding: "14px",
        borderRadius: "12px",
        border: `1px solid ${chartColors.border}`,
        background: chartColors.secondaryBg,
      }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--gh-text, #374151)" }}>
            {t("usageMonitorChartTitle")}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--gh-text-secondary, #6b7280)",
              marginTop: "4px",
            }}>
            {t("usageMonitorChartDesc")}
          </div>
          <div
            style={{
              marginTop: "8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}>
            <span style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)" }}>
              {t("usageMonitorChartSiteLabel")}
            </span>
            <select
              className="settings-select"
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              style={{ minWidth: "170px" }}>
              {siteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {(
              [
                ["hour", t("usageMonitorChartHour")],
                ["day", t("usageMonitorChartDay")],
                ["month", t("usageMonitorChartMonth")],
              ] as Array<[UsageHistoryGranularity, string]>
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={granularity === value ? "primary" : "secondary"}
                onClick={() => setGranularity(value)}>
                {label}
              </Button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {(
              [
                ["count", t("usageMonitorChartMetricCount")],
                ["requestTokens", t("usageMonitorChartMetricRequest")],
                ["roundTripTokens", t("usageMonitorChartMetricRoundTrip")],
                ["loadedConversationTokens", t("usageMonitorChartMetricConversation")],
                ["loadedOutputTokens", t("usageMonitorChartMetricOutput")],
              ] as Array<[UsageHistoryMetric, string]>
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={metric === value ? "primary" : "secondary"}
                onClick={() => setMetric(value)}>
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "18px",
          marginTop: "12px",
          marginBottom: "8px",
          flexWrap: "wrap",
        }}>
        <div style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)" }}>
          <span>{metricLabel}: </span>
          <strong style={{ color: "var(--gh-text, #374151)" }}>{latestValue}</strong>
        </div>
        <div style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)" }}>
          <span>{t("usageMonitorChartCurrentSite")}: </span>
          <strong style={{ color: "var(--gh-text, #374151)" }}>{selectedSiteLabel}</strong>
        </div>
        <div style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)" }}>
          <span>MAX: </span>
          <strong style={{ color: "var(--gh-text, #374151)" }}>{maxValue}</strong>
        </div>
        <div style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)" }}>
          <span>{t("usageMonitorChartScrollHint")}</span>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          marginTop: "4px",
        }}
        onMouseLeave={() => setHoveredIndex(null)}>
        {/* tooltip 提升到滚动容器外层渲染，避免被横向滚动区域裁切。 */}
        <div
          ref={scrollRef}
          style={{
            position: "relative",
            borderRadius: "10px",
            overflowX: "auto",
            overflowY: "hidden",
            background: chartColors.cardBg,
            border: `1px solid ${chartColors.border}`,
            minHeight: "220px",
          }}>
          <div style={{ width: `${chartWidth}px`, minWidth: "100%", position: "relative" }}>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              style={{ width: "100%", height: "220px", display: "block" }}>
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = padding.top + innerHeight - innerHeight * ratio
                return (
                  <line
                    key={ratio}
                    x1={padding.left}
                    x2={chartWidth - padding.right}
                    y1={y}
                    y2={y}
                    stroke={chartColors.grid}
                    strokeWidth="1"
                    opacity={0.6}
                  />
                )
              })}

              {areaPath && <path d={areaPath} fill={chartColors.area} />}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke={chartColors.line}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {points.map((point) => (
                <circle
                  key={`${point.label}-${point.x}`}
                  cx={point.x}
                  cy={point.y}
                  r="3"
                  fill={chartColors.line}
                />
              ))}

              {hoveredPoint && (
                <line
                  x1={hoveredPoint.x}
                  x2={hoveredPoint.x}
                  y1={padding.top}
                  y2={padding.top + innerHeight}
                  stroke={chartColors.guide}
                  strokeDasharray="4 4"
                  strokeWidth="1"
                  opacity={0.65}
                />
              )}

              {buckets.map((bucket, index) => {
                const point = points[index]
                const previous = points[index - 1]
                const next = points[index + 1]
                const xStart = previous ? (previous.x + point.x) / 2 : padding.left
                const xEnd = next ? (point.x + next.x) / 2 : chartWidth - padding.right

                return (
                  <rect
                    key={`${bucket.key}-hover`}
                    // 使用透明 hover 区域覆盖整个 bucket 宽度，提升折线图在稀疏点位上的悬浮命中率。
                    x={xStart}
                    y={padding.top}
                    width={Math.max(12, xEnd - xStart)}
                    height={innerHeight}
                    fill="transparent"
                    pointerEvents="all"
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseMove={() => setHoveredIndex(index)}
                  />
                )
              })}

              {buckets.map((bucket, index) => {
                const shouldShow =
                  index === 0 || index === buckets.length - 1 || index % labelStep === 0
                if (!shouldShow) return null

                const x = padding.left + stepX * index
                return (
                  <text
                    key={bucket.key}
                    x={x}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    fill={chartColors.axis}
                    fontSize="11">
                    {bucket.label}
                  </text>
                )
              })}
            </svg>
          </div>

          {!loading && buckets.every((bucket) => getUsageMetricValue(bucket, metric) === 0) && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: chartColors.axis,
                fontSize: "13px",
              }}>
              {t("usageMonitorChartEmpty")}
            </div>
          )}
        </div>

        {hoveredBucket && hoveredPoint && (
          <div
            style={{
              position: "absolute",
              left: `${tooltipLeft}px`,
              top: `${tooltipTop}px`,
              width: `${tooltipWidth}px`,
              borderRadius: "10px",
              padding: "10px 12px",
              background: chartColors.cardBg,
              color: chartColors.text,
              border: `1px solid ${chartColors.activeBorder}`,
              boxShadow: chartColors.shadow,
              pointerEvents: "none",
              zIndex: 5,
            }}>
            <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>
              {formatBucketTime(hoveredBucket)}
            </div>
            {hoveredDelta !== null && (
              <div
                style={{
                  fontSize: "11px",
                  marginBottom: "8px",
                  color: "var(--gh-text-secondary, #6b7280)",
                }}>
                {metricLabel}: {hoveredMetricValue}
                {" · "}
                {hoveredDelta >= 0 ? "+" : ""}
                {hoveredDelta} {t("usageMonitorChartDelta")}
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "6px 10px",
                fontSize: "12px",
              }}>
              <span style={{ color: chartColors.axis }}>{t("usageMonitorChartMetricCount")}</span>
              <strong>{hoveredBucket.count}</strong>
              <span style={{ color: chartColors.axis }}>{t("usageMonitorChartMetricRequest")}</span>
              <strong>{hoveredBucket.requestTokens}</strong>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMetricRoundTrip")}
              </span>
              <strong>{hoveredBucket.roundTripTokens}</strong>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMetricConversation")}
              </span>
              <strong>{hoveredBucket.loadedConversationTokens}</strong>
              <span style={{ color: chartColors.axis }}>{t("usageMonitorChartMetricOutput")}</span>
              <strong>{hoveredBucket.loadedOutputTokens}</strong>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMaxConversation")}
              </span>
              <strong>{hoveredBucket.maxLoadedConversationTokens}</strong>
              <span style={{ color: chartColors.axis }}>{t("usageMonitorChartMaxRequest")}</span>
              <strong>{hoveredBucket.maxRequestTokens}</strong>
              <span style={{ color: chartColors.axis }}>{t("usageMonitorChartMaxRoundTrip")}</span>
              <strong>{hoveredBucket.maxRoundTripTokens}</strong>
              <span style={{ color: chartColors.axis }}>{t("usageMonitorChartMaxOutput")}</span>
              <strong>{hoveredBucket.maxLoadedOutputTokens}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const FeaturesPage: React.FC<FeaturesPageProps> = ({ siteId, initialTab }) => {
  const tabs = [
    { id: FEATURES_TAB_IDS.OUTLINE, label: t("tabOutline") },
    { id: FEATURES_TAB_IDS.CONVERSATIONS, label: t("tabConversations") },
    { id: FEATURES_TAB_IDS.PROMPTS, label: t("tabPrompts") },
    { id: FEATURES_TAB_IDS.TAB_SETTINGS, label: t("tabSettingsTab") },
    { id: FEATURES_TAB_IDS.REMINDER, label: t("reminderTab") },
    { id: FEATURES_TAB_IDS.CONTENT, label: t("navContent") },
    { id: FEATURES_TAB_IDS.READING_HISTORY, label: t("readingHistoryTitle") },
  ]

  const [activeTab, setActiveTab] = useState<string>(initialTab || tabs[0].id)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null)
  const { settings, updateDeepSetting, updateNestedSetting } = useSettingsStore()

  const clearPreviewAudioHandlers = useCallback(() => {
    if (!previewAudioRef.current) return

    previewAudioRef.current.onended = null
    previewAudioRef.current.onerror = null
  }, [])

  const stopNotificationSoundPreview = useCallback(() => {
    const audio = previewAudioRef.current
    if (!audio) {
      setIsPreviewPlaying(false)
      return
    }

    clearPreviewAudioHandlers()
    audio.pause()
    audio.currentTime = 0
    setIsPreviewPlaying(false)
  }, [clearPreviewAudioHandlers])

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  useEffect(() => {
    return () => {
      stopNotificationSoundPreview()
    }
  }, [stopNotificationSoundPreview])

  useEffect(() => {
    if (activeTab !== FEATURES_TAB_IDS.REMINDER) {
      stopNotificationSoundPreview()
    }
  }, [activeTab, stopNotificationSoundPreview])

  useEffect(() => {
    if (!settings?.tab?.showNotification || !settings.tab.notificationSound) {
      stopNotificationSoundPreview()
    }
  }, [
    settings?.tab?.notificationSound,
    settings?.tab?.showNotification,
    stopNotificationSoundPreview,
  ])

  useEffect(() => {
    const previewAudio = previewAudioRef.current
    if (!previewAudio || !isPreviewPlaying) return

    const volume = settings?.tab?.notificationVolume ?? 0.5
    previewAudio.volume = Math.max(0.1, Math.min(1.0, volume))
  }, [isPreviewPlaying, settings?.tab?.notificationVolume])

  if (!settings) return null

  const prerequisiteToastTemplate = t("enablePrerequisiteToast")
  const showPrerequisiteToast = (label: string) =>
    showToastThrottled(prerequisiteToastTemplate.replace("{setting}", label), 2000, {}, 1500, label)
  const autoRenameLabel = t("autoRenameTabLabel")
  const showNotificationLabel = t("showNotificationLabel")
  const showStatusLabel = t("showStatusLabel")
  const privacyModeLabel = t("privacyModeLabel")
  const readingHistoryLabel = t("readingHistoryPersistenceLabel")
  const formulaCopyLabel = t("formulaCopyLabel")
  const exportPackaging =
    settings.export?.packaging === "zip" || settings.export?.packaging === "markdown"
      ? settings.export.packaging
      : "markdown"
  const exportPackagingOptions = [
    { value: "markdown", label: t("exportPackagingMarkdown") },
    { value: "zip", label: t("exportPackagingZip") },
  ]
  const formulaCopyFormat = settings.content?.formulaCopyFormat === "mathml" ? "mathml" : "latex"
  const formulaCopyFormatOptions = [
    { value: "latex", label: t("formulaCopyFormatLatex") },
    { value: "mathml", label: t("formulaCopyFormatMathml") },
  ]
  const showFormulaDelimiterPrerequisiteToast = () => {
    if (!settings.content?.formulaCopy) {
      showPrerequisiteToast(formulaCopyLabel)
      return
    }

    showToastThrottled(
      t("formulaDelimiterLatexOnlyToast"),
      2000,
      {},
      1500,
      "formula-delimiter-latex-only",
    )
  }
  const hasMultipleNotificationSoundPresets = NOTIFICATION_SOUND_PRESETS.length > 1
  const formatSecondsOptionLabel = (value: number) => t("secondsValueLabel", { val: String(value) })
  const formatRepeatCountOptionLabel = (value: number) => `${value}x`
  const previewSoundButtonLabel = t("notificationSoundPreviewButtonLabel")
  const playNotificationSoundPreview = (presetId?: string) => {
    const targetPresetId =
      presetId || settings.tab?.notificationSoundPreset || NOTIFICATION_SOUND_PRESETS[0].id
    const sourceUrl = platform.getNotificationSoundUrl(targetPresetId)

    if (!sourceUrl) {
      showToast(t("notificationSoundPreviewFailed"), 2000)
      return
    }

    stopNotificationSoundPreview()

    let previewAudio = previewAudioRef.current
    if (!previewAudio) {
      previewAudio = new Audio()
      previewAudioRef.current = previewAudio
    }

    const volume = settings.tab?.notificationVolume ?? 0.5
    previewAudio.volume = Math.max(0.1, Math.min(1.0, volume))
    previewAudio.src = sourceUrl
    previewAudio.currentTime = 0
    previewAudio.onended = () => {
      clearPreviewAudioHandlers()
      setIsPreviewPlaying(false)
    }
    previewAudio.onerror = () => {
      clearPreviewAudioHandlers()
      setIsPreviewPlaying(false)
      showToast(t("notificationSoundPreviewFailed"), 2000)
    }

    setIsPreviewPlaying(true)
    previewAudio.play().catch(() => {
      clearPreviewAudioHandlers()
      setIsPreviewPlaying(false)
      showToast(t("notificationSoundPreviewFailed"), 2000)
    })
  }
  const notificationSettingsCard = (
    <SettingCard title={t("notificationSettings")}>
      <ToggleRow
        label={t("showNotificationLabel")}
        description={t("showNotificationDesc")}
        settingId="tab-show-notification"
        checked={settings.tab?.showNotification ?? false}
        onChange={async () => {
          const checked = settings.tab?.showNotification
          if (!checked) {
            // 油猴脚本环境：直接启用（不需要检查权限，GM_notification 已通过 @grant 声明）
            if (!platform.hasCapability("permissions")) {
              updateNestedSetting("tab", "showNotification", true)
              return
            }
            // Options 页面可直接调用 chrome.permissions API（无需先 contains，避免 await 导致 user gesture 丢失）
            if (typeof chrome.permissions !== "undefined") {
              const granted = await chrome.permissions.request({
                permissions: ["notifications"],
              })
              if (granted) {
                updateNestedSetting("tab", "showNotification", true)
              }
            } else {
              // Content Script fallback：通过 background 打开权限请求弹窗
              const response = await sendToBackground({
                type: MSG_CHECK_PERMISSIONS,
                permissions: ["notifications"],
              })
              if (response.success && response.hasPermission) {
                updateNestedSetting("tab", "showNotification", true)
              } else {
                await sendToBackground({
                  type: MSG_REQUEST_PERMISSIONS,
                  permType: "notifications",
                })
                showToast(t("permissionRequestToast"), 3000)
              }
            }
          } else {
            updateNestedSetting("tab", "showNotification", false)
          }
        }}
      />

      <ToggleRow
        label={t("notificationSoundLabel")}
        description={t("notificationSoundDesc")}
        settingId="tab-notification-sound"
        checked={settings.tab?.notificationSound ?? false}
        disabled={!settings.tab?.showNotification}
        onDisabledClick={() => showPrerequisiteToast(showNotificationLabel)}
        onChange={() =>
          updateNestedSetting("tab", "notificationSound", !settings.tab?.notificationSound)
        }
      />

      {hasMultipleNotificationSoundPresets && (
        <SettingRow
          label={t("notificationSoundPresetLabel")}
          settingId="tab-notification-sound-preset"
          disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}
          onDisabledClick={() => showPrerequisiteToast(showNotificationLabel)}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <select
              className="settings-select"
              value={settings.tab?.notificationSoundPreset || NOTIFICATION_SOUND_PRESETS[0].id}
              onChange={(e) => {
                const nextPresetId = e.target.value
                updateNestedSetting("tab", "notificationSoundPreset", nextPresetId)
                playNotificationSoundPreview(nextPresetId)
              }}
              disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}
              style={{ flex: 1 }}>
              {NOTIFICATION_SOUND_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {t(preset.labelKey)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant={isPreviewPlaying ? "primary" : "secondary"}
              size="sm"
              onClick={() => playNotificationSoundPreview()}
              disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}
              style={{ minWidth: "56px", flexShrink: 0 }}>
              {previewSoundButtonLabel}
            </Button>
          </div>
        </SettingRow>
      )}

      <SettingRow
        label={t("notificationVolumeLabel")}
        settingId="tab-notification-volume"
        disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}
        onDisabledClick={() => showPrerequisiteToast(showNotificationLabel)}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.1"
            value={settings.tab?.notificationVolume || 0.5}
            onChange={(e) =>
              updateNestedSetting("tab", "notificationVolume", parseFloat(e.target.value))
            }
            disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}
            style={{ width: "100px" }}
          />
          <span style={{ fontSize: "12px", minWidth: "36px" }}>
            {Math.round((settings.tab?.notificationVolume || 0.5) * 100)}%
          </span>
        </div>
      </SettingRow>

      <SettingRow
        label={t("notificationRepeatCountLabel")}
        settingId="tab-notification-repeat-count"
        disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}
        onDisabledClick={() => showPrerequisiteToast(showNotificationLabel)}>
        <select
          className="settings-select"
          value={settings.tab?.notificationRepeatCount ?? 1}
          onChange={(e) =>
            updateNestedSetting("tab", "notificationRepeatCount", parseInt(e.target.value))
          }
          disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}>
          {[1, 2, 3, 5].map((value) => (
            <option key={value} value={value}>
              {formatRepeatCountOptionLabel(value)}
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow
        label={t("notificationRepeatIntervalLabel")}
        settingId="tab-notification-repeat-interval"
        disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}
        onDisabledClick={() => showPrerequisiteToast(showNotificationLabel)}>
        <select
          className="settings-select"
          value={settings.tab?.notificationRepeatInterval ?? 3}
          onChange={(e) =>
            updateNestedSetting("tab", "notificationRepeatInterval", parseInt(e.target.value))
          }
          disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}>
          {[1, 2, 3, 5, 10].map((value) => (
            <option key={value} value={value}>
              {formatSecondsOptionLabel(value)}
            </option>
          ))}
        </select>
      </SettingRow>

      <ToggleRow
        label={t("notifyWhenFocusedLabel")}
        description={t("notifyWhenFocusedDesc")}
        settingId="tab-notify-when-focused"
        checked={settings.tab?.notifyWhenFocused ?? false}
        disabled={!settings.tab?.showNotification}
        onDisabledClick={() => showPrerequisiteToast(showNotificationLabel)}
        onChange={() =>
          updateNestedSetting("tab", "notifyWhenFocused", !settings.tab?.notifyWhenFocused)
        }
      />

      <ToggleRow
        label={t("autoFocusLabel")}
        description={t("autoFocusDesc")}
        settingId="tab-auto-focus"
        checked={settings.tab?.autoFocus ?? false}
        onChange={() => updateNestedSetting("tab", "autoFocus", !settings.tab?.autoFocus)}
      />
    </SettingCard>
  )
  const usageMonitorCard = (
    <SettingCard title={t("usageMonitorSettingsTitle")} description={t("usageMonitorSettingsDesc")}>
      <div
        style={{
          marginBottom: "12px",
          padding: "10px 12px",
          borderRadius: "10px",
          border: "1px solid var(--gh-border, #e5e7eb)",
          background: "var(--gh-bg-secondary, #f9fafb)",
          color: "var(--gh-text-secondary, #6b7280)",
          fontSize: "12px",
          lineHeight: 1.6,
        }}>
        <div>{t("usageMonitorExplainLocalOnly")}</div>
        <div>{t("usageMonitorExplainNoBackend")}</div>
        <div>{t("usageMonitorExplainReset")}</div>
      </div>

      <ToggleRow
        label={t("usageMonitorEnabledLabel")}
        description={t("usageMonitorEnabledDesc")}
        settingId="usage-monitor-enabled"
        checked={settings.usageMonitor?.enabled ?? false}
        onChange={() =>
          updateNestedSetting("usageMonitor", "enabled", !(settings.usageMonitor?.enabled ?? false))
        }
      />

      <div
        style={{
          marginTop: "-2px",
          marginBottom: "12px",
          padding: "10px 12px",
          borderRadius: "10px",
          border: "1px solid var(--gh-border-active, #6366f1)",
          background: "var(--gh-user-query-bg, rgba(66, 133, 244, 0.08))",
          color: "var(--gh-text, #374151)",
          fontSize: "12px",
          lineHeight: 1.55,
        }}>
        {t("usageMonitorExplainRender")}
      </div>

      <SettingRow
        label={t("usageMonitorDailyLimitLabel")}
        description={t("usageMonitorDailyLimitDesc")}
        settingId="usage-monitor-daily-limit"
        disabled={!(settings.usageMonitor?.enabled ?? false)}
        onDisabledClick={() => showPrerequisiteToast(t("usageMonitorEnabledLabel"))}>
        <NumberInput
          value={settings.usageMonitor?.dailyLimit ?? 100}
          onChange={(val) => updateNestedSetting("usageMonitor", "dailyLimit", val)}
          min={1}
          max={9999}
          defaultValue={100}
          disabled={!(settings.usageMonitor?.enabled ?? false)}
          style={{ width: "96px" }}
        />
      </SettingRow>

      <ToggleRow
        label={t("usageMonitorAutoResetLabel")}
        description={t("usageMonitorAutoResetDesc")}
        settingId="usage-monitor-auto-reset"
        checked={settings.usageMonitor?.autoResetEnabled ?? false}
        disabled={!(settings.usageMonitor?.enabled ?? false)}
        onDisabledClick={() => showPrerequisiteToast(t("usageMonitorEnabledLabel"))}
        onChange={() =>
          updateNestedSetting(
            "usageMonitor",
            "autoResetEnabled",
            !(settings.usageMonitor?.autoResetEnabled ?? false),
          )
        }
      />

      <UsageHistoryChart siteId={siteId} />
    </SettingCard>
  )

  return (
    <div>
      <PageTitle title={t("navFeatures")} Icon={FeaturesIcon} />
      <p className="settings-page-desc">{t("featuresPageDesc")}</p>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ========== 标签页 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.TAB_SETTINGS && (
        <>
          {/* 标签页行为卡片 */}
          <SettingCard title={t("tabBehaviorTitle")}>
            <ToggleRow
              label={t("openNewTabLabel")}
              description={t("openNewTabDesc")}
              settingId="tab-open-new"
              checked={settings.tab?.openInNewTab ?? true}
              onChange={() =>
                updateNestedSetting("tab", "openInNewTab", !settings.tab?.openInNewTab)
              }
            />

            <ToggleRow
              label={t("autoRenameTabLabel")}
              description={t("autoRenameTabDesc")}
              settingId="tab-auto-rename"
              checked={settings.tab?.autoRename ?? false}
              onChange={() => updateNestedSetting("tab", "autoRename", !settings.tab?.autoRename)}
            />

            <SettingRow
              label={t("renameIntervalLabel")}
              settingId="tab-rename-interval"
              disabled={!settings.tab?.autoRename}
              onDisabledClick={() => showPrerequisiteToast(autoRenameLabel)}>
              <select
                className="settings-select"
                value={settings.tab?.renameInterval || 3}
                onChange={(e) =>
                  updateNestedSetting("tab", "renameInterval", parseInt(e.target.value))
                }
                disabled={!settings.tab?.autoRename}>
                {[1, 3, 5, 10, 30, 60].map((v) => (
                  <option key={v} value={v}>
                    {formatSecondsOptionLabel(v)}
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              label={t("titleFormatLabel")}
              description={t("titleFormatDesc")}
              settingId="tab-title-format"
              disabled={!settings.tab?.autoRename}
              onDisabledClick={() => showPrerequisiteToast(autoRenameLabel)}>
              <PlaceholderInput
                value={settings.tab?.titleFormat ?? "{status}{title}"}
                onChange={(val) => updateNestedSetting("tab", "titleFormat", val)}
                placeholders={["{status}", "{title}", "{model}"]}
                placeholder="{status}{title}"
                disabled={!settings.tab?.autoRename}
                style={{ width: "260px" }}
              />
            </SettingRow>

            <ToggleRow
              label={t("showStatusLabel")}
              description={t("showStatusDesc")}
              settingId="tab-show-status"
              checked={settings.tab?.showStatus ?? true}
              onChange={() => updateNestedSetting("tab", "showStatus", !settings.tab?.showStatus)}
            />

            <ToggleRow
              label={t("hideStatusWhenReadLabel")}
              description={t("hideStatusWhenReadDesc")}
              settingId="tab-hide-status-when-read"
              disabled={!settings.tab?.showStatus}
              onDisabledClick={() => showPrerequisiteToast(showStatusLabel)}
              checked={settings.tab?.hideStatusWhenRead ?? false}
              onChange={() =>
                updateNestedSetting("tab", "hideStatusWhenRead", !settings.tab?.hideStatusWhenRead)
              }
            />
          </SettingCard>

          {/* 隐私模式卡片 */}
          <SettingCard title={t("privacyModeTitle")}>
            <ToggleRow
              label={t("privacyModeLabel")}
              description={t("privacyModeDesc")}
              settingId="tab-privacy-mode"
              checked={settings.tab?.privacyMode ?? false}
              onChange={() => updateNestedSetting("tab", "privacyMode", !settings.tab?.privacyMode)}
            />

            <SettingRow
              label={t("privacyTitleLabel")}
              settingId="tab-privacy-title"
              disabled={!settings.tab?.privacyMode}
              onDisabledClick={() => showPrerequisiteToast(privacyModeLabel)}>
              <input
                type="text"
                className="settings-input"
                value={settings.tab?.privacyTitle || "Google"}
                onChange={(e) => updateNestedSetting("tab", "privacyTitle", e.target.value)}
                placeholder="Google"
                disabled={!settings.tab?.privacyMode}
                style={{ width: "180px" }}
              />
            </SettingRow>
          </SettingCard>
        </>
      )}

      {/* ========== 提醒 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.REMINDER && (
        <>
          {notificationSettingsCard}
          {usageMonitorCard}
        </>
      )}

      {/* ========== 大纲 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.OUTLINE && (
        <>
          <SettingCard title={t("outlineSettings")} description={t("outlineSettingsDesc")}>
            <ToggleRow
              label={t("outlineAutoUpdateLabel")}
              description={t("outlineAutoUpdateDesc")}
              settingId="outline-auto-update"
              checked={settings.features?.outline?.autoUpdate ?? true}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "outline",
                  "autoUpdate",
                  !settings.features?.outline?.autoUpdate,
                )
              }
            />

            <SettingRow
              label={t("outlineUpdateIntervalLabel")}
              description={t("outlineUpdateIntervalDesc")}
              settingId="outline-update-interval">
              <NumberInput
                value={settings.features?.outline?.updateInterval ?? 2}
                onChange={(val) => updateDeepSetting("features", "outline", "updateInterval", val)}
                min={1}
                max={60}
                defaultValue={2}
                style={{ width: "80px" }}
              />
            </SettingRow>

            <SettingRow
              label={t("outlineFollowModeLabel")}
              description={
                settings.features?.outline?.followMode === "current"
                  ? t("outlineFollowCurrentDesc")
                  : settings.features?.outline?.followMode === "latest"
                    ? t("outlineFollowLatestDesc")
                    : t("outlineFollowManualDesc")
              }
              settingId="outline-follow-mode">
              <select
                className="settings-select"
                value={settings.features?.outline?.followMode || "current"}
                onChange={(e) =>
                  updateDeepSetting(
                    "features",
                    "outline",
                    "followMode",
                    e.target.value as "current" | "latest" | "manual",
                  )
                }>
                <option value="current">{t("outlineFollowCurrent")}</option>
                <option value="latest">{t("outlineFollowLatest")}</option>
                <option value="manual">{t("outlineFollowManual")}</option>
              </select>
            </SettingRow>

            <ToggleRow
              label={t("outlineShowWordCountLabel")}
              description={t("outlineShowWordCountDesc")}
              settingId="outline-show-word-count"
              checked={settings.features?.outline?.showWordCount ?? false}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "outline",
                  "showWordCount",
                  !settings.features?.outline?.showWordCount,
                )
              }
            />
          </SettingCard>

          {/* 收藏图标设置卡片 */}
          <SettingCard title={t("bookmarkSettings")} description={t("bookmarkSettingsDesc")}>
            <SettingRow
              label={t("inlineBookmarkModeLabel")}
              description={t("inlineBookmarkModeDesc")}
              settingId="outline-inline-bookmark-mode">
              <select
                className="settings-select"
                value={settings.features?.outline?.inlineBookmarkMode || "always"}
                onChange={(e) =>
                  updateDeepSetting(
                    "features",
                    "outline",
                    "inlineBookmarkMode",
                    e.target.value as "always" | "hover" | "hidden",
                  )
                }>
                <option value="always">{t("inlineBookmarkModeAlways")}</option>
                <option value="hover">{t("inlineBookmarkModeHover")}</option>
                <option value="hidden">{t("inlineBookmarkModeHidden")}</option>
              </select>
            </SettingRow>

            <SettingRow
              label={t("panelBookmarkModeLabel")}
              description={t("panelBookmarkModeDesc")}
              settingId="outline-panel-bookmark-mode">
              <select
                className="settings-select"
                value={settings.features?.outline?.panelBookmarkMode || "always"}
                onChange={(e) =>
                  updateDeepSetting(
                    "features",
                    "outline",
                    "panelBookmarkMode",
                    e.target.value as "always" | "hover" | "hidden",
                  )
                }>
                <option value="always">{t("inlineBookmarkModeAlways")}</option>
                <option value="hover">{t("inlineBookmarkModeHover")}</option>
                <option value="hidden">{t("inlineBookmarkModeHidden")}</option>
              </select>
            </SettingRow>
          </SettingCard>

          {/* 滚动设置卡片 */}
          <SettingCard title={t("scrollSettings")}>
            <ToggleRow
              label={t("preventAutoScrollLabel")}
              description={t("preventAutoScrollDesc")}
              settingId="outline-prevent-auto-scroll"
              checked={settings.panel?.preventAutoScroll ?? false}
              onChange={() =>
                updateNestedSetting(
                  "panel",
                  "preventAutoScroll",
                  !settings.panel?.preventAutoScroll,
                )
              }
            />
          </SettingCard>
        </>
      )}

      {/* ========== 会话 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.CONVERSATIONS && (
        <>
          <SettingCard
            title={t("conversationsSettingsTitle")}
            description={t("conversationsSettingsDesc")}>
            <ToggleRow
              label={t("folderRainbowLabel")}
              description={t("folderRainbowDesc")}
              settingId="conversation-folder-rainbow"
              checked={settings.features?.conversations?.folderRainbow ?? true}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "conversations",
                  "folderRainbow",
                  !settings.features?.conversations?.folderRainbow,
                )
              }
            />

            <ToggleRow
              label={t("conversationsSyncUnpinLabel")}
              description={t("conversationsSyncUnpinDesc")}
              settingId="conversation-sync-unpin"
              checked={settings.features?.conversations?.syncUnpin ?? false}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "conversations",
                  "syncUnpin",
                  !settings.features?.conversations?.syncUnpin,
                )
              }
            />
            <ToggleRow
              label={t("conversationsSyncDeleteLabel")}
              description={t("conversationsSyncDeleteDesc")}
              settingId="conversation-sync-delete"
              checked={settings.features?.conversations?.syncDelete ?? true}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "conversations",
                  "syncDelete",
                  !(settings.features?.conversations?.syncDelete ?? true),
                )
              }
            />
          </SettingCard>

          {/* 导出设置卡片 */}
          <SettingCard title={t("exportSettings")}>
            <SettingRow
              label={t("exportPackagingLabel")}
              description={t("exportPackagingDesc")}
              settingId="export-packaging">
              <SelectDropdown
                className="settings-select-dropdown"
                buttonClassName="settings-select"
                options={exportPackagingOptions}
                value={exportPackaging}
                ariaLabel={t("exportPackagingLabel")}
                onChange={(value) =>
                  updateNestedSetting("export", "packaging", value as ExportPackaging)
                }
              />
            </SettingRow>

            <ToggleRow
              label={t("exportFilenameTimestamp")}
              description={t("exportFilenameTimestampDesc")}
              settingId="export-filename-timestamp"
              checked={settings.export?.exportFilenameTimestamp ?? false}
              onChange={() =>
                updateNestedSetting(
                  "export",
                  "exportFilenameTimestamp",
                  !settings.export?.exportFilenameTimestamp,
                )
              }
            />

            <ToggleRow
              label={t("exportIncludeThoughtsLabel")}
              description={t("exportIncludeThoughtsDesc")}
              settingId="export-include-thoughts"
              checked={settings.export?.includeThoughts ?? true}
              onChange={() =>
                updateNestedSetting(
                  "export",
                  "includeThoughts",
                  !(settings.export?.includeThoughts ?? true),
                )
              }
            />

            <SettingRow
              label={t("exportCustomUserName")}
              description={t("exportCustomUserNameDesc")}
              settingId="export-custom-user-name">
              <LazyInput
                className="settings-input"
                value={settings.export?.customUserName || ""}
                onChange={(val) => updateNestedSetting("export", "customUserName", val)}
                placeholder="User"
                style={{ width: "180px" }}
              />
            </SettingRow>

            <SettingRow
              label={t("exportCustomModelName")}
              description={t("exportCustomModelNameDesc")}
              settingId="export-custom-model-name">
              <LazyInput
                className="settings-input"
                value={settings.export?.customModelName || ""}
                onChange={(val) => updateNestedSetting("export", "customModelName", val)}
                placeholder="Site Name"
                style={{ width: "180px" }}
              />
            </SettingRow>
          </SettingCard>
        </>
      )}
      {/* ========== Prompt Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.PROMPTS && (
        <>
          <SettingCard title={t("promptSettingsTitle")} description={t("promptSettingsDesc")}>
            <ToggleRow
              label={t("promptDoubleClickSendLabel")}
              description={t("promptDoubleClickSendDesc")}
              settingId="prompt-double-click-send"
              checked={settings.features?.prompts?.doubleClickToSend ?? false}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "prompts",
                  "doubleClickToSend",
                  !settings.features?.prompts?.doubleClickToSend,
                )
              }
            />

            <SettingRow
              label={t("promptSubmitShortcutLabel")}
              description={t("promptSubmitShortcutDesc")}
              settingId="shortcuts-prompt-submit-shortcut">
              <select
                className="settings-select"
                value={settings.features?.prompts?.submitShortcut ?? "enter"}
                onChange={(e) =>
                  updateDeepSetting("features", "prompts", "submitShortcut", e.target.value)
                }>
                <option value="enter">{t("promptSubmitShortcutEnter")}</option>
                <option value="ctrlEnter">{t("promptSubmitShortcutCtrlEnter")}</option>
              </select>
            </SettingRow>

            <ToggleRow
              label={t("queueSettingLabel")}
              description={t("queueSettingDesc")}
              settingId="prompt-queue"
              checked={settings.features?.prompts?.promptQueue ?? false}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "prompts",
                  "promptQueue",
                  !(settings.features?.prompts?.promptQueue ?? false),
                )
              }
            />
          </SettingCard>

          <SettingCard
            title={t("quickQuoteSettingsTitle")}
            description={t("quickQuoteSettingsDesc")}>
            <ToggleRow
              label={t("quickQuoteEnabledLabel")}
              description={t("quickQuoteEnabledDesc")}
              settingId="prompt-quick-quote-enabled"
              checked={settings.features?.prompts?.quickQuoteEnabled ?? true}
              onChange={() =>
                updateDeepSetting(
                  "features",
                  "prompts",
                  "quickQuoteEnabled",
                  !(settings.features?.prompts?.quickQuoteEnabled ?? true),
                )
              }
            />
          </SettingCard>
        </>
      )}

      {/* ========== Reading History Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.READING_HISTORY && (
        <SettingCard title={t("readingHistoryTitle")} description={t("readingHistoryDesc")}>
          <ToggleRow
            label={t("readingHistoryPersistenceLabel")}
            description={t("readingHistoryPersistenceDesc")}
            settingId="reading-history-persistence"
            checked={settings.readingHistory?.persistence ?? true}
            onChange={() =>
              updateNestedSetting(
                "readingHistory",
                "persistence",
                !settings.readingHistory?.persistence,
              )
            }
          />

          <ToggleRow
            label={t("readingHistoryAutoRestoreLabel")}
            description={t("readingHistoryAutoRestoreDesc")}
            settingId="reading-history-auto-restore"
            checked={settings.readingHistory?.autoRestore ?? true}
            disabled={!settings.readingHistory?.persistence}
            onDisabledClick={() => showPrerequisiteToast(readingHistoryLabel)}
            onChange={() =>
              updateNestedSetting(
                "readingHistory",
                "autoRestore",
                !settings.readingHistory?.autoRestore,
              )
            }
          />

          <SettingRow
            label={t("readingHistoryCleanup")}
            settingId="reading-history-cleanup-days"
            disabled={!settings.readingHistory?.persistence}
            onDisabledClick={() => showPrerequisiteToast(readingHistoryLabel)}>
            <select
              className="settings-select"
              value={settings.readingHistory?.cleanupDays || 30}
              onChange={(e) =>
                updateNestedSetting("readingHistory", "cleanupDays", parseInt(e.target.value))
              }
              disabled={!settings.readingHistory?.persistence}>
              <option value={1}>1 {t("day")}</option>
              <option value={3}>3 {t("days")}</option>
              <option value={7}>7 {t("days")}</option>
              <option value={30}>30 {t("days")}</option>
              <option value={90}>90 {t("days")}</option>
              <option value={-1}>{t("forever")}</option>
            </select>
          </SettingRow>
        </SettingCard>
      )}

      {/* ========== 内容交互 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.CONTENT && (
        <SettingCard title={t("interactionEnhance")} description={t("interactionEnhanceDesc")}>
          <ToggleRow
            label={t("assistantMermaidLabel")}
            description={t("assistantMermaidDesc")}
            settingId="content-assistant-mermaid"
            checked={settings.content?.assistantMermaid ?? true}
            onChange={() =>
              updateNestedSetting(
                "content",
                "assistantMermaid",
                !(settings.content?.assistantMermaid ?? true),
              )
            }
          />

          <ToggleRow
            label={t("userQueryMarkdownLabel")}
            description={t("userQueryMarkdownDesc")}
            settingId="content-user-query-markdown"
            checked={settings.content?.userQueryMarkdown ?? true}
            onChange={() =>
              updateNestedSetting(
                "content",
                "userQueryMarkdown",
                !(settings.content?.userQueryMarkdown ?? true),
              )
            }
          />

          <ToggleRow
            label={t("formulaCopyLabel")}
            description={t("formulaCopyDesc")}
            settingId="content-formula-copy"
            checked={settings.content?.formulaCopy ?? true}
            onChange={() =>
              updateNestedSetting("content", "formulaCopy", !settings.content?.formulaCopy)
            }
          />

          <SettingRow
            label={t("formulaCopyFormatLabel")}
            description={t("formulaCopyFormatDesc")}
            settingId="content-formula-copy-format"
            disabled={!settings.content?.formulaCopy}
            onDisabledClick={() => showPrerequisiteToast(formulaCopyLabel)}>
            <SelectDropdown
              className="settings-select-dropdown"
              buttonClassName="settings-select"
              options={formulaCopyFormatOptions}
              value={formulaCopyFormat}
              ariaLabel={t("formulaCopyFormatLabel")}
              disabled={!settings.content?.formulaCopy}
              onChange={(value) =>
                updateNestedSetting("content", "formulaCopyFormat", value as FormulaCopyFormat)
              }
            />
          </SettingRow>

          <ToggleRow
            label={t("formulaDelimiterLabel")}
            description={t("formulaDelimiterDesc")}
            settingId="content-formula-delimiter"
            checked={settings.content?.formulaDelimiter ?? true}
            disabled={!settings.content?.formulaCopy || formulaCopyFormat !== "latex"}
            onDisabledClick={showFormulaDelimiterPrerequisiteToast}
            onChange={() =>
              updateNestedSetting(
                "content",
                "formulaDelimiter",
                !settings.content?.formulaDelimiter,
              )
            }
          />

          <ToggleRow
            label={t("tableCopyLabel")}
            description={t("tableCopyDesc")}
            settingId="content-table-copy"
            checked={settings.content?.tableCopy ?? true}
            onChange={() =>
              updateNestedSetting("content", "tableCopy", !settings.content?.tableCopy)
            }
          />
        </SettingCard>
      )}
    </div>
  )
}

export default FeaturesPage
