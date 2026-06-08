import {
  removeWatermarkFromImageDataSync,
  type WatermarkMeta,
} from "@pilio/gemini-watermark-remover"

type ImageDataLike = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type BananaWatermarkDecision = {
  meta: WatermarkMeta
  sourceUrl?: string
  scene?: "display" | "download" | "copy" | "fetch" | "export"
}

export type BananaWatermarkProcessResult =
  | {
      status: "removed"
      imageData: ImageData
      decision: BananaWatermarkDecision
    }
  | {
      status: "skipped"
      reason: "not-banana" | "invalid-candidate"
      decision?: BananaWatermarkDecision
    }
  | {
      status: "failed"
      error: string
    }

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message || "Unknown watermark processing error"
  if (typeof error === "string" && error.trim()) return error.trim()
  return "Unknown watermark processing error"
}

function isConfirmedBananaMeta(meta: WatermarkMeta | null | undefined): boolean {
  if (!meta || meta.applied !== true) return false
  if (meta.skipReason) return false
  if (meta.decisionTier === "insufficient") return false
  return true
}

function toBrowserImageData(imageData: ImageDataLike): ImageData {
  if (typeof ImageData !== "undefined" && imageData instanceof ImageData) {
    return imageData
  }

  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)
}

export function processBananaWatermarkImageData(
  imageData: ImageData,
  options: {
    sourceUrl?: string
    scene?: BananaWatermarkDecision["scene"]
    adaptiveMode?: "auto" | "always" | "never" | "off"
    maxPasses?: number
  } = {},
): BananaWatermarkProcessResult {
  try {
    const result = removeWatermarkFromImageDataSync(imageData, {
      adaptiveMode: options.adaptiveMode ?? "always",
      maxPasses: options.maxPasses ?? 4,
    })

    const meta = result.meta as WatermarkMeta
    const decision: BananaWatermarkDecision = {
      meta,
      sourceUrl: options.sourceUrl,
      scene: options.scene,
    }

    if (!isConfirmedBananaMeta(meta)) {
      return {
        status: "skipped",
        reason: meta.skipReason ? "invalid-candidate" : "not-banana",
        decision,
      }
    }

    return {
      status: "removed",
      imageData: toBrowserImageData(result.imageData),
      decision,
    }
  } catch (error) {
    return {
      status: "failed",
      error: normalizeError(error),
    }
  }
}
