import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Course, Semester } from '../miniprogram/types/models'
import {
  BREAK_HEIGHT,
  DEFAULT_CLASS_TIMES,
  SECTION_HEIGHT,
  allWeeks,
  buildGridRows,
  buildTimeline,
  courseOccursInWeek,
  courseTimeText,
  currentTimeLineTop,
  detectWeekPattern,
  findNextCourse,
  gridHeight,
  isCourseFinished,
  isCourseOngoing,
  layoutDayCourses,
  listCoursesForDate,
  listCoursesForWeek,
  patternWeeks,
  resolveClassTimes,
  sectionRangeLabel,
  weeksSummary
} from '../miniprogram/utils/timetable'

const semester: Semester = {
  id: 'sem_test',
  name: '测试学期',
  startDate: '2024-03-04',
  totalWeeks: 16,
  classTimes: DEFAULT_CLASS_TIMES
}

function makeCourse(partial: Partial<Course>): Course {
  return {
    id: partial.id || 'course_x',
    name: partial.name || '课程',
    teacher: '',
    location: '',
    weekday: partial.weekday || 1,
    startSection: partial.startSection || 1,
    endSection: partial.endSection || 2,
    weeks: partial.weeks || allWeeks(16),
    colorId: 'blue',
    note: '',
    createdAt: 0,
    updatedAt: 0
  }
}

const rows = buildGridRows(DEFAULT_CLASS_TIMES)

test('网格常量与行高', () => {
  assert.equal(DEFAULT_CLASS_TIMES.length, 12)
  assert.equal(rows.length, 14)
  assert.equal(gridHeight(rows), 12 * SECTION_HEIGHT + 2 * BREAK_HEIGHT)
  assert.equal(gridHeight(rows), 1440)
})

test('resolveClassTimes 回退与排序', () => {
  assert.equal(resolveClassTimes(null).length, 12)
  assert.equal(resolveClassTimes({ ...semester, classTimes: [] }).length, 12)
  const custom = resolveClassTimes({
    ...semester,
    classTimes: [
      { section: 9, start: '19:00', end: '19:45' },
      { section: 3, start: '10:00', end: '10:45' }
    ]
  })
  assert.deepEqual(custom, [
    { section: 1, start: '10:00', end: '10:45' },
    { section: 2, start: '19:00', end: '19:45' }
  ])
})

test('courseOccursInWeek 与周次筛选', () => {
  const odd = makeCourse({ id: 'odd', weeks: patternWeeks(16, 'odd') })
  const even = makeCourse({ id: 'even', weeks: patternWeeks(16, 'even') })
  const all = makeCourse({ id: 'all', weeks: allWeeks(16) })
  assert.equal(courseOccursInWeek(odd, 1), true)
  assert.equal(courseOccursInWeek(odd, 2), false)
  assert.equal(courseOccursInWeek(even, 2), true)
  assert.equal(courseOccursInWeek(even, 3), false)
  assert.equal(courseOccursInWeek(all, 16), true)

  const week3 = listCoursesForWeek([odd, even, all], 3).map((item) => item.id)
  assert.deepEqual(week3.sort(), ['all', 'odd'])
  const week4 = listCoursesForWeek([odd, even, all], 4).map((item) => item.id)
  assert.deepEqual(week4.sort(), ['all', 'even'])
})

test('listCoursesForDate 结合星期、周次与教学周', () => {
  const monday = makeCourse({ id: 'mon', weekday: 1, weeks: allWeeks(16) })
  const onlyOdd = makeCourse({ id: 'monOdd', weekday: 1, weeks: patternWeeks(16, 'odd') })
  const tuesday = makeCourse({ id: 'tue', weekday: 2, weeks: allWeeks(16) })
  const courses = [monday, onlyOdd, tuesday]

  // 2024-03-04 是第 1 周周一
  assert.deepEqual(
    listCoursesForDate(courses, '2024-03-04', semester).map((item) => item.id).sort(),
    ['mon', 'monOdd']
  )
  // 第 2 周周一，单周课程不出现
  assert.deepEqual(listCoursesForDate(courses, '2024-03-11', semester).map((item) => item.id), ['mon'])
  // 开学前一周，不属于教学周
  assert.deepEqual(listCoursesForDate(courses, '2024-02-26', semester), [])
  // 超出总周数
  assert.deepEqual(listCoursesForDate(courses, '2024-07-01', semester), [])
  // 未配置学期
  assert.deepEqual(listCoursesForDate(courses, '2024-03-04', null), [])
})

test('layoutDayCourses 处理重叠与并列', () => {
  const a = makeCourse({ id: 'a', startSection: 1, endSection: 2 })
  const b = makeCourse({ id: 'b', startSection: 2, endSection: 3 })
  const laid = layoutDayCourses([a, b], rows)
  assert.equal(laid.length, 2)
  assert.equal(laid[0].widthPercent, 50)
  assert.equal(laid[1].widthPercent, 50)
  assert.equal(laid[0].leftPercent, 0)
  assert.equal(laid[1].leftPercent, 50)
  assert.equal(laid[0].conflict, true)
  assert.equal(laid[0].top, 0)
  assert.equal(laid[0].height, 224)
})

test('layoutDayCourses 相邻不重叠时占满整列', () => {
  const a = makeCourse({ id: 'a', startSection: 1, endSection: 2 })
  const b = makeCourse({ id: 'b', startSection: 3, endSection: 4 })
  const laid = layoutDayCourses([a, b], rows)
  assert.equal(laid[0].widthPercent, 100)
  assert.equal(laid[1].widthPercent, 100)
  assert.equal(laid[0].conflict, false)
  assert.equal(laid[1].conflict, false)
})

