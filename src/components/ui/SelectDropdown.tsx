import React, { useEffect, useMemo, useRef, useState } from "react"

import { ChevronDownIcon } from "~components/icons"

export interface SelectDropdownOption {
  value: string
  label: React.ReactNode
  title?: string
  disabled?: boolean
}

export interface SelectDropdownProps {
  options: SelectDropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: React.ReactNode
  disabled?: boolean
  emptyText?: React.ReactNode
  maxMenuHeight?: number
  className?: string
  buttonClassName?: string
  menuClassName?: string
  optionClassName?: string
  ariaLabel?: string
  onOpenChange?: (open: boolean) => void
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
  disabled = false,
  emptyText,
  maxMenuHeight = 260,
  className,
  buttonClassName,
  menuClassName,
  optionClassName,
  ariaLabel,
  onOpenChange,
}) => {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  )

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return

    const initialIndex =
      selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled)
    setActiveIndex(initialIndex)
  }, [open, options, selectedIndex])

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
    if (options.length === 0) return -1

    let index = start
    for (let i = 0; i < options.length; i += 1) {
      index += direction
      if (index >= options.length) index = 0
      if (index < 0) index = options.length - 1
      if (!options[index]?.disabled) return index
    }

    return -1
  }

  const selectAtIndex = (index: number) => {
    const option = options[index]
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

    if (event.key === "Home") {
      event.preventDefault()
      const first = options.findIndex((option) => !option.disabled)
      if (first >= 0) setActiveIndex(first)
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      const reversedIndex = [...options].reverse().findIndex((option) => !option.disabled)
      if (reversedIndex >= 0) {
        setActiveIndex(options.length - reversedIndex - 1)
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
      style={{
        position: "relative",
        width: "100%",
      }}>
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
        title={selectedOption?.title}
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

      {open && (
        <div
          role="listbox"
          tabIndex={-1}
          className={menuClassName}
          onKeyDown={handleMenuKeyDown}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: `${maxMenuHeight}px`,
            overflowY: "auto",
            zIndex: 100,
            borderRadius: "8px",
            border: "1px solid var(--gh-input-border, #d1d5db)",
            boxShadow: "var(--gh-shadow-md, 0 8px 16px rgba(0,0,0,0.12))",
            background: "var(--gh-bg, #ffffff)",
            padding: "4px",
          }}>
          {options.length === 0 ? (
            <div
              style={{
                padding: "8px 10px",
                color: "var(--gh-text-tertiary, #9ca3af)",
                fontSize: "13px",
                textAlign: "left",
              }}>
              {emptyText || "No options"}
            </div>
          ) : (
            options.map((option, index) => {
              const isSelected = option.value === value
              const isActive = index === activeIndex

              return (
                <button
                  key={option.value}
                  ref={(element) => {
                    optionRefs.current[index] = element
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={optionClassName}
                  disabled={option.disabled}
                  title={option.title}
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
                    color: isSelected ? "#ffffff" : "var(--gh-text, #1f2937)",
                    cursor: option.disabled ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "14px",
                    lineHeight: 1.4,
                  }}>
                  {option.label}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default SelectDropdown
