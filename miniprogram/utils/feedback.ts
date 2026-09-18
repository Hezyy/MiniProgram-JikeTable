import { logWarn } from './logger'

/**
 * 交互反馈工具：自定义轻提示。
 *
 * 产品不使用触觉（震动）反馈，所有操作反馈都由可视化的按压态与轻提示承担。
 */

export type ToastType = 'info' | 'success' | 'error'

export interface ToastOptions {
  message: string
  type?: ToastType
  /** 毫秒，默认 2000，带操作按钮时默认 4000。 */
  duration?: number
  /** 操作按钮文案，例如「撤销」。 */
  actionText?: string
}

/** 能通过 selectComponent 找到 toast 组件的宿主（页面或组件实例）。 */
export interface ToastHost {
  selectComponent(selector: string): any
}

interface ToastInstance {
  show(options: ToastOptions): void
  hide(): void
}

function resolveToast(host: ToastHost): ToastInstance | null {
  if (!host || typeof host.selectComponent !== 'function') return null
  const instance = host.selectComponent('#toast')
  if (!instance || typeof instance.show !== 'function') return null
  return instance as ToastInstance
}

/** 显示轻提示；宿主未挂载 toast 组件时静默忽略。 */
export function showToast(host: ToastHost, options: ToastOptions): void {
  const toast = resolveToast(host)
  if (!toast) {
    logWarn('页面未挂载 toast 组件，已忽略提示', options.message)
    return
  }
  toast.show(options)
}

/** 关闭轻提示。 */
export function hideToast(host: ToastHost): void {
  const toast = resolveToast(host)
  if (toast) toast.hide()
}
