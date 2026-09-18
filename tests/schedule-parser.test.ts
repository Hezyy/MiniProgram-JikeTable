import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectScheduleFormat,
  expandWeekSpec,
  looksLikeLocation,
  parseCourseCell,
  parseScheduleText,
  parseSectionLabel,
  parseSectionSpec,
  parseWeekSpec
} from '../miniprogram/utils/schedule-parser'

const OPTIONS = { totalWeeks: 16, sectionCount: 12 }

/** 制表符与换行在源码里不可读，用占位符拼装，保证测试用例看得懂。 */
const T = '\t'
const N = '\n'

function grid(...rows: string[][]): string {
  return rows.map((row) => row.join(T)).join(N)
}

test('parseWeekSpec 识别正方多段周次写法', () => {
  assert.deepEqual(parseWeekSpec('1-12周,14-16周'), {
    ranges: [
      { from: 1, to: 12 },
      { from: 14, to: 16 }
    ],
    singles: [],
    parity: 'all',
    whole: false
  })
  assert.deepEqual(expandWeekSpec(parseWeekSpec('1-4周,8-9周')!, 16), [1, 2, 3, 4, 8, 9])
  assert.deepEqual(expandWeekSpec(parseWeekSpec('{第1-4周,第8周}')!, 16), [1, 2, 3, 4, 8])
})

test('parseCourseCell 同格多时段继承课程名', () => {
  const cell = [
    '高等数学A',
    '张伟',
    '1-12周,14-16周',
    '教三楼201',
    '',
    '第5-6节',
    '教三楼201'
  ].join(N)
  const result = parseCourseCell(cell, 1, { start: 1, end: 2 }, OPTIONS)

  assert.equal(result.courses.length, 2)
  assert.equal(result.courses[0].name, '高等数学A')
  assert.equal(result.courses[0].startSection, 1)
  assert.equal(result.courses[1].name, '高等数学A')
  assert.equal(result.courses[1].startSection, 5)
  assert.equal(result.courses[1].endSection, 6)
  assert.deepEqual(result.courses[0].weeks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16])
})

test('parseSectionLabel 识别节次行标签', () => {
  assert.equal(parseSectionLabel('第一节'), 1)
  assert.equal(parseSectionLabel('第十二节'), 12)
  assert.equal(parseSectionLabel('1'), 1)
  assert.equal(parseSectionLabel('第12节'), 12)
  assert.equal(parseSectionLabel('第一节\n08:00\n08:45'), 1)
  assert.equal(parseSectionLabel('高等数学A'), null)
  assert.equal(parseSectionLabel('201'), null)
  assert.equal(parseSectionLabel(''), null)
})

test('parseSectionSpec 识别节次区间', () => {
  assert.deepEqual(parseSectionSpec('第1-2节'), { start: 1, end: 2 })
  assert.deepEqual(parseSectionSpec('3-4节'), { start: 3, end: 4 })
  assert.deepEqual(parseSectionSpec('第5节'), { start: 5, end: 5 })
  assert.deepEqual(parseSectionSpec('1-16周'), null)
  assert.deepEqual(parseSectionSpec('教三楼201'), null)
})

test('parseWeekSpec 识别常见周次写法', () => {
  assert.deepEqual(parseWeekSpec('1-16周'), {
    ranges: [{ from: 1, to: 16 }],
    singles: [],
    parity: 'all',
    whole: false
  })
  assert.equal(parseWeekSpec('1-16周(单)')?.parity, 'odd')
  assert.equal(parseWeekSpec('1-16周（双）')?.parity, 'even')
  assert.deepEqual(parseWeekSpec('1,3,5-8周'), {
    ranges: [{ from: 5, to: 8 }],
    singles: [1, 3],
    parity: 'all',
    whole: false
  })
  assert.equal(parseWeekSpec('单周')?.whole, true)
  assert.deepEqual(parseWeekSpec('3-5'), {
    ranges: [{ from: 3, to: 5 }],
    singles: [],
    parity: 'all',
    whole: false
  })
  assert.equal(parseWeekSpec('高等数学A'), null)
  assert.equal(parseWeekSpec('教三楼201'), null)
  assert.equal(parseWeekSpec('08:00-09:40'), null)
})

test('expandWeekSpec 展开并收敛到学期总周数', () => {
  assert.deepEqual(expandWeekSpec(parseWeekSpec('1-4周')!, 16), [1, 2, 3, 4])
  assert.deepEqual(expandWeekSpec(parseWeekSpec('1-4周')!, 3), [1, 2, 3])
  assert.deepEqual(expandWeekSpec(parseWeekSpec('1-6周(单)')!, 16), [1, 3, 5])
  assert.deepEqual(expandWeekSpec(parseWeekSpec('1-6周(双)')!, 16), [2, 4, 6])
  assert.deepEqual(expandWeekSpec(parseWeekSpec('1,3,5-6周')!, 16), [1, 3, 5, 6])
})

