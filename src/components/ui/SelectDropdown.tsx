import React, { useEffect, useMemo, useRef, useState } from "react"

import { ChevronDownIcon } from "~components/icons"
import { OPHEL_ESCAPE_LAYER_PROPS, OPHEL_INTERACTION_LAYER_PROPS } from "~utils/dom-toolkit"
import { t } from "~utils/i18n"

import { Tooltip } from "./Tooltip"

export interface SelectDropdownOption {
  value: string
  label: React.ReactNode
  title?: string
  disabled?: boolean
  /** 仅显示在菜单项右侧的次要说明（如分类），不会出现在按钮上 */
  description?: string
  /** 搜索匹配用的文本；缺省时使用 string 类型的 label */
  searchText?: string
}

export interface SelectDropdownProps {
  options: SelectDropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: React.ReactNode
  menuHeader?: React.ReactNode
  disabled?: boolean
  emptyText?: React.ReactNode
  maxMenuHeight?: number
  className?: string
  buttonClassName?: string
  menuClassName?: string
  optionClassName?: string
  ariaLabel?: string
  /** 显式覆盖按钮的悬浮提示；传 null 可关闭（例如外层已有自定义 Tooltip 时避免双提示） */
  buttonTitle?: string | null
  onOpenChange?: (open: boolean) => void
  /** 在菜单顶部显示搜索框，按 label / searchText / description 过滤选项（选项很多时使用） */
  searchable?: boolean
  searchPlaceholder?: string
}

const getComposedPath = (event: Event): EventTarget[] => {
  const composedPath = (event as Event & { composedPath?: () => EventTarget[] }).composedPath
  if (typeof composedPath === "function") {
    return composedPath.call(event)
  }
  return []
}

