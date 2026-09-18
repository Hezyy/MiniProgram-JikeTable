interface SegmentOption {
  value: string
  label: string
  /** 可选的角标数字。 */
  badge?: number
}

/**
 * 分段控件。
 *
 * properties:
 * - options: Array<{ value: string; label: string; badge?: number }>
 * - value: 当前选中值
 * - disabled: 是否禁用
 *
 * 事件：
 * - change: { value }
 */
Component({
  options: { addGlobalClass: true },
  properties: {
    options: { type: Array, value: [] },
    value: { type: String, value: '' },
    disabled: { type: Boolean, value: false }
  },
  methods: {
    onSelect(event: WechatMiniprogram.TouchEvent) {
      if (this.data.disabled) return
      const value = event.currentTarget.dataset.value as string
      if (!value || value === this.data.value) return
      this.triggerEvent('change', { value })
    }
  }
})