test('looksLikeLocation 区分地点与课程名', () => {
  assert.equal(looksLikeLocation('教三楼201'), true)
  assert.equal(looksLikeLocation('外语楼 305'), true)
  assert.equal(looksLikeLocation('A301'), true)
  assert.equal(looksLikeLocation('体育馆'), true)
  assert.equal(looksLikeLocation('高等数学A'), false)
  assert.equal(looksLikeLocation('张伟'), false)
})

test('parseCourseCell 解析多行单元格', () => {
  const result = parseCourseCell(
    `高等数学A${N}张伟${N}1-16周${N}教三楼201`,
    1,
    { start: 1, end: 1 },
    OPTIONS
  )
  assert.equal(result.courses.length, 1)
  assert.equal(result.issues.length, 0)
  const course = result.courses[0]
  assert.equal(course.name, '高等数学A')
  assert.equal(course.teacher, '张伟')
  assert.equal(course.location, '教三楼201')
  assert.equal(course.weekday, 1)
  assert.equal(course.startSection, 1)
  assert.equal(course.endSection, 1)
  assert.deepEqual(course.weeks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
  assert.equal(course.weeksInferred, false)
})

test('parseCourseCell 单元格自带节次时优先于所在行', () => {
  const result = parseCourseCell(`大学物理${N}刘洋${N}第3-5节${N}1-8周${N}物理实验中心B203`, 3, { start: 1, end: 1 }, OPTIONS)
  assert.equal(result.courses.length, 1)
  assert.equal(result.courses[0].startSection, 3)
  assert.equal(result.courses[0].endSection, 5)
  assert.deepEqual(result.courses[0].weeks, [1, 2, 3, 4, 5, 6, 7, 8])
})

test('parseCourseCell 处理一格多课', () => {
  const result = parseCourseCell(
    `高等数学A${N}张伟${N}1-16周${N}教三楼201${N}大学英语${N}李娜${N}1-8周${N}外语楼305`,
    2,
    { start: 5, end: 5 },
    OPTIONS
  )
  assert.equal(result.courses.length, 2)
  assert.equal(result.courses[0].name, '高等数学A')
  assert.equal(result.courses[1].name, '大学英语')
  assert.deepEqual(result.courses[1].weeks, [1, 2, 3, 4, 5, 6, 7, 8])
})

test('parseCourseCell 支持 ★ 与 @ 分隔的紧凑写法', () => {
  const result = parseCourseCell('线性代数★陈静★1-16周★教二楼108', 2, { start: 1, end: 1 }, OPTIONS)
  assert.equal(result.courses.length, 1)
  assert.equal(result.courses[0].name, '线性代数')
  assert.equal(result.courses[0].teacher, '陈静')
  assert.equal(result.courses[0].location, '教二楼108')
})

test('parseCourseCell 缺少周次时按全部周次导入并标记', () => {
  const result = parseCourseCell(`体育${N}孙磊${N}体育馆2号场`, 4, { start: 5, end: 6 }, OPTIONS)
  assert.equal(result.courses.length, 1)
  assert.equal(result.courses[0].weeksInferred, true)
  assert.deepEqual(result.courses[0].weeks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
})

test('parseCourseCell 无法识别时给出问题记录', () => {
  const result = parseCourseCell('1-16周', 1, { start: 1, end: 1 }, OPTIONS)
  assert.equal(result.courses.length, 0)
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].kind, 'cell')
  assert.equal(result.issues[0].raw, '1-16周')
})

test('detectScheduleFormat 区分网格与逐行两种格式', () => {
  const gridText = grid(
    ['节次', '星期一', '星期二'],
    ['第一节', `高等数学A${N}张伟${N}1-16周${N}教三楼201`, ''],
    ['第二节', '', '']
  )
  assert.equal(detectScheduleFormat(gridText), 'grid')

  const lineText = [
    '高等数学A\t张伟\t1-16周\t星期一\t第1-2节\t教三楼201',
    '大学英语\t李娜\t1-16周\t星期二\t第3-4节\t外语楼305'
  ].join(N)
  assert.equal(detectScheduleFormat(lineText), 'line')

  assert.equal(detectScheduleFormat('随便写点什么'), 'unknown')
})

test('parseScheduleText 忽略「按周次查询」页面混入的第 N 周标记', () => {
  const text = grid(
    ['节次', '星期一', '星期二'],
    ['第3周', '', ''],
    ['第一节', `高等数学A${N}张伟${N}1-12周,14-16周${N}教三楼201`, ''],
    ['第二节', '', ''],
    ['第4周', '', ''],
    ['第一节', `大学英语${N}李娜${N}1-16周${N}外语楼305`, '']
  )

  const result = parseScheduleText(text, OPTIONS)
  assert.equal(result.format, 'grid')
  assert.equal(result.courses.length, 2)
  const math = result.courses.filter((course) => course.name === '高等数学A')[0]
  assert.deepEqual(math.weeks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16])
  // 「第 N 周」标记不能让后面那门课被当成只上第 4 周
  const english = result.courses.filter((course) => course.name === '大学英语')[0]
  assert.equal(english.weeks.length, 16)
})