export const SelectDropdown: React.FC<SelectDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder,
  menuHeader,
  disabled = false,
  emptyText,
  maxMenuHeight = 260,
  className,
  buttonClassName,
  menuClassName,
  optionClassName,
  ariaLabel,
  buttonTitle,
  onOpenChange,
  searchable = false,
  searchPlaceholder,
}) => {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [query, setQuery] = useState("")

  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  )

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null

  // 搜索只影响菜单里显示哪些选项；按钮上的已选项始终取自完整的 options
  const visibleOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!searchable || !keyword) return options

    return options.filter((option) => {
      const text = option.searchText ?? (typeof option.label === "string" ? option.label : "")
      return `${text} ${option.description ?? ""}`.toLowerCase().includes(keyword)
    })
  }, [options, query, searchable])

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return

    const selectedVisibleIndex = visibleOptions.findIndex((option) => option.value === value)
    setActiveIndex(
      selectedVisibleIndex >= 0
        ? selectedVisibleIndex
        : visibleOptions.findIndex((option) => !option.disabled),
    )
  }, [open, visibleOptions, value])

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus({ preventScroll: true })
  }, [open, searchable])

  // 菜单是绝对定位的：放在带滚动的容器里（如弹窗内容区）时，下半截可能落在可视区域之外。
  // 展开时把整个菜单滚进可视区域，不需要用户再手动滚动才能看全选项
  useEffect(() => {
    if (open) menuRef.current?.scrollIntoView({ block: "nearest" })
  }, [open])

  useEffect(() => {
    if (!open || activeIndex < 0) return

    const option = optionRefs.current[activeIndex]
    option?.scrollIntoView({ block: "nearest" })
  }, [open, activeIndex])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (!root) return

      const path = getComposedPath(event)
      if (path.length > 0) {
        if (!path.includes(root)) {
          setOpen(false)
        }
        return
      }

      const target = event.target as Node | null
      if (target && !root.contains(target)) {
        setOpen(false)
      }
    }

    const handleWindowBlur = () => {
      setOpen(false)
    }

    window.addEventListener("pointerdown", handlePointerDown, true)
    window.addEventListener("blur", handleWindowBlur)

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true)
      window.removeEventListener("blur", handleWindowBlur)
    }
  }, [open])

  const closeDropdown = (focusButton: boolean) => {
    setOpen(false)
    if (!focusButton) return

    window.requestAnimationFrame(() => {
      buttonRef.current?.focus({ preventScroll: true })
    })
  }

  const getNextEnabledIndex = (start: number, direction: 1 | -1): number => {
    if (visibleOptions.length === 0) return -1

    let index = start
    for (let i = 0; i < visibleOptions.length; i += 1) {
      index += direction
      if (index >= visibleOptions.length) index = 0
      if (index < 0) index = visibleOptions.length - 1
      if (!visibleOptions[index]?.disabled) return index
    }

    return -1
  }

  const selectAtIndex = (index: number) => {
    const option = visibleOptions[index]
    if (!option || option.disabled) return

    onChange(option.value)
    closeDropdown(true)
  }

  const handleButtonKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (disabled) return

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()

      if (!open) {
        setOpen(true)
        return
      }

      const next = getNextEnabledIndex(
        activeIndex < 0 ? selectedIndex : activeIndex,
        event.key === "ArrowDown" ? 1 : -1,
      )
      if (next >= 0) setActiveIndex(next)
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      setOpen((previous) => !previous)
      return
    }

    if (event.key === "Escape" && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  const handleMenuKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      const next = getNextEnabledIndex(activeIndex, 1)
      if (next >= 0) setActiveIndex(next)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      const next = getNextEnabledIndex(activeIndex, -1)
      if (next >= 0) setActiveIndex(next)
      return
    }

    // 带搜索框时，Home / End 留给输入框移动光标
    if (event.key === "Home" && !searchable) {
      event.preventDefault()
      const first = visibleOptions.findIndex((option) => !option.disabled)
      if (first >= 0) setActiveIndex(first)
      return
    }

    if (event.key === "End" && !searchable) {
      event.preventDefault()
      const reversedIndex = [...visibleOptions].reverse().findIndex((option) => !option.disabled)
      if (reversedIndex >= 0) {
        setActiveIndex(visibleOptions.length - reversedIndex - 1)
      }
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      if (activeIndex >= 0) {
        selectAtIndex(activeIndex)
      }
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      closeDropdown(true)
      return
    }

    if (event.key === "Tab") {
      closeDropdown(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className={className}
      {...(open ? OPHEL_ESCAPE_LAYER_PROPS : {})}
      style={{
        position: "relative",
        width: "100%",
      }}>
      <Tooltip
        content={buttonTitle === undefined ? selectedOption?.title ?? "" : buttonTitle || ""}
        disabled={buttonTitle === undefined ? !selectedOption?.title : !buttonTitle}
        triggerStyle={{ display: "flex", width: "100%" }}>
        <button
          ref={buttonRef}
          type="button"
          className={buttonClassName}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => !disabled && setOpen((previous) => !previous)}
          onKeyDown={handleButtonKeyDown}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            textAlign: "left",
          }}>
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}>
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDownIcon
            size={16}
            style={{
              flexShrink: 0,
              transition: "transform 0.2s ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
      </Tooltip>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          tabIndex={-1}
          className={menuClassName}
          {...OPHEL_INTERACTION_LAYER_PROPS}
          onKeyDown={handleMenuKeyDown}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: `${maxMenuHeight}px`,
            overflowY: "auto",
            // 滚动到列表边缘时阻止滚动链到下层页面
            overscrollBehavior: "contain",
            zIndex: 100,
            borderRadius: "8px",
            border: "1px solid var(--gh-input-border, #d1d5db)",
            boxShadow: "var(--gh-shadow-md, 0 8px 16px rgba(0,0,0,0.12))",
            background: "var(--gh-bg, #ffffff)",
            padding: "4px",
          }}>
          {menuHeader && (
            <div
              role="presentation"
              aria-hidden="true"
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                padding: "5px 10px 4px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.02em",
                color: "var(--gh-text-secondary, #6b7280)",
                background: "var(--gh-bg, #ffffff)",
                userSelect: "none",
              }}>
              {menuHeader}
            </div>
          )}
          {searchable && (
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                padding: "2px 0 6px",
                background: "var(--gh-bg, #ffffff)",
              }}>
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={(event) => {
                  event.target.style.borderColor = "var(--gh-primary, #4285f4)"
                }}
                onBlur={(event) => {
                  event.target.style.borderColor = "var(--gh-input-border, #d1d5db)"
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  height: "30px",
                  padding: "0 8px",
                  border: "1px solid var(--gh-input-border, #d1d5db)",
                  borderRadius: "6px",
                  background: "var(--gh-input-bg, var(--gh-bg, #ffffff))",
                  color: "var(--gh-text, #1f2937)",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
            </div>
          )}
          {visibleOptions.length === 0 ? (
            <div
              style={{
                padding: "8px 10px",
                color: "var(--gh-text-secondary, #6b7280)",
                fontSize: "13px",
                textAlign: "left",
              }}>
              {emptyText || t("selectNoOptions")}
            </div>
          ) : (
            visibleOptions.map((option, index) => {
              const isSelected = option.value === value
              const isActive = index === activeIndex

              return (
                <Tooltip
                  key={option.value}
                  content={option.title ?? ""}
                  disabled={!option.title}
                  triggerStyle={{ display: "flex", width: "100%" }}>
                  <button
                    ref={(element) => {
                      optionRefs.current[index] = element
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={optionClassName}
                    disabled={option.disabled}
                    onMouseEnter={() => {
                      if (!option.disabled) {
                        setActiveIndex(index)
                      }
                    }}
                    onClick={() => selectAtIndex(index)}
                    style={{
                      width: "100%",
                      border: "none",
                      borderRadius: "6px",
                      padding: "7px 10px",
                      textAlign: "left",
                      background: isSelected
                        ? "var(--gh-border-active, #3b82f6)"
                        : isActive
                          ? "var(--gh-hover, #f3f4f6)"
                          : "transparent",
                      color: isSelected
                        ? "var(--gh-text-on-primary, #ffffff)"
                        : "var(--gh-text, #1f2937)",
                      cursor: option.disabled ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "14px",
                      lineHeight: 1.4,
                    }}>
                    {option.description ? (
                      <>
                        <span
                          style={{
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                          {option.label}
                        </span>
                        <span
                          style={{
                            flexShrink: 0,
                            maxWidth: "40%",
                            marginLeft: "auto",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: "12px",
                            opacity: 0.7,
                          }}>
                          {option.description}
                        </span>
                      </>
                    ) : (
                      option.label
                    )}
                  </button>
                </Tooltip>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default SelectDropdown
