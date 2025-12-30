import React, { useEffect, useRef, useState } from "react"

import { t } from "~utils/i18n"

interface FloatingBallProps {
  onClick: () => void
  isOpen: boolean
}

export const FloatingBall: React.FC<FloatingBallProps> = ({
  onClick,
  isOpen
}) => {
  const [position, setPosition] = useState({ x: 20, y: 20 }) // Right-bottom offset
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })

  // Simple drag implementation (optional for now, can be improved)
  // For now, let's just stick to fixed position or simple click
  // The user requirement said "FloatingBall... support dragging (optional)".
  // I will implement a static fixed one first to ensure stability, or a very simple one.

  return (
    <div
      className="gh-floating-ball gh-interactive"
      onClick={onClick}
      title={t("panelTitle")}
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        width: "48px",
        height: "48px",
        borderRadius: "50%",
        backgroundColor: "var(--gh-primary-color, #4285f4)",
        boxShadow: "0 4px 12px rgba(66, 133, 244, 0.4)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 0.2s, background-color 0.2s",
        zIndex: 10000,
        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)"
      }}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 2L2 7L12 12L22 7L12 2Z"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 17L12 22L22 17"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 12L12 17L22 12"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
