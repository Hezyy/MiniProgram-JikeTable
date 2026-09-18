import type { ColorOption, CourseInput, FieldErrors, Weekday } from '../../types/models'
import { appStore } from '../../store/app-store'
import { courseService } from '../../services/course-service'
import { DEFAULT_COURSE_COLOR_ID, PRESET_COLORS, getColor } from '../../utils/colors'
import { weekdayLabel, weekdayOrder } from '../../utils/date'
import { confirmAction, disableLeaveConfirm, enableLeaveConfirm } from '../../utils/dialog'
import { showToast } from '../../utils/feedback'
import { logError } from '../../utils/logger'
import { refreshPageTheme } from '../../utils/theme'
import {
  allWeeks,
  createDefaultClassTimes,
  detectWeekPattern,
  patternWeeks,
  resolveClassTimes
} from '../../utils/timetable'
import { LIMITS, validateCourseInput } from '../../utils/validation'

interface WeekdayOption {
  label: string
  value: Weekday
}

interface SectionOption {
  label: string
  section: number
}

interface WeekCell {
  week: number
  selected: boolean
}

/** 输入框事件。 */
type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>
/** picker / 分段控件事件。 */
type ValueChangeEvent = WechatMiniprogram.CustomEvent<{ value: string | number }>

const WEEK_MODE_OPTIONS = [
  { label: '全部周次', value: 'all' },
  { label: '单周', value: 'odd' },
  { label: '双周', value: 'even' },
  { label: '指定周次', value: 'custom' }
]

const FIELD_IDS: Record<string, string> = {
  name: 'field-name',
  teacher: 'field-teacher',
  location: 'field-location',
  weekday: 'field-weekday',
  startSection: 'field-section',
  endSection: 'field-section',
  weeks: 'field-weeks',
  colorId: 'field-color',
  note: 'field-note'
}

