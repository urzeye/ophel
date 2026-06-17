import React, { useEffect, useMemo, useRef } from "react"

import { createSanitizedSvgIconElement, sanitizeSvgIcon } from "~utils/svg-sanitizer"

interface SafeSvgMarkupProps {
  svg?: string
  className?: string
  fallback?: React.ReactNode
  title?: string
}

export const SafeSvgMarkup: React.FC<SafeSvgMarkupProps> = ({
  svg,
  className,
  fallback = null,
  title,
}) => {
  const hostRef = useRef<HTMLSpanElement>(null)
  const safeSvg = useMemo(() => sanitizeSvgIcon(svg || ""), [svg])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    host.replaceChildren()
    if (!safeSvg) return

    const svgElement = createSanitizedSvgIconElement(safeSvg, document)
    if (svgElement) host.replaceChildren(svgElement)
  }, [safeSvg])

  if (!safeSvg) return <>{fallback}</>

  return <span ref={hostRef} className={className} title={title} />
}
