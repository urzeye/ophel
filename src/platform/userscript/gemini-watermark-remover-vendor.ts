import { removeWatermarkFromImageDataSync } from "@pilio/gemini-watermark-remover"
;(
  globalThis as typeof globalThis & {
    __OphelGeminiWatermarkRemover?: {
      removeWatermarkFromImageDataSync: typeof removeWatermarkFromImageDataSync
    }
  }
).__OphelGeminiWatermarkRemover = {
  removeWatermarkFromImageDataSync,
}
