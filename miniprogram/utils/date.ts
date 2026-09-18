import type { Semester, WeekStart, Weekday } from '../types/models'

/**
 * 日期与周次计算。
 *
 * 全部对外接口都接收 / 返回本地日期字符串 `YYYY-MM-DD`。
 * 内部使用 `Date.UTC` 归一化后的天数差，避免夏令时导致整天偏移。
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/** 补零到两位。 */
export function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`
}

/** 构造本地零点的 Date。 */
export function createLocalDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

/** Date -> `YYYY-MM-DD`。 */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * 严格解析 `YYYY-MM-DD`，非法（含 2 月 30 日之类）返回 null。
 */
export function parseDateString(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const matched = DATE_PATTERN.exec(value)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = createLocalDate(year, month, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

export function isValidDateString(value: unknown): boolean {
  return parseDateString(value) !== null
}

export function isValidTimeString(value: unknown): boolean {
  return typeof value === 'string' && TIME_PATTERN.test(value)
}

/** 取当天零点。 */
export function startOfDay(date: Date): Date {
  return createLocalDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** 加减天数，按本地日历计算，跨月跨年与夏令时安全。 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0)
}

/** 对日期字符串加减天数。 */
export function addDaysToDateString(value: string, days: number): string {
  const date = parseDateString(value)
  if (!date) return value
  return toDateString(addDays(date, days))
}

/** 归一化到 UTC 的天序号。 */
function dayIndex(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY)
}

/** `to - from` 的整天数。 */
export function diffInDays(from: Date, to: Date): number {
  return dayIndex(to) - dayIndex(from)
}

/** 两个日期字符串之间的整天数。 */
export function diffDateStrings(from: string, to: string): number {
  const a = parseDateString(from)
  const b = parseDateString(to)
  if (!a || !b) return 0
  return diffInDays(a, b)
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

/** 取星期，周一为 1。 */
export function getWeekday(date: Date): Weekday {
  return ((((date.getDay() + 6) % 7) + 1) as Weekday)
}

/** 把任意输入安全转换为星期，非法时回退。 */
export function toWeekday(value: unknown, fallback: Weekday = 1): Weekday {
  const num = typeof value === 'number' ? value : Number(value)
  if (Number.isInteger(num) && num >= 1 && num <= 7) return num as Weekday
  return fallback
}

export function weekdayLabel(weekday: Weekday): string {
  return WEEKDAY_LABELS[weekday - 1] || ''
}

/** 从指定周起始日开始的星期顺序，例如周一起始返回 [1,2,3,4,5,6,7]。 */
export function weekdayOrder(weekStartsOn: WeekStart = 1): Weekday[] {
  const order: Weekday[] = []
  for (let i = 0; i < 7; i += 1) {
    order.push((((weekStartsOn - 1 + i) % 7) + 1) as Weekday)
  }
  return order
}

/** 目标日期所在周的起始日。 */
export function startOfWeek(date: Date, weekStartsOn: WeekStart = 1): Date {
  const offset = (getWeekday(date) - weekStartsOn + 7) % 7
  return addDays(date, -offset)
}

/** `HH:mm` -> 当天分钟数。 */
export function timeToMinutes(value: string): number {
  if (!isValidTimeString(value)) return 0
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
}

/** 当天分钟数 -> `HH:mm`。 */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`
}

/** 当前时间 `HH:mm`。 */
export function nowTimeString(now: Date = new Date()): string {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
}

export function todayString(now: Date = new Date()): string {
  return toDateString(now)
}

/** 时间区间文案，结束时间为空时只显示开始时间。 */
export function formatTimeRange(start: string, end: string): string {
  if (!end) return start
  return `${start} - ${end}`
}

/**
 * 下一个整点区间，用于新建日程的默认值。
 * 已是整点时使用当前整点；接近午夜时收敛到 23:00 - 23:59。
 */
export function nextHourRange(now: Date = new Date()): { start: string; end: string } {
  const base = now.getMinutes() === 0 ? now.getHours() : now.getHours() + 1
  const startMinutes = Math.min(base * 60, 23 * 60)
  const endMinutes = Math.min(startMinutes + 60, 23 * 60 + 59)
  return { start: minutesToTime(startMinutes), end: minutesToTime(endMinutes) }
}