Page({
  data: {
    themeClass: 'theme-light',
    isEdit: false,
    courseId: '',
    name: '',
    teacher: '',
    location: '',
    note: '',
    nameLength: 0,
    noteLength: 0,
    maxName: LIMITS.courseName,
    maxTeacher: LIMITS.teacher,
    maxLocation: LIMITS.courseLocation,
    maxNote: LIMITS.note,
    weekdayOptions: [] as WeekdayOption[],
    weekdayIndex: 0,
    sectionOptions: [] as SectionOption[],
    startIndex: 0,
    endIndex: 0,
    weekMode: 'all',
    weekModeOptions: WEEK_MODE_OPTIONS,
    weekCells: [] as WeekCell[],
    totalWeeks: 0,
    colors: PRESET_COLORS,
    colorIndex: 0,
    selectedColorName: getColor(DEFAULT_COURSE_COLOR_ID).name,
    errors: {} as FieldErrors,
    focusField: '',
    saving: false,
    dirty: false
  },

  onLoad(query: Record<string, string | undefined>) {
    refreshPageTheme(this)
    const data = appStore.getData()
    const semester = data.semester
    const classTimes = resolveClassTimes(semester)
    const totalWeeks = semester ? semester.totalWeeks : 20
    const order = weekdayOrder(data.preferences.weekStartsOn)
    const weekdayOptions: WeekdayOption[] = order.map((weekday) => ({
      label: weekdayLabel(weekday),
      value: weekday
    }))
    const sectionOptions: SectionOption[] = classTimes.map((item) => ({
      label: `第 ${item.section} 节 ${item.start}-${item.end}`,
      section: item.section
    }))

    const courseId = query && query.id ? query.id : ''
    const course = courseId ? courseService.getById(courseId) : null

    if (course) {
      const colorIndex = Math.max(
        0,
        PRESET_COLORS.findIndex((item) => item.id === course.colorId)
      )
      const weeks = course.weeks.slice()
      this.setData({
        isEdit: true,
        courseId: course.id,
        name: course.name,
        teacher: course.teacher,
        location: course.location,
        note: course.note,
        nameLength: course.name.length,
        noteLength: course.note.length,
        weekdayIndex: Math.max(
          0,
          weekdayOptions.findIndex((item) => item.value === course.weekday)
        ),
        startIndex: Math.max(0, course.startSection - 1),
        endIndex: Math.max(0, course.endSection - 1),
        weekMode: detectWeekPattern(weeks, totalWeeks),
        weekCells: this.buildWeekCells(weeks, totalWeeks),
        totalWeeks,
        weekdayOptions,
        sectionOptions,
        colorIndex,
        selectedColorName: getColor(course.colorId).name
      })
      wx.setNavigationBarTitle({ title: '编辑课程' })
      return
    }

    // 新建：支持从课表带入星期与节次
    const presetWeekday = query && query.weekday ? Number(query.weekday) : order[0]
    const presetSection = query && query.section ? Number(query.section) : 1
    const weekdayIndex = Math.max(
      0,
      weekdayOptions.findIndex((item) => item.value === presetWeekday)
    )
    const startIndex = Math.max(0, Math.min(sectionOptions.length - 1, presetSection - 1))
    this.setData({
      totalWeeks,
      weekdayOptions,
      sectionOptions,
      weekdayIndex,
      startIndex,
      endIndex: startIndex,
      weekCells: this.buildWeekCells(allWeeks(totalWeeks), totalWeeks)
    })
    wx.setNavigationBarTitle({ title: '新增课程' })
  },

  onUnload() {
    disableLeaveConfirm()
  },

  buildWeekCells(selected: number[], totalWeeks: number): WeekCell[] {
    const cells: WeekCell[] = []
    for (let i = 1; i <= totalWeeks; i += 1) {
      cells.push({ week: i, selected: selected.indexOf(i) !== -1 })
    }
    return cells
  },

  markDirty() {
    if (this.data.dirty) return
    this.setData({ dirty: true })
    enableLeaveConfirm('有未保存的修改，确定放弃吗？')
  },

  onNameInput(event: TextInputEvent) {
    this.markDirty()
    this.setData({ name: event.detail.value, nameLength: event.detail.value.length })
  },

  onTeacherInput(event: TextInputEvent) {
    this.markDirty()
    this.setData({ teacher: event.detail.value })
  },

  onLocationInput(event: TextInputEvent) {
    this.markDirty()
    this.setData({ location: event.detail.value })
  },

  onNoteInput(event: TextInputEvent) {
    this.markDirty()
    this.setData({ note: event.detail.value, noteLength: event.detail.value.length })
  },

  onWeekdayChange(event: ValueChangeEvent) {
    this.markDirty()
    this.setData({ weekdayIndex: Number(event.detail.value) })
  },

  onStartSectionChange(event: ValueChangeEvent) {
    const index = Number(event.detail.value)
    const endIndex = Math.max(this.data.endIndex, index)
    this.markDirty()
    this.setData({ startIndex: index, endIndex })
  },

  onEndSectionChange(event: ValueChangeEvent) {
    const index = Number(event.detail.value)
    const startIndex = Math.min(this.data.startIndex, index)
    this.markDirty()
    this.setData({ endIndex: index, startIndex })
  },

  onWeekModeChange(event: ValueChangeEvent) {
    const mode = String(event.detail.value)
    const totalWeeks = this.data.totalWeeks
    let weeks: number[]
    if (mode === 'all') weeks = allWeeks(totalWeeks)
    else if (mode === 'odd') weeks = patternWeeks(totalWeeks, 'odd')
    else if (mode === 'even') weeks = patternWeeks(totalWeeks, 'even')
    else weeks = this.selectedWeeks()
    this.markDirty()
    this.setData({ weekMode: mode, weekCells: this.buildWeekCells(weeks, totalWeeks) })
  },

  onToggleWeek(event: WechatMiniprogram.TouchEvent) {
    const week = Number(event.currentTarget.dataset.week)
    if (!Number.isInteger(week)) return
    const cells = this.data.weekCells.slice()
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i].week === week) {
        cells[i] = { week, selected: !cells[i].selected }
        break
      }
    }
    this.markDirty()
    this.setData({ weekCells: cells, weekMode: 'custom' })
  },

  onSelectAllWeeks() {
    const all = allWeeks(this.data.totalWeeks)
    this.markDirty()
    this.setData({ weekCells: this.buildWeekCells(all, this.data.totalWeeks), weekMode: 'all' })
  },

  onClearWeeks() {
    const totalWeeks = this.data.totalWeeks
    this.markDirty()
    this.setData({ weekCells: this.buildWeekCells([], totalWeeks), weekMode: 'custom' })
  },

  onSelectColor(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0 || index >= PRESET_COLORS.length) return
    this.markDirty()
    this.setData({ colorIndex: index, selectedColorName: PRESET_COLORS[index].name })
  },

  selectedWeeks(): number[] {
    const weeks: number[] = []
    const cells = this.data.weekCells
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i].selected) weeks.push(cells[i].week)
    }
    return weeks
  },

  currentColor(): ColorOption {
    return PRESET_COLORS[this.data.colorIndex] || PRESET_COLORS[0]
  },

  buildInput(): CourseInput {
    const weekdayOption = this.data.weekdayOptions[this.data.weekdayIndex]
    const startOption = this.data.sectionOptions[this.data.startIndex]
    const endOption = this.data.sectionOptions[this.data.endIndex]
    return {
      name: this.data.name,
      teacher: this.data.teacher,
      location: this.data.location,
      weekday: weekdayOption ? weekdayOption.value : 1,
      startSection: startOption ? startOption.section : 1,
      endSection: endOption ? endOption.section : 1,
      weeks: this.selectedWeeks(),
      colorId: this.currentColor().id,
      note: this.data.note
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
    const sectionTotal = this.data.sectionOptions.length || createDefaultClassTimes().length
    const result = validateCourseInput(input, sectionTotal, this.data.totalWeeks)
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
        courseService.update(this.data.courseId, input)
      } else {
        courseService.create(input)
      }
      disableLeaveConfirm()
      wx.showToast({ title: this.data.isEdit ? '课程已更新' : '课程已添加', icon: 'success', duration: 1200 })
      setTimeout(() => {
        wx.navigateBack({ delta: 1 })
      }, 500)
    } catch (error) {
      logError('保存课程失败', error)
      this.setData({ saving: false })
      const message = error instanceof Error ? error.message : '保存失败，请重试'
      showToast(this, { message, type: 'error' })
    }
  },

  onDelete() {
    if (this.data.saving || !this.data.isEdit) return
    confirmAction({
      title: '删除课程',
      content: `确定删除「${this.data.name || '该课程'}」吗？删除后可在提示中撤销。`,
      confirmText: '删除',
      danger: true
    }).then((confirmed) => {
      if (!confirmed) return
      try {
        courseService.remove(this.data.courseId)
        disableLeaveConfirm()
        wx.showToast({ title: '已删除课程', icon: 'success', duration: 1200 })
        setTimeout(() => {
          wx.navigateBack({ delta: 1 })
        }, 400)
      } catch (error) {
        logError('删除课程失败', error)
        showToast(this, { message: '删除失败，请重试', type: 'error' })
      }
    })
  }
})
