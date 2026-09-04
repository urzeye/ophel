import React from "react"

interface PageTitleProps {
  title: string
  Icon?: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
  action?: React.ReactNode
}

export const PageTitle: React.FC<PageTitleProps> = ({ title, Icon, action }) => {
  return (
    <div className="settings-page-header">
      <div className="settings-page-title-wrap">
        <h1 className="settings-page-title" style={{ display: "flex", alignItems: "center" }}>
          {Icon && (
            <Icon
              size={28}
              className="settings-page-title-icon"
              style={{
                marginRight: 8,
                color: "var(--gh-primary, #4285f4)",
              }}
            />
          )}
          <span>{title}</span>
        </h1>
        {action && <div className="settings-page-header-action">{action}</div>}
      </div>
    </div>
  )
}
