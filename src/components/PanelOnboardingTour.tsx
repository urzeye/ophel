import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { ConversationIcon, OutlineIcon, PromptIcon, SettingsIcon } from "~components/icons"
import { SparkleIcon } from "~components/icons/SparkleIcon"
import { t } from "~utils/i18n"

interface TourStep {
  icon: React.ComponentType<{ size?: number }>
  titleKey: string
  descKey: string
  /** 高亮目标选择器（在 Shadow Root 内查询）；目标不存在时整步跳过 */
  targetSelector: string
  /** 进入该步时真实点击目标（仅 tab 步骤），让面板切到被讲解的内容区 */
  activateTarget?: boolean
}

// 步骤即面板的核心区域：三个 tab + 头部设置入口
const TOUR_STEPS: TourStep[] = [
  {
    icon: OutlineIcon,
    titleKey: "onboardingTourOutlineTitle",
    descKey: "onboardingTourOutlineDesc",
    targetSelector: "#gh-panel-tab-outline",
    activateTarget: true,
  },
  {
    icon: ConversationIcon,
    titleKey: "onboardingTourConversationsTitle",
    descKey: "onboardingTourConversationsDesc",
    targetSelector: "#gh-panel-tab-conversations",
    activateTarget: true,
  },
  {
    icon: PromptIcon,
    titleKey: "onboardingTourPromptsTitle",
    descKey: "onboardingTourPromptsDesc",
    targetSelector: "#gh-panel-tab-prompts",
    activateTarget: true,
  },
  {
    icon: SettingsIcon,
    titleKey: "onboardingTourSettingsTitle",
    descKey: "onboardingTourSettingsDesc",
    // 快捷悬浮岛也有 settings-btn，必须限定在面板头部
    targetSelector: '.gh-main-panel [data-tip-target="settings-btn"]',
  },
]

const SPOTLIGHT_PADDING = 8
const CARD_WIDTH = 320
const CARD_GAP = 12
const VIEWPORT_MARGIN = 12
const EXIT_DURATION_MS = 320

type QueryRoot = Document | ShadowRoot

/**
 * 首装全屏导览：蒙层压暗整个视口，聚光灯逐个高亮面板核心区域，
 * 气泡卡片跟随目标位置；欢迎页先行，tab 步骤会真实切换面板内容区，
 * 退出时恢复原 tab。完成、跳过、Esc 均经退场动画后走 onExit（注册表永久记录）。
 * 导览期间蒙层拦截全部页面交互，避免误触造成状态错乱。
 */
