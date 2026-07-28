import React from "react"

import { GlobeIcon } from "~components/icons"
import { SITE_ICONS } from "~constants/site-icons"

interface PlatformIconProps {
  name: string
  size?: number
  className?: string
}

export const PlatformIcon: React.FC<PlatformIconProps> = ({ name, size = 16, className = "" }) => {
  const icon = SITE_ICONS[name]

  if (!icon) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{ display: "inline-flex", flex: "0 0 auto" }}>
        <GlobeIcon size={size} />
      </span>
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{
        display: "block",
        flex: "0 0 auto",
      }}>
      <image href={icon} x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid meet" />
    </svg>
  )
}
