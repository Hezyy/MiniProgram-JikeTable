/**
 * 空状态。
 *
 * properties:
 * - icon: 图标名
 * - title: 主文案
 * - description: 辅助说明
 * - actionText: 操作按钮文案，为空时不显示按钮
 * - hint: 更次要的提示行（例如「下拉可刷新」）
 *
 * 事件：
 * - action: 点击操作按钮
 */
Component({
  options: { addGlobalClass: true },
  properties: {
    icon: { type: String, value: 'calendar' },
    title: { type: String, value: '' },
    description: { type: String, value: '' },
    actionText: { type: String, value: '' },
    hint: { type: String, value: '' }
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})
