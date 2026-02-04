import React, { Component, type ReactNode } from "react"
import Editor from "react-simple-code-editor"

type BaseEditorProps = React.ComponentProps<typeof Editor>

interface SafeCodeEditorProps extends Partial<BaseEditorProps> {
  value: string
  onValueChange: (code: string) => void
  highlight: (code: string) => string | ReactNode
  fallbackPlaceholder?: string
}

interface SafeCodeEditorState {
  hasError: boolean
}

/**
 * A wrapper around react-simple-code-editor that falls back to a plain textarea
 * if an error occurs (e.g. Trusted Types violation).
 */
export class SafeCodeEditor extends Component<SafeCodeEditorProps, SafeCodeEditorState> {
  constructor(props: SafeCodeEditorProps) {
    super(props)

    // Proactively check if string assignment to innerHTML is blocked
    // This prevents the browser from logging a Trusted Types violation error in the console
    let isBlocked = false
    try {
      const testDiv = document.createElement("div")
      testDiv.innerHTML = ""
    } catch {
      isBlocked = true
    }

    this.state = { hasError: isBlocked }
  }

  static getDerivedStateFromError(_: Error): SafeCodeEditorState {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _errorInfo: React.ErrorInfo) {
    // Suppress console logs as requested
  }

  render() {
    if (this.state.hasError) {
      const { value, onValueChange, style, placeholder, className, fallbackPlaceholder } =
        this.props
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
          <textarea
            className={`settings-textarea ${className || ""}`}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={fallbackPlaceholder || placeholder}
            style={{
              ...style,
              fontFamily: '"Menlo", "Monaco", "Consolas", monospace',
              resize: "none",
              flex: 1,
              width: "100%",
              height: "100%",
              border: "none",
              outline: "none",
              padding: "12px",
            }}
          />
        </div>
      )
    }

    return <Editor {...(this.props as any)} />
  }
}
