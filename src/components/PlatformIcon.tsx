import React, { useState } from "react"

import type { SupportedAiPlatform } from "~constants/defaults"
import { SITE_ICONS } from "~constants/site-icons"

interface PlatformIconProps {
  platform: SupportedAiPlatform
  size?: number
  className?: string
  fallbackClassName?: string
}

export const PlatformIcon: React.FC<PlatformIconProps> = ({
  platform,
  size = 16,
  className = "",
  fallbackClassName,
}) => {
  const [failedFaviconUrl, setFailedFaviconUrl] = useState<string | null>(null)
  const embeddedIcon = SITE_ICONS[platform.name]

  if (embeddedIcon) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        className={className}
        style={{ display: "block", flex: "0 0 auto" }}>
        <image
          href={embeddedIcon}
          x="0"
          y="0"
          width="24"
          height="24"
          preserveAspectRatio="xMidYMid meet"
        />
      </svg>
    )
  }

  if (platform.faviconUrl && failedFaviconUrl !== platform.faviconUrl) {
    return (
      <img
        src={platform.faviconUrl}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={className}
        style={{ display: "block", flex: "0 0 auto", objectFit: "contain" }}
        onError={() => setFailedFaviconUrl(platform.faviconUrl ?? null)}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={fallbackClassName ?? className}
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        ...(fallbackClassName ? {} : { fontSize: size, lineHeight: 1 }),
      }}>
      {platform.icon || Array.from(platform.name.trim())[0]?.toUpperCase() || "?"}
    </span>
  )
}
