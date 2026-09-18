import type { Weekday } from '../types/models'
import { allWeeks, patternWeeks } from './timetable'
import { normalizeWeeks } from './validation'

/**
 * 教务课表文本解析器（ImportProvider）。
 *
 * 设计目标：用户从学校教务系统复制课表后粘贴进来，本地解析成课程。
 * 全过程不接触账号密码、不发起任何网络请求、不上传数据。
 *
 * 支持两种来源格式，自动识别：
 *  1. `grid` —— 课表网格粘贴（浏览器复制表格，单元格以 \t 分隔）；
 *  2. `line` —— 每行一条完整课程记录（教务系统的「课程列表」视图）。
 *
 * 本文件不引用任何 wx.* 能力，可在 Node 中直接单元测试。
 */

// ---------------------------------------------------------------- 类型

export interface ParsedCourse {
  name: string
  teacher: string
  location: string
  weekday: Weekday
  startSection: number
  endSection: number
  weeks: number[]
  /** 原文没有标注周次，已按全部周次导入。 */
  weeksInferred: boolean
  /** 原始文本，用于预览与排错。 */
  raw: string
}

export interface ParseIssue {
  /** cell = 单元格无法识别；line = 整行无法识别；format = 整体格式问题。 */
  kind: 'cell' | 'line' | 'format'
  message: string
  raw: string
}

export interface ScheduleParseResult {
  format: 'grid' | 'line' | 'unknown'
  courses: ParsedCourse[]
  /** 无法识别的内容，需要用户关注。 */
  issues: ParseIssue[]
  /** 已自动处理但不影响导入的提示。 */
  warnings: string[]
  /** 识别到的最大周次，用于提示学期总周数是否够用。 */
  maxWeek: number
  /** 识别到的最大节次，用于提示节次配置是否够用。 */
  maxSection: number
  /** 识别到的星期列数，用于结果说明。 */
  dayCount: number
}

export interface ParseOptions {
  /** 当前学期总周数，用于展开「单周 / 双周」。 */
  totalWeeks: number
  /** 当前每天节次数，用于收敛越界节次。 */
  sectionCount: number
}

interface WeekSpec {
  ranges: Array<{ from: number; to: number }>
  singles: number[]
  parity: 'all' | 'odd' | 'even'
  /** 只写了「单周 / 双周」而没有具体周次。 */
  whole: boolean
}

// ---------------------------------------------------------------- 基础工具

const DAY_DIGITS: Record<string, Weekday> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7
}

const CN_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10
}

/** 「星期一 / 周一 / 礼拜一」且必须是独立词，避免把「1-16周」的「周」当成星期标记。 */
const DAY_TOKEN = /(?:^|[\s\t,，、])(?:星期|周|礼拜)\s*([一二三四五六日天])(?=$|[\s\t,，、])/g

/** 归一化空白与换行，保留 \t（它是网格列分隔符）。 */
function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
}

function cnToInt(text: string): number | null {
  const value = text.trim()
  if (!value) return null
  if (/^\d{1,2}$/.test(value)) return Number(value)
  if (value === '十') return 10
  const tenIndex = value.indexOf('十')
  if (tenIndex >= 0) {
    const head = value.slice(0, tenIndex)
    const tail = value.slice(tenIndex + 1)
    const tens = head ? CN_DIGITS[head] : 1
    const ones = tail ? CN_DIGITS[tail] : 0
    if (tens === undefined || ones === undefined) return null
    return tens * 10 + ones
  }
  return CN_DIGITS[value] === undefined ? null : CN_DIGITS[value]
}

/** 单元格第一行若为节次标签，返回节次号。 */
export function parseSectionLabel(cell: string): number | null {
  const line = cell.split('\n')[0].trim()
  if (!line || line.length > 6) return null
  const cn = /^第?\s*([一二三四五六七八九十]+)\s*节$/.exec(line)
  if (cn) {
    const value = cnToInt(cn[1])
    return value !== null && value >= 1 && value <= 24 ? value : null
  }
  const num = /^第?\s*(\d{1,2})\s*节?$/.exec(line)
  if (num) {
    const value = Number(num[1])
    return value >= 1 && value <= 24 ? value : null
  }
  return null
}

