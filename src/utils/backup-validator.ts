/**
 * 备份数据校验工具
 * 用于验证导入/恢复的备份数据格式是否正确
 */

export interface ValidationResult {
  valid: boolean
  /** 错误信息的国际化 key 列表 */
  errorKeys: string[]
}

/**
 * 校验备份数据格式
 * @param data 解析后的备份数据对象
 * @returns 校验结果，errorKeys 为国际化 key
 */
export function validateBackupData(data: any): ValidationResult {
  const errorKeys: string[] = []

  // 基础格式校验
  if (!data || typeof data !== "object") {
    return { valid: false, errorKeys: ["backupValidationInvalidFormat"] }
  }

  if (!data.version) {
    errorKeys.push("backupValidationMissingVersion")
  }

  if (!data.data || typeof data.data !== "object") {
    errorKeys.push("backupValidationMissingData")
    return { valid: false, errorKeys }
  }

  const backupData = data.data

  // 数据类型校验
  if (backupData.settings !== undefined) {
    if (typeof backupData.settings !== "object" || Array.isArray(backupData.settings)) {
      errorKeys.push("backupValidationSettingsType")
    }
  }

  if (backupData.prompts !== undefined) {
    if (!Array.isArray(backupData.prompts)) {
      errorKeys.push("backupValidationPromptsType")
    }
  }

  if (backupData.folders !== undefined) {
    if (!Array.isArray(backupData.folders)) {
      errorKeys.push("backupValidationFoldersType")
    }
  }

  if (backupData.conversations !== undefined) {
    if (typeof backupData.conversations !== "object" || Array.isArray(backupData.conversations)) {
      errorKeys.push("backupValidationConversationsType")
    }
  }

  if (backupData.readingHistory !== undefined) {
    if (typeof backupData.readingHistory !== "object" || Array.isArray(backupData.readingHistory)) {
      errorKeys.push("backupValidationHistoryType")
    }
  }

  return {
    valid: errorKeys.length === 0,
    errorKeys,
  }
}
