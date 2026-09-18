import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Semester } from '../miniprogram/types/models'
import {
  addDaysToDateString,
  dateOfWeekday,
  diffDateStrings,
  diffInDays,
  formatFullDateWithWeekday,
  formatMonthDay,
  formatRelativeDate,
  formatTimeRange,
  getWeekday,
  isTeachingWeek,
  isValidDateString,
  isValidTimeString,
  minutesToTime,
  nextHourRange,
  parseDateString,
  startOfWeek,
  timeToMinutes,
  toDateString,
  weekDateRange,
  weekLabel,
  weekNumberOf,
  weekdayLabel,
  weekdayOrder
} from '../miniprogram/utils/date'

const semester: Semester = {
  id: 'sem_test',
  name: '测试学期',
  startDate: '2024-03-04',
  totalWeeks: 16,
  classTimes: []
}

test('toDateString / parseDateString 往返一致', () => {
  const date = parseDateString('2024-03-04')
  assert.ok(date)
  assert.equal(toDateString(date as Date), '2024-03-04')
})

test('parseDateString 拒绝非法日期', () => {
  assert.equal(parseDateString('2024-02-30'), null)
  assert.equal(parseDateString('2024-13-01'), null)
  assert.equal(parseDateString('2024-2-3'), null)
  assert.equal(parseDateString('2024/03/04'), null)
  assert.equal(parseDateString(20240304), null)
  assert.equal(parseDateString(''), null)
  assert.equal(isValidDateString('2024-02-29'), true)
  assert.equal(isValidDateString('2023-02-29'), false)
})

test('isValidTimeString 只接受 HH:mm', () => {
  assert.equal(isValidTimeString('08:00'), true)
  assert.equal(isValidTimeString('23:59'), true)
  assert.equal(isValidTimeString('24:00'), false)
  assert.equal(isValidTimeString('8:00'), false)
  assert.equal(isValidTimeString('08:60'), false)
})

test('addDaysToDateString 处理跨月、跨年与闰日', () => {
  assert.equal(addDaysToDateString('2024-02-28', 1), '2024-02-29')
  assert.equal(addDaysToDateString('2024-02-28', 2), '2024-03-01')
  assert.equal(addDaysToDateString('2023-02-28', 1), '2023-03-01')
  assert.equal(addDaysToDateString('2024-12-31', 1), '2025-01-01')
  assert.equal(addDaysToDateString('2025-01-01', -1), '2024-12-31')
})

test('diffInDays 在天数上与夏令时无关', () => {
  const from = parseDateString('2024-03-09') as Date
  const to = parseDateString('2024-03-11') as Date
  assert.equal(diffInDays(from, to), 2)
  assert.equal(diffDateStrings('2024-03-09', '2024-03-11'), 2)
  assert.equal(diffDateStrings('2024-11-03', '2024-11-04'), 1)
  assert.equal(diffDateStrings('2024-03-11', '2024-03-09'), -2)
})

test('getWeekday 以周一为 1', () => {
  assert.equal(getWeekday(parseDateString('2024-03-04') as Date), 1)
  assert.equal(getWeekday(parseDateString('2024-03-09') as Date), 6)
  assert.equal(getWeekday(parseDateString('2024-03-10') as Date), 7)
  assert.equal(weekdayLabel(1), '周一')
  assert.equal(weekdayLabel(7), '周日')
})

test('startOfWeek 支持周一与周日作为一周开始', () => {
  const sunday = parseDateString('2024-03-10') as Date
  assert.equal(toDateString(startOfWeek(sunday, 1)), '2024-03-04')
  assert.equal(toDateString(startOfWeek(sunday, 7)), '2024-03-10')
  const monday = parseDateString('2024-03-04') as Date
  assert.equal(toDateString(startOfWeek(monday, 1)), '2024-03-04')
  assert.equal(toDateString(startOfWeek(monday, 7)), '2024-03-03')
})