/** 解析周次描述，例如 `1-16周`、`1-16周(单)`、`1,3,5-8周`、`第3-5周`、`单周`。 */
export function parseWeekSpec(line: string): WeekSpec | null {
  const text = line.trim().replace(/[{}【】[\]]/g, '')
  if (!text || text.length > 40) return null
  if (!/^[第周\s\d,，、\-~～()（）单双]+$/.test(text)) return null

  const hasWeekMark = text.indexOf('周') >= 0
  if (!hasWeekMark && !/^\d{1,2}\s*[-~～]\s*\d{1,2}$/.test(text)) return null

  let parity: WeekSpec['parity'] = 'all'
  if (/单/.test(text)) parity = 'odd'
  else if (/双/.test(text)) parity = 'even'

  const ranges: WeekSpec['ranges'] = []
  const rest = text.replace(/(\d{1,2})\s*[-~～]\s*(\d{1,2})/g, (_match, from: string, to: string) => {
    const start = Number(from)
    const end = Number(to)
    if (start >= 1 && end >= start && end <= 60) ranges.push({ from: start, to: end })
    return ' '
  })

  const singles: number[] = []
  rest.replace(/(\d{1,2})/g, (_match, value: string) => {
    const week = Number(value)
    if (week >= 1 && week <= 60) singles.push(week)
    return ' '
  })

  if (ranges.length === 0 && singles.length === 0) {
    if (parity === 'all') return null
    return { ranges: [], singles: [], parity, whole: true }
  }
  return { ranges, singles, parity, whole: false }
}

/** 展开周次描述为具体周次列表，并收敛到学期总周数内。 */
export function expandWeekSpec(spec: WeekSpec, totalWeeks: number): number[] {
  if (spec.whole) {
    if (spec.parity === 'odd') return patternWeeks(totalWeeks, 'odd')
    if (spec.parity === 'even') return patternWeeks(totalWeeks, 'even')
    return allWeeks(totalWeeks)
  }
  const collected: number[] = []
  for (let i = 0; i < spec.ranges.length; i += 1) {
    for (let week = spec.ranges[i].from; week <= spec.ranges[i].to; week += 1) collected.push(week)
  }
  for (let i = 0; i < spec.singles.length; i += 1) collected.push(spec.singles[i])
  let weeks = normalizeWeeks(collected, totalWeeks)
  if (spec.parity === 'odd') weeks = weeks.filter((week) => week % 2 === 1)
  else if (spec.parity === 'even') weeks = weeks.filter((week) => week % 2 === 0)
  return weeks
}

/** 解析节次描述，例如 `第1-2节`、`1-2节`、`第3节`。 */
export function parseSectionSpec(line: string): { start: number; end: number } | null {
  const text = line.trim()
  if (!text || text.length > 24) return null
  const range = /^第?\s*(\d{1,2})\s*[-~～至]\s*(\d{1,2})\s*节?$/.exec(text)
  if (range) {
    const start = Number(range[1])
    const end = Number(range[2])
    if (start >= 1 && end >= start && end <= 24) return { start, end }
    return null
  }
  const single = /^第?\s*(\d{1,2})\s*节$/.exec(text)
  if (single) {
    const value = Number(single[1])
    if (value >= 1 && value <= 24) return { start: value, end: value }
  }
  return null
}

const TEACHER_PREFIX = /^(?:教师|老师|任课教师|授课教师)\s*[：:]\s*/
const LOCATION_PREFIX = /^(?:地点|教室|上课地点|上课教室|教学地点)\s*[：:]\s*/

function stripPrefix(line: string): string {
  return line.replace(TEACHER_PREFIX, '').replace(LOCATION_PREFIX, '')
}

function isExplicitTeacher(line: string): boolean {
  return TEACHER_PREFIX.test(line.trim())
}

function isExplicitLocation(line: string): boolean {
  return LOCATION_PREFIX.test(line.trim())
}

const LOCATION_KEYWORDS = /(楼|室|馆|场|区|栋|幢|座|中心|机房|教室|实验室|学院|校区|阶梯|号)/

/** 判断一行是否像地点。 */
export function looksLikeLocation(line: string): boolean {
  const text = line.trim()
  if (!text || text.length > 30) return false
  if (isExplicitLocation(text)) return true
  if (LOCATION_KEYWORDS.test(text)) return true
  // 形如 A301 / 301 / 3-201
  return /^[A-Za-z]{0,2}\d{2,4}([-—]\d{2,4})?$/.test(text)
}

/** 判断一行是否像教师名。 */
function looksLikeTeacher(line: string): boolean {
  const text = stripPrefix(line.trim())
  if (!text || text.length > 20) return false
  if (/\d/.test(text)) return false
  return /^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z,，、\s]{0,19}$/.test(text)
}

