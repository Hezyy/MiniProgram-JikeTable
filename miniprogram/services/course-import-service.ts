import type { ClassTime, Course, CourseInput, Semester } from '../types/models'
import { appStore, commitAppData } from '../store/app-store'
import { PRESET_COLORS, DEFAULT_COURSE_COLOR_ID } from '../utils/colors'
import { weekdayLabel } from '../utils/date'
import { createId } from '../utils/id'
import {
  type ParseIssue,
  type ParseOptions,
  type ParsedCourse,
  type ScheduleParseResult,
  parseScheduleText
} from '../utils/schedule-parser'
import { DEFAULT_TOTAL_WEEKS } from '../utils/schema'
import {
  getClassTime,
  resolveClassTimes,
  sectionRangeLabel,
  weeksSummary
} from '../utils/timetable'
import { LIMITS, truncate } from '../utils/validation'

/**
 * 教务课表导入服务。
 *
 * 与数据导入导出（JSON 备份）不同，这里处理的是**从教务系统复制的课表文本**：
 * 解析 → 预览 → 用户确认 → 写入。整个过程不涉及账号密码，也没有任何网络请求。
 */

export interface ImportPreviewItem {
  key: string
  name: string
  teacher: string
  location: string
  weekdayText: string
  sectionText: string
  timeText: string
  weeksText: string
  colorId: string
  raw: string
}

export interface CourseImportPreview {
  ok: boolean
  message: string
  format: ScheduleParseResult['format']
  items: ImportPreviewItem[]
  issues: ParseIssue[]
  warnings: string[]
  courses: CourseInput[]
  /** 解析出的最大周次，可用于建议学期总周数。 */
  maxWeek: number
  /** 建议的学期总周数；大于当前学期总周数时需要用户确认。 */
  suggestedTotalWeeks: number
}

export interface ApplyOptions {
  /** merge 追加到现有课程；replace 覆盖全部课程。 */
  mode: 'merge' | 'replace'
  /** 是否把学期总周数扩展到建议值。 */
  extendTotalWeeks: boolean
}

function parseOptions(semester: Semester | null): ParseOptions {
  return {
    totalWeeks: semester ? semester.totalWeeks : DEFAULT_TOTAL_WEEKS,
    sectionCount: resolveClassTimes(semester).length
  }
}

function sectionTimeText(classTimes: ClassTime[], start: number, end: number): string {
  const from = getClassTime(classTimes, start)
  const to = getClassTime(classTimes, end)
  if (!from || !to) return ''
  return `${from.start} - ${to.end}`
}

function fingerprint(input: CourseInput): string {
  return [
    input.name,
    input.weekday,
    input.startSection,
    input.endSection,
    input.weeks.join(',')
  ].join('|')
}

/** 按课程名首次出现顺序分配颜色，保证同一门课颜色一致、相邻课程颜色不同。 */
function assignColors(courses: ParsedCourse[]): string[] {
  const byName: { [name: string]: string } = {}
  let cursor = 0
  return courses.map((course) => {
    const existing = byName[course.name]
    if (existing) return existing
    const color = PRESET_COLORS[cursor % PRESET_COLORS.length] || PRESET_COLORS[0]
    cursor += 1
    byName[course.name] = color.id
    return color.id
  })
}

function toCourseInput(course: ParsedCourse, colorId: string): CourseInput {
  return {
    name: truncate(course.name, LIMITS.courseName),
    teacher: truncate(course.teacher, LIMITS.teacher),
    location: truncate(course.location, LIMITS.courseLocation),
    weekday: course.weekday,
    startSection: course.startSection,
    endSection: course.endSection,
    weeks: course.weeks,
    colorId: colorId || DEFAULT_COURSE_COLOR_ID,
    note: ''
  }
}

