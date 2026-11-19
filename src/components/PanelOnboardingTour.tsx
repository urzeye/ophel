import { useEffect, useRef, useState } from "react"

import { ConversationIcon, OutlineIcon, PromptIcon, SettingsIcon } from "~components/icons"
import { t } from "~utils/i18n"

interface TourStep {
  icon: React.ComponentType<{ size?: number }>
  titleKey: string
  descKey: string
}

// 步骤即面板的核心区域：三个 tab + 头部设置入口
const TOUR_STEPS: TourStep[] = [
  {
    icon: OutlineIcon,
    titleKey: "onboardingTourOutlineTitle",
    descKey: "onboardingTourOutlineDesc",
  },
  {
    icon: ConversationIcon,
    titleKey: "onboardingTourConversationsTitle",
    descKey: "onboardingTourConversationsDesc",
  },
  {
    icon: PromptIcon,
    titleKey: "onboardingTourPromptsTitle",
    descKey: "onboardingTourPromptsDesc",
  },
  {
    icon: SettingsIcon,
    titleKey: "onboardingTourSettingsTitle",
    descKey: "onboardingTourSettingsDesc",
  },
]

/**
 * 首装面板导览卡片：锚定在面板底部，逐条介绍面板核心区域。
 * 完成、跳过、Esc 均走 onExit（注册表永久记录，不再展示）。
 */
export const PanelOnboardingTour: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [stepIndex, setStepIndex] = useState(0)
  const primaryButtonRef = useRef<HTMLButtonElement>(null)
  const step = TOUR_STEPS[stepIndex]
  const isLastStep = stepIndex === TOUR_STEPS.length - 1
  const StepIcon = step.icon

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

  return (
    <div
      className="gh-onboarding-tour"
      role="dialog"
      aria-modal="false"
      aria-label={t("onboardingTourAriaLabel")}
      onKeyDown={handleKeyDown}>
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
            total: TOUR_STEPS.length,
          })}>
          {TOUR_STEPS.map((tourStep, index) => (
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
  )
}