// ---------------------------------------------------------------- 单元格解析

interface CellLine {
  name: string
  teacher: string
  location: string
  weeks: WeekSpec | null
  section: { start: number; end: number } | null
}

function readRecord(lines: string[]): CellLine {
  const record: CellLine = {
    name: '',
    teacher: '',
    location: '',
    weeks: null,
    section: null
  }
  const leftovers: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) continue

    if (record.section === null) {
      const section = parseSectionSpec(line)
      if (section) {
        record.section = section
        continue
      }
    }
    if (record.weeks === null) {
      const spec = parseWeekSpec(line)
      if (spec) {
        record.weeks = spec
        continue
      }
    }
    if (isExplicitTeacher(line)) {
      record.teacher = stripPrefix(line).trim()
      continue
    }
    if (isExplicitLocation(line)) {
      record.location = stripPrefix(line).trim()
      continue
    }
    leftovers.push(line)
  }

  for (let i = 0; i < leftovers.length; i += 1) {
    const line = leftovers[i]
    if (!record.name) {
      // 像地点的行不能当作课程名，否则「同格多时段继承课程名」的段落会认错
      if (looksLikeLocation(line) && !looksLikeTeacher(line)) {
        if (!record.location) record.location = line
        continue
      }
      record.name = line
      continue
    }
    if (!record.teacher && looksLikeTeacher(line)) {
      record.teacher = line
      continue
    }
    if (!record.location && looksLikeLocation(line)) {
      record.location = line
      continue
    }
    // 已经收齐信息的多余行（例如重复的教师名）忽略
  }

  return record
}

/** 判断当前记录是否已经包含足够信息，说明下一行可能是另一门课。 */
function recordComplete(lines: string[]): boolean {
  let hasWeek = false
  let hasLocation = false
  for (let i = 0; i < lines.length; i += 1) {
    if (parseWeekSpec(lines[i]) !== null) hasWeek = true
    if (looksLikeLocation(lines[i])) hasLocation = true
  }
  return hasWeek || hasLocation
}

/**
 * 判断一行是不是「上一条记录的延续」。
 * 周次、地点、带前缀的教师/地点都只会出现在一条记录内部，不可能开启新记录；
 * 而课程名与节次（同格多时段的第二段会以节次开头）都可能开启新记录。
 */
function isContinuation(line: string): boolean {
  const text = line.trim()
  if (!text) return true
  return (
    parseWeekSpec(text) !== null ||
    isExplicitTeacher(text) ||
    isExplicitLocation(text) ||
    looksLikeLocation(text)
  )
}

/** 把单元格内的多行拆成多条课程记录（同一格放多门课、或多时段时）。 */
function splitRecords(lines: string[]): string[][] {
  const records: string[][] = []
  let current: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const startsNew = current.length > 0 && recordComplete(current) && !isContinuation(line)
    if (startsNew) {
      records.push(current)
      current = []
    }
    current.push(line)
  }
  if (current.length > 0) records.push(current)
  return records
}

function clampSection(value: number, sectionCount: number): number {
  if (value < 1) return 1
  if (value > sectionCount) return sectionCount
  return value
}

/**
 * 解析一个课程单元格。
 * @param raw 单元格原始文本
 * @param weekday 该单元格所在星期
 * @param fallbackSection 由所在行推断的节次（单元格内自带节次时优先使用）
 */
export function parseCourseCell(
  raw: string,
  weekday: Weekday,
  fallbackSection: { start: number; end: number },
  options: ParseOptions
): { courses: ParsedCourse[]; issues: ParseIssue[] } {
  const courses: ParsedCourse[] = []
  const issues: ParseIssue[] = []
  const expanded = raw.replace(/[★☆]/g, '\n').replace(/@/g, '\n')
  const lines = expanded
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const groups = splitRecords(lines)

  // 正方 V9.0 的同一格里可能出现多个时段，只有第一段带课程名，其余段落继承它。
  let inheritedName = ''

  for (let i = 0; i < groups.length; i += 1) {
    const record = readRecord(groups[i])
    if (!record.name && inheritedName) record.name = inheritedName
    if (!record.name) {
      const text = groups[i].join(' ').trim()
      if (text) issues.push({ kind: 'cell', message: '无法识别课程名', raw: text })
      continue
    }
    inheritedName = record.name
    const section = record.section || fallbackSection
    courses.push({
      name: record.name,
      teacher: record.teacher,
      location: record.location,
      weekday,
      startSection: clampSection(section.start, options.sectionCount),
      endSection: clampSection(Math.max(section.start, section.end), options.sectionCount),
      weeks: record.weeks
        ? expandWeekSpec(record.weeks, options.totalWeeks)
        : allWeeks(options.totalWeeks),
      weeksInferred: record.weeks === null,
      raw: groups[i].join(' / ')
    })
  }

  return { courses, issues }
}

