import type { ClassTime, CourseBlockVM, GridRow, PositionedCourse, Semester, Weekday } from '../../types/models'
import { appStore } from '../../store/app-store'
import { courseService } from '../../services/course-service'
import { getColor } from '../../utils/colors'
import {
  dateOfWeekday,
  formatDateRange,
  todayString,
  weekDateRange,
  weekLabel,
  weekNumberOf,
  weekdayLabel,
  weekdayOrder
} from '../../utils/date'
import { showToast } from '../../utils/feedback'
import { logError } from '../../utils/logger'
import { refreshPageTheme } from '../../utils/theme'
import { clearRegisteredTimers, registerInterval } from '../../utils/timers'
import {
  buildGridRows,
  courseTimeRange,
  courseTimeText,
  currentTimeLineTop,
  gridHeight,
  isCourseFinished,
  isCourseOngoing,
  layoutDayCourses,
  resolveClassTimes,
  weeksSummary
} from '../../utils/timetable'
import { restoreUndo, setUndo, takeUndo } from '../../utils/undo'

const UNSUBSCRIBERS = new WeakMap<object, () => void>()

interface WeekdayHeader {
  weekday: Weekday
  label: string
  dateText: string
  isToday: boolean
}

interface DayColumn {
  weekday: Weekday
  isToday: boolean
  blocks: CourseBlockVM[]
}

