import React, { useEffect, useRef } from "react"

import { CheckIcon } from "~components/icons"
import { OPHEL_ESCAPE_LAYER_PROPS } from "~utils/dom-toolkit"
import { t } from "~utils/i18n"

export const LANG_MAP: Record<string, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  ru: "Русский",
  ja: "日本語",
  de: "Deutsch",
  fr: "Français",
  ko: "한국어",
}

const getMenuItems = (menu: HTMLElement | null): HTMLButtonElement[] =>
  Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])

interface LanguageMenuProps {
  currentLang: string
  onSelect: (lang: string) => void
  onClose: () => void
  /** 关闭后焦点回到的按钮 */
  restoreFocusRef: React.RefObject<HTMLElement>
  /** 打开菜单的按钮：它们自己负责开关，按下时不算「点到菜单外」 */
  triggerRefs: ReadonlyArray<React.RefObject<HTMLElement>>
}

/**
 * 侧栏底部的语言菜单：渲染在侧栏内（不 portal），颜色跟随主题变量；
 * 打开后焦点进入菜单，支持方向键 / Home / End 切换，Esc 关闭并回到触发按钮
 */
export const LanguageMenu: React.FC<LanguageMenuProps> = ({
  currentLang,
  onSelect,
  onClose,
  restoreFocusRef,
  triggerRefs,
}) => {
  const menuRef = useRef<HTMLDivElement>(null)
  // 只在打开时把焦点移到当前语言，之后切换语言不再抢焦点
  const initialLangRef = useRef(currentLang)

  useEffect(() => {
    const items = getMenuItems(menuRef.current)
    const currentItem =
      items.find((item) => item.dataset.lang === initialLangRef.current) ?? items[0]
    currentItem?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const path = event.composedPath()
      if (menuRef.current && path.includes(menuRef.current)) return
      if (triggerRefs.some((ref) => ref.current && path.includes(ref.current))) return
      onClose()
    }

    window.addEventListener("pointerdown", handlePointerDown, true)
    return () => window.removeEventListener("pointerdown", handlePointerDown, true)
  }, [onClose, triggerRefs])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = getMenuItems(menuRef.current)
    const currentIndex = items.indexOf(event.target as HTMLButtonElement)
    const focusAt = (index: number) => {
      event.preventDefault()
      items[(index + items.length) % items.length]?.focus({ preventScroll: true })
    }

    switch (event.key) {
      case "ArrowDown":
        focusAt(currentIndex + 1)
        break
      case "ArrowUp":
        focusAt(currentIndex - 1)
        break
      case "Home":
        focusAt(0)
        break
      case "End":
        focusAt(items.length - 1)
        break
      case "Escape":
        event.preventDefault()
        onClose()
        restoreFocusRef.current?.focus({ preventScroll: true })
        break
      case "Tab":
        onClose()
        break
    }
  }

  return (
    <div
      ref={menuRef}
      className="settings-lang-menu"
      role="menu"
      aria-label={t("moreLanguages")}
      {...OPHEL_ESCAPE_LAYER_PROPS}
      onKeyDown={handleKeyDown}>
      {Object.entries(LANG_MAP).map(([lang, label]) => {
        const isActive = currentLang === lang
        return (
          <button
            key={lang}
            type="button"
            role="menuitemradio"
            aria-checked={isActive}
            tabIndex={-1}
            data-lang={lang}
            className={`settings-lang-menu-item${isActive ? " active" : ""}`}
            onClick={() => onSelect(lang)}>
            <span lang={lang}>{label}</span>
            {isActive ? <CheckIcon size={14} /> : null}
          </button>
        )
      })}
    </div>
  )
}