// ---------------------------------------------------------------- 网格格式

interface GridLayout {
  /** 每个网格列对应的星期，null 表示该列不是星期列（例如节次列、时间列）。 */
  columnDays: Array<Weekday | null>
}

function parseDayToken(text: string): Weekday | null {
  const matched = /^(?:星期|周|礼拜)\s*([一二三四五六日天])$/.exec(text.trim())
  if (!matched) return null
  return DAY_DIGITS[matched[1]] || null
}

function buildGridLayout(headerLine: string): GridLayout | null {
  const cells = headerLine.split('\t').map((cell) => cell.trim())
  if (cells.length >= 3) {
    const columnDays: Array<Weekday | null> = cells.map((cell) => parseDayToken(cell))
    const dayCount = columnDays.filter((day) => day !== null).length
    if (dayCount >= 2) return { columnDays }
  }

  // 表头没有用 \t 分隔时，退化为按出现顺序排列的星期列表
  const ordered: Weekday[] = []
  const pattern = new RegExp(DAY_TOKEN.source, 'g')
  let matched = pattern.exec(headerLine)
  while (matched) {
    const day = DAY_DIGITS[matched[1]]
    if (day && ordered.indexOf(day) === -1) ordered.push(day)
    matched = pattern.exec(headerLine)
  }
  if (ordered.length < 2) return null
  const columnDays: Array<Weekday | null> = [null]
  for (let i = 0; i < ordered.length; i += 1) columnDays.push(ordered[i])
  return { columnDays }
}

/**
 * 分节标记与「第 N 周」标记。
 *
 * 正方教务的「按周次查询」页面会把「第 N 周」渲染成独立元素，整页复制时会混进来。
 * 它整格出现时应当当作表头标记跳过，否则会被误认成「只上第 N 周」的周次。
 */
const PERIOD_OR_WEEK_MARKER = /^(上午|下午|晚上|中午|早晨|第?\s*\d{1,2}\s*周)$/

function isNonDayCell(cell: string): boolean {
  return PERIOD_OR_WEEK_MARKER.test(cell.trim())
}

/**
 * 粘贴文本里 `\n` 既可能是「行分隔」也可能是「单元格内的换行」。
 * 行首一定是节次标签，因此：`\n` + 节次标签 视为行分隔，统一换成 `\t`。
 *
 * 注意：节次标签后面**不能**吞掉制表符，否则会吃掉该行开头的空单元格，
 * 导致后面的星期整体错位。
 */
const ROW_BREAK = /\n[ \t]*((?:第[ \t]*)?(?:\d{1,2}|[一二三四五六七八九十]{1,3})[ \t]*节)/g

function normalizeRowBreaks(body: string): string {
  return body.replace(ROW_BREAK, '\t$1')
}

/**
 * 合并同一天内相邻节次的同一门课。
 *
 * 教务系统的课表用合并单元格表示连堂，复制成纯文本后，被合并的单元格内容
 * 可能只在第一行出现，也可能在每一行重复出现。两种情况都归一到「一个课程块」。
 */
function mergeAdjacentSections(courses: ParsedCourse[]): {
  courses: ParsedCourse[]
  mergedCount: number
} {
  const groups: { [key: string]: ParsedCourse[] } = {}
  const order: string[] = []

  for (let i = 0; i < courses.length; i += 1) {
    const course = courses[i]
    const key = [course.name, course.teacher, course.location, course.weeks.join(','), course.weekday].join('|')
    if (!groups[key]) {
      groups[key] = []
      order.push(key)
    }
    groups[key].push(course)
  }

  const merged: ParsedCourse[] = []
  let mergedCount = 0
  for (let i = 0; i < order.length; i += 1) {
    const list = groups[order[i]].slice().sort((a, b) => a.startSection - b.startSection)
    let current: ParsedCourse = { ...list[0] }
    for (let k = 1; k < list.length; k += 1) {
      const next = list[k]
      if (next.startSection <= current.endSection + 1) {
        current.endSection = Math.max(current.endSection, next.endSection)
        mergedCount += 1
      } else {
        merged.push(current)
        current = { ...next }
      }
    }
    merged.push(current)
  }

  return { courses: merged, mergedCount }
}

