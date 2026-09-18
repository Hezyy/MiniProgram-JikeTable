import { logWarn } from './logger'

/**
 * 对话框与离开确认。
 * `wx.showModal` 的 Promise 化封装，以及「未保存修改」提示。
 */

export interface ConfirmOptions {
  title: string
  content: string
  confirmText?: string
  cancelText?: string
  /** 危险操作使用危险色确认按钮。 */
  danger?: boolean
}

/** 二次确认，返回用户是否确认。 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: options.title,
      content: options.content,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      confirmColor: options.danger ? '#d9485f' : '#2675ec',
      success: (res) => resolve(!!res.confirm),
      fail: (error) => {
        logWarn('确认框调用失败', error)
        resolve(false)
      }
    })
  })
}

/** 仅用于提示的对话框。 */
export function alertInfo(title: string, content: string): Promise<void> {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      showCancel: false,
      confirmText: '知道了',
      complete: () => resolve()
    })
  })
}

type EnableAlertFn = (options: { message: string; success?: () => void; fail?: (error: unknown) => void }) => void
type DisableAlertFn = (options?: { success?: () => void; fail?: (error: unknown) => void }) => void

function api<T>(name: string): T | null {
  const target = wx as unknown as Record<string, unknown>
  const fn = target[name]
  return typeof fn === 'function' ? (fn as unknown as T) : null
}

/** 存在未保存修改时，返回 / 关闭小程序前询问是否放弃。 */
export function enableLeaveConfirm(message: string): void {
  const fn = api<EnableAlertFn>('enableAlertBeforeUnload')
  if (!fn) return
  try {
    fn({ message, fail: () => undefined })
  } catch (error) {
    logWarn('开启离开确认失败', error)
  }
}

/** 关闭离开确认。 */
export function disableLeaveConfirm(): void {
  const fn = api<DisableAlertFn>('disableAlertBeforeUnload')
  if (!fn) return
  try {
    fn({ fail: () => undefined })
  } catch (error) {
    logWarn('关闭离开确认失败', error)
  }
}
