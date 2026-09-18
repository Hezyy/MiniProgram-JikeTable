import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_ID,
  MAX_COURSES,
  SCHEMA_VERSION,
  buildExportPayload,
  createDefaultAppData,
  createSemester,
  migrateAppData,
  parseImportPayload,
  sanitizeAppData,
  summarize
} from '../miniprogram/utils/schema'

const validSemester = { name: '测试学期', startDate: '2024-03-04', totalWeeks: 16 }

const validCourse = {
  name: '高等数学',
  teacher: '张伟',
  location: '教三楼 201',
  weekday: 1,
  startSection: 1,
  endSection: 2,
  weeks: [1, 2, 3],
  colorId: 'blue',
  note: ''
}

const validEvent = {
  title: '小组会议',
  date: '2024-03-04',
  startTime: '19:00',
  endTime: '20:00',
  kind: 'event',
  colorId: 'violet'
}

test('createDefaultAppData 提供可用的初始结构', () => {
  const data = createDefaultAppData()
  assert.equal(data.version, SCHEMA_VERSION)
  assert.equal(data.initialized, false)
  assert.equal(data.semester, null)
  assert.deepEqual(data.courses, [])
  assert.deepEqual(data.events, [])
  assert.equal(data.preferences.weekStartsOn, 1)
  assert.equal(data.preferences.theme, 'system')
  assert.deepEqual(Object.keys(data.preferences).sort(), ['theme', 'weekStartsOn'])
})

test('createSemester 收敛非法参数', () => {
  const semester = createSemester('测试', '2024-03-04', 999)
  assert.equal(semester.totalWeeks, 30)
  assert.equal(semester.classTimes.length, 12)
  assert.equal(semester.startDate, '2024-03-04')
  const named = createSemester('   ', '2024-03-04', 16)
  assert.equal(named.name, '我的学期')
})

test('migrateAppData 处理丢失、损坏与超前版本', () => {
  const missing = migrateAppData(null)
  assert.equal(missing.migrated, false)
  assert.ok(missing.issues.length > 0)
  assert.equal(missing.data.initialized, false)

  const legacy = migrateAppData({})
  assert.equal(legacy.migrated, true)
  assert.equal(legacy.data.version, SCHEMA_VERSION)

  const future = migrateAppData({ version: SCHEMA_VERSION + 5, initialized: false })
  assert.ok(future.issues.join(' ').indexOf('高于当前支持') >= 0)
  assert.equal(future.data.version, SCHEMA_VERSION)

  const current = migrateAppData({
    version: SCHEMA_VERSION,
    initialized: true,
    semester: validSemester,
    courses: [validCourse],
    events: [validEvent],
    preferences: { weekStartsOn: 7, theme: 'dark' }
  })
  assert.equal(current.migrated, false)
  assert.ok(current.issues.length === 0)
  assert.equal(current.data.initialized, true)
  assert.equal(current.data.courses.length, 1)
  assert.equal(current.data.events.length, 1)
  assert.equal(current.data.preferences.weekStartsOn, 7)
  assert.equal(current.data.preferences.theme, 'dark')
  assert.equal(current.data.semester?.classTimes.length, 12)
})

test('migrateAppData 逐级迁移 v1 数据并移除触觉反馈偏好', () => {
  const v1 = migrateAppData({
    version: 1,
    initialized: true,
    semester: validSemester,
    courses: [validCourse],
    events: [validEvent],
    preferences: { weekStartsOn: 1, theme: 'light', hapticsEnabled: false }
  })
  assert.equal(v1.migrated, true)
  assert.equal(v1.data.version, SCHEMA_VERSION)
  assert.equal(v1.data.preferences.weekStartsOn, 1)
  assert.equal(v1.data.preferences.theme, 'light')
  assert.equal(v1.data.courses.length, 1)
  assert.equal(v1.data.events.length, 1)
  assert.equal(
    Object.prototype.hasOwnProperty.call(v1.data.preferences, 'hapticsEnabled'),
    false
  )
})

test('sanitizeAppData 丢弃无法识别的数据并保留问题说明', () => {
  const { data, issues } = sanitizeAppData({
    initialized: true,
    semester: validSemester,
    courses: [
      validCourse,
      { name: '', weekday: 1, startSection: 1, endSection: 1, weeks: [1] },
      { name: '坏星期', weekday: 9, startSection: 1, endSection: 1, weeks: [1] },
      { name: '坏节次', weekday: 1, startSection: 0, endSection: 1, weeks: [1] }
    ],
    events: [validEvent, { title: '', date: '2024-03-04', startTime: '09:00' }]
  })
  assert.equal(data.courses.length, 1)
  assert.equal(data.events.length, 1)
  assert.ok(issues.join(' ').indexOf('课程') >= 0)
  assert.ok(issues.join(' ').indexOf('日程') >= 0)
})

