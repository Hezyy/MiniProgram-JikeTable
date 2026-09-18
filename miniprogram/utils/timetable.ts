import type {
  ClassTime,
  Course,
  GridRow,
  GridSectionRow,
  NextCourseInfo,
  PositionedCourse,
  ScheduleEvent,
  Semester,
  TimelineEntry,
  WeekStart,
  Weekday
} from '../types/models'
import {
  getWeekday,
  isTeachingWeek,
  minutesToTime,
  parseDateString,
  timeToMinutes,
  weekNumberOf
} from './date'

/**
 * 课表网格、周次筛选与今日时间线的纯计算逻辑。
 * 本文件不得引用任何 wx.* 能力，便于单元测试。
 */

/** 默认节次数：每天 8:00 - 22:00，共 12 节。 */
export const DEFAULT_SECTION_COUNT = 12

/** 课表网格每节的高度（rpx）。 */
export const SECTION_HEIGHT = 112

/** 课表网格休息行高度（rpx）。 */
export const BREAK_HEIGHT = 48

/** 在哪些节次之后插入休息行。 */
export const BREAK_AFTER_SECTIONS: Array<{ section: number; label: string }> = [
  { section: 4, label: '午休' },
  { section: 8, label: '晚间' }
]

/** 一天的起始与结束分钟数。 */
export const DAY_START_MINUTES = 8 * 60
export const DAY_END_MINUTES = 22 * 60

/** 默认节次时间表。 */
export const DEFAULT_CLASS_TIMES: ClassTime[] = [
  { section: 1, start: '08:00', end: '08:45' },
  { section: 2, start: '08:55', end: '09:40' },
  { section: 3, start: '10:00', end: '10:45' },
  { section: 4, start: '10:55', end: '11:40' },
  { section: 5, start: '14:00', end: '14:45' },
  { section: 6, start: '14:55', end: '15:40' },
  { section: 7, start: '16:00', end: '16:45' },
  { section: 8, start: '16:55', end: '17:40' },
  { section: 9, start: '18:45', end: '19:30' },
  { section: 10, start: '19:35', end: '20:20' },
  { section: 11, start: '20:25', end: '21:10' },
  { section: 12, start: '21:15', end: '22:00' }
]

/** 复制默认节次表，避免调用方修改常量。 */
export function createDefaultClassTimes(): ClassTime[] {
  return DEFAULT_CLASS_TIMES.map((item) => ({ section: item.section, start: item.start, end: item.end }))
}

/**
 * 解析学期节次表；缺失或非法时回退到默认 12 节。
 * 结果按节次升序并按 1..N 重新编号。
 */
export function resolveClassTimes(semester: Semester | null): ClassTime[] {
  const source = semester && Array.isArray(semester.classTimes) ? semester.classTimes : []
  const cleaned: ClassTime[] = []
  for (let i = 0; i < source.length; i += 1) {
    const item = source[i]
    if (!item || typeof item.start !== 'string' || typeof item.end !== 'string') continue
    cleaned.push({ section: cleaned.length + 1, start: item.start, end: item.end })
  }
  if (cleaned.length === 0) return createDefaultClassTimes()
  cleaned.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
  return cleaned.map((item, index) => ({ section: index + 1, start: item.start, end: item.end }))
}

export function sectionCount(classTimes: ClassTime[]): number {
  return classTimes.length
}

export function getClassTime(classTimes: ClassTime[], section: number): ClassTime | null {
  for (let i = 0; i < classTimes.length; i += 1) {
    if (classTimes[i].section === section) return classTimes[i]
  }
  return null
}

/** 课程在某周是否上课。 */
export function courseOccursInWeek(course: Course, week: number): boolean {
  if (!course.weeks || course.weeks.length === 0) return true
  for (let i = 0; i < course.weeks.length; i += 1) {
    if (course.weeks[i] === week) return true
  }
  return false
}

/** 某周的全部课程。 */
export function listCoursesForWeek(courses: Course[], week: number): Course[] {
  const result: Course[] = []
  for (let i = 0; i < courses.length; i += 1) {
    if (courseOccursInWeek(courses[i], week)) result.push(courses[i])
  }
  return result
}

/** 某天的全部课程。 */
export function listCoursesForDate(
  courses: Course[],
  date: string,
  semester: Semester | null,
  weekStartsOn: WeekStart = 1
): Course[] {
  const parsed = parseDateString(date)
  if (!parsed || !semester) return []
  const week = weekNumberOf(date, semester, weekStartsOn)
  if (!isTeachingWeek(week, semester)) return []
  const weekday = getWeekday(parsed)
  const result: Course[] = []
  for (let i = 0; i < courses.length; i += 1) {
    const course = courses[i]
    if (course.weekday === weekday && courseOccursInWeek(course, week)) result.push(course)
  }
  return result
}

