import React, { useState } from "react"

import { SITE_ICONS } from "~constants/site-icons"

interface PlatformIconProps {
  /** 结构化子集而非完整 SupportedAiPlatform：只传 name/faviconUrl 即可获得 favicon → 首字母回退链。 */
  platform: {
    name: string
    icon?: string
    faviconUrl?: string
  }
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
        ...(fallbackClassName
          ? {}
          : { fontSize: Math.round(size * 0.75), fontWeight: 600, lineHeight: 1 }),
      }}>
      {platform.icon || Array.from(platform.name.trim())[0]?.toUpperCase() || "?"}
    </span>
  )
}
