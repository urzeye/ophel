/**
 * 功能模块页面
 * 包含：标签页、提醒、内容处理、大纲、会话、模型锁定、阅读历史
 * 使用顶部 Tab 切换
 */
import React, { useCallback, useEffect, useState } from "react"

import { FeaturesIcon } from "~components/icons"
import { Button, NumberInput } from "~components/ui"
import { FEATURES_TAB_IDS, NOTIFICATION_SOUND_PRESETS, SITE_IDS } from "~constants"
import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { MSG_CHECK_PERMISSIONS, MSG_REQUEST_PERMISSIONS, sendToBackground } from "~utils/messaging"
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
      { id: "all", label: t("usageMonitorChartSiteAll") || "全部站点" },
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
      { id: SITE_IDS.QWENAI, label: "QwenAI" },
      { id: SITE_IDS.ZAI, label: "Z.ai" },
    ],
    [],
  )

  const selectedSiteLabel =
    siteOptions.find((site) => site.id === selectedSiteId)?.label ||
    t("usageMonitorChartSiteAll") ||
    "全部站点"

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
      ? t("usageMonitorChartMetricRequest") || "请求 Tokens"
      : metric === "roundTripTokens"
        ? t("usageMonitorChartMetricRoundTrip") || "往返 Tokens"
        : metric === "loadedConversationTokens"
          ? t("usageMonitorChartMetricConversation") || "已加载对话 Tokens"
          : metric === "loadedOutputTokens"
            ? t("usageMonitorChartMetricOutput") || "输出 Tokens"
            : t("usageMonitorChartMetricCount") || "次数"
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
            {t("usageMonitorChartTitle") || "历史统计曲线"}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--gh-text-secondary, #6b7280)",
              marginTop: "4px",
            }}>
            {t("usageMonitorChartDesc") ||
              "基于本地记录的发送事件聚合，可按小时、天、月查看次数或粗估 Tokens。"}
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
              {t("usageMonitorChartSiteLabel") || "统计站点"}
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
                ["hour", t("usageMonitorChartHour") || "小时"],
                ["day", t("usageMonitorChartDay") || "天"],
                ["month", t("usageMonitorChartMonth") || "月"],
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
                ["count", t("usageMonitorChartMetricCount") || "次数"],
                ["requestTokens", t("usageMonitorChartMetricRequest") || "请求 Tokens"],
                ["roundTripTokens", t("usageMonitorChartMetricRoundTrip") || "往返 Tokens"],
                [
                  "loadedConversationTokens",
                  t("usageMonitorChartMetricConversation") || "已加载对话 Tokens",
                ],
                ["loadedOutputTokens", t("usageMonitorChartMetricOutput") || "输出 Tokens"],
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
          <span>{t("usageMonitorChartCurrentSite") || "当前统计站点"}: </span>
          <strong style={{ color: "var(--gh-text, #374151)" }}>{selectedSiteLabel}</strong>
        </div>
        <div style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)" }}>
          <span>MAX: </span>
          <strong style={{ color: "var(--gh-text, #374151)" }}>{maxValue}</strong>
        </div>
        <div style={{ fontSize: "12px", color: "var(--gh-text-secondary, #6b7280)" }}>
          <span>{t("usageMonitorChartScrollHint") || "可左右滚动查看完整时间轴"}</span>
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
              {t("usageMonitorChartEmpty") || "暂无统计数据"}
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
                {hoveredDelta} {t("usageMonitorChartDelta") || "较上一桶"}
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "6px 10px",
                fontSize: "12px",
              }}>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMetricCount") || "次数"}
              </span>
              <strong>{hoveredBucket.count}</strong>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMetricRequest") || "请求 Tokens"}
              </span>
              <strong>{hoveredBucket.requestTokens}</strong>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMetricRoundTrip") || "往返 Tokens"}
              </span>
              <strong>{hoveredBucket.roundTripTokens}</strong>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMetricConversation") || "已加载对话 Tokens"}
              </span>
              <strong>{hoveredBucket.loadedConversationTokens}</strong>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMetricOutput") || "输出 Tokens"}
              </span>
              <strong>{hoveredBucket.loadedOutputTokens}</strong>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMaxConversation") || "最大单次已加载对话"}
              </span>
              <strong>{hoveredBucket.maxLoadedConversationTokens}</strong>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMaxRequest") || "最大单次请求"}
              </span>
              <strong>{hoveredBucket.maxRequestTokens}</strong>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMaxRoundTrip") || "最大单次往返"}
              </span>
              <strong>{hoveredBucket.maxRoundTripTokens}</strong>
              <span style={{ color: chartColors.axis }}>
                {t("usageMonitorChartMaxOutput") || "最大单次输出"}
              </span>
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
    { id: FEATURES_TAB_IDS.OUTLINE, label: t("tabOutline") || "大纲" },
    { id: FEATURES_TAB_IDS.CONVERSATIONS, label: t("tabConversations") || "会话" },
    { id: FEATURES_TAB_IDS.PROMPTS, label: t("tabPrompts") || "Prompts" },
    { id: FEATURES_TAB_IDS.TAB_SETTINGS, label: t("tabSettingsTab") || "标签页" },
    { id: FEATURES_TAB_IDS.REMINDER, label: t("reminderTab") || "提醒" },
    { id: FEATURES_TAB_IDS.CONTENT, label: t("navContent") || "内容交互" },
    { id: FEATURES_TAB_IDS.READING_HISTORY, label: t("readingHistoryTitle") || "阅读历史" },
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

  const prerequisiteToastTemplate = t("enablePrerequisiteToast") || "请先开启「{setting}」"
  const showPrerequisiteToast = (label: string) =>
    showToastThrottled(prerequisiteToastTemplate.replace("{setting}", label), 2000, {}, 1500, label)
  const autoRenameLabel = t("autoRenameTabLabel") || "自动重命名"
  const showNotificationLabel = t("showNotificationLabel") || "桌面通知"
  const privacyModeLabel = t("privacyModeLabel") || "隐私模式"
  const readingHistoryLabel = t("readingHistoryPersistenceLabel") || "启用阅读历史"
  const formulaCopyLabel = t("formulaCopyLabel") || "双击复制公式"
  const hasMultipleNotificationSoundPresets = NOTIFICATION_SOUND_PRESETS.length > 1
  const formatSecondsOptionLabel = (value: number) =>
    t("secondsValueLabel", { val: String(value) }) || `${value} 秒`
  const formatRepeatCountOptionLabel = (value: number) => `${value}x`
  const previewSoundButtonLabel = t("notificationSoundPreviewButtonLabel") || "试听"
  const playNotificationSoundPreview = (presetId?: string) => {
    const targetPresetId =
      presetId || settings.tab?.notificationSoundPreset || NOTIFICATION_SOUND_PRESETS[0].id
    const sourceUrl = platform.getNotificationSoundUrl(targetPresetId)

    if (!sourceUrl) {
      showToast(t("notificationSoundPreviewFailed") || "提示音试听失败", 2000)
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
      showToast(t("notificationSoundPreviewFailed") || "提示音试听失败", 2000)
    }

    setIsPreviewPlaying(true)
    previewAudio.play().catch(() => {
      clearPreviewAudioHandlers()
      setIsPreviewPlaying(false)
      showToast(t("notificationSoundPreviewFailed") || "提示音试听失败", 2000)
    })
  }
  const notificationSettingsCard = (
    <SettingCard title={t("notificationSettings") || "完成后操作"}>
      <ToggleRow
        label={t("showNotificationLabel") || "桌面通知"}
        description={t("showNotificationDesc") || "生成完成时发送桌面通知"}
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
            // 1. 检查是否已有权限
            const response = await sendToBackground({
              type: MSG_CHECK_PERMISSIONS,
              permissions: ["notifications"],
            })

            if (response.success && response.hasPermission) {
              updateNestedSetting("tab", "showNotification", true)
            } else {
              // 2. 请求权限 (打开独立窗口)
              await sendToBackground({
                type: MSG_REQUEST_PERMISSIONS,
                permType: "notifications",
              })
              showToast(t("permissionRequestToast") || "请在弹出的窗口中授予权限", 3000)
            }
          } else {
            updateNestedSetting("tab", "showNotification", false)
          }
        }}
      />

      <ToggleRow
        label={t("notificationSoundLabel") || "通知声音"}
        description={t("notificationSoundDesc") || "生成完成时播放提示音"}
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
          label={t("notificationSoundPresetLabel") || "提示音预设"}
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
                  {t(preset.labelKey) || preset.fallback}
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
        label={t("notificationVolumeLabel") || "声音音量"}
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
        label={t("notificationRepeatCountLabel") || "播放次数"}
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
        label={t("notificationRepeatIntervalLabel") || "播放间隔"}
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
        label={t("notifyWhenFocusedLabel") || "前台时也通知"}
        description={t("notifyWhenFocusedDesc") || "窗口在前台时也发送通知"}
        settingId="tab-notify-when-focused"
        checked={settings.tab?.notifyWhenFocused ?? false}
        disabled={!settings.tab?.showNotification}
        onDisabledClick={() => showPrerequisiteToast(showNotificationLabel)}
        onChange={() =>
          updateNestedSetting("tab", "notifyWhenFocused", !settings.tab?.notifyWhenFocused)
        }
      />

      <ToggleRow
        label={t("autoFocusLabel") || "自动置顶窗口"}
        description={t("autoFocusDesc") || "生成完成后自动激活窗口"}
        settingId="tab-auto-focus"
        checked={settings.tab?.autoFocus ?? false}
        onChange={() => updateNestedSetting("tab", "autoFocus", !settings.tab?.autoFocus)}
      />
    </SettingCard>
  )
  const usageMonitorCard = (
    <SettingCard
      title={t("usageMonitorSettingsTitle") || "高级模型本地计数与预估"}
      description={
        t("usageMonitorSettingsDesc") ||
        "在输入框附近显示本地发送计数、阈值进度和粗略 Token 预估，不影响站点原有发送逻辑"
      }>
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
        <div>
          {t("usageMonitorExplainLocalOnly") ||
            "说明：这是纯本地估算能力。插件不会读取官方剩余额度，也不会知道服务端真实剩余次数。"}
        </div>
        <div>
          {t("usageMonitorExplainNoBackend") ||
            "行为：仅在本地存储里记录计数，并在页面输入区附近展示面板；不会额外改写站点后端状态。"}
        </div>
        <div>
          {t("usageMonitorExplainReset") ||
            "归零：平台实际额度重置时间可能不是固定 00:00。自动归零默认关闭，建议在平台真实重置后手动清零校准。"}
        </div>
      </div>

      <ToggleRow
        label={t("usageMonitorEnabledLabel") || "启用高级模型对话本地计数与预估"}
        description={
          t("usageMonitorEnabledDesc") || "通过本地计数和输入框附近的轻量面板，辅助估算当日使用情况"
        }
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
        {t("usageMonitorExplainRender") ||
          "面板会显示在当前输入区上方并为正文预留空间；如果开启后出现渲染异常，请刷新页面即可。"}
      </div>

      <SettingRow
        label={t("usageMonitorDailyLimitLabel") || "每日对话次数预估上限"}
        description={
          t("usageMonitorDailyLimitDesc") || "用于计算 80% / 100% 阈值提醒，仅为本地估算值"
        }
        settingId="usage-monitor-daily-limit"
        disabled={!(settings.usageMonitor?.enabled ?? false)}
        onDisabledClick={() =>
          showPrerequisiteToast(t("usageMonitorEnabledLabel") || "启用高级模型对话本地计数与预估")
        }>
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
        label={t("usageMonitorAutoResetLabel") || "启用自动归零"}
        description={
          t("usageMonitorAutoResetDesc") ||
          "实验性：按本地日期切换自动归零。由于平台实际重置时间可能变化，默认关闭。"
        }
        settingId="usage-monitor-auto-reset"
        checked={settings.usageMonitor?.autoResetEnabled ?? false}
        disabled={!(settings.usageMonitor?.enabled ?? false)}
        onDisabledClick={() =>
          showPrerequisiteToast(t("usageMonitorEnabledLabel") || "启用高级模型对话本地计数与预估")
        }
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
      <PageTitle title={t("navFeatures") || "功能模块"} Icon={FeaturesIcon} />
      <p className="settings-page-desc">{t("featuresPageDesc") || "配置扩展的各项功能模块"}</p>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ========== 标签页 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.TAB_SETTINGS && (
        <>
          {/* 标签页行为卡片 */}
          <SettingCard title={t("tabBehaviorTitle") || "标签页行为"}>
            <ToggleRow
              label={t("openNewTabLabel") || "新标签页打开"}
              description={t("openNewTabDesc") || "在新标签页中打开新对话"}
              settingId="tab-open-new"
              checked={settings.tab?.openInNewTab ?? true}
              onChange={() =>
                updateNestedSetting("tab", "openInNewTab", !settings.tab?.openInNewTab)
              }
            />

            <ToggleRow
              label={t("autoRenameTabLabel") || "自动重命名"}
              description={t("autoRenameTabDesc") || "根据对话内容自动更新标签页标题"}
              settingId="tab-auto-rename"
              checked={settings.tab?.autoRename ?? false}
              onChange={() => updateNestedSetting("tab", "autoRename", !settings.tab?.autoRename)}
            />

            <SettingRow
              label={t("renameIntervalLabel") || "检测频率"}
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
              label={t("titleFormatLabel") || "标题格式"}
              description={t("titleFormatDesc") || "支持占位符：{status}、{title}、{model}"}
              settingId="tab-title-format"
              disabled={!settings.tab?.autoRename}
              onDisabledClick={() => showPrerequisiteToast(autoRenameLabel)}>
              <input
                type="text"
                className="settings-input"
                value={settings.tab?.titleFormat || "{status}{title}"}
                onChange={(e) => updateNestedSetting("tab", "titleFormat", e.target.value)}
                placeholder="{status}{title}"
                disabled={!settings.tab?.autoRename}
                style={{ width: "180px" }}
              />
            </SettingRow>

            <ToggleRow
              label={t("showStatusLabel") || "显示生成状态"}
              description={t("showStatusDesc") || "在标签页标题中显示生成状态"}
              settingId="tab-show-status"
              checked={settings.tab?.showStatus ?? true}
              onChange={() => updateNestedSetting("tab", "showStatus", !settings.tab?.showStatus)}
            />
          </SettingCard>

          {/* 隐私模式卡片 */}
          <SettingCard title={t("privacyModeTitle") || "隐私模式"}>
            <ToggleRow
              label={t("privacyModeLabel") || "启用隐私模式"}
              description={t("privacyModeDesc") || "使用伪装标题隐藏真实内容"}
              settingId="tab-privacy-mode"
              checked={settings.tab?.privacyMode ?? false}
              onChange={() => updateNestedSetting("tab", "privacyMode", !settings.tab?.privacyMode)}
            />

            <SettingRow
              label={t("privacyTitleLabel") || "伪装标题"}
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
          <SettingCard
            title={t("outlineSettings") || "大纲设置"}
            description={t("outlineSettingsDesc") || "配置大纲生成和跟随行为"}>
            <ToggleRow
              label={t("outlineAutoUpdateLabel") || "自动更新"}
              description={t("outlineAutoUpdateDesc") || "在对话进行时自动刷新大纲"}
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
              label={t("outlineUpdateIntervalLabel") || "更新检测间隔"}
              description={t("outlineUpdateIntervalDesc") || "大纲自动更新的时间间隔（秒）"}
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
              label={t("outlineFollowModeLabel") || "大纲跟随模式"}
              description={
                settings.features?.outline?.followMode === "current"
                  ? t("outlineFollowCurrentDesc") || "滚动页面时自动定位高亮大纲项"
                  : settings.features?.outline?.followMode === "latest"
                    ? t("outlineFollowLatestDesc") || "大纲始终自动滚动到底部"
                    : t("outlineFollowManualDesc") || "不自动滚动大纲"
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
                <option value="current">{t("outlineFollowCurrent") || "跟随当前位置"}</option>
                <option value="latest">{t("outlineFollowLatest") || "跟随最新消息"}</option>
                <option value="manual">{t("outlineFollowManual") || "手动控制"}</option>
              </select>
            </SettingRow>

            <ToggleRow
              label={t("outlineShowWordCountLabel") || "悬浮显示字数"}
              description={t("outlineShowWordCountDesc") || "在大纲悬浮提示中显示该章节的字数"}
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
          <SettingCard
            title={t("bookmarkSettings") || "收藏"}
            description={t("bookmarkSettingsDesc") || "配置页内收藏功能"}>
            <SettingRow
              label={t("inlineBookmarkModeLabel") || "页内收藏图标"}
              description={t("inlineBookmarkModeDesc") || "控制页面标题旁的收藏图标显示方式"}
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
                <option value="always">{t("inlineBookmarkModeAlways") || "固定显示"}</option>
                <option value="hover">{t("inlineBookmarkModeHover") || "悬浮显示"}</option>
                <option value="hidden">{t("inlineBookmarkModeHidden") || "隐藏"}</option>
              </select>
            </SettingRow>

            <SettingRow
              label={t("panelBookmarkModeLabel") || "面板收藏图标"}
              description={t("panelBookmarkModeDesc") || "控制大纲面板中的收藏图标显示方式"}
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
                <option value="always">{t("inlineBookmarkModeAlways") || "固定显示"}</option>
                <option value="hover">{t("inlineBookmarkModeHover") || "悬浮显示"}</option>
                <option value="hidden">{t("inlineBookmarkModeHidden") || "隐藏"}</option>
              </select>
            </SettingRow>
          </SettingCard>

          {/* 滚动设置卡片 */}
          <SettingCard title={t("scrollSettings") || "滚动设置"}>
            <ToggleRow
              label={t("preventAutoScrollLabel") || "防止自动滚动"}
              description={t("preventAutoScrollDesc") || "阻止页面自动滚动到底部"}
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
            title={t("conversationsSettingsTitle") || "会话管理"}
            description={t("conversationsSettingsDesc") || "配置会话同步和显示行为"}>
            <ToggleRow
              label={t("folderRainbowLabel") || "文件夹彩虹色"}
              description={t("folderRainbowDesc") || "为不同文件夹使用不同颜色"}
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
              label={t("conversationsSyncUnpinLabel") || "同步时取消置顶"}
              description={t("conversationsSyncUnpinDesc") || "同步会话时自动取消置顶"}
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
              label={t("conversationsSyncDeleteLabel") || "Sync Delete Cloud"}
              description={
                t("conversationsSyncDeleteDesc") ||
                "Delete cloud conversation on supported sites when deleting local record"
              }
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
          <SettingCard title={t("exportSettings") || "导出设置"}>
            <SettingRow
              label={t("exportCustomUserName") || "自定义用户名称"}
              description={t("exportCustomUserNameDesc") || "导出时使用的用户显示名称 (默认: User)"}
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
              label={t("exportCustomModelName") || "自定义 AI 名称"}
              description={
                t("exportCustomModelNameDesc") || "导出时使用的 AI 显示名称 (默认: 站点名称)"
              }
              settingId="export-custom-model-name">
              <LazyInput
                className="settings-input"
                value={settings.export?.customModelName || ""}
                onChange={(val) => updateNestedSetting("export", "customModelName", val)}
                placeholder="Site Name"
                style={{ width: "180px" }}
              />
            </SettingRow>

            <ToggleRow
              label={t("exportFilenameTimestamp") || "导出文件名包含时间戳"}
              description={t("exportFilenameTimestampDesc") || "在导出文件名末尾添加时间戳"}
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
              label={t("exportIncludeThoughtsLabel") || "导出包含思维链"}
              description={t("exportIncludeThoughtsDesc") || "导出时包含并自动展开思维链内容"}
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

            <ToggleRow
              label={t("exportImagesToBase64Label") || "导出时图片转 Base64"}
              description={t("exportImagesToBase64Desc") || "导出会话时将图片转为 Base64 嵌入"}
              settingId="export-images-base64"
              checked={settings.content?.exportImagesToBase64 ?? false}
              onChange={() =>
                updateNestedSetting(
                  "content",
                  "exportImagesToBase64",
                  !settings.content?.exportImagesToBase64,
                )
              }
            />
          </SettingCard>
        </>
      )}
      {/* ========== Prompt Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.PROMPTS && (
        <SettingCard
          title={t("promptSettingsTitle") || "Prompts Settings"}
          description={t("promptSettingsDesc") || "Configure interactions in the prompts tab"}>
          <ToggleRow
            label={t("promptDoubleClickSendLabel") || "Double-click to send prompt"}
            description={
              t("promptDoubleClickSendDesc") ||
              "When enabled, double-click sends the prompt directly. Prompts with variables are sent after confirmation."
            }
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

          <ToggleRow
            label={t("queueSettingLabel") || "Prompt Queue"}
            description={
              t("queueSettingDesc") ||
              "Show queue overlay above input for queuing prompts while AI generates"
            }
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
      )}

      {/* ========== Reading History Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.READING_HISTORY && (
        <SettingCard
          title={t("readingHistoryTitle") || "阅读历史"}
          description={t("readingHistoryDesc") || "记录和恢复会话阅读位置"}>
          <ToggleRow
            label={t("readingHistoryPersistenceLabel") || "启用阅读历史"}
            description={t("readingHistoryPersistenceDesc") || "记录每个会话的阅读位置"}
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
            label={t("readingHistoryAutoRestoreLabel") || "自动恢复位置"}
            description={t("readingHistoryAutoRestoreDesc") || "打开会话时自动跳转到上次阅读位置"}
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
            label={t("readingHistoryCleanup") || "历史保留时间"}
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
              <option value={1}>1 {t("day") || "天"}</option>
              <option value={3}>3 {t("days") || "天"}</option>
              <option value={7}>7 {t("days") || "天"}</option>
              <option value={30}>30 {t("days") || "天"}</option>
              <option value={90}>90 {t("days") || "天"}</option>
              <option value={-1}>{t("forever") || "永久"}</option>
            </select>
          </SettingRow>
        </SettingCard>
      )}

      {/* ========== 内容交互 Tab ========== */}
      {activeTab === FEATURES_TAB_IDS.CONTENT && (
        <SettingCard
          title={t("interactionEnhance") || "交互增强"}
          description={t("interactionEnhanceDesc") || "增强 Mermaid、公式和表格的交互功能"}>
          <ToggleRow
            label={t("assistantMermaidLabel") || "AI 回复 Mermaid 渲染"}
            description={
              t("assistantMermaidDesc") ||
              "为未原生支持 Mermaid 的站点自动渲染 AI 回复中的 Mermaid 图表"
            }
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
            label={t("userQueryMarkdownLabel") || "用户问题 Markdown 渲染"}
            description={t("userQueryMarkdownDesc") || "将用户输入的 Markdown 渲染为富文本"}
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
            label={t("formulaCopyLabel") || "双击复制公式"}
            description={t("formulaCopyDesc") || "双击数学公式即可复制其 LaTeX 源码"}
            settingId="content-formula-copy"
            checked={settings.content?.formulaCopy ?? true}
            onChange={() =>
              updateNestedSetting("content", "formulaCopy", !settings.content?.formulaCopy)
            }
          />

          <ToggleRow
            label={t("formulaDelimiterLabel") || "公式分隔符转换"}
            description={t("formulaDelimiterDesc") || "复制时将括号分隔符转为美元符号"}
            settingId="content-formula-delimiter"
            checked={settings.content?.formulaDelimiter ?? true}
            disabled={!settings.content?.formulaCopy}
            onDisabledClick={() => showPrerequisiteToast(formulaCopyLabel)}
            onChange={() =>
              updateNestedSetting(
                "content",
                "formulaDelimiter",
                !settings.content?.formulaDelimiter,
              )
            }
          />

          <ToggleRow
            label={t("tableCopyLabel") || "表格复制 Markdown"}
            description={t("tableCopyDesc") || "表格右上角添加复制按钮"}
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