/** 构建网格行：节次行 + 休息行。 */
export function buildGridRows(classTimes: ClassTime[]): GridRow[] {
  const rows: GridRow[] = []
  let top = 0
  for (let i = 0; i < classTimes.length; i += 1) {
    const item = classTimes[i]
    const row: GridSectionRow = {
      type: 'section',
      section: item.section,
      label: String(item.section),
      startText: item.start,
      endText: item.end,
      timeText: `${item.start}\n${item.end}`,
      top,
      height: SECTION_HEIGHT
    }
    rows.push(row)
    top += SECTION_HEIGHT
    for (let k = 0; k < BREAK_AFTER_SECTIONS.length; k += 1) {
      if (BREAK_AFTER_SECTIONS[k].section === item.section) {
        rows.push({ type: 'break', label: BREAK_AFTER_SECTIONS[k].label, top, height: BREAK_HEIGHT })
        top += BREAK_HEIGHT
      }
    }
  }
  return rows
}

/** 网格总高度（rpx）。 */
export function gridHeight(rows: GridRow[]): number {
  if (rows.length === 0) return SECTION_HEIGHT
  const last = rows[rows.length - 1]
  return last.top + last.height
}

function findSectionRow(rows: GridRow[], section: number): GridSectionRow | null {
  let fallback: GridSectionRow | null = null
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (row.type !== 'section') continue
    if (row.section === section) return row
    if (row.section < section) fallback = row
  }
  return fallback
}

/** 节次所在网格行的顶部位置。 */
export function sectionTop(rows: GridRow[], section: number): number {
  const row = findSectionRow(rows, section)
  return row ? row.top : 0
}

/** 节次所在网格行的底部位置。 */
export function sectionBottom(rows: GridRow[], section: number): number {
  const row = findSectionRow(rows, section)
  return row ? row.top + row.height : SECTION_HEIGHT
}

/**
 * 为同一天的课程分配列，保证互不重叠。
 * 按重叠簇分别计算列数，单个冲突不会压缩全天课程宽度。
 */
export function layoutDayCourses(courses: Course[], rows: GridRow[]): PositionedCourse[] {
  const sorted = courses.slice().sort((a, b) => {
    if (a.startSection !== b.startSection) return a.startSection - b.startSection
    return b.endSection - a.endSection
  })

  const result: PositionedCourse[] = []
  let index = 0
  while (index < sorted.length) {
    const cluster: Course[] = [sorted[index]]
    let clusterEnd = sorted[index].endSection
    let cursor = index + 1
    while (cursor < sorted.length && sorted[cursor].startSection <= clusterEnd) {
      cluster.push(sorted[cursor])
      clusterEnd = Math.max(clusterEnd, sorted[cursor].endSection)
      cursor += 1
    }

    const columnEnds: number[] = []
    const columns: number[] = []
    for (let i = 0; i < cluster.length; i += 1) {
      const course = cluster[i]
      let column = -1
      for (let k = 0; k < columnEnds.length; k += 1) {
        if (columnEnds[k] < course.startSection) {
          column = k
          break
        }
      }
      if (column === -1) {
        columnEnds.push(course.endSection)
        column = columnEnds.length - 1
      } else {
        columnEnds[column] = course.endSection
      }
      columns.push(column)
    }

    const columnCount = columnEnds.length
    const widthPercent = 100 / columnCount
    for (let i = 0; i < cluster.length; i += 1) {
      const course = cluster[i]
      const top = sectionTop(rows, course.startSection)
      const bottom = sectionBottom(rows, course.endSection)
      result.push({
        course,
        top,
        height: Math.max(SECTION_HEIGHT, bottom - top),
        leftPercent: columns[i] * widthPercent,
        widthPercent,
        conflict: columnCount > 1
      })
    }
    index = cursor
  }

  return result
}

/** 课程的时间区间文案。 */
export function courseTimeRange(course: Course, classTimes: ClassTime[]): { start: string; end: string } {
  const start = getClassTime(classTimes, course.startSection)
  const end = getClassTime(classTimes, course.endSection)
  return { start: start ? start.start : '', end: end ? end.end : '' }
}

/** 课程的时间区间文案，例如 `08:00 - 09:40`。 */
export function courseTimeText(course: Course, classTimes: ClassTime[]): string {
  const range = courseTimeRange(course, classTimes)
  if (!range.start || !range.end) return ''
  return `${range.start} - ${range.end}`
}

