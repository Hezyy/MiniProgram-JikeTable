/**
 * 自定义底部弹层。
 *
 * properties:
 * - show: 是否显示
 * - title: 标题，为空时不显示标题栏
 * - maskClosable: 点击遮罩是否关闭，默认 true
 * - showClose: 是否显示关闭按钮
 *
 * 插槽：
 * - 默认插槽：主体内容（内部为可滚动区域）
 * - footer：固定在底部的操作区
 *
 * 事件：
 * - close: { from: 'mask' | 'button' }
 *
 * 进入使用 CSS 动画（220-280ms，遮罩同步淡入），关闭立即卸载，不持有定时器。
 */
Component({
  options: { addGlobalClass: true, multipleSlots: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    maskClosable: { type: Boolean, value: true },
    showClose: { type: Boolean, value: true }
  },
  methods: {
    onMaskTap() {
      if (!this.data.maskClosable) return
      this.triggerEvent('close', { from: 'mask' })
    },
    onCloseTap() {
      this.triggerEvent('close', { from: 'button' })
    },
    /** 阻止面板内的点击穿透到遮罩。 */
    noop() {
      return undefined
    }
  }
})
