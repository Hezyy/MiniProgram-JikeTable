/**
 * 图标组件。
 *
 * properties:
 * - name: 图标名，取值见 styles/icons.less（chevron-left / close / plus / check / edit / trash ...）
 * - tone: default | strong | primary | success | danger | inverse
 * - size: 边长（rpx）
 * - label: 有值时作为语义图标暴露给辅助技术；为空时对辅助技术隐藏
 */
Component({
  options: { addGlobalClass: true },
  properties: {
    name: { type: String, value: '' },
    tone: { type: String, value: 'default' },
    size: { type: Number, value: 40 },
    label: { type: String, value: '' }
  },
  data: {
    className: 'jk-icon',
    ariaHidden: 'true'
  },
  observers: {
    'name, tone': function (name: string, tone: string) {
      const safeName = name || 'none'
      const safeTone = tone || 'default'
      this.setData({ className: `jk-icon jk-i-${safeName} jk-t-${safeTone}` })
    },
    label: function (label: string) {
      this.setData({ ariaHidden: label ? 'false' : 'true' })
    }
  }
})
