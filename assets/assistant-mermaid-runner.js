;(function () {
  "use strict"

  const REQUEST_EVENT = "OPHEL_ASSISTANT_MERMAID_RENDER_REQUEST"
  const RESPONSE_EVENT = "OPHEL_ASSISTANT_MERMAID_RENDER_RESPONSE"
  const PREVIEW_ATTR = "data-ophel-assistant-mermaid-preview-id"
  const PREVIEW_TOKEN_ATTR = "data-ophel-assistant-mermaid-render-token"
  const ROOT_ATTR = "data-ophel-assistant-mermaid-runner"
  const READY_FLAG = "__ophelAssistantMermaidRunnerReady"
  const TRUSTED_TYPES_POLICY_KEY = "__ophelAssistantMermaidTrustedTypesPolicy"

  if (window[READY_FLAG]) {
    return
  }

  window[READY_FLAG] = true
  document.documentElement?.setAttribute(ROOT_ATTR, "1")

  let initializedTheme = null

  function getTrustedTypesPolicy() {
    if (window[TRUSTED_TYPES_POLICY_KEY]) {
      return window[TRUSTED_TYPES_POLICY_KEY]
    }

    const tt = window.trustedTypes
    if (!tt || typeof tt.createPolicy !== "function") {
      return null
    }

    try {
      const policy = tt.createPolicy("ophel-assistant-mermaid", {
        createHTML(value) {
          return value
        },
        createScript(value) {
          return value
        },
        createScriptURL(value) {
          return value
        },
      })

      window[TRUSTED_TYPES_POLICY_KEY] = policy
      return policy
    } catch (error) {
      console.warn("[AssistantMermaidRunner] Failed to create Trusted Types policy:", error)
      return null
    }
  }

  function ensureTrustedTypesDefaultPolicy() {
    const tt = window.trustedTypes
    if (!tt || typeof tt.createPolicy !== "function") {
      return
    }

    try {
      tt.createPolicy("default", {
        createHTML(value) {
          return value
        },
        createScript(value) {
          return value
        },
        createScriptURL(value) {
          return value
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/default/i.test(message) && !/already exists/i.test(message)) {
        console.warn(
          "[AssistantMermaidRunner] Failed to create default Trusted Types policy:",
          error,
        )
      }
    }
  }

  function withTrustedHtmlAssignments(task) {
    ensureTrustedTypesDefaultPolicy()

    const policy = getTrustedTypesPolicy()
    if (!policy) {
      return task()
    }

    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML")
    if (!descriptor || typeof descriptor.set !== "function" || descriptor.configurable !== true) {
      return task()
    }

    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true,
      enumerable: descriptor.enumerable === true,
      get: descriptor.get,
      set(value) {
        const nextValue =
          typeof value === "string"
            ? policy.createHTML(value)
            : value

        descriptor.set.call(this, nextValue)
      },
    })

    return Promise.resolve()
      .then(() => task())
      .finally(() => {
        Object.defineProperty(Element.prototype, "innerHTML", descriptor)
      })
  }

  function getMermaid() {
    const mermaid = window.mermaid
    if (!mermaid || typeof mermaid.render !== "function") {
      throw new Error("Mermaid runtime is unavailable")
    }
    return mermaid
  }

  function findPreviewElement(previewId) {
    if (!previewId) return null

    const visitedRoots = new Set()
    const rootStack = [document]

    while (rootStack.length > 0) {
      const root = rootStack.pop()
      if (!root || visitedRoots.has(root)) continue
      visitedRoots.add(root)

      const candidates = root.querySelectorAll ? root.querySelectorAll(`[${PREVIEW_ATTR}]`) : []
      for (const candidate of candidates) {
        if (candidate.getAttribute(PREVIEW_ATTR) === previewId) {
          return candidate
        }
      }

      const descendants = root.querySelectorAll ? root.querySelectorAll("*") : []
      for (const element of descendants) {
        if (element.shadowRoot) {
          rootStack.push(element.shadowRoot)
        }
      }
    }

    return null
  }

  function isLatestRequest(previewElement, requestId) {
    return previewElement?.getAttribute(PREVIEW_TOKEN_ATTR) === requestId
  }

  function postResponse(requestId, success, error) {
    window.postMessage(
      {
        type: RESPONSE_EVENT,
        requestId,
        success,
        error,
      },
      "*",
    )
  }

  function tryParseRenderedSvgAsXml(svgMarkup) {
    const parser = new DOMParser()
    const parsedDocument = parser.parseFromString(svgMarkup, "image/svg+xml")
    const parseError = parsedDocument.querySelector("parsererror")
    const svgElement = parsedDocument.documentElement

    if (parseError || !svgElement || svgElement.tagName.toLowerCase() !== "svg") {
      return null
    }

    return svgElement
  }

  function tryParseRenderedSvgAsHtml(svgMarkup) {
    const parser = new DOMParser()
    const parsedDocument = parser.parseFromString(svgMarkup, "text/html")
    return parsedDocument.querySelector("svg")
  }

  function decodeBase64Utf8(value) {
    const normalizedValue = value.replace(/\s+/g, "")
    const binary = atob(normalizedValue)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  function decodeDataUrlContent(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith("data:")) {
      return null
    }

    const commaIndex = dataUrl.indexOf(",")
    if (commaIndex === -1) {
      return null
    }

    const metadata = dataUrl.slice(0, commaIndex)
    const payload = dataUrl.slice(commaIndex + 1)

    try {
      return /;base64/i.test(metadata) ? decodeBase64Utf8(payload) : decodeURIComponent(payload)
    } catch (error) {
      console.warn("[AssistantMermaidRunner] Failed to decode iframe data URL:", error)
      return null
    }
  }

  function tryParseRenderedSvgFromIframe(svgMarkup) {
    const parser = new DOMParser()
    const parsedDocument = parser.parseFromString(svgMarkup, "text/html")
    const iframe = parsedDocument.querySelector("iframe")
    if (!iframe) {
      return null
    }

    const embeddedDocumentMarkup =
      iframe.getAttribute("srcdoc") ||
      decodeDataUrlContent(iframe.getAttribute("src") || "") ||
      iframe.innerHTML.trim()

    if (!embeddedDocumentMarkup) {
      return null
    }

    return (
      tryParseRenderedSvgAsXml(embeddedDocumentMarkup) ||
      tryParseRenderedSvgAsHtml(embeddedDocumentMarkup)
    )
  }

  function extractRenderedSvgElement(svgMarkup) {
    const normalizedMarkup =
      typeof svgMarkup === "string" ? svgMarkup.trim() : String(svgMarkup || "").trim()

    if (!normalizedMarkup) {
      throw new Error("Rendered SVG markup is empty")
    }

    const svgElement =
      tryParseRenderedSvgAsXml(normalizedMarkup) ||
      tryParseRenderedSvgAsHtml(normalizedMarkup) ||
      tryParseRenderedSvgFromIframe(normalizedMarkup)

    if (!svgElement) {
      throw new Error("Failed to parse rendered SVG")
    }

    return svgElement
  }

  function applyRenderedSvg(previewElement, svgMarkup) {
    const svgElement = extractRenderedSvgElement(svgMarkup)
    const importedSvg = document.importNode(svgElement, true)
    previewElement.replaceChildren(importedSvg)
  }

  async function renderMermaid(payload) {
    const { requestId, previewId, source, theme } = payload || {}

    try {
      const previewElement = findPreviewElement(previewId)
      if (!previewElement) {
        throw new Error("Preview container not found")
      }

      if (!isLatestRequest(previewElement, requestId)) {
        postResponse(requestId, true)
        return
      }

      const mermaid = getMermaid()
      if (initializedTheme !== theme) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: theme === "dark" ? "dark" : "default",
        })
        initializedTheme = theme
      }

      await withTrustedHtmlAssignments(async () => {
        if (typeof mermaid.parse === "function") {
          const parsed = await mermaid.parse(source, { suppressErrors: true })
          if (parsed === false) {
            throw new Error("Mermaid parse rejected")
          }
        }

        const renderId = `ophel-assistant-mermaid-${requestId}`
        const result = await mermaid.render(renderId, source)
        if (!isLatestRequest(previewElement, requestId)) {
          postResponse(requestId, true)
          return
        }

        applyRenderedSvg(previewElement, result.svg)
        if (
          typeof result.bindFunctions === "function" &&
          isLatestRequest(previewElement, requestId)
        ) {
          result.bindFunctions(previewElement)
        }
      })

      postResponse(requestId, true)
    } catch (error) {
      postResponse(requestId, false, error instanceof Error ? error.message : String(error))
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    if (event.data?.type !== REQUEST_EVENT) return

    void renderMermaid(event.data)
  })
})()
