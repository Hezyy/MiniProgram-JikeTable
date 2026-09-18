import type {
  AppData,
  ClassTime,
  Course,
  ExportPayload,
  ImportStats,
  Preferences,
  ScheduleEvent,
  Semester
} from '../types/models'
import {
  DEFAULT_COURSE_COLOR_ID,
  DEFAULT_EVENT_COLOR_ID,
  isValidColorId
} from './colors'
import {
  addDays,
  isValidDateString,
  isValidTimeString,
  minutesToTime,
  startOfWeek,
  timeToMinutes,
  toDateString
} from './date'
import { createId } from './id'
import {
  DEFAULT_SECTION_COUNT,
  allWeeks,
  createDefaultClassTimes
} from './timetable'
import {
  LIMITS,
  MAX_TOTAL_WEEKS,
  MIN_TOTAL_WEEKS,
  normalizeWeeks,
  truncate
} from './validation'

/**
 * 本地存储结构、迁移与不可信数据清洗。
 * 本文件不引用 wx.*，可在 Node 中直接单元测试。
 */

/** 本地存储主键。 */
export const STORAGE_KEY = 'timetable_app_data_v1'

/** 数据损坏时保留的原始数据备份主键。 */
export const BACKUP_KEY = 'timetable_app_data_v1_backup'

/** 当前数据结构版本。 */
export const SCHEMA_VERSION = 2

/** 导出文件标识。 */
export const APP_ID = 'jike-timetable'

/** 导入规模上限。 */
export const MAX_COURSES = 500
export const MAX_EVENTS = 2000

/** 学期默认总周数。 */
export const DEFAULT_TOTAL_WEEKS = 20

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  const rounded = Math.round(num)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

function numberOr(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) && num > 0 ? num : fallback
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return truncate(value.trim(), max)
}

export function createDefaultPreferences(): Preferences {
  return { weekStartsOn: 1, theme: 'system' }
}

export function createDefaultAppData(): AppData {
  return {
    version: SCHEMA_VERSION,
    initialized: false,
    semester: null,
    courses: [],
    events: [],
    preferences: createDefaultPreferences()
  }
}

export function createSemester(name: string, startDate: string, totalWeeks: number): Semester {
  return {
    id: createId('sem'),
    name: text(name, LIMITS.semesterName) || '我的学期',
    startDate,
    totalWeeks: clampInt(totalWeeks, MIN_TOTAL_WEEKS, MAX_TOTAL_WEEKS, DEFAULT_TOTAL_WEEKS),
    classTimes: createDefaultClassTimes()
  }
}

function sanitizeClassTimes(value: unknown): ClassTime[] {
  if (!Array.isArray(value)) return createDefaultClassTimes()
  const cleaned: ClassTime[] = []
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i]
    if (!isPlainObject(item)) continue
    if (!isValidTimeString(item.start) || !isValidTimeString(item.end)) continue
    if (timeToMinutes(item.end as string) <= timeToMinutes(item.start as string)) continue
    cleaned.push({ section: 0, start: item.start as string, end: item.end as string })
  }
  if (cleaned.length === 0) return createDefaultClassTimes()
  cleaned.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
  return cleaned.slice(0, 24).map((item, index) => ({
    section: index + 1,
    start: item.start,
    end: item.end
  }))
}

function sanitizeSemester(value: unknown): Semester | null {
  if (!isPlainObject(value)) return null
  if (!isValidDateString(value.startDate)) return null
  const name = text(value.name, LIMITS.semesterName) || '我的学期'
  return {
    id: text(value.id, 64) || createId('sem'),
    name,
    startDate: value.startDate as string,
    totalWeeks: clampInt(value.totalWeeks, MIN_TOTAL_WEEKS, MAX_TOTAL_WEEKS, DEFAULT_TOTAL_WEEKS),
    classTimes: sanitizeClassTimes(value.classTimes)
  }
}

function sanitizePreferences(value: unknown): Preferences {
  const base = createDefaultPreferences()
  if (!isPlainObject(value)) return base
  const weekStartsOn = value.weekStartsOn === 7 ? 7 : 1
  const theme = value.theme === 'light' || value.theme === 'dark' ? value.theme : 'system'
  return { weekStartsOn, theme }
}

function sanitizeWeeks(value: unknown, totalWeeks: number): number[] {
  if (!Array.isArray(value)) return []
  const numbers: number[] = []
  for (let i = 0; i < value.length && i < 200; i += 1) {
    const num = Number(value[i])
    if (Number.isInteger(num)) numbers.push(num)
  }
  return normalizeWeeks(numbers, totalWeeks)
}

