import React from "react"

export const ChromeIcon: React.FC<{ size?: number; className?: string; color?: string }> = ({
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
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="4" />
    <line x1="21.17" x2="12" y1="8" y2="8" />
    <line x1="3.95" x2="8.54" y1="6.06" y2="14" />
    <line x1="10.88" x2="15.46" y1="21.94" y2="14" />
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
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="m9 15 2 2 4-4" />
  </svg>
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
