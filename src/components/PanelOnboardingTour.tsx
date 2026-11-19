import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { ConversationIcon, OutlineIcon, PromptIcon, SettingsIcon } from "~components/icons"
import { t } from "~utils/i18n"

interface TourStep {
  icon: React.ComponentType<{ size?: number }>
  titleKey: string
  descKey: string
  /** 高亮目标选择器（在 Shadow Root 内查询）；目标不存在时整步跳过 */
  targetSelector: string
}

// 步骤即面板的核心区域：三个 tab + 头部设置入口
const TOUR_STEPS: TourStep[] = [
  {
    icon: OutlineIcon,
    titleKey: "onboardingTourOutlineTitle",
    descKey: "onboardingTourOutlineDesc",
    targetSelector: "#gh-panel-tab-outline",
  },
  {
    icon: ConversationIcon,
    titleKey: "onboardingTourConversationsTitle",
    descKey: "onboardingTourConversationsDesc",
    targetSelector: "#gh-panel-tab-conversations",
  },
  {
    icon: PromptIcon,
    titleKey: "onboardingTourPromptsTitle",
    descKey: "onboardingTourPromptsDesc",
    targetSelector: "#gh-panel-tab-prompts",
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
const CARD_WIDTH = 300
const CARD_GAP = 12
const VIEWPORT_MARGIN = 12

type QueryRoot = Document | ShadowRoot

/**
 * 首装全屏导览：蒙层压暗整个视口，聚光灯逐个高亮面板核心区域，
 * 气泡卡片跟随目标位置。完成、跳过、Esc 均走 onExit（注册表永久记录）。
 * 导览期间蒙层拦截全部页面交互，避免误触造成状态错乱。
 */
export const PanelOnboardingTour: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const overlayRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryButtonRef = useRef<HTMLButtonElement>(null)
  const [steps, setSteps] = useState<TourStep[] | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  // undefined = 尚未测量；null = 已测量但目标消失
  const [spotRect, setSpotRect] = useState<DOMRect | null | undefined>(undefined)
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null)

  const queryTarget = useCallback((selector: string): Element | null => {
    const root = overlayRef.current?.getRootNode() as QueryRoot | null
    return root?.querySelector(selector) ?? null
  }, [])

  // 挂载后按目标存在性过滤步骤（站点能力差异会隐藏个别 tab）；
  // 全部缺失时直接退出，不留蒙层
  useLayoutEffect(() => {
    const available = TOUR_STEPS.filter((step) => queryTarget(step.targetSelector) !== null)
    if (available.length === 0) {
      onExit()
      return
    }
    setSteps(available)
  }, [onExit, queryTarget])

  // 每步测量高亮目标位置；窗口尺寸变化时重测
  useLayoutEffect(() => {
    if (!steps) return
    const selector = steps[stepIndex].targetSelector
    const measure = () => {
      const target = queryTarget(selector)
      setSpotRect(target ? target.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [steps, stepIndex, queryTarget])

  // 目标中途消失（如布局切换）：前进到下一步，已是最后一步则退出
  useEffect(() => {
    if (steps && spotRect === null) {
      if (stepIndex < steps.length - 1) {
        setStepIndex(stepIndex + 1)
      } else {
        onExit()
      }
    }
  }, [steps, spotRect, stepIndex, onExit])

  // 气泡卡片跟随目标：默认放目标下方，空间不足翻转到上方，水平随目标居中并夹取在视口内
  useLayoutEffect(() => {
    if (!spotRect) return
    // 实测卡片宽度，避免盒模型/窄视口 max-width 导致右缘夹取失准
    const cardWidth = cardRef.current?.offsetWidth ?? CARD_WIDTH
    const cardHeight = cardRef.current?.offsetHeight ?? 160
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

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
  }, [spotRect, stepIndex])

  // 每步把焦点交给主按钮，键盘用户可直接回车推进
  useEffect(() => {
    primaryButtonRef.current?.focus()
  }, [stepIndex])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      onExit()
    }
  }

  const step = steps?.[stepIndex]
  const isLastStep = steps ? stepIndex === steps.length - 1 : true
  const StepIcon = step?.icon

  return (
    <div
      ref={overlayRef}
      className="gh-tour-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("onboardingTourAriaLabel")}
      onKeyDown={handleKeyDown}>
      {steps && step && spotRect && (
        <div
          className="gh-tour-spotlight"
          style={{
            top: spotRect.top - SPOTLIGHT_PADDING,
            left: spotRect.left - SPOTLIGHT_PADDING,
            width: spotRect.width + SPOTLIGHT_PADDING * 2,
            height: spotRect.height + SPOTLIGHT_PADDING * 2,
          }}
        />
      )}

      {steps && step && StepIcon && (
        <div
          ref={cardRef}
          className="gh-onboarding-tour"
          style={{
            top: cardPos?.top ?? 0,
            left: cardPos?.left ?? 0,
            visibility: cardPos ? "visible" : "hidden",
          }}>
          <div className="gh-onboarding-tour-header">
            <span className="gh-onboarding-tour-icon" aria-hidden="true">
              <StepIcon size={16} />
            </span>
            <h3 className="gh-onboarding-tour-title">{t(step.titleKey)}</h3>
            <button
              type="button"
              className="gh-onboarding-tour-btn gh-onboarding-tour-btn-ghost"
              onClick={onExit}>
              {t("onboardingTourSkip")}
            </button>
          </div>

          <div className="gh-onboarding-tour-body" key={stepIndex}>
            <p className="gh-onboarding-tour-desc">{t(step.descKey)}</p>
          </div>

          <div className="gh-onboarding-tour-footer">
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
            <div className="gh-onboarding-tour-actions">
              {stepIndex > 0 && (
                <button
                  type="button"
                  className="gh-onboarding-tour-btn gh-onboarding-tour-btn-ghost"
                  onClick={() => setStepIndex(stepIndex - 1)}>
                  {t("onboardingTourPrev")}
                </button>
              )}
              <button
                type="button"
                ref={primaryButtonRef}
                className="gh-onboarding-tour-btn gh-onboarding-tour-btn-primary"
                onClick={() => (isLastStep ? onExit() : setStepIndex(stepIndex + 1))}>
                {isLastStep ? t("onboardingTourDone") : t("onboardingTourNext")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