test('sanitizeAppData 收敛周次、节次与枚举', () => {
  const { data } = sanitizeAppData({
    initialized: true,
    semester: { name: 'S', startDate: '2024-03-04', totalWeeks: 8 },
    courses: [
      { ...validCourse, weeks: [1, 5, 99, -1], colorId: 'neon' },
      { ...validCourse, name: '节次越界', startSection: 3, endSection: 99 }
    ],
    events: [{ ...validEvent, kind: 'unknown', endTime: '08:00', completed: 'yes' }],
    preferences: { weekStartsOn: 3, theme: 'neon' }
  })
  assert.deepEqual(data.courses[0].weeks, [1, 5])
  assert.equal(data.courses[0].colorId, 'blue')
  // 开始节次越界后回落到结束节次，最大节次为 8 节
  assert.equal(data.courses[1].startSection, 3)
  assert.equal(data.courses[1].endSection, 3)
  assert.equal(data.events[0].kind, 'event')
  // 非法或早于开始时间的结束时间会被修正
  assert.ok(data.events[0].endTime > data.events[0].startTime)
  assert.equal(data.events[0].completed, false)
  assert.equal(data.preferences.weekStartsOn, 1)
  assert.equal(data.preferences.theme, 'system')
})

test('sanitizeAppData 学期无效时视为未初始化', () => {
  const invalid = sanitizeAppData({ initialized: true, semester: { name: 'S', startDate: 'bad' } })
  assert.equal(invalid.data.semester, null)
  assert.equal(invalid.data.initialized, false)
  assert.ok(invalid.issues.length > 0)

  const clamped = sanitizeAppData({ semester: { ...validSemester, totalWeeks: 999 } })
  assert.equal(clamped.data.semester?.totalWeeks, 30)

  const tooSmall = sanitizeAppData({ semester: { ...validSemester, totalWeeks: 0 } })
  assert.equal(tooSmall.data.semester?.totalWeeks, 1)
})

test('summarize 输出导入预览统计', () => {
  const stats = summarize(
    migrateAppData({
      version: SCHEMA_VERSION,
      initialized: true,
      semester: validSemester,
      courses: [validCourse],
      events: [validEvent]
    }).data
  )
  assert.equal(stats.semesterName, '测试学期')
  assert.equal(stats.courses, 1)
  assert.equal(stats.events, 1)
  assert.equal(stats.totalWeeks, 16)
  assert.equal(stats.startDate, '2024-03-04')

  const empty = summarize(createDefaultAppData())
  assert.equal(empty.semesterName, '未配置学期')
  assert.equal(empty.totalWeeks, 0)
})

test('buildExportPayload 包含版本与导出时间', () => {
  const payload = buildExportPayload(createDefaultAppData())
  assert.equal(payload.schemaVersion, SCHEMA_VERSION)
  assert.equal(payload.app, APP_ID)
  assert.ok(payload.exportedAt > 0)
  assert.equal(payload.data.version, SCHEMA_VERSION)
})

test('parseImportPayload 接受合法导出文件与裸数据', () => {
  const raw = {
    version: SCHEMA_VERSION,
    initialized: true,
    semester: validSemester,
    courses: [validCourse],
    events: [validEvent],
    preferences: { weekStartsOn: 1, theme: 'system' }
  }
  const bare = parseImportPayload(JSON.stringify(raw))
  assert.equal(bare.ok, true)
  assert.equal(bare.stats?.courses, 1)

  const wrapped = parseImportPayload(
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      app: APP_ID,
      exportedAt: Date.now(),
      data: raw
    })
  )
  assert.equal(wrapped.ok, true)
  assert.equal(wrapped.stats?.events, 1)
})

test('parseImportPayload 拒绝非法输入且不产生数据', () => {
  assert.equal(parseImportPayload('').ok, false)
  assert.equal(parseImportPayload('   ').ok, false)
  assert.equal(parseImportPayload('这不是 JSON').ok, false)
  assert.equal(parseImportPayload('[]').ok, false)
  assert.equal(parseImportPayload(JSON.stringify({ foo: 'bar' })).ok, false)

  const futureFile = parseImportPayload(
    JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, data: { courses: [validCourse] } })
  )
  assert.equal(futureFile.ok, false)
  assert.ok(futureFile.message.indexOf('高于当前支持') >= 0)
  assert.equal(futureFile.data, undefined)
})

test('parseImportPayload 拒绝超出规模上限的数据', () => {
  const courses = []
  for (let i = 0; i <= MAX_COURSES; i += 1) courses.push(validCourse)
  const result = parseImportPayload(JSON.stringify({ courses, events: [] }))
  assert.equal(result.ok, false)
  assert.ok(result.message.indexOf('超出上限') >= 0)
  assert.equal(result.data, undefined)
})

test('parseImportPayload 在校验通过时不做破坏性修改', () => {
  const result = parseImportPayload(
    JSON.stringify({ semester: validSemester, courses: [validCourse], events: [] })
  )
  assert.equal(result.ok, true)
  assert.equal(result.data?.courses.length, 1)
  assert.equal(result.data?.courses[0].name, '高等数学')
})
