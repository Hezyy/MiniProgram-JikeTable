import type {
  CourseInput,
  FieldErrors,
  ScheduleEventInput,
  ValidationResult
} from '../types/models'
import { isValidColorId } from './colors'
import { isValidDateString, isValidTimeString, timeToMinutes } from './date'

/** 表单字段长度上限，导入校验共用同一组常量。 */
export const LIMITS = {
  semesterName: 24,
  courseName: 30,
  teacher: 20,
  courseLocation: 30,
  eventTitle: 30,
  eventLocation: 30,
  note: 200
} as const

export const MIN_TOTAL_WEEKS = 1
export const MAX_TOTAL_WEEKS = 30

/** 截断文本到指定长度。 */
export function truncate(value: string, max: number): string {
  if (typeof value !== 'string') return ''
  return value.length > max ? value.slice(0, max) : value
}

/** 统计字符串长度，按 Unicode 码点计算，避免 emoji 被截半。 */
export function textLength(value: string): number {
  if (typeof value !== 'string') return 0
  return Array.from(value).length
}

function buildResult(errors: FieldErrors, order: string[]): ValidationResult {
  const keys = Object.keys(errors)
  if (keys.length === 0) return { ok: true, errors: {}, firstError: null }
  let first: string | null = null
  for (let i = 0; i < order.length; i += 1) {
    if (errors[order[i]]) {
      first = order[i]
      break
    }
  }
  return { ok: false, errors, firstError: first || keys[0] }
}

const COURSE_FIELD_ORDER = [
  'name',
  'teacher',
  'location',
  'weekday',
  'startSection',
  'endSection',
  'weeks',
  'colorId',
  'note'
]

/** 校验课程表单。 */
export function validateCourseInput(
  input: CourseInput,
  sectionTotal: number,
  totalWeeks: number
): ValidationResult {
  const errors: FieldErrors = {}
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (textLength(name) < 1) errors.name = '请填写课程名'
  else if (textLength(name) > LIMITS.courseName) errors.name = `课程名最多 ${LIMITS.courseName} 个字`

  if (textLength(input.teacher || '') > LIMITS.teacher) errors.teacher = `教师最多 ${LIMITS.teacher} 个字`
  if (textLength(input.location || '') > LIMITS.courseLocation) {
    errors.location = `地点最多 ${LIMITS.courseLocation} 个字`
  }

  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
    errors.weekday = '请选择星期'
  }

  if (!Number.isInteger(input.startSection) || input.startSection < 1 || input.startSection > sectionTotal) {
    errors.startSection = '请选择开始节次'
  }
  if (!Number.isInteger(input.endSection) || input.endSection < 1 || input.endSection > sectionTotal) {
    errors.endSection = '请选择结束节次'
  } else if (
    Number.isInteger(input.startSection) &&
    input.startSection >= 1 &&
    input.endSection < input.startSection
  ) {
    errors.endSection = '结束节次不能早于开始节次'
  }

  if (!Array.isArray(input.weeks) || input.weeks.length === 0) {
    errors.weeks = '请至少选择一个周次'
  } else {
    for (let i = 0; i < input.weeks.length; i += 1) {
      const week = input.weeks[i]
      if (!Number.isInteger(week) || week < 1 || week > totalWeeks) {
        errors.weeks = `周次必须在 1 - ${totalWeeks} 之间`
        break
      }
    }
  }

  if (!isValidColorId(input.colorId)) errors.colorId = '请选择颜色'
  if (textLength(input.note || '') > LIMITS.note) errors.note = `备注最多 ${LIMITS.note} 个字`

  return buildResult(errors, COURSE_FIELD_ORDER)
}

const EVENT_FIELD_ORDER = ['title', 'date', 'startTime', 'endTime', 'kind', 'location', 'colorId', 'note']

/** 校验日程 / 待办表单。 */
export function validateEventInput(input: ScheduleEventInput): ValidationResult {
  const errors: FieldErrors = {}
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (textLength(title) < 1) errors.title = '请填写标题'
  else if (textLength(title) > LIMITS.eventTitle) errors.title = `标题最多 ${LIMITS.eventTitle} 个字`

  if (!isValidDateString(input.date)) errors.date = '请选择有效日期'
  if (!isValidTimeString(input.startTime)) errors.startTime = '请选择开始时间'

  if (input.kind !== 'event' && input.kind !== 'todo') {
    errors.kind = '请选择日程类型'
  } else if (input.kind === 'event') {
    if (!isValidTimeString(input.endTime)) errors.endTime = '请选择结束时间'
    else if (isValidTimeString(input.startTime) && timeToMinutes(input.endTime) <= timeToMinutes(input.startTime)) {
      errors.endTime = '结束时间必须晚于开始时间'
    }
  } else if (input.endTime) {
    if (!isValidTimeString(input.endTime)) errors.endTime = '结束时间格式不正确'
    else if (isValidTimeString(input.startTime) && timeToMinutes(input.endTime) <= timeToMinutes(input.startTime)) {
      errors.endTime = '结束时间必须晚于开始时间'
    }
  }

  if (textLength(input.location || '') > LIMITS.eventLocation) {
    errors.location = `地点最多 ${LIMITS.eventLocation} 个字`
  }
  if (!isValidColorId(input.colorId)) errors.colorId = '请选择颜色'
  if (textLength(input.note || '') > LIMITS.note) errors.note = `备注最多 ${LIMITS.note} 个字`

  return buildResult(errors, EVENT_FIELD_ORDER)
}

/** 校验学期初始化 / 设置表单。 */
export function validateSemesterInput(input: {
  name: string
  startDate: string
  totalWeeks: number
}): ValidationResult {
  const errors: FieldErrors = {}
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (textLength(name) < 1) errors.name = '请填写学期名称'
  else if (textLength(name) > LIMITS.semesterName) errors.name = `学期名称最多 ${LIMITS.semesterName} 个字`

  if (!isValidDateString(input.startDate)) errors.startDate = '请选择开学日期'

  if (
    !Number.isInteger(input.totalWeeks) ||
    input.totalWeeks < MIN_TOTAL_WEEKS ||
    input.totalWeeks > MAX_TOTAL_WEEKS
  ) {
    errors.totalWeeks = `总周数需在 ${MIN_TOTAL_WEEKS} - ${MAX_TOTAL_WEEKS} 之间`
  }

  return buildResult(errors, ['name', 'startDate', 'totalWeeks'])
}

/** 把周次列表归一化到 1..totalWeeks，去重并排序。 */
export function normalizeWeeks(weeks: number[], totalWeeks: number): number[] {
  const seen: { [week: number]: boolean } = {}
  const result: number[] = []
  for (let i = 0; i < weeks.length; i += 1) {
    const week = weeks[i]
    if (!Number.isInteger(week) || week < 1 || week > totalWeeks) continue
    if (seen[week]) continue
    seen[week] = true
    result.push(week)
  }
  result.sort((a, b) => a - b)
  return result
}
