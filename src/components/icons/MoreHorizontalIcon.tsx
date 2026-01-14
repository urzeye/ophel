import React from "react"

export const MoreHorizontalIcon = ({
  size = 16,
  className = "",
  ...props
}: {
  size?: number
  className?: string
} & React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`more-horizontal-icon ${className}`}
      {...props}>
      <circle cx="12" cy="12" r="1" className="dot dot-2" />
      <circle cx="19" cy="12" r="1" className="dot dot-3" />
      <circle cx="5" cy="12" r="1" className="dot dot-1" />
      <style>{`
        .more-horizontal-icon .dot {
          transform-box: fill-box;
          transform-origin: center;
          animation: dot-jump 3s infinite;
        }
        .more-horizontal-icon .dot-1 {
          animation-delay: 0s;
        }
        .more-horizontal-icon .dot-2 {
          animation-delay: 0.1s;
        }
        .more-horizontal-icon .dot-3 {
          animation-delay: 0.2s;
        }
        @keyframes dot-jump {
          0%, 90%, 100% { transform: translateY(0); }
          5% { transform: translateY(-3px); }
          10% { transform: translateY(0); }
        }
      `}</style>
    </svg>
  )
}