test('weekdayOrder 随一周起始日轮转', () => {
  assert.deepEqual(weekdayOrder(1), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(weekdayOrder(7), [7, 1, 2, 3, 4, 5, 6])
})

test('weekNumberOf 以开学日期所在周为第 1 周', () => {
  assert.equal(weekNumberOf('2024-03-04', semester), 1)
  assert.equal(weekNumberOf('2024-03-10', semester), 1)
  assert.equal(weekNumberOf('2024-03-11', semester), 2)
  assert.equal(weekNumberOf('2024-02-26', semester), 0)
  assert.equal(weekNumberOf('2024-02-25', semester), -1)
  assert.equal(weekNumberOf('2024-06-24', semester), 17)
})

test('weekNumberOf 支持周日作为一周起始', () => {
  const sundaySemester: Semester = { ...semester, startDate: '2024-03-10' }
  assert.equal(weekNumberOf('2024-03-10', sundaySemester, 7), 1)
  assert.equal(weekNumberOf('2024-03-16', sundaySemester, 7), 1)
  assert.equal(weekNumberOf('2024-03-17', sundaySemester, 7), 2)
})

test('开学日期不在周一时仍以所在周的周一开始计算', () => {
  const wednesdaySemester: Semester = { ...semester, startDate: '2024-03-06' }
  assert.equal(weekNumberOf('2024-03-04', wednesdaySemester), 1)
  assert.equal(weekNumberOf('2024-03-10', wednesdaySemester), 1)
  assert.equal(weekNumberOf('2024-03-11', wednesdaySemester), 2)
  assert.equal(weekNumberOf('2024-03-03', wednesdaySemester), 0)
})

test('isTeachingWeek 排除非教学周', () => {
  assert.equal(isTeachingWeek(1, semester), true)
  assert.equal(isTeachingWeek(16, semester), true)
  assert.equal(isTeachingWeek(17, semester), false)
  assert.equal(isTeachingWeek(0, semester), false)
  assert.equal(isTeachingWeek(1, null), false)
})

test('weekDateRange / dateOfWeekday 与一周起始日一致', () => {
  assert.deepEqual(weekDateRange(semester, 1), { start: '2024-03-04', end: '2024-03-10' })
  assert.deepEqual(weekDateRange(semester, 2), { start: '2024-03-11', end: '2024-03-17' })
  assert.equal(dateOfWeekday(semester, 2, 1), '2024-03-11')
  assert.equal(dateOfWeekday(semester, 2, 7), '2024-03-17')
  assert.equal(dateOfWeekday(semester, 2, 7, 7), '2024-03-10')
  assert.equal(weekLabel(3), '第 3 周')
})

test('时间换算与格式化', () => {
  assert.equal(timeToMinutes('08:00'), 480)
  assert.equal(timeToMinutes('23:59'), 1439)
  assert.equal(timeToMinutes('非法'), 0)
  assert.equal(minutesToTime(480), '08:00')
  assert.equal(minutesToTime(1439), '23:59')
  assert.equal(minutesToTime(-10), '00:00')
  assert.equal(minutesToTime(99999), '23:59')
  assert.equal(formatTimeRange('08:00', '09:40'), '08:00 - 09:40')
  assert.equal(formatTimeRange('08:00', ''), '08:00')
})

test('nextHourRange 收敛到当天范围内', () => {
  const morning = nextHourRange(new Date(2024, 2, 4, 9, 0, 0))
  assert.deepEqual(morning, { start: '09:00', end: '10:00' })
  const between = nextHourRange(new Date(2024, 2, 4, 9, 30, 0))
  assert.deepEqual(between, { start: '10:00', end: '11:00' })
  const lateNight = nextHourRange(new Date(2024, 2, 4, 23, 30, 0))
  assert.deepEqual(lateNight, { start: '23:00', end: '23:59' })
})

test('格式化文案', () => {
  assert.equal(formatMonthDay('2024-03-04'), '3月4日')
  assert.equal(formatFullDateWithWeekday('2024-03-04'), '2024年3月4日 周一')
  assert.equal(formatRelativeDate('2024-03-04', '2024-03-04'), '今天')
  assert.equal(formatRelativeDate('2024-03-05', '2024-03-04'), '明天')
  assert.equal(formatRelativeDate('2024-03-03', '2024-03-04'), '昨天')
  assert.equal(formatRelativeDate('2024-03-09', '2024-03-04'), '5 天后')
  assert.equal(formatRelativeDate('2024-02-28', '2024-03-04'), '5 天前')
  assert.equal(formatRelativeDate('2024-04-01', '2024-03-04'), '4月1日')
  assert.equal(formatRelativeDate('2025-04-01', '2024-03-04'), '2025年4月1日')
})
