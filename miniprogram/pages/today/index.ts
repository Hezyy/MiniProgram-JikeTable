import type { TimelineEntry } from '../../types/models'
import { appStore } from '../../store/app-store'
import { courseService } from '../../services/course-service'
import { eventService } from '../../services/event-service'
import { getColor } from '../../utils/colors'
import {
  formatCountdown,
  getWeekday,
  isTeachingWeek,
  parseDateString,
  todayString,
  weekLabel,
  weekNumberOf,
  weekdayLabel
} from '../../utils/date'
import { showToast } from '../../utils/feedback'
import { logError } from '../../utils/logger'
import { refreshPageTheme } from '../../utils/theme'
import {
  buildTimeline,
  courseTimeRange,
  findNextCourse,
  resolveClassTimes,
  weeksSummary
} from '../../utils/timetable'
import { restoreUndo, setUndo, takeUndo } from '../../utils/undo'

const UNSUBSCRIBERS = new WeakMap<object, () => void>()

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

Page({
  data: {
    themeClass: 'theme-light',
    hasSemester: false,
    dateNumber: '',
    monthLabel: '',
    weekdayText: '',
    semesterName: '',
    weekText: '',
    hasNext: false,
    nextTitle: '',
    nextTimeText: '',
    nextLocation: '',
    nextColorBar: '',
    nextOngoing: false,
    nextBadge: '',
    nextCountdown: '',
    nextEmptyText: '',
    timeline: [] as TimelineEntry[],
    emptyTitle: '',
    emptyDesc: '',
    detail: null as CourseDetail | null,
    detailShow: false
  },

  onLoad() {
    const unsubscribe = appStore.subscribe(() => {
      refreshPageTheme(this)
    })
    UNSUBSCRIBERS.set(this, unsubscribe)
  },

  onShow() {
    if (!appStore.getData().initialized) {
      wx.reLaunch({ url: '/pages/onboarding/index' })
      return
    }
    refreshPageTheme(this)
    this.refresh()
  },

  onUnload() {
    const unsubscribe = UNSUBSCRIBERS.get(this)
    if (unsubscribe) unsubscribe()
    UNSUBSCRIBERS.set(this, undefined as unknown as () => void)
  },

  onPullDownRefresh() {
    this.refresh()
    wx.stopPullDownRefresh()
  },

  /** 重新计算今日概览与时间线。 */
  refresh() {
    const data = appStore.getData()
    const semester = data.semester
    const now = new Date()
    const date = todayString(now)
    const parsed = parseDateString(date)
    const semesterName = semester ? semester.name : '未设置学期'
    const hasSemester = !!semester
    const weekStartsOn = data.preferences.weekStartsOn
    const week = semester ? weekNumberOf(date, semester, weekStartsOn) : 0
    const teaching = isTeachingWeek(week, semester)
    const classTimes = resolveClassTimes(semester)
    const courses = courseService.listByDate(date)
    const events = eventService.listByDate(date)
    const timeline = buildTimeline(courses, events, classTimes, now)
    const next = findNextCourse(courses, classTimes, now)

    let nextTitle = ''
    let nextTimeText = ''
    let nextLocation = ''
    let nextColorBar = ''
    let nextOngoing = false
    let nextBadge = ''
    let nextCountdown = ''
    let nextEmptyText = ''
    const hasNext = !!next

    if (next) {
      nextOngoing = next.status === 'ongoing'
      nextBadge = nextOngoing ? '进行中' : '下一节'
      nextTitle = next.course.name
      nextTimeText = `${next.startTime} - ${next.endTime}`
      nextLocation = next.course.location
      nextColorBar = getColor(next.course.colorId).bar
      nextCountdown = nextOngoing ? '正在上课' : formatCountdown(next.minutesUntil)
    } else if (!hasSemester) {
      nextEmptyText = '设置学期后即可查看课程'
    } else if (!teaching) {
      nextEmptyText = '当前不在教学周内'
    } else if (courses.length > 0) {
      nextEmptyText = '今日课程已结束'
    } else {
      nextEmptyText = '今天没有课'
    }

    this.setData({
      hasSemester,
      dateNumber: parsed ? String(parsed.getDate()) : '',
      monthLabel: parsed ? `${parsed.getMonth() + 1}月` : '',
      weekdayText: parsed ? weekdayLabel(getWeekday(parsed)) : '',
      semesterName,
      weekText: teaching ? weekLabel(week) : hasSemester ? '非教学周' : '未设置',
      hasNext,
      nextTitle,
      nextTimeText,
      nextLocation,
      nextColorBar,
      nextOngoing,
      nextBadge,
      nextCountdown,
      nextEmptyText,
      timeline,
      emptyTitle: hasSemester ? '今天没有安排' : '还没有设置学期',
      emptyDesc: hasSemester
        ? '可以添加日程，或到课表页添加课程。'
        : '先设置学期名称与开学日期，就能看到每天的课程。'
    })
  },

  onAddEvent() {
    wx.navigateTo({ url: `/pages/event-edit/index?date=${todayString()}` })
  },

  onOpenSettings() {
    wx.switchTab({ url: '/pages/settings/index' })
  },

  onOpenTimetable() {
    wx.switchTab({ url: '/pages/timetable/index' })
  },

  onTapItem(event: WechatMiniprogram.CustomEvent<{ id: string; type: string }>) {
    const detail = event.detail
    if (!detail) return
    if (detail.type === 'course') {
      this.openCourseDetail(detail.id)
      return
    }
    wx.navigateTo({ url: `/pages/event-edit/index?id=${detail.id}` })
  },

  onToggleTodo(event: WechatMiniprogram.CustomEvent<{ id: string; completed: boolean }>) {
    const detail = event.detail
    if (!detail) return
    try {
      eventService.update(detail.id, { completed: detail.completed })
      this.refresh()
    } catch (error) {
      logError('更新待办状态失败', error)
      showToast(this, { message: '更新失败，请重试', type: 'error' })
    }
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
          showToast(this, {
            message: '已删除课程',
            type: 'success',
            actionText: '撤销'
          })
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