function sanitizeCourse(value: unknown, totalWeeks: number, sectionTotal: number): Course | null {
  if (!isPlainObject(value)) return null
  const name = text(value.name, LIMITS.courseName)
  if (!name) return null

  const weekday = Number(value.weekday)
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null

  const startSection = Number(value.startSection)
  if (!Number.isInteger(startSection) || startSection < 1 || startSection > sectionTotal) return null

  let endSection = Number(value.endSection)
  if (!Number.isInteger(endSection) || endSection < 1 || endSection > sectionTotal) endSection = startSection
  if (endSection < startSection) endSection = startSection

  let weeks = sanitizeWeeks(value.weeks, totalWeeks)
  if (weeks.length === 0) weeks = allWeeks(totalWeeks)

  const createdAt = numberOr(value.createdAt, Date.now())
  return {
    id: text(value.id, 64) || createId('course'),
    name,
    teacher: text(value.teacher, LIMITS.teacher),
    location: text(value.location, LIMITS.courseLocation),
    weekday: weekday as Course['weekday'],
    startSection,
    endSection,
    weeks,
    colorId: isValidColorId(value.colorId) ? (value.colorId as string) : DEFAULT_COURSE_COLOR_ID,
    note: text(value.note, LIMITS.note),
    createdAt,
    updatedAt: numberOr(value.updatedAt, createdAt)
  }
}

function sanitizeEvent(value: unknown): ScheduleEvent | null {
  if (!isPlainObject(value)) return null
  const title = text(value.title, LIMITS.eventTitle)
  if (!title) return null
  if (!isValidDateString(value.date)) return null
  if (!isValidTimeString(value.startTime)) return null

  const kind: ScheduleEvent['kind'] = value.kind === 'todo' ? 'todo' : 'event'
  const startTime = value.startTime as string
  let endTime = isValidTimeString(value.endTime) ? (value.endTime as string) : ''
  if (kind === 'event') {
    if (!endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      endTime = minutesToTime(Math.min(timeToMinutes(startTime) + 60, 23 * 60 + 59))
    }
  } else if (endTime && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    endTime = ''
  }

  const createdAt = numberOr(value.createdAt, Date.now())
  return {
    id: text(value.id, 64) || createId('event'),
    title,
    date: value.date as string,
    startTime,
    endTime,
    kind,
    completed: value.completed === true,
    location: text(value.location, LIMITS.eventLocation),
    note: text(value.note, LIMITS.note),
    colorId: isValidColorId(value.colorId) ? (value.colorId as string) : DEFAULT_EVENT_COLOR_ID,
    createdAt,
    updatedAt: numberOr(value.updatedAt, createdAt)
  }
}

/** 清洗任意输入为合法的 AppData。 */
export function sanitizeAppData(raw: unknown): { data: AppData; issues: string[] } {
  const issues: string[] = []
  const source = isPlainObject(raw) ? raw : {}

  const preferences = sanitizePreferences(source.preferences)
  const semester = sanitizeSemester(source.semester)
  if (source.semester && !semester) issues.push('学期配置无法识别，已重置为未初始化')

  const totalWeeks = semester ? semester.totalWeeks : DEFAULT_TOTAL_WEEKS
  const sectionTotal = semester ? semester.classTimes.length : DEFAULT_SECTION_COUNT

  const rawCourses = Array.isArray(source.courses) ? source.courses : []
  const courses: Course[] = []
  let skippedCourses = 0
  for (let i = 0; i < rawCourses.length && i < MAX_COURSES; i += 1) {
    const course = sanitizeCourse(rawCourses[i], totalWeeks, sectionTotal)
    if (course) courses.push(course)
    else skippedCourses += 1
  }
  if (skippedCourses > 0) issues.push(`已跳过 ${skippedCourses} 条无法识别的课程`)
  if (rawCourses.length > MAX_COURSES) issues.push(`课程数量超过上限 ${MAX_COURSES}，多余部分未导入`)

  const rawEvents = Array.isArray(source.events) ? source.events : []
  const events: ScheduleEvent[] = []
  let skippedEvents = 0
  for (let i = 0; i < rawEvents.length && i < MAX_EVENTS; i += 1) {
    const event = sanitizeEvent(rawEvents[i])
    if (event) events.push(event)
    else skippedEvents += 1
  }
  if (skippedEvents > 0) issues.push(`已跳过 ${skippedEvents} 条无法识别的日程`)
  if (rawEvents.length > MAX_EVENTS) issues.push(`日程数量超过上限 ${MAX_EVENTS}，多余部分未导入`)

  const initialized = source.initialized === true && semester !== null

  return {
    data: { version: SCHEMA_VERSION, initialized, semester, courses, events, preferences },
    issues
  }
}