/** `3月5日`。 */
export function formatMonthDay(value: string): string {
  const date = parseDateString(value)
  if (!date) return value
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/** `2025年3月5日`。 */
export function formatFullDate(value: string): string {
  const date = parseDateString(value)
  if (!date) return value
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

/** `2025年3月5日 周三`。 */
export function formatFullDateWithWeekday(value: string): string {
  const date = parseDateString(value)
  if (!date) return value
  return `${formatFullDate(value)} ${weekdayLabel(getWeekday(date))}`
}

/** 距今的相对日期文案。 */
export function formatRelativeDate(value: string, today: string): string {
  const target = parseDateString(value)
  const base = parseDateString(today)
  if (!target || !base) return value
  const delta = diffInDays(base, target)
  if (delta === 0) return '今天'
  if (delta === 1) return '明天'
  if (delta === 2) return '后天'
  if (delta === -1) return '昨天'
  if (delta === -2) return '前天'
  if (delta > 2 && delta <= 7) return `${delta} 天后`
  if (delta < -2 && delta >= -7) return `${-delta} 天前`
  if (target.getFullYear() === base.getFullYear()) return formatMonthDay(value)
  return formatFullDate(value)
}

/** 距离现在多久，用于「下一节课」倒计时。 */
export function formatCountdown(minutes: number): string {
  if (minutes <= 0) return '即将开始'
  if (minutes < 60) return `${minutes} 分钟后`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return `${hours} 小时后`
  return `${hours} 小时 ${rest} 分后`
}

/** 目标日期在学期中的周次，可能小于 1（早于开学）或大于总周数。 */
export function weekNumberOf(dateString: string, semester: Semester, weekStartsOn: WeekStart = 1): number {
  const target = parseDateString(dateString)
  const start = parseDateString(semester.startDate)
  if (!target || !start) return 0
  const targetWeekStart = startOfWeek(target, weekStartsOn)
  const firstWeekStart = startOfWeek(start, weekStartsOn)
  return Math.floor(diffInDays(firstWeekStart, targetWeekStart) / 7) + 1
}

export function isTeachingWeek(week: number, semester: Semester | null): boolean {
  if (!semester) return false
  return Number.isInteger(week) && week >= 1 && week <= semester.totalWeeks
}

/** 第 N 周的起始日期。 */
export function weekStartDate(semester: Semester, week: number, weekStartsOn: WeekStart = 1): string {
  const start = parseDateString(semester.startDate)
  if (!start) return semester.startDate
  const firstWeekStart = startOfWeek(start, weekStartsOn)
  return toDateString(addDays(firstWeekStart, (week - 1) * 7))
}

/** 第 N 周的日期区间。 */
export function weekDateRange(
  semester: Semester,
  week: number,
  weekStartsOn: WeekStart = 1
): { start: string; end: string } {
  const start = weekStartDate(semester, week, weekStartsOn)
  return { start, end: addDaysToDateString(start, 6) }
}

/** 第 N 周内某个星期的日期。 */
export function dateOfWeekday(
  semester: Semester,
  week: number,
  weekday: Weekday,
  weekStartsOn: WeekStart = 1
): string {
  const start = weekStartDate(semester, week, weekStartsOn)
  const offset = (weekday - weekStartsOn + 7) % 7
  return addDaysToDateString(start, offset)
}

/** 周次文案：`第 3 周`。 */
export function weekLabel(week: number): string {
  return `第 ${week} 周`
}

/** 日期区间文案：`3月4日 - 3月10日`。 */
export function formatDateRange(start: string, end: string): string {
  return `${formatMonthDay(start)} - ${formatMonthDay(end)}`
}

/** 学期是否覆盖目标日期。 */
export function isDateInSemester(dateString: string, semester: Semester | null, weekStartsOn: WeekStart = 1): boolean {
  if (!semester) return false
  const week = weekNumberOf(dateString, semester, weekStartsOn)
  return isTeachingWeek(week, semester)
}
