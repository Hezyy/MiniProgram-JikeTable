import type { AppData, Course, CourseInput, Weekday } from '../types/models'
import { appStore, commitAppData } from '../store/app-store'
import { DEFAULT_COURSE_COLOR_ID, isValidColorId } from '../utils/colors'
import { createId } from '../utils/id'
import {
  allWeeks,
  listCoursesForDate,
  listCoursesForWeek,
  resolveClassTimes
} from '../utils/timetable'
import { DEFAULT_TOTAL_WEEKS } from '../utils/schema'
import { normalizeWeeks } from '../utils/validation'

/**
 * 课程业务逻辑。调用者只能拿到副本，不得直接修改原始数组。
 */

function currentData(): AppData {
  return appStore.getData()
}

function currentTotalWeeks(): number {
  const semester = currentData().semester
  return semester ? semester.totalWeeks : DEFAULT_TOTAL_WEEKS
}

function currentSectionTotal(): number {
  return resolveClassTimes(currentData().semester).length
}

function normalizeInput(input: CourseInput, totalWeeks: number, sectionTotal: number): CourseInput {
  const start = Math.max(1, Math.min(sectionTotal, Math.round(input.startSection)))
  const end = Math.max(start, Math.min(sectionTotal, Math.round(input.endSection)))
  let weeks = normalizeWeeks(input.weeks || [], totalWeeks)
  if (weeks.length === 0) weeks = allWeeks(totalWeeks)
  return {
    name: (input.name || '').trim(),
    teacher: (input.teacher || '').trim(),
    location: (input.location || '').trim(),
    weekday: input.weekday,
    startSection: start,
    endSection: end,
    weeks,
    colorId: isValidColorId(input.colorId) ? input.colorId : DEFAULT_COURSE_COLOR_ID,
    note: (input.note || '').trim()
  }
}

export const courseService = {
  /** 全部课程（副本）。 */
  list(): Course[] {
    return currentData().courses.slice()
  },

  count(): number {
    return currentData().courses.length
  },

  getById(id: string): Course | null {
    const courses = currentData().courses
    for (let i = 0; i < courses.length; i += 1) {
      if (courses[i].id === id) return { ...courses[i] }
    }
    return null
  },

  /** 指定周次的课程。 */
  listByWeek(weekNumber: number): Course[] {
    return listCoursesForWeek(currentData().courses, weekNumber)
  },

  /** 指定日期的课程，自动换算周次并校验教学周。 */
  listByDate(date: string): Course[] {
    const data = currentData()
    return listCoursesForDate(data.courses, date, data.semester, data.preferences.weekStartsOn)
  },

  /** 指定星期的课程（不限周次）。 */
  listByWeekday(weekday: Weekday): Course[] {
    return currentData().courses.filter((course) => course.weekday === weekday)
  },

  create(input: CourseInput): Course {
    const data = currentData()
    const normalized = normalizeInput(input, currentTotalWeeks(), currentSectionTotal())
    const now = Date.now()
    const course: Course = {
      ...normalized,
      id: createId('course'),
      createdAt: now,
      updatedAt: now
    }
    commitAppData({ ...data, courses: data.courses.concat([course]) })
    return course
  },

  update(id: string, patch: Partial<CourseInput>): Course {
    const data = currentData()
    let index = -1
    for (let i = 0; i < data.courses.length; i += 1) {
      if (data.courses[i].id === id) {
        index = i
        break
      }
    }
    if (index === -1) throw new Error('课程不存在或已被删除')

    const merged: CourseInput = { ...data.courses[index], ...patch }
    const normalized = normalizeInput(merged, currentTotalWeeks(), currentSectionTotal())
    const updated: Course = {
      ...normalized,
      id: data.courses[index].id,
      createdAt: data.courses[index].createdAt,
      updatedAt: Date.now()
    }
    const courses = data.courses.slice()
    courses[index] = updated
    commitAppData({ ...data, courses })
    return updated
  },

  /** 删除课程，返回被删除的数据便于撤销。 */
  remove(id: string): Course {
    const data = currentData()
    let removed: Course | null = null
    const courses: Course[] = []
    for (let i = 0; i < data.courses.length; i += 1) {
      if (data.courses[i].id === id) removed = data.courses[i]
      else courses.push(data.courses[i])
    }
    if (!removed) throw new Error('课程不存在或已被删除')
    commitAppData({ ...data, courses })
    return removed
  },

  /** 撤销删除。 */
  restore(course: Course): void {
    const data = currentData()
    for (let i = 0; i < data.courses.length; i += 1) {
      if (data.courses[i].id === course.id) return
    }
    commitAppData({ ...data, courses: data.courses.concat([course]) })
  },

  /** 整体替换课程列表，用于导入。 */
  replaceAll(courses: Course[]): void {
    const data = currentData()
    commitAppData({ ...data, courses: courses.slice() })
  }
}
