import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CourseInput, ScheduleEventInput } from '../miniprogram/types/models'
import {
  LIMITS,
  normalizeWeeks,
  textLength,
  truncate,
  validateCourseInput,
  validateEventInput,
  validateSemesterInput
} from '../miniprogram/utils/validation'

function courseInput(partial: Partial<CourseInput>): CourseInput {
  return {
    name: '高等数学',
    teacher: '',
    location: '',
    weekday: 1,
    startSection: 1,
    endSection: 2,
    weeks: [1, 2, 3],
    colorId: 'blue',
    note: '',
    ...partial
  }
}

function eventInput(partial: Partial<ScheduleEventInput>): ScheduleEventInput {
  return {
    title: '小组会议',
    date: '2024-03-04',
    startTime: '09:00',
    endTime: '10:00',
    kind: 'event',
    completed: false,
    location: '',
    note: '',
    colorId: 'violet',
    ...partial
  }
}

test('truncate / textLength 按码点处理', () => {
  assert.equal(truncate('abcdef', 3), 'abc')
  assert.equal(truncate('abc', 10), 'abc')
  assert.equal(textLength('课表'), 2)
  assert.equal(textLength('🙂🙂'), 2)
})

test('validateCourseInput 通过合法数据', () => {
  const result = validateCourseInput(courseInput({}), 12, 16)
  assert.equal(result.ok, true)
  assert.equal(result.firstError, null)
})

test('validateCourseInput 校验必填与长度', () => {
  const emptyName = validateCourseInput(courseInput({ name: '   ' }), 12, 16)
  assert.equal(emptyName.ok, false)
  assert.equal(emptyName.firstError, 'name')

  const longName = validateCourseInput(courseInput({ name: 'x'.repeat(LIMITS.courseName + 1) }), 12, 16)
  assert.equal(longName.ok, false)
  assert.ok(longName.errors.name)

  const longTeacher = validateCourseInput(courseInput({ teacher: 'y'.repeat(LIMITS.teacher + 1) }), 12, 16)
  assert.equal(longTeacher.ok, false)
  assert.ok(longTeacher.errors.teacher)
})

test('validateCourseInput 校验节次顺序与范围', () => {
  const reversed = validateCourseInput(courseInput({ startSection: 5, endSection: 3 }), 12, 16)
  assert.equal(reversed.ok, false)
  assert.ok(reversed.errors.endSection)

  const outOfRange = validateCourseInput(courseInput({ startSection: 0, endSection: 99 }), 12, 16)
  assert.equal(outOfRange.ok, false)
  assert.ok(outOfRange.errors.startSection)
  assert.ok(outOfRange.errors.endSection)
})

test('validateCourseInput 校验周次与颜色', () => {
  const noWeeks = validateCourseInput(courseInput({ weeks: [] }), 12, 16)
  assert.equal(noWeeks.ok, false)
  assert.equal(noWeeks.firstError, 'weeks')

  const badWeek = validateCourseInput(courseInput({ weeks: [1, 99] }), 12, 16)
  assert.equal(badWeek.ok, false)
  assert.ok(badWeek.errors.weeks)

  const badColor = validateCourseInput(courseInput({ colorId: 'neon' }), 12, 16)
  assert.equal(badColor.ok, false)
  assert.ok(badColor.errors.colorId)
})

test('validateEventInput 普通日程要求结束晚于开始', () => {
  const ok = validateEventInput(eventInput({}))
  assert.equal(ok.ok, true)

  const same = validateEventInput(eventInput({ endTime: '09:00' }))
  assert.equal(same.ok, false)
  assert.equal(same.firstError, 'endTime')

  const earlier = validateEventInput(eventInput({ startTime: '10:00', endTime: '09:00' }))
  assert.equal(earlier.ok, false)
  assert.ok(earlier.errors.endTime)

  const missingEnd = validateEventInput(eventInput({ endTime: '' }))
  assert.equal(missingEnd.ok, false)
  assert.ok(missingEnd.errors.endTime)
})

test('validateEventInput 待办允许不填写结束时间', () => {
  const todo = validateEventInput(eventInput({ kind: 'todo', endTime: '' }))
  assert.equal(todo.ok, true)

  const todoWithBadEnd = validateEventInput(eventInput({ kind: 'todo', endTime: '08:00' }))
  assert.equal(todoWithBadEnd.ok, false)
  assert.ok(todoWithBadEnd.errors.endTime)
})

test('validateEventInput 校验日期与标题', () => {
  const badDate = validateEventInput(eventInput({ date: '2024-02-30' }))
  assert.equal(badDate.ok, false)
  assert.equal(badDate.firstError, 'date')

  const noTitle = validateEventInput(eventInput({ title: '  ' }))
  assert.equal(noTitle.ok, false)
  assert.equal(noTitle.firstError, 'title')
})

test('validateSemesterInput 校验学期配置', () => {
  assert.equal(
    validateSemesterInput({ name: '2024 春', startDate: '2024-03-04', totalWeeks: 16 }).ok,
    true
  )
  assert.equal(validateSemesterInput({ name: '', startDate: '2024-03-04', totalWeeks: 16 }).ok, false)
  assert.equal(
    validateSemesterInput({ name: '2024 春', startDate: 'bad', totalWeeks: 16 }).firstError,
    'startDate'
  )
  assert.equal(
    validateSemesterInput({ name: '2024 春', startDate: '2024-03-04', totalWeeks: 0 }).firstError,
    'totalWeeks'
  )
  assert.equal(
    validateSemesterInput({ name: '2024 春', startDate: '2024-03-04', totalWeeks: 99 }).firstError,
    'totalWeeks'
  )
})

test('normalizeWeeks 去重、排序并过滤越界值', () => {
  assert.deepEqual(normalizeWeeks([3, 1, 2, 2, 0, 99], 16), [1, 2, 3])
  assert.deepEqual(normalizeWeeks([], 16), [])
  assert.deepEqual(normalizeWeeks([1.5, 2], 16), [2])
})