type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>

/**
 * 历史版本迁移链，键为源版本号，值为升级到下一版本的函数。
 * 新增破坏性变更时在此追加，并保留至少一个版本的迁移路径。
 */
const MIGRATIONS: Record<number, MigrationFn> = {
  // v0 -> v1：初版数据未写入 version 字段，结构与 v1 兼容。
  0: (raw) => ({ ...raw, version: 1 }),
  // v1 -> v2：移除触觉反馈偏好，产品改为纯视觉按压反馈。
  1: (raw) => {
    const preferences: Record<string, unknown> = isPlainObject(raw.preferences)
      ? { ...raw.preferences }
      : {}
    delete preferences.hapticsEnabled
    return { ...raw, version: 2, preferences }
  }
}

/** 读取原始数据并迁移到当前版本。 */
export function migrateAppData(raw: unknown): { data: AppData; migrated: boolean; issues: string[] } {
  const issues: string[] = []
  if (!isPlainObject(raw)) {
    issues.push('本地数据格式无法识别，已重置为空数据')
    return { data: createDefaultAppData(), migrated: false, issues }
  }

  let working: Record<string, unknown> = { ...raw }
  const rawVersion = Number(working.version)
  let version = Number.isInteger(rawVersion) && rawVersion >= 0 ? rawVersion : 0

  if (version > SCHEMA_VERSION) {
    issues.push(`本地数据版本 v${version} 高于当前支持的 v${SCHEMA_VERSION}，已按当前版本读取`)
  }

  let migrated = false
  while (version < SCHEMA_VERSION) {
    const migration = MIGRATIONS[version]
    if (!migration) {
      issues.push(`缺少 v${version} 到 v${version + 1} 的迁移函数，已按当前版本读取`)
      break
    }
    working = migration(working)
    version += 1
    migrated = true
  }

  const sanitized = sanitizeAppData(working)
  return { data: sanitized.data, migrated, issues: issues.concat(sanitized.issues) }
}

/** 统计数据结构，用于导入预览。 */
export function summarize(data: AppData): ImportStats {
  return {
    semesterName: data.semester ? data.semester.name : '未配置学期',
    courses: data.courses.length,
    events: data.events.length,
    totalWeeks: data.semester ? data.semester.totalWeeks : 0,
    startDate: data.semester ? data.semester.startDate : ''
  }
}

/** 构造导出文件内容。 */
export function buildExportPayload(data: AppData): ExportPayload {
  return {
    schemaVersion: SCHEMA_VERSION,
    app: APP_ID,
    exportedAt: Date.now(),
    data
  }
}

export interface ParseImportResult {
  ok: boolean
  message: string
  data?: AppData
  stats?: ImportStats
  issues: string[]
}

/** 解析并校验导入内容，全部字段都按不可信数据处理。 */
export function parseImportPayload(raw: unknown): ParseImportResult {
  let parsed: unknown = raw

  if (typeof raw === 'string') {
    const content = raw.trim()
    if (!content) return { ok: false, message: '导入内容为空', issues: [] }
    try {
      parsed = JSON.parse(content)
    } catch {
      return { ok: false, message: '内容不是合法的 JSON 文本', issues: [] }
    }
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, message: '数据结构无法识别', issues: [] }
  }

  let dataSource: unknown = parsed
  if (isPlainObject(parsed.data)) {
    const fileVersion = Number(parsed.schemaVersion)
    if (Number.isInteger(fileVersion) && fileVersion > SCHEMA_VERSION) {
      return {
        ok: false,
        message: `文件版本 v${fileVersion} 高于当前支持的 v${SCHEMA_VERSION}，请先升级小程序`,
        issues: []
      }
    }
    dataSource = parsed.data
  }

  if (!isPlainObject(dataSource)) {
    return { ok: false, message: '未找到可导入的数据段', issues: [] }
  }

  const courseCount = Array.isArray(dataSource.courses) ? dataSource.courses.length : 0
  const eventCount = Array.isArray(dataSource.events) ? dataSource.events.length : 0
  if (courseCount === 0 && eventCount === 0 && !dataSource.semester) {
    return { ok: false, message: '未找到课程或日程数据', issues: [] }
  }
  if (courseCount > MAX_COURSES) {
    return { ok: false, message: `课程数量 ${courseCount} 超出上限 ${MAX_COURSES}`, issues: [] }
  }
  if (eventCount > MAX_EVENTS) {
    return { ok: false, message: `日程数量 ${eventCount} 超出上限 ${MAX_EVENTS}`, issues: [] }
  }

  const { data, issues } = sanitizeAppData(dataSource)
  if (!data.semester && data.courses.length === 0 && data.events.length === 0) {
    return { ok: false, message: '数据内容为空或全部无法识别', issues }
  }

  return { ok: true, message: '数据校验通过', data, stats: summarize(data), issues }
}

