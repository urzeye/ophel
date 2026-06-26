import React from "react"

export const ChromeIcon: React.FC<{ size?: number; className?: string; color?: string }> = ({
  size = 24,
  className,
  color = "currentColor",
}) => (
  <svg width={size} height={size} viewBox="0 0 1024 1024" className={className} style={{ color }}>
    <path
      d="M123.648 178.346667C361.642667-98.602667 802.986667-43.946667 967.936 279.68h-396.501333c-71.424 0-117.546667-1.621333-167.509334 24.661333-58.709333 30.933333-102.997333 88.234667-118.485333 155.52L123.648 178.389333z"
      fill="#EA4335"
    />
    <path
      d="M341.674667 512c0 93.866667 76.330667 170.24 170.154666 170.24 93.866667 0 170.154667-76.373333 170.154667-170.24s-76.330667-170.24-170.154667-170.24c-93.866667 0-170.154667 76.373333-170.154666 170.24z"
      fill="#4285F4"
    />
    <path
      d="M577.877333 734.848c-95.530667 28.373333-207.274667-3.114667-268.501333-108.8-46.762667-80.64-170.24-295.765333-226.346667-393.557333-196.565333 301.226667-27.136 711.808 329.685334 781.866666l165.12-279.509333z"
      fill="#34A853"
    />
    <path
      d="M669.866667 341.76a233.130667 233.130667 0 0 1 43.008 286.634667c-40.576 69.973333-170.154667 288.682667-232.96 394.581333 367.658667 22.656 635.733333-337.664 514.645333-681.258667H669.866667z"
      fill="#FBBC05"
    />
  </svg>
)

export const FirefoxIcon: React.FC<{ size?: number; className?: string; color?: string }> = ({
  size = 24,
  className,
  color = "currentColor",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ color }}>
    <path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" />
  </svg>
)

export const GreasyForkIcon: React.FC<{ size?: number; className?: string; color?: string }> = ({
  size = 24,
  className,
  color = "currentColor",
}) => (
  <svg width={size} height={size} viewBox="0 0 1024 1024" className={className} style={{ color }}>
    <path
      d="M28.16 514.56c0 268.8 217.6 486.4 486.4 486.4s486.4-217.6 486.4-486.4-217.6-486.4-486.4-486.4-486.4 217.6-486.4 486.4z"
      fill={color}
    />
    <path
      d="M440.32 258.048c139.264 140.288 142.336 144.384 135.68 193.024-2.048 16.384 0 28.672 0 29.696 0 40.96 138.752 164.352 218.624 253.952 39.424 44.032 64 78.848 53.248 109.056-5.12 14.336-17.92 27.648-34.304 31.744-32.768 8.192-67.072-26.112-117.76-78.336-145.408-150.016-197.632-204.8-251.392-194.56-13.824 2.56-11.264 7.68-25.6 8.704-35.84 2.56-80.896-34.304-193.024-146.432C121.856 360.448 91.648 322.56 98.304 304.128c7.68-19.456 26.112-5.12 113.152 79.872l105.472 103.424 29.184-28.672 29.184-28.672-103.424-103.424c-68.608-69.632-97.28-106.496-87.04-112.64 10.752-6.656 52.736 27.648 117.248 90.624L401.92 404.48l30.208-28.672 29.184-30.208-99.84-100.352C274.432 157.184 250.88 115.2 287.744 115.2c5.12 0 73.728 64.512 152.576 142.848z"
      fill="#FFFFFF"
    />
  </svg>
)

const SCRIPT_CAT_ICON_DATA_URL =
  "data:image/png;base64,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"

export const ScriptCatIcon: React.FC<{ size?: number; className?: string; color?: string }> = ({
  size = 24,
  className,
}) => (
  <img
    src={SCRIPT_CAT_ICON_DATA_URL}
    width={size}
    height={size}
    className={className}
    alt=""
    aria-hidden="true"
    style={{ display: "block", width: size, height: size }}
  />
)

export const EdgeIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 24,
  className,
}) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
    <path
      fill="#1e88e5"
      d="M40.69,35.42c-9.15,11.88-21.41,8.8-26.23,6.1 c-7.35-4.11-12.5-13.68-9.44-23.25c0.9-2.82,2.27-5.23,3.98-7.23c1.67,0.13,3.65,0.13,6-0.04c14-1,18,11,17,14 c-0.51,1.53-2.32,2.02-3.97,2.13c0.16-0.22,0.36-0.54,0.64-1.02c0.87-1.54,0.98-4.49-1.73-6.27c-2.61-1.7-5.43-0.65-6.88,1.28 c-1.45,1.92-0.88,4.81-0.37,6.09c2.2,5.52,6.26,6.95,9.02,7.78c2.76,0.83,6.86,0.71,9.05-0.19c2.18-0.91,2.8-1.43,3.22-0.97 C41.41,34.29,41.11,34.82,40.69,35.42z"
    />
    <path
      fill="#0d47a1"
      d="M40.732,35.42c-3.48,4.52-7.41,6.87-11.21,7.91 c-0.03,0.01-0.06,0.01-0.08,0.02c-2.2,0.42-3.95,0.08-5.85-0.29c-3.09-0.6-7.35-4.01-8.38-10.18c-0.88-5.31,1.63-9.81,5.59-12.54 c-0.26,0.24-0.49,0.5-0.7,0.78c-1.45,1.92-0.88,4.81-0.37,6.09c2.2,5.52,6.26,6.95,9.02,7.78c2.76,0.83,6.86,0.71,9.05-0.19 c2.18-0.91,2.8-1.43,3.22-0.97C41.452,34.29,41.152,34.82,40.732,35.42z"
    />
    <path
      fill="#00e5ff"
      d="M26.94,4.25c0.02,0.26,0.03,0.54,0.03,0.81c0,3.78-1.75,7.14-4.48,9.32 c-1.02-0.52-2.21-0.94-3.65-1.22c-4.07-0.78-10.63,1.1-13.3,5.77c-0.88,1.53-1.25,3.1-1.41,4.55c0.04-1.71,0.33-3.46,0.89-5.21 C8.31,8.01,17.86,3.05,26.94,4.25z"
    />
    <path
      fill="#00e676"
      d="M41.4,27.89c-2.76,2.78-6.27,2.86-8.67,2.73 c-2.41-0.12-3.59-0.82-4.69-1.5c-1.11-0.69-0.48-1.37-0.37-1.52c0.11-0.15,0.38-0.41,1-1.49c0.29-0.51,0.5-1.18,0.54-1.91 c4.62-3.43,7.96-8.49,9.16-14.34c2.92,2.95,4.3,6.21,4.79,7.61C44.04,19.99,44.71,24.56,41.4,27.89z"
    />
    <path
      fill="#1de9b6"
      d="M38.37,9.85v0.01c-1.2,5.85-4.54,10.91-9.16,14.34c0.03-0.42,0-0.87-0.1-1.32 c0-0.02-0.01-0.04-0.01-0.05c-0.25-1.47-0.99-3.33-2.22-4.77c-1.22-1.44-2.52-2.73-4.39-3.68c2.73-2.18,4.48-5.54,4.48-9.32 c0-0.27-0.01-0.55-0.03-0.81c0.4,0.05,0.79,0.11,1.19,0.19C32.74,5.33,36.04,7.49,38.37,9.85z"
    />
  </svg>
)
