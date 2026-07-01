import React from "react"
import { createRoot } from "react-dom/client"

import { BrowserSidebarApp } from "~components/sidebar/BrowserSidebarApp"

import "./sidepanel.css"

const container = document.getElementById("__plasmo")

if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <BrowserSidebarApp />
    </React.StrictMode>,
  )
}
