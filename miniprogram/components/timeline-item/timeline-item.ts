import type { ColorOption, TimelineEntry } from '../../types/models'
import { getColor } from '../../utils/colors'

function asEntry(value: unknown): TimelineEntry | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.title !== 'string') return null
  return value as TimelineEntry
}

/**
 * 今日时间线条目：课程与日程共用同一视觉结构，日程额外提供完成控件。
 *
 * properties:
 * - item: TimelineEntry
 *
 * 事件：
 * - tapitem: { id, type }
 * - toggletodo: { id, completed }
 */
Component({
  options: { addGlobalClass: true },
  properties: {
    item: { type: Object }
  },
  data: {
    color: getColor('blue') as ColorOption,
    statusText: '',
    ariaLabel: ''
  },
  observers: {
    item: function (value: unknown) {
      const entry = asEntry(value)
      if (!entry) return
      const statusText =
        entry.status === 'ongoing' ? '进行中' : entry.status === 'finished' ? '已结束' : ''
      const parts = [entry.title, entry.timeText]
      if (entry.location) parts.push(entry.location)
      this.setData({
        color: getColor(entry.colorId),
        statusText,
        ariaLabel: parts.join('，')
      })
    }
  },
  methods: {
    onTap() {
      const entry = asEntry(this.data.item)
      if (!entry) return
      this.triggerEvent('tapitem', { id: entry.id, type: entry.type })
    },
    onToggle() {
      const entry = asEntry(this.data.item)
      if (!entry) return
      this.triggerEvent('toggletodo', { id: entry.id, completed: !entry.completed })
    }
  }
})