function parseGrid(text: string, options: ParseOptions): ScheduleParseResult | null {
  const lines = text.split('\n')
  let headerIndex = -1
  let layout: GridLayout | null = null

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].indexOf('星期') < 0 && lines[i].indexOf('周') < 0) continue
    const candidate = buildGridLayout(lines[i])
    if (candidate) {
      headerIndex = i
      layout = candidate
      break
    }
  }
  if (!layout || headerIndex < 0) return null

  const body = normalizeRowBreaks(lines.slice(headerIndex + 1).join('\n'))
  if (body.indexOf('\t') < 0) return null
  const cells = body.split('\t')

  const issues: ParseIssue[] = []
  const courses: ParsedCourse[] = []
  const columnDays = layout.columnDays
  const dayCount = columnDays.filter((day) => day !== null).length

  // 按「表头列下标」而不是「第几个非空单元格」来定位星期，
  // 这样单元格为空、或存在时间列时都不会让后面的星期整体错位。
  const cellsWithColumn: Array<{ section: number; column: number; text: string }> = []
  let currentSection: number | null = null
  let column = 1

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i]
    const section = parseSectionLabel(cell)
    if (section !== null) {
      currentSection = section
      column = 1
      continue
    }
    if (currentSection === null) continue
    // 「上午 / 下午」这类分节标记独占一行，之后的内容要等下一个节次标签才重新对齐
    if (isNonDayCell(cell)) {
      currentSection = null
      continue
    }
    cellsWithColumn.push({ section: currentSection, column, text: cell })
    column += 1
  }

  if (cellsWithColumn.length === 0) return null

  for (let i = 0; i < cellsWithColumn.length; i += 1) {
    const entry = cellsWithColumn[i]
    const weekday = columnDays[entry.column]
    if (!weekday) continue
    const text = entry.text.trim()
    if (!text) continue
    const parsed = parseCourseCell(
      text,
      weekday,
      { start: entry.section, end: entry.section },
      options
    )
    for (let c = 0; c < parsed.courses.length; c += 1) courses.push(parsed.courses[c])
    for (let c = 0; c < parsed.issues.length; c += 1) issues.push(parsed.issues[c])
  }

  if (courses.length === 0) return null

  const normalized = mergeAdjacentSections(courses)
  if (normalized.mergedCount > 0) {
    issues.push({
      kind: 'cell',
      message: `检测到 ${normalized.mergedCount} 处连堂（表格合并单元格），已按相邻节次合并，请核对节次`,
      raw: ''
    })
  }

  return finalize('grid', normalized.courses, issues, dayCount)
}

// ---------------------------------------------------------------- 行记录格式

function parseLineRecord(line: string, options: ParseOptions): ParsedCourse | null {
  let rest = line

  // 星期
  let weekday: Weekday | null = null
  const dayPattern = new RegExp(DAY_TOKEN.source, 'g')
  let dayMatch = dayPattern.exec(rest)
  while (dayMatch) {
    const day = DAY_DIGITS[dayMatch[1]]
    if (day) {
      weekday = day
      rest = `${rest.slice(0, dayMatch.index)} ${rest.slice(dayMatch.index + dayMatch[0].length)}`
      break
    }
    dayMatch = dayPattern.exec(rest)
  }
  if (!weekday) return null

  // 节次
  let section: { start: number; end: number } | null = null
  const sectionMatch = /第?\s*(\d{1,2})\s*[-~～至]\s*(\d{1,2})\s*节|第?\s*(\d{1,2})\s*节/.exec(rest)
  if (sectionMatch) {
    const start = Number(sectionMatch[1] || sectionMatch[3])
    const end = Number(sectionMatch[2] || sectionMatch[3])
    if (start >= 1 && end >= start && end <= 24) {
      section = { start, end }
      rest = `${rest.slice(0, sectionMatch.index)} ${rest.slice(sectionMatch.index + sectionMatch[0].length)}`
    }
  }
  if (!section) return null

  // 周次
  let weeks: number[] | null = null
  const weekMatch = /(?:第)?\s*\d{1,2}(?:\s*[-~～,，、]\s*\d{1,2})*\s*周(?:\s*[（(]\s*[单双]\s*[)）])?|第?\s*[单双]周/.exec(
    rest
  )
  if (weekMatch) {
    const spec = parseWeekSpec(weekMatch[0])
    if (spec) {
      weeks = expandWeekSpec(spec, options.totalWeeks)
      rest = `${rest.slice(0, weekMatch.index)} ${rest.slice(weekMatch.index + weekMatch[0].length)}`
    }
  }

  const tokens = rest
    .split(/[\t]+|\s{2,}/)
    .map((token) => token.trim())
    .filter((token) => !!token)
  if (tokens.length === 0) return null

  const name = tokens[0]
  if (!name || parseWeekSpec(name) !== null || parseSectionSpec(name) !== null) return null

  let teacher = ''
  let location = ''
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!teacher && looksLikeTeacher(token) && !looksLikeLocation(token)) {
      teacher = token
      continue
    }
    if (!location && looksLikeLocation(token)) {
      location = stripPrefix(token)
      continue
    }
  }

  return {
    name,
    teacher,
    location,
    weekday,
    startSection: clampSection(section.start, options.sectionCount),
    endSection: clampSection(section.end, options.sectionCount),
    weeks: weeks || allWeeks(options.totalWeeks),
    weeksInferred: weeks === null,
    raw: line.trim()
  }
}

