import type { FieldErrors, ScheduleEventInput } from '../../types/models'
import { eventService } from '../../services/event-service'
import { DEFAULT_EVENT_COLOR_ID, PRESET_COLORS, getColor } from '../../utils/colors'
import { formatFullDateWithWeekday, nextHourRange, todayString } from '../../utils/date'
import { confirmAction, disableLeaveConfirm, enableLeaveConfirm } from '../../utils/dialog'
import { showToast } from '../../utils/feedback'
import { logError } from '../../utils/logger'
import { refreshPageTheme } from '../../utils/theme'
import { LIMITS, validateEventInput } from '../../utils/validation'

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>
type ValueChangeEvent = WechatMiniprogram.CustomEvent<{ value: string | number }>

const KIND_OPTIONS = [
  { label: '普通日程', value: 'event' },
  { label: '待办事项', value: 'todo' }
]

const FIELD_IDS: Record<string, string> = {
  title: 'field-title',
  date: 'field-date',
  startTime: 'field-time',
  endTime: 'field-time',
  location: 'field-location',
  colorId: 'field-color',
  note: 'field-note'
}

Page({
  data: {
    themeClass: 'theme-light',
    isEdit: false,
    eventId: '',
    kind: 'event',
    kindOptions: KIND_OPTIONS,
    title: '',
    titleLength: 0,
    maxTitle: LIMITS.eventTitle,
    maxLocation: LIMITS.eventLocation,
    maxNote: LIMITS.note,
    date: '',
    dateLabel: '',
    startTime: '09:00',
    endTime: '10:00',
    location: '',
    note: '',
    noteLength: 0,
    completed: false,
    colors: PRESET_COLORS,
    colorIndex: 0,
    selectedColorName: getColor(DEFAULT_EVENT_COLOR_ID).name,
    errors: {} as FieldErrors,
    focusField: '',
    saving: false,
    dirty: false
  },

  onLoad(query: Record<string, string | undefined>) {
    refreshPageTheme(this)
    const eventId = query && query.id ? query.id : ''
    const event = eventId ? eventService.getById(eventId) : null

    if (event) {
      const colorIndex = Math.max(0, PRESET_COLORS.findIndex((item) => item.id === event.colorId))
      this.setData({
        isEdit: true,
        eventId: event.id,
        kind: event.kind,
        title: event.title,
        titleLength: event.title.length,
        date: event.date,
        dateLabel: formatFullDateWithWeekday(event.date),
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        note: event.note,
        noteLength: event.note.length,
        completed: event.completed,
        colorIndex,
        selectedColorName: getColor(event.colorId).name
      })
      wx.setNavigationBarTitle({ title: event.kind === 'todo' ? '编辑待办' : '编辑日程' })
      return
    }

    const defaultDate = query && query.date && query.date ? query.date : todayString()
    const range = nextHourRange()
    this.setData({
      date: defaultDate,
      dateLabel: formatFullDateWithWeekday(defaultDate),
      startTime: range.start,
      endTime: range.end
    })
    wx.setNavigationBarTitle({ title: '新建日程' })
  },

  onUnload() {
    disableLeaveConfirm()
  },

  markDirty() {
    if (this.data.dirty) return
    this.setData({ dirty: true })
    enableLeaveConfirm('有未保存的修改，确定放弃吗？')
  },

  onKindChange(event: ValueChangeEvent) {
    const kind = String(event.detail.value) === 'todo' ? 'todo' : 'event'
    this.markDirty()
    this.setData({ kind })
  },

  onTitleInput(event: TextInputEvent) {
    this.markDirty()
    this.setData({ title: event.detail.value, titleLength: event.detail.value.length })
  },

  onDateChange(event: ValueChangeEvent) {
    const date = String(event.detail.value)
    this.markDirty()
    this.setData({ date, dateLabel: formatFullDateWithWeekday(date) })
  },

  onStartTimeChange(event: ValueChangeEvent) {
    const startTime = String(event.detail.value)
    let endTime = this.data.endTime
    if (this.data.kind === 'event' && (!endTime || endTime <= startTime)) {
      const minutes = Math.min(Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5)) + 60, 23 * 60 + 59)
      endTime = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    }
    this.markDirty()
    this.setData({ startTime, endTime })
  },

  onEndTimeChange(event: ValueChangeEvent) {
    this.markDirty()
    this.setData({ endTime: String(event.detail.value) })
  },

  onLocationInput(event: TextInputEvent) {
    this.markDirty()
    this.setData({ location: event.detail.value })
  },

  onNoteInput(event: TextInputEvent) {
    this.markDirty()
    this.setData({ note: event.detail.value, noteLength: event.detail.value.length })
  },

  onToggleCompleted() {
    this.markDirty()
    this.setData({ completed: !this.data.completed })
  },

  onSelectColor(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0 || index >= PRESET_COLORS.length) return
    this.markDirty()
    this.setData({ colorIndex: index, selectedColorName: PRESET_COLORS[index].name })
  },

  buildInput(): ScheduleEventInput {
    const color = PRESET_COLORS[this.data.colorIndex] || PRESET_COLORS[0]
    return {
      title: this.data.title,
      date: this.data.date,
      startTime: this.data.startTime,
      endTime: this.data.endTime,
      kind: this.data.kind === 'todo' ? 'todo' : 'event',
      completed: this.data.completed,
      location: this.data.location,
      note: this.data.note,
      colorId: color.id
    }
  },

  scrollToField(field: string | null) {
    if (!field) return
    const id = FIELD_IDS[field]
    if (!id) return
    const query = wx.createSelectorQuery()
    query.select(`#${id}`).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      const rect = res && res[0] ? (res[0] as WechatMiniprogram.BoundingClientRectCallbackResult) : null
      const offset = res && res[1] ? (res[1] as WechatMiniprogram.ScrollOffsetCallbackResult) : null
      if (!rect || !offset) return
      const target = offset.scrollTop + rect.top - 140
      wx.pageScrollTo({ scrollTop: target > 0 ? target : 0, duration: 220 })
    })
  },

  onSave() {
    if (this.data.saving) return
    const input = this.buildInput()
    const result = validateEventInput(input)
    if (!result.ok) {
      this.setData({ errors: result.errors, focusField: result.firstError || '' })
      this.scrollToField(result.firstError)
      const first = result.firstError ? result.errors[result.firstError] : ''
      showToast(this, { message: first || '请检查填写内容', type: 'error' })
      return
    }

    this.setData({ saving: true, errors: {}, focusField: '' })
    try {
      if (this.data.isEdit) {
        eventService.update(this.data.eventId, input)
      } else {
        eventService.create(input)
      }
      disableLeaveConfirm()
      wx.showToast({ title: this.data.isEdit ? '已保存' : '已添加', icon: 'success', duration: 1200 })
      setTimeout(() => {
        wx.navigateBack({ delta: 1 })
      }, 450)
    } catch (error) {
      logError('保存日程失败', error)
      this.setData({ saving: false })
      const message = error instanceof Error ? error.message : '保存失败，请重试'
      showToast(this, { message, type: 'error' })
    }
  },

  onDelete() {
    if (!this.data.isEdit || this.data.saving) return
    confirmAction({
      title: '删除日程',
      content: `确定删除「${this.data.title || '该日程'}」吗？删除后可在提示中撤销。`,
      confirmText: '删除',
      danger: true
    }).then((confirmed) => {
      if (!confirmed) return
      try {
        eventService.remove(this.data.eventId)
        disableLeaveConfirm()
        wx.showToast({ title: '已删除', icon: 'success', duration: 1200 })
        setTimeout(() => {
          wx.navigateBack({ delta: 1 })
        }, 400)
      } catch (error) {
        logError('删除日程失败', error)
        showToast(this, { message: '删除失败，请重试', type: 'error' })
      }
    })
  }
})