export const PanelOnboardingTour: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const overlayRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryButtonRef = useRef<HTMLButtonElement>(null)
  // 进入导览时激活的 tab，退出时恢复，不留副作用
  const originalTabRef = useRef<Element | null>(null)
  // 步进方向驱动内容横移入场；初始 none 不给欢迎页强加滑入
  const dirRef = useRef<"fwd" | "back" | "none">("none")
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [steps, setSteps] = useState<TourStep[] | null>(null)
  const [started, setStarted] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [exiting, setExiting] = useState(false)
  // undefined = 尚未测量；null = 已测量但目标消失
  const [spotRect, setSpotRect] = useState<DOMRect | null | undefined>(undefined)
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null)

  const queryTarget = useCallback((selector: string): Element | null => {
    const root = overlayRef.current?.getRootNode() as QueryRoot | null
    return root?.querySelector(selector) ?? null
  }, [])

  // 统一出口：先播「释放页面」退场动画再真正退出；reduced-motion 下立即退出。
  // exitTimerRef 兼作幂等锁，退场期间重复触发（连点、Esc）不会二次计时
  const requestExit = useCallback(() => {
    if (exitTimerRef.current !== null) return
    setExiting(true)
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    exitTimerRef.current = setTimeout(onExit, reduce ? 0 : EXIT_DURATION_MS)
  }, [onExit])

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current)
    }
  }, [])

  // 挂载后按目标存在性过滤步骤（站点能力差异会隐藏个别 tab）；
  // 全部缺失时直接退出，不留蒙层
  useLayoutEffect(() => {
    originalTabRef.current = queryTarget('.gh-panel-tab-btn[aria-selected="true"]')
    const available = TOUR_STEPS.filter((step) => queryTarget(step.targetSelector) !== null)
    if (available.length === 0) {
      onExit()
      return
    }
    setSteps(available)
  }, [onExit, queryTarget])

  // 卸载即恢复初始 tab：覆盖完成/跳过/Esc/面板关闭等全部退出路径
  useEffect(() => {
    return () => {
      const original = originalTabRef.current
      if (original instanceof HTMLElement && original.getAttribute("aria-selected") !== "true") {
        original.click()
      }
    }
  }, [])

  // 每步测量高亮目标位置；窗口尺寸变化时重测。
  // tab 步骤同步真实切换到对应内容区，讲解与蒙层下露出的内容保持一致
  useLayoutEffect(() => {
    if (!steps || !started) return
    const step = steps[stepIndex]
    const target = queryTarget(step.targetSelector)
    if (
      step.activateTarget &&
      target instanceof HTMLElement &&
      target.getAttribute("aria-selected") !== "true"
    ) {
      target.click()
    }
    const measure = () => {
      const el = queryTarget(step.targetSelector)
      setSpotRect(el ? el.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [steps, started, stepIndex, queryTarget])

  // 目标中途消失（如布局切换）：前进到下一步，已是最后一步则退出
  useEffect(() => {
    if (steps && spotRect === null) {
      if (stepIndex < steps.length - 1) {
        dirRef.current = "fwd"
        setStepIndex(stepIndex + 1)
      } else {
        requestExit()
      }
    }
  }, [steps, spotRect, stepIndex, requestExit])

  // 卡片定位：欢迎页居中；步骤态跟随目标，默认放目标下方，
  // 空间不足翻转到上方，水平随目标居中并夹取在视口内
  useLayoutEffect(() => {
    if (!steps) return
    const place = () => {
      // 实测卡片宽度，避免盒模型/窄视口 max-width 导致右缘夹取失准
      const cardWidth = cardRef.current?.offsetWidth ?? CARD_WIDTH
      const cardHeight = cardRef.current?.offsetHeight ?? 180
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      if (!started || !spotRect) {
        setCardPos({
          top: Math.max(VIEWPORT_MARGIN, (viewportHeight - cardHeight) / 2),
          left: Math.max(VIEWPORT_MARGIN, (viewportWidth - cardWidth) / 2),
        })
        return
      }

      let top = spotRect.bottom + CARD_GAP
      if (top + cardHeight > viewportHeight - VIEWPORT_MARGIN) {
        top = Math.max(VIEWPORT_MARGIN, spotRect.top - CARD_GAP - cardHeight)
      }
      const targetCenterX = spotRect.left + spotRect.width / 2
      const left = Math.min(
        Math.max(targetCenterX - cardWidth / 2, VIEWPORT_MARGIN),
        viewportWidth - cardWidth - VIEWPORT_MARGIN,
      )
      setCardPos({ top, left })
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [steps, started, spotRect, stepIndex])

  // 每步把焦点交给主按钮，键盘用户可直接回车推进
  useEffect(() => {
    primaryButtonRef.current?.focus()
  }, [started, stepIndex])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      requestExit()
    }
  }

  const goNext = () => {
    dirRef.current = "fwd"
    if (!started) {
      setStarted(true)
      return
    }
    if (isLastStep) {
      requestExit()
      return
    }
    setStepIndex(stepIndex + 1)
  }

  const goPrev = () => {
    dirRef.current = "back"
    if (stepIndex === 0) {
      setStarted(false)
      return
    }
    setStepIndex(stepIndex - 1)
  }

  const step = started && steps ? steps[stepIndex] : undefined
  const isLastStep = steps ? stepIndex === steps.length - 1 : false
  const StepIcon = step?.icon

  return (
    <div
      ref={overlayRef}
      className={`gh-tour-overlay${exiting ? " is-exiting" : ""}${started ? "" : " is-welcome"}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("onboardingTourAriaLabel")}
      onKeyDown={handleKeyDown}>
      {started && step && spotRect && (
        <div
          className="gh-tour-spotlight"
          style={{
            top: spotRect.top - SPOTLIGHT_PADDING,
            left: spotRect.left - SPOTLIGHT_PADDING,
            width: spotRect.width + SPOTLIGHT_PADDING * 2,
            height: spotRect.height + SPOTLIGHT_PADDING * 2,
          }}>
          {/* key 驱动重挂载：每步到位播放一次「锁定」扩散环 */}
          <div key={stepIndex} className="gh-tour-spotlight-ping" />
        </div>
      )}

      {steps && (
        <div
          ref={cardRef}
          className="gh-onboarding-tour"
          style={{
            top: cardPos?.top ?? 0,
            left: cardPos?.left ?? 0,
            visibility: cardPos ? "visible" : "hidden",
          }}>
          <div
            key={started ? stepIndex : -1}
            className={`gh-onboarding-tour-step${started ? "" : " is-welcome"}`}
            data-dir={dirRef.current}>
            {!started ? (
              <>
                <span className="gh-onboarding-tour-logo" aria-hidden="true">
                  <SparkleIcon size={24} />
                </span>
                <h3 className="gh-onboarding-tour-title gh-onboarding-tour-title-welcome">
                  {t("onboardingTourWelcomeTitle")}
                </h3>
                <p className="gh-onboarding-tour-desc">{t("onboardingTourWelcomeDesc")}</p>
              </>
            ) : step && StepIcon ? (
              <>
                <div className="gh-onboarding-tour-head">
                  <span className="gh-onboarding-tour-icon" aria-hidden="true">
                    <StepIcon size={16} />
                  </span>
                  <h3 className="gh-onboarding-tour-title">{t(step.titleKey)}</h3>
                </div>
                <p className="gh-onboarding-tour-desc">{t(step.descKey)}</p>
              </>
            ) : null}
          </div>

          <div className="gh-onboarding-tour-footer">
            {started ? (
              <div
                className="gh-onboarding-tour-dots"
                role="img"
                aria-label={t("onboardingTourStepOf", {
                  current: stepIndex + 1,
                  total: steps.length,
                })}>
                {steps.map((tourStep, index) => (
                  <span
                    key={tourStep.titleKey}
                    className={`gh-onboarding-tour-dot${index === stepIndex ? " active" : ""}`}
                  />
                ))}
              </div>
            ) : (
              <span />
            )}
            <div className="gh-onboarding-tour-actions">
              <button
                type="button"
                className="gh-onboarding-tour-btn"
                disabled={exiting}
                onClick={requestExit}>
                {t("onboardingTourSkip")}
              </button>
              {started && (
                <button
                  type="button"
                  className="gh-onboarding-tour-btn"
                  disabled={exiting}
                  onClick={goPrev}>
                  {t("onboardingTourPrev")}
                </button>
              )}
              <button
                type="button"
                ref={primaryButtonRef}
                className={`gh-onboarding-tour-btn gh-onboarding-tour-btn-primary${started && isLastStep ? " is-final" : ""}`}
                disabled={exiting}
                onClick={goNext}>
                {!started
                  ? t("onboardingTourStart")
                  : isLastStep
                    ? t("onboardingTourDone")
                    : t("onboardingTourNext")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
