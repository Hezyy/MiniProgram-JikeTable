/**
 * 统一日志出口。
 * 开发 / 体验版输出调试日志，正式版只保留错误日志，避免发布包携带调试信息。
 */

let releaseCache: boolean | null = null

function isRelease(): boolean {
  if (releaseCache !== null) return releaseCache
  let release = false
  try {
    const info = wx.getAccountInfoSync()
    release = !!info && !!info.miniProgram && info.miniProgram.envVersion === 'release'
  } catch {
    release = false
  }
  releaseCache = release
  return release
}

/** 调试日志，正式版静默。 */
export function logDebug(...args: unknown[]): void {
  if (isRelease()) return
  console.log('[即课课表]', ...args)
}

/** 警告日志，正式版静默。 */
export function logWarn(...args: unknown[]): void {
  if (isRelease()) return
  console.warn('[即课课表]', ...args)
}

/** 错误日志，任何环境都输出，便于真机排查。 */
export function logError(...args: unknown[]): void {
  console.error('[即课课表]', ...args)
}

/** 从任意异常对象中提取可读信息。 */
export function errorMessage(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    if (typeof record.errMsg === 'string') return record.errMsg
    if (typeof record.message === 'string') return record.message
  }
  return ''
}