/** 按开始节次排序。 */
export function sortCoursesByTime(courses: Course[], classTimes: ClassTime[]): Course[] {
  return courses.slice().sort((a, b) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday
    const startA = getClassTime(classTimes, a.startSection)
    const startB = getClassTime(classTimes, b.startSection)
    return timeToMinutes(startA ? startA.start : '00:00') - timeToMinutes(startB ? startB.start : '00:00')
  })
}

/**
 * 找到正在上的或下一节课程。
 * `todayCourses` 应当已经按日期筛选过。
 */
export function findNextCourse(
  todayCourses: Course[],
  classTimes: ClassTime[],
  now: Date = new Date()
): NextCourseInfo | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  let ongoing: NextCourseInfo | null = null
  let upcoming: NextCourseInfo | null = null

  for (let i = 0; i < todayCourses.length; i += 1) {
    const course = todayCourses[i]
    const range = courseTimeRange(course, classTimes)
    if (!range.start || !range.end) continue
    const startMinutes = timeToMinutes(range.start)
    const endMinutes = timeToMinutes(range.end)
    if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
      const info: NextCourseInfo = {
        course,
        status: 'ongoing',
        startTime: range.start,
        endTime: range.end,
        startMinutes,
        endMinutes,
        minutesUntil: 0
      }
      if (!ongoing || startMinutes < ongoing.startMinutes) ongoing = info
      continue
    }
    if (startMinutes > nowMinutes) {
      const info: NextCourseInfo = {
        course,
        status: 'upcoming',
        startTime: range.start,
        endTime: range.end,
        startMinutes,
        endMinutes,
        minutesUntil: startMinutes - nowMinutes
      }
      if (!upcoming || startMinutes < upcoming.startMinutes) upcoming = info
    }
  }

  return ongoing || upcoming
}

/**
 * 当前时间线的纵向位置（rpx）。
 * 时间在教学时段之外时返回 null，表示不显示。
 */
export function currentTimeLineTop(
  rows: GridRow[],
  classTimes: ClassTime[],
  now: Date = new Date()
): number | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const first = classTimes[0]
  const last = classTimes[classTimes.length - 1]
  if (!first || !last) return null
  if (nowMinutes < timeToMinutes(first.start)) return null
  if (nowMinutes > timeToMinutes(last.end)) return null

  for (let i = 0; i < classTimes.length; i += 1) {
    const item = classTimes[i]
    const start = timeToMinutes(item.start)
    const end = timeToMinutes(item.end)
    const row = findSectionRow(rows, item.section)
    if (!row) continue
    if (nowMinutes < start) return row.top
    if (nowMinutes <= end) {
      const ratio = end === start ? 0 : (nowMinutes - start) / (end - start)
      return row.top + ratio * row.height
    }
  }
  return null
}

function resolveStatus(
  startMinutes: number,
  endMinutes: number,
  nowMinutes: number,
  completed: boolean,
  timed: boolean
): 'pending' | 'ongoing' | 'finished' {
  if (completed) return 'finished'
  if (!timed) return 'pending'
  if (nowMinutes >= startMinutes && nowMinutes < endMinutes) return 'ongoing'
  if (nowMinutes >= endMinutes) return 'finished'
  return 'pending'
}

/**
 * 合并课程与日程，生成今日时间线。
 */
export function buildTimeline(
  courses: Course[],
  events: ScheduleEvent[],
  classTimes: ClassTime[],
  now: Date = new Date()
): TimelineEntry[] {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const entries: TimelineEntry[] = []

  for (let i = 0; i < courses.length; i += 1) {
    const course = courses[i]
    const range = courseTimeRange(course, classTimes)
    if (!range.start || !range.end) continue
    const startMinutes = timeToMinutes(range.start)
    const endMinutes = timeToMinutes(range.end)
    entries.push({
      id: course.id,
      type: 'course',
      title: course.name,
      subtitle: course.teacher,
      timeText: `${range.start} - ${range.end}`,
      location: course.location,
      colorId: course.colorId,
      completed: false,
      isTodo: false,
      startMinutes,
      status: resolveStatus(startMinutes, endMinutes, nowMinutes, false, true)
    })
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]
    const startMinutes = timeToMinutes(event.startTime)
    const timed = event.kind === 'event' && !!event.endTime
    const endMinutes = timed ? timeToMinutes(event.endTime) : startMinutes
    entries.push({
      id: event.id,
      type: 'event',
      title: event.title,
      subtitle: event.kind === 'todo' ? '待办' : '',
      timeText: timed ? `${event.startTime} - ${event.endTime}` : event.startTime,
      location: event.location,
      colorId: event.colorId,
      completed: event.completed,
      isTodo: event.kind === 'todo',
      startMinutes,
      status: resolveStatus(startMinutes, endMinutes, nowMinutes, event.completed, timed)
    })
  }

  entries.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes
    if (a.type !== b.type) return a.type === 'course' ? -1 : 1
    return a.title.localeCompare(b.title)
  })

  return entries
}

