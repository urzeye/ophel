/**
 * SVG 图标组件 - 适配中心导航
 * 风格：Filled modules / grid
 */
import React from "react"

export const SitePacksIcon = ({
  size = 16,
  className = "",
  ...props
}: {
  size?: number
  className?: string
} & React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      style={{ display: "block", width: size, height: size }}
      {...props}>
      <path d="M737.148 541.92h-256.85V286.073c0-17.673-14.327-32-32-32h-288.85c-17.673 0-32 14.327-32 32v576.698c0 17.673 14.327 32 32 32h577.7c17.673 0 32-14.327 32-32V573.92c0-17.673-14.327-32-32-32z m-320.85-223.847V541.92h-224.85V318.073h224.85z m-224.85 288.85h224.85v223.848h-224.85V606.923z m513.7 223.848h-224.85V605.92h224.85v224.851z" />
      <path d="M843.523 146.698h-280c-17.132 0-31.02 13.888-31.02 31.02v280c0 17.132 13.888 31.02 31.02 31.02h280c17.132 0 31.02-13.888 31.02-31.02v-280c0-17.132-13.888-31.02-31.02-31.02z m-31.019 280H594.543V208.737h217.961v217.961z" />
      <path d="M671.523 285.718h64v64h-64z" />
    </svg>
  )
}

export default SitePacksIcon