export const courseImportService = {
  /** 直接解析文本，返回解析器原始结果。 */
  parse(text: string): ScheduleParseResult {
    return parseScheduleText(text, parseOptions(appStore.getData().semester))
  },

  /** 解析并生成可预览的导入方案。 */
  buildPreview(text: string): CourseImportPreview {
    const data = appStore.getData()
    const semester = data.semester
    const classTimes = resolveClassTimes(semester)
    const options = parseOptions(semester)
    const result = parseScheduleText(text, options)

    if (result.courses.length === 0) {
      const first = result.issues.length > 0 ? result.issues[0].message : '没有识别到课程'
      return {
        ok: false,
        message: first,
        format: result.format,
        items: [],
        issues: result.issues,
        warnings: result.warnings,
        courses: [],
        maxWeek: 0,
        suggestedTotalWeeks: semester ? semester.totalWeeks : DEFAULT_TOTAL_WEEKS
      }
    }

    const colors = assignColors(result.courses)
    const courses: CourseInput[] = []
    const items: ImportPreviewItem[] = []
    const seen: { [key: string]: boolean } = {}

    for (let i = 0; i < result.courses.length; i += 1) {
      const parsed = result.courses[i]
      const input = toCourseInput(parsed, colors[i])
      const key = fingerprint(input)
      if (seen[key]) continue
      seen[key] = true
      courses.push(input)
      items.push({
        key,
        name: input.name,
        teacher: input.teacher,
        location: input.location,
        weekdayText: weekdayLabel(input.weekday),
        sectionText: sectionRangeLabel(input.startSection, input.endSection),
        timeText: sectionTimeText(classTimes, input.startSection, input.endSection),
        weeksText: weeksSummary(input.weeks),
        colorId: input.colorId,
        raw: parsed.raw
      })
    }

    const warnings = result.warnings.slice()
    let suggestedTotalWeeks = semester ? semester.totalWeeks : DEFAULT_TOTAL_WEEKS
    if (result.maxWeek > suggestedTotalWeeks) {
      suggestedTotalWeeks = result.maxWeek
      warnings.push(
        `课表最晚到第 ${result.maxWeek} 周，当前学期只设置了 ${semester ? semester.totalWeeks : DEFAULT_TOTAL_WEEKS} 周，建议同步扩展`
      )
    }

    return {
      ok: true,
      message: `识别到 ${courses.length} 门课程`,
      format: result.format,
      items,
      issues: result.issues,
      warnings,
      courses,
      maxWeek: result.maxWeek,
      suggestedTotalWeeks
    }
  },

  /**
   * 写入课程。
   * 追加模式下会跳过与现有课程完全重复的条目，避免重复导入。
   */
  apply(preview: CourseImportPreview, options: ApplyOptions): { added: number; total: number } {
    if (!preview.ok || preview.courses.length === 0) {
      throw new Error('请先成功解析课表')
    }
    const data = appStore.getData()
    const now = Date.now()

    const build = (input: CourseInput): Course => ({
      ...input,
      id: createId('course'),
      createdAt: now,
      updatedAt: now
    })

    let courses: Course[]
    let added = 0

    if (options.mode === 'replace') {
      courses = preview.courses.map(build)
      added = courses.length
    } else {
      const existingKeys: { [key: string]: boolean } = {}
      for (let i = 0; i < data.courses.length; i += 1) {
        const item = data.courses[i]
        existingKeys[fingerprint({ ...item })] = true
      }
      const additions: Course[] = []
      for (let i = 0; i < preview.courses.length; i += 1) {
        const input = preview.courses[i]
        const key = fingerprint(input)
        if (existingKeys[key]) continue
        existingKeys[key] = true
        additions.push(build(input))
      }
      courses = data.courses.concat(additions)
      added = additions.length
    }

    let semester = data.semester
    if (options.extendTotalWeeks && semester && preview.suggestedTotalWeeks > semester.totalWeeks) {
      semester = { ...semester, totalWeeks: preview.suggestedTotalWeeks }
    }

    commitAppData({ ...data, semester, courses })
    return { added, total: courses.length }
  }
}