function parseLines(text: string, options: ParseOptions): ScheduleParseResult | null {
  const lines = text.split('\n')
  const courses: ParsedCourse[] = []
  const issues: ParseIssue[] = []
  const days: Weekday[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line) continue
    if (parseSectionLabel(line) !== null && !/星期|周[一二三四五六日天]/.test(line)) continue
    const course = parseLineRecord(line, options)
    if (course) {
      courses.push(course)
      if (days.indexOf(course.weekday) === -1) days.push(course.weekday)
    }
  }

  if (courses.length === 0) return null
  return finalize('line', courses, issues, days.length)
}

// ---------------------------------------------------------------- 出口

function finalize(
  format: ScheduleParseResult['format'],
  courses: ParsedCourse[],
  issues: ParseIssue[],
  dayCount: number
): ScheduleParseResult {
  let maxWeek = 0
  let maxSection = 0
  let inferredWeeks = 0

  for (let i = 0; i < courses.length; i += 1) {
    const course = courses[i]
    if (course.weeksInferred) inferredWeeks += 1
    for (let k = 0; k < course.weeks.length; k += 1) {
      if (course.weeks[k] > maxWeek) maxWeek = course.weeks[k]
    }
    if (course.endSection > maxSection) maxSection = course.endSection
  }

  const warnings: string[] = []
  if (inferredWeeks > 0) {
    warnings.push(`${inferredWeeks} 门课程原文没有标注周次，已按全部周次导入`)
  }

  return { format, courses, issues, warnings, maxWeek, maxSection, dayCount }
}

/** 识别粘贴文本的格式。 */
export function detectScheduleFormat(text: string): 'grid' | 'line' | 'unknown' {
  const normalized = normalizeText(text)
  if (!normalized.trim()) return 'unknown'
  const options: ParseOptions = { totalWeeks: 20, sectionCount: 12 }
  if (parseGrid(normalized, options)) return 'grid'
  if (parseLines(normalized, options)) return 'line'
  return 'unknown'
}

/**
 * 解析教务课表文本。
 * 解析失败时 `format` 为 `unknown`，`issues` 中会给出可操作的提示。
 */
export function parseScheduleText(raw: string, options: ParseOptions): ScheduleParseResult {
  const text = normalizeText(raw)
  if (!text.trim()) {
    return {
      format: 'unknown',
      courses: [],
      issues: [{ kind: 'format', message: '粘贴内容为空', raw: '' }],
      warnings: [],
      maxWeek: 0,
      maxSection: 0,
      dayCount: 0
    }
  }

  const grid = parseGrid(text, options)
  if (grid && grid.courses.length > 0) return grid

  const lines = parseLines(text, options)
  if (lines && lines.courses.length > 0) return lines

  return {
    format: 'unknown',
    courses: [],
    issues: [
      {
        kind: 'format',
        message: '未识别出课表结构，请确认复制范围包含「星期一…星期日」表头与节次列',
        raw: text.slice(0, 200)
      }
    ],
    warnings: [],
    maxWeek: 0,
    maxSection: 0,
    dayCount: 0
  }
}
