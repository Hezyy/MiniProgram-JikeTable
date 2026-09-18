export type ToastType = 'info' | 'success' | 'error'

export interface ToastShowOptions {
  message: string
  type?: ToastType
  /** 毫秒；带操作按钮时默认 4000，否则 2000。 */
  duration?: number
  /** 操作按钮文案，例如「撤销」。 */
  actionText?: string
}

interface TimerSlot {
  hide: number | null
}

const TIMERS = new WeakMap<object, TimerSlot>()

function slotOf(target: object): TimerSlot {
  let slot = TIMERS.get(target)
  if (!slot) {
    slot = { hide: null }
    TIMERS.set(target, slot)
  }
  return slot
}

function clearHideTimer(target: object): void {
  const slot = slotOf(target)
  if (slot.hide !== null) {
    clearTimeout(slot.hide)
    slot.hide = null
  }
}

/**
 * 轻提示，通过页面 selectComponent('#toast').show(...) 调用。
 *
 * 事件：
 * - action: 点击操作按钮
 */
Component({
  options: { addGlobalClass: true },
  data: {
    visible: false,
    message: '',
    type: 'info' as ToastType,
    iconName: 'info' as string,
    actionText: ''
  },
  lifetimes: {
    detached() {
      clearHideTimer(this)
    }
  },
  methods: {
    show(options: ToastShowOptions) {
      if (!options) return
      clearHideTimer(this)
      const actionText = options.actionText || ''
      const duration =
        typeof options.duration === 'number' && options.duration > 0
          ? options.duration
          : actionText
          ? 4000
          : 2000
      const type: ToastType = options.type || 'info'
      this.setData({
        visible: true,
        message: options.message || '',
        type,
        iconName: type === 'success' ? 'check' : type === 'error' ? 'warning' : 'info',
        actionText
      })
      slotOf(this).hide = setTimeout(() => {
        this.hide()
      }, duration)
    },
    hide() {
      clearHideTimer(this)
      if (!this.data.visible) return
      this.setData({ visible: false, actionText: '' })
    },
    onAction() {
      this.hide()
      this.triggerEvent('action')
    }
  }
})