test('parseScheduleText 解析网格课表', () => {
  const text = grid(
    ['节次', '星期一', '星期二', '星期三', '星期四', '星期五'],
    ['第一节', `高等数学A${N}张伟${N}1-16周${N}教三楼201`, `大学英语${N}李娜${N}1-16周${N}外语楼305`, '', '', ''],
    ['第二节', '', '', `数据结构${N}王强${N}1-16周${N}计算机楼401`, '', ''],
    ['第三节', `大学物理实验${N}刘洋${N}1-16周(单)${N}物理实验中心B203`, '', '', `概率论${N}吴鹏${N}1-8周${N}教三楼306`, '']
  )

  const result = parseScheduleText(text, OPTIONS)
  assert.equal(result.format, 'grid')
  assert.equal(result.dayCount, 5)
  assert.equal(result.issues.length, 0)
  assert.equal(result.courses.length, 5)

  const byName: Record<string, (typeof result.courses)[number]> = {}
  for (const course of result.courses) byName[course.name] = course

  assert.equal(byName['高等数学A'].weekday, 1)
  assert.equal(byName['高等数学A'].startSection, 1)
  assert.equal(byName['大学英语'].weekday, 2)
  assert.equal(byName['数据结构'].weekday, 3)
  assert.equal(byName['数据结构'].startSection, 2)
  assert.equal(byName['大学物理实验'].weekday, 1)
  assert.deepEqual(byName['大学物理实验'].weeks, [1, 3, 5, 7, 9, 11, 13, 15])
  assert.equal(byName['概率论'].weekday, 4)
  assert.equal(result.maxWeek, 16)
  assert.equal(result.maxSection, 3)
})

test('parseScheduleText 合并被合并单元格重复出现的连堂课', () => {
  const cell = `高等数学A${N}张伟${N}1-16周${N}教三楼201`
  const text = grid(
    ['节次', '星期一', '星期二'],
    ['第一节', cell, ''],
    ['第二节', cell, ''],
    ['第三节', '', `大学英语${N}李娜${N}1-16周${N}外语楼305`]
  )

  const result = parseScheduleText(text, OPTIONS)
  assert.equal(result.courses.length, 2)
  const math = result.courses.filter((course) => course.name === '高等数学A')
  assert.equal(math.length, 1)
  assert.equal(math[0].startSection, 1)
  assert.equal(math[0].endSection, 2)
})

test('parseScheduleText 解析逐行课程记录', () => {
  const text = [
    '高等数学A\t张伟\t1-16周\t星期一\t第1-2节\t教三楼201',
    '大学英语\t李娜\t1-16周\t星期二\t第3-4节\t外语楼305',
    '大学物理实验\t刘洋\t1-16周(单)\t星期三\t第3-5节\t物理实验中心B203'
  ].join(N)

  const result = parseScheduleText(text, OPTIONS)
  assert.equal(result.format, 'line')
  assert.equal(result.courses.length, 3)

  const physics = result.courses[2]
  assert.equal(physics.name, '大学物理实验')
  assert.equal(physics.weekday, 3)
  assert.equal(physics.startSection, 3)
  assert.equal(physics.endSection, 5)
  assert.deepEqual(physics.weeks, [1, 3, 5, 7, 9, 11, 13, 15])
  assert.equal(physics.location, '物理实验中心B203')
})

test('parseScheduleText 对空内容与无法识别的内容给出可操作提示', () => {
  const empty = parseScheduleText('   ', OPTIONS)
  assert.equal(empty.format, 'unknown')
  assert.ok(empty.issues.length > 0)

  const garbage = parseScheduleText('今天天气不错，随便写点东西', OPTIONS)
  assert.equal(garbage.format, 'unknown')
  assert.equal(garbage.courses.length, 0)
  assert.ok(garbage.issues[0].message.indexOf('课表结构') >= 0)
})

test('parseScheduleText 忽略表头之外的时间列与非课程行', () => {
  const text = grid(
    ['节次', '时间', '星期一', '星期二'],
    ['上午', '', '', ''],
    ['第一节', '08:00-08:45', `高等数学A${N}张伟${N}1-16周${N}教三楼201`, ''],
    ['第二节', '08:55-09:40', '', '']
  )

  const result = parseScheduleText(text, OPTIONS)
  assert.equal(result.courses.length, 1)
  assert.equal(result.courses[0].weekday, 1)
  assert.equal(result.courses[0].startSection, 1)
})