/** 星期顺序对应的列下标。 */
export function weekdayColumnIndex(weekday: Weekday, weekStartsOn: WeekStart = 1): number {
  return (weekday - weekStartsOn + 7) % 7
}

/** 把分钟数转换为网格纵坐标，用于非节次对齐的场景。 */
export function minutesToGridTop(minutes: number, rows: GridRow[], classTimes: ClassTime[]): number {
  for (let i = 0; i < classTimes.length; i += 1) {
    const item = classTimes[i]
    const start = timeToMinutes(item.start)
    const end = timeToMinutes(item.end)
    const row = findSectionRow(rows, item.section)
    if (!row) continue
    if (minutes <= start) return row.top
    if (minutes <= end) {
      const ratio = end === start ? 0 : (minutes - start) / (end - start)
      return row.top + ratio * row.height
    }
  }
  return gridHeight(rows)
}

/** 节次区间文案，例如 `第 1-2 节`。 */
export function sectionRangeLabel(startSection: number, endSection: number): string {
  if (startSection === endSection) return `第 ${startSection} 节`
  return `第 ${startSection}-${endSection} 节`
}

/** 生成周次模式下的周次文案，例如 `1-16 周`。 */
export function weeksSummary(weeks: number[]): string {
  if (!weeks || weeks.length === 0) return '全部周次'
  const sorted = weeks.slice().sort((a, b) => a - b)
  const ranges: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i += 1) {
    const current = sorted[i]
    if (current === prev + 1) {
      prev = current
      continue
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = current
    prev = current
  }
  return `${ranges.join('、')} 周`
}

/** 判断周次列表是否为「全部周次」。 */
export function isAllWeeks(weeks: number[], totalWeeks: number): boolean {
  if (!weeks || weeks.length !== totalWeeks) return false
  for (let i = 1; i <= totalWeeks; i += 1) {
    if (weeks.indexOf(i) === -1) return false
  }
  return true
}

/** 判断周次列表是否为单周或双周。 */
export function detectWeekPattern(weeks: number[], totalWeeks: number): 'all' | 'odd' | 'even' | 'custom' {
  if (isAllWeeks(weeks, totalWeeks)) return 'all'
  const sorted = weeks.slice().sort((a, b) => a - b)
  let odd = true
  let even = true
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] % 2 === 0) odd = false
    else even = false
  }
  if (odd && sorted.length > 0) return 'odd'
  if (even && sorted.length > 0) return 'even'
  return 'custom'
}

/** 生成 1..totalWeeks 的周次列表。 */
export function allWeeks(totalWeeks: number): number[] {
  const weeks: number[] = []
  for (let i = 1; i <= totalWeeks; i += 1) weeks.push(i)
  return weeks
}

/** 生成单周或双周列表。 */
export function patternWeeks(totalWeeks: number, parity: 'odd' | 'even'): number[] {
  const weeks: number[] = []
  for (let i = 1; i <= totalWeeks; i += 1) {
    if (parity === 'odd' ? i % 2 === 1 : i % 2 === 0) weeks.push(i)
  }
  return weeks
}

/** 计算下一周次，用于「下一周」按钮；越界时返回 null。 */
export function clampWeek(week: number, semester: Semester | null): number {
  if (!semester) return 1
  return Math.max(1, Math.min(semester.totalWeeks, week))
}

/** 判断某个时间点是否落在课程内。 */
export function isCourseOngoing(course: Course, classTimes: ClassTime[], now: Date = new Date()): boolean {
  const range = courseTimeRange(course, classTimes)
  if (!range.start || !range.end) return false
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes >= timeToMinutes(range.start) && nowMinutes < timeToMinutes(range.end)
}

/** 判断课程是否已经结束。 */
export function isCourseFinished(course: Course, classTimes: ClassTime[], now: Date = new Date()): boolean {
  const range = courseTimeRange(course, classTimes)
  if (!range.end) return false
  return now.getHours() * 60 + now.getMinutes() >= timeToMinutes(range.end)
}

/** 把分钟数格式化为 `HH:mm`。 */
export function formatMinutes(minutes: number): string {
  return minutesToTime(minutes)
}