interface CourseDetail {
  id: string
  name: string
  teacher: string
  location: string
  timeText: string
  weeksText: string
  weekdayText: string
  note: string
  bg: string
  text: string
  bar: string
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

Page({
  data: {
    themeClass: 'theme-light',
    hasSemester: false,
    week: 0,
    totalWeeks: 0,
    weekTitle: '',
    weekRangeText: '',
    isCurrentWeek: false,
    weekdayHeaders: [] as WeekdayHeader[],
    dayColumns: [] as DayColumn[],
    rows: [] as GridRow[],
    gridHeight: 0,
    timeLineTop: 0,
    timeLineVisible: false,
    conflictCount: 0,
    canPrev: false,
    canNext: false,
    detail: null as CourseDetail | null,
    detailShow: false
  },

  onLoad() {
    const unsubscribe = appStore.subscribe(() => {
      refreshPageTheme(this)
    })
    UNSUBSCRIBERS.set(this, unsubscribe)
    this.setData({ week: this.defaultWeek() })
  },

  onShow() {
    refreshPageTheme(this)
    this.refresh()
    // 每分钟更新一次「当前时间」指示线
    clearRegisteredTimers(this)
    registerInterval(this, () => this.refreshTimeLine(), 60 * 1000)
  },

  onHide() {
    clearRegisteredTimers(this)
  },

  onUnload() {
    clearRegisteredTimers(this)
    const unsubscribe = UNSUBSCRIBERS.get(this)
    if (unsubscribe) unsubscribe()
    UNSUBSCRIBERS.set(this, undefined as unknown as () => void)
  },

  /** 当前教学周，越界时收敛到 1..totalWeeks。 */
  defaultWeek(): number {
    const data = appStore.getData()
    const semester = data.semester
    if (!semester) return 1
    const week = weekNumberOf(todayString(), semester, data.preferences.weekStartsOn)
    return Math.max(1, Math.min(semester.totalWeeks, week))
  },

  buildBlocks(
    positioned: PositionedCourse[],
    classTimes: ClassTime[],
    isTodayColumn: boolean,
    now: Date
  ): CourseBlockVM[] {
    const blocks: CourseBlockVM[] = []
    for (let i = 0; i < positioned.length; i += 1) {
      const item = positioned[i]
      const course = item.course
      blocks.push({
        id: course.id,
        name: course.name,
        location: course.location,
        teacher: course.teacher,
        timeText: courseTimeText(course, classTimes),
        weeksText: weeksSummary(course.weeks),
        colorId: course.colorId,
        top: item.top,
        height: item.height,
        leftPercent: round3(item.leftPercent),
        widthPercent: round3(item.widthPercent),
        isOngoing: isTodayColumn && isCourseOngoing(course, classTimes, now),
        isFinished: isTodayColumn && isCourseFinished(course, classTimes, now),
        conflict: item.conflict
      })
    }
    return blocks
  },

  refresh() {
    const data = appStore.getData()
    const semester: Semester | null = data.semester
    if (!semester) {
      this.setData({
        hasSemester: false,
        weekdayHeaders: [],
        dayColumns: [],
        rows: [],
        gridHeight: 0,
        weekTitle: '',
        weekRangeText: '',
        conflictCount: 0,
        timeLineVisible: false,
        canPrev: false,
        canNext: false
      })
      return
    }

    const weekStartsOn = data.preferences.weekStartsOn
    const totalWeeks = semester.totalWeeks
    const week = Math.max(1, Math.min(totalWeeks, this.data.week || 1))
    const classTimes = resolveClassTimes(semester)
    const rows = buildGridRows(classTimes)
    const courses = courseService.listByWeek(week)
    const now = new Date()
    const today = todayString(now)
    const currentWeek = weekNumberOf(today, semester, weekStartsOn)

    const order = weekdayOrder(weekStartsOn)
    const weekdayHeaders: WeekdayHeader[] = []
    const dayColumns: DayColumn[] = []
    let conflictCount = 0

    for (let i = 0; i < order.length; i += 1) {
      const weekday = order[i]
      const date = dateOfWeekday(semester, week, weekday, weekStartsOn)
      const isToday = date === today
      weekdayHeaders.push({
        weekday,
        label: weekdayLabel(weekday),
        dateText: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`,
        isToday
      })
      const dayCourses = courses.filter((course) => course.weekday === weekday)
      const positioned = layoutDayCourses(dayCourses, rows)
      const blocks = this.buildBlocks(positioned, classTimes, isToday, now)
      for (let k = 0; k < blocks.length; k += 1) {
        if (blocks[k].conflict) conflictCount += 1
      }
      dayColumns.push({ weekday, isToday, blocks })
    }

    const range = weekDateRange(semester, week, weekStartsOn)
    const timeLineTop = currentTimeLineTop(rows, classTimes, now)
    const totalHeight = gridHeight(rows)

    this.setData({
      hasSemester: true,
      week,
      totalWeeks,
      weekTitle: weekLabel(week),
      weekRangeText: formatDateRange(range.start, range.end),
      isCurrentWeek: currentWeek === week,
      weekdayHeaders,
      dayColumns,
      rows,
      gridHeight: totalHeight,
      conflictCount,
      canPrev: week > 1,
      canNext: week < totalWeeks,
      timeLineTop: timeLineTop === null ? 0 : timeLineTop,
      timeLineVisible: timeLineTop !== null && currentWeek === week
    })
  },

  /** 只更新时间线位置，避免整表重算。 */
  refreshTimeLine() {
    const data = appStore.getData()
    const semester = data.semester
    if (!semester) return
    const classTimes = resolveClassTimes(semester)
    const rows = this.data.rows as GridRow[]
    if (rows.length === 0) return
    const now = new Date()
    const currentWeek = weekNumberOf(todayString(now), semester, data.preferences.weekStartsOn)
    const top = currentTimeLineTop(rows, classTimes, now)
    this.setData({
      timeLineTop: top === null ? 0 : top,
      timeLineVisible: top !== null && currentWeek === this.data.week
    })
  },

  onPrevWeek() {
    if (!this.data.canPrev) return
    this.setData({ week: this.data.week - 1 }, () => this.refresh())
  },

  onNextWeek() {
    if (!this.data.canNext) return
    this.setData({ week: this.data.week + 1 }, () => this.refresh())
  },

  onBackToCurrent() {
    const week = this.defaultWeek()
    if (week === this.data.week) {
      showToast(this, { message: '已经是本周', type: 'info' })
      return
    }
    this.setData({ week }, () => this.refresh())
  },

  onOpenSettings() {
    wx.switchTab({ url: '/pages/settings/index' })
  },

  onAddCourse() {
    if (!this.data.hasSemester) {
      this.onOpenSettings()
      return
    }
    wx.navigateTo({ url: '/pages/course-edit/index' })
  },

  onTapCourse(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const id = event.detail && event.detail.id
    if (!id) return
    this.openCourseDetail(id)
  },

  openCourseDetail(id: string) {
    const course = courseService.getById(id)
    if (!course) {
      showToast(this, { message: '该课程可能已被删除', type: 'error' })
      this.refresh()
      return
    }
    const data = appStore.getData()
    const classTimes = resolveClassTimes(data.semester)
    const range = courseTimeRange(course, classTimes)
    const color = getColor(course.colorId)
    this.setData({
      detail: {
        id: course.id,
        name: course.name,
        teacher: course.teacher,
        location: course.location,
        timeText: range.start && range.end ? `${range.start} - ${range.end}` : '',
        weeksText: weeksSummary(course.weeks),
        weekdayText: weekdayLabel(course.weekday),
        note: course.note,
        bg: color.bg,
        text: color.text,
        bar: color.bar
      },
      detailShow: true
    })
  },

  onCloseDetail() {
    this.setData({ detailShow: false })
  },

  onEditCourse() {
    const detail = this.data.detail
    if (!detail) return
    this.setData({ detailShow: false })
    wx.navigateTo({ url: `/pages/course-edit/index?id=${detail.id}` })
  },

  onDeleteCourse() {
    const detail = this.data.detail
    if (!detail) return
    wx.showModal({
      title: '删除课程',
      content: `确定删除「${detail.name}」吗？`,
      confirmText: '删除',
      confirmColor: '#d9485f',
      success: (res) => {
        if (!res.confirm) return
        try {
          const removed = courseService.remove(detail.id)
          setUndo(this, { kind: 'course', label: removed.name, course: removed })
          this.setData({ detailShow: false })
          showToast(this, { message: '已删除课程', type: 'success', actionText: '撤销' })
          this.refresh()
        } catch (error) {
          logError('删除课程失败', error)
          showToast(this, { message: '删除失败，请重试', type: 'error' })
        }
      }
    })
  },

  onToastAction() {
    const snapshot = takeUndo(this)
    if (!snapshot) return
    try {
      restoreUndo(snapshot)
      showToast(this, { message: '已恢复', type: 'success' })
      this.refresh()
    } catch (error) {
      logError('恢复删除失败', error)
      showToast(this, { message: '恢复失败，请重试', type: 'error' })
    }
  }
})
