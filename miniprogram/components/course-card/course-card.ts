import type { ColorOption, CourseBlockVM } from '../../types/models'
import { getColor } from '../../utils/colors'

function asBlock(value: unknown): CourseBlockVM | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null
  return value as CourseBlockVM
}

/** 冲突并排后每列不足这个宽度时，只显示课程名。 */
const NARROW_WIDTH_PERCENT = 60
/** 高度达到两节以上才显示地点与教师。 */
const ROOMY_HEIGHT = 168

/**
 * 课表网格中的课程块。位置由父级按节次计算后传入，组件只负责绘制与交互。
 *
 * properties:
 * - block: CourseBlockVM
 *
 * 事件：
 * - tapcourse: { id }
 */
Component({
  options: { addGlobalClass: true },
  properties: {
    block: { type: Object }
  },
  data: {
    color: getColor('blue') as ColorOption,
    /** 高度足够时才显示地点与教师。 */
    roomy: false,
    /** 并排冲突导致列很窄时，精简为只显示课程名。 */
    narrow: false,
    /** 是否显示右下角状态角标；显示时需要为它预留文字空间。 */
    showFlag: false,
    ariaLabel: ''
  },
  observers: {
    block: function (value: unknown) {
      const block = asBlock(value)
      if (!block) return
      const narrow = block.widthPercent < NARROW_WIDTH_PERCENT
      const parts = [block.name, block.timeText]
      if (block.location) parts.push(block.location)
      if (block.teacher) parts.push(block.teacher)
      if (block.conflict) parts.push('与其它课程时间冲突')
      this.setData({
        color: getColor(block.colorId),
        narrow,
        showFlag: !narrow && (block.isOngoing || block.conflict),
        roomy: !narrow && block.height >= ROOMY_HEIGHT,
        ariaLabel: parts.join('，')
      })
    }
  },
  methods: {
    onTap() {
      const block = asBlock(this.data.block)
      if (!block) return
      this.triggerEvent('tapcourse', { id: block.id })
    }
  }
})
