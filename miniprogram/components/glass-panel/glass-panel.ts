/**
 * 液态玻璃面板容器。
 *
 * properties:
 * - strong: 使用更高不透明度的表面色
 * - padded: 是否使用默认内边距
 * - extClass: 附加类名
 */
Component({
  options: { addGlobalClass: true, multipleSlots: true },
  properties: {
    strong: { type: Boolean, value: false },
    padded: { type: Boolean, value: true },
    extClass: { type: String, value: '' }
  }
})