/** 首次启动写入的演示数据，用户正式编辑后不再覆盖。 */
export function createDemoAppData(today: Date = new Date()): AppData {
  const monday = startOfWeek(today, 1)
  const startDate = toDateString(addDays(monday, -7 * 2))
  const totalWeeks = 20
  const semester = createSemester('示例学期', startDate, totalWeeks)
  const now = Date.now()

  const courseSeeds: Array<[string, string, string, Course['weekday'], number, number, string, number[]]> = [
    ['高等数学 A', '张伟', '教三楼 201', 1, 1, 2, 'blue', allWeeks(totalWeeks)],
    ['大学英语（三）', '李娜', '外语楼 305', 1, 3, 4, 'teal', allWeeks(totalWeeks)],
    ['数据结构与算法', '王强', '计算机楼 401', 2, 1, 2, 'violet', allWeeks(totalWeeks)],
    ['线性代数', '陈静', '教二楼 108', 2, 5, 6, 'green', allWeeks(totalWeeks)],
    ['大学物理实验', '刘洋', '物理实验中心 B203', 3, 3, 5, 'amber', allWeeks(totalWeeks).filter((w) => w % 2 === 1)],
    ['程序设计基础', '赵敏', '计算机楼 302', 3, 7, 8, 'orange', allWeeks(totalWeeks)],
    ['概率论与数理统计', '吴鹏', '教三楼 306', 4, 1, 2, 'pink', allWeeks(totalWeeks)],
    ['体育（羽毛球）', '孙磊', '体育馆 2 号场', 4, 5, 6, 'rose', allWeeks(totalWeeks)],
    ['中国近现代史纲要', '周婷', '文科楼 210', 5, 3, 4, 'slate', allWeeks(totalWeeks).filter((w) => w % 2 === 0)]
  ]

  const courses: Course[] = courseSeeds.map((seed) => ({
    id: createId('course'),
    name: seed[0],
    teacher: seed[1],
    location: seed[2],
    weekday: seed[3],
    startSection: seed[4],
    endSection: seed[5],
    weeks: seed[7],
    colorId: seed[6],
    note: '',
    createdAt: now,
    updatedAt: now
  }))

  const todayString = toDateString(today)
  const eventSeeds: Array<[string, string, string, string, ScheduleEvent['kind'], boolean, string, string]> = [
    ['小组会议', todayString, '19:00', '20:00', 'event', false, '图书馆 3F 研讨间', 'violet'],
    ['提交数据结构作业', todayString, '21:30', '', 'todo', false, '', 'orange'],
    ['英语四级模拟考', toDateString(addDays(today, 1)), '09:00', '11:00', 'event', false, '外语楼 401', 'blue'],
    ['完成实验报告', toDateString(addDays(today, -1)), '20:00', '', 'todo', true, '', 'green'],
    ['归还借阅图书', toDateString(addDays(today, 3)), '18:00', '', 'todo', false, '图书馆一层', 'amber'],
    ['社团例会', toDateString(addDays(today, 5)), '19:30', '21:00', 'event', false, '大学生活动中心', 'rose']
  ]

  const events: ScheduleEvent[] = eventSeeds.map((seed) => ({
    id: createId('event'),
    title: seed[0],
    date: seed[1],
    startTime: seed[2],
    endTime: seed[3],
    kind: seed[4],
    completed: seed[5],
    location: seed[6],
    note: '',
    colorId: seed[7],
    createdAt: now,
    updatedAt: now
  }))

  return {
    version: SCHEMA_VERSION,
    initialized: true,
    semester,
    courses,
    events,
    preferences: createDefaultPreferences()
  }
}