test('layoutDayCourses 按节次正确换算纵向位置', () => {
  const late = makeCourse({ id: 'late', startSection: 9, endSection: 12 })
  const laid = layoutDayCourses([late], rows)
  assert.equal(laid[0].top, 992)
  assert.equal(laid[0].height, 448)
  assert.equal(laid[0].top + laid[0].height, gridHeight(rows))
})

test('layoutDayCourses 三个互相重叠的课程分为三列', () => {
  const a = makeCourse({ id: 'a', startSection: 1, endSection: 4 })
  const b = makeCourse({ id: 'b', startSection: 2, endSection: 3 })
  const c = makeCourse({ id: 'c', startSection: 3, endSection: 4 })
  const laid = layoutDayCourses([a, b, c], rows)
  assert.equal(laid.length, 3)
  for (let i = 0; i < laid.length; i += 1) {
    assert.ok(Math.abs(laid[i].widthPercent - 100 / 3) < 0.0001)
  }
})

test('findNextCourse 识别进行中与下一节', () => {
  const first = makeCourse({ id: 'first', startSection: 1, endSection: 2 })
  const second = makeCourse({ id: 'second', startSection: 3, endSection: 4 })
  const courses = [first, second]

  const during = findNextCourse(courses, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 9, 0, 0))
  assert.ok(during)
  assert.equal((during as { course: Course }).course.id, 'first')
  assert.equal((during as { status: string }).status, 'ongoing')

  const beforeSecond = findNextCourse(courses, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 9, 50, 0))
  assert.ok(beforeSecond)
  assert.equal((beforeSecond as { course: Course }).course.id, 'second')
  assert.equal((beforeSecond as { status: string }).status, 'upcoming')
  assert.equal((beforeSecond as { minutesUntil: number }).minutesUntil, 10)

  const afterAll = findNextCourse(courses, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 12, 0, 0))
  assert.equal(afterAll, null)
})

test('currentTimeLineTop 只在教学时段内返回位置', () => {
  assert.equal(currentTimeLineTop(rows, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 7, 0, 0)), null)
  assert.equal(currentTimeLineTop(rows, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 23, 0, 0)), null)

  const duringFirst = currentTimeLineTop(rows, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 8, 22, 0))
  assert.ok(duringFirst !== null)
  assert.ok(Math.abs((duringFirst as number) - (SECTION_HEIGHT * 22) / 45) < 0.001)

  // 09:45 处于第 2 节与第 3 节之间的空档，落在第 3 节顶部
  const inGap = currentTimeLineTop(rows, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 9, 45, 0))
  assert.equal(inGap, 224)
})

test('isCourseOngoing / isCourseFinished', () => {
  const course = makeCourse({ startSection: 1, endSection: 2 })
  assert.equal(isCourseOngoing(course, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 9, 0, 0)), true)
  assert.equal(isCourseFinished(course, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 9, 0, 0)), false)
  assert.equal(isCourseOngoing(course, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 10, 0, 0)), false)
  assert.equal(isCourseFinished(course, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 10, 0, 0)), true)
})

test('buildTimeline 合并课程与日程并按时间排序', () => {
  const course = makeCourse({ id: 'c1', name: '高等数学', startSection: 3, endSection: 4 })
  const events = [
    {
      id: 'e1',
      title: '早读',
      date: '2024-03-04',
      startTime: '07:30',
      endTime: '08:00',
      kind: 'event' as const,
      completed: false,
      location: '',
      note: '',
      colorId: 'blue',
      createdAt: 0,
      updatedAt: 0
    },
    {
      id: 'e2',
      title: '交作业',
      date: '2024-03-04',
      startTime: '21:00',
      endTime: '',
      kind: 'todo' as const,
      completed: true,
      location: '',
      note: '',
      colorId: 'green',
      createdAt: 0,
      updatedAt: 0
    }
  ]
  const timeline = buildTimeline([course], events, DEFAULT_CLASS_TIMES, new Date(2024, 2, 4, 9, 0, 0))
  assert.deepEqual(timeline.map((item) => item.id), ['e1', 'c1', 'e2'])
  assert.equal(timeline[0].status, 'finished')
  assert.equal(timeline[1].type, 'course')
  assert.equal(timeline[1].timeText, '10:00 - 11:40')
  assert.equal(timeline[2].isTodo, true)
  assert.equal(timeline[2].completed, true)
  assert.equal(timeline[2].status, 'finished')
})

test('周次文案与模式识别', () => {
  const all = allWeeks(16)
  assert.equal(detectWeekPattern(all, 16), 'all')
  assert.equal(detectWeekPattern(patternWeeks(16, 'odd'), 16), 'odd')
  assert.equal(detectWeekPattern(patternWeeks(16, 'even'), 16), 'even')
  assert.equal(detectWeekPattern([1, 2, 5], 16), 'custom')
  assert.equal(weeksSummary(all), '1-16 周')
  assert.equal(weeksSummary([1, 3, 5]), '1、3、5 周')
  assert.equal(weeksSummary([1, 2, 3, 7]), '1-3、7 周')
  assert.equal(weeksSummary([]), '全部周次')
  assert.equal(sectionRangeLabel(1, 2), '第 1-2 节')
  assert.equal(sectionRangeLabel(3, 3), '第 3 节')
  assert.equal(courseTimeText(makeCourse({ startSection: 1, endSection: 2 }), DEFAULT_CLASS_TIMES), '08:00 - 09:40')
})
