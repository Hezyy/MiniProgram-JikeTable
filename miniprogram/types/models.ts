/**
 * 即课课表 —— 核心数据模型。
 *
 * 约定：
 * - 日期一律使用本地日期字符串 `YYYY-MM-DD`；
 * - 时间一律使用 `HH:mm`；
 * - `createdAt` / `updatedAt` 使用毫秒时间戳。
 */

/** 星期，周一为 1，周日为 7。 */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** 一周的起始日：1 = 周一，7 = 周日。 */
export type WeekStart = 1 | 7

/** 主题偏好。 */
export type ThemePreference = 'system' | 'light' | 'dark'

/** 节次时间配置。 */
export interface ClassTime {
  /** 节次序号，从 1 开始。 */
  section: number
  /** 开始时间 `HH:mm`。 */
  start: string
  /** 结束时间 `HH:mm`。 */
  end: string
}

/** 学期配置。 */
export interface Semester {
  id: string
  name: string
  /** 开学日期 `YYYY-MM-DD`，其所在周为第 1 周。 */
  startDate: string
  /** 总周数。 */
  totalWeeks: number
  /** 每节课的起止时间，长度即每天节次数。 */
  classTimes: ClassTime[]
}

/** 课程。 */
export interface Course {
  id: string
  name: string
  teacher: string
  location: string
  weekday: Weekday
  startSection: number
  endSection: number
  /** 上课周次列表，取值 1..totalWeeks。 */
  weeks: number[]
  colorId: string
  note: string
  createdAt: number
  updatedAt: number
}

/** 日程类型：普通日程或待办事项。 */
export type ScheduleEventKind = 'event' | 'todo'

/** 日程 / 待办。 */
export interface ScheduleEvent {
  id: string
  title: string
  date: string
  startTime: string
  /** 待办事项允许为空字符串。 */
  endTime: string
  kind: ScheduleEventKind
  completed: boolean
  location: string
  note: string
  colorId: string
  createdAt: number
  updatedAt: number
}

/** 用户偏好。 */
export interface Preferences {
  weekStartsOn: WeekStart
  theme: ThemePreference
}

/** 本地存储的完整数据结构。 */
export interface AppData {
  /** 数据结构版本，破坏性变更时递增并提供迁移函数。 */
  version: number
  /** 是否已完成学期初始化。 */
  initialized: boolean
  semester: Semester | null
  courses: Course[]
  events: ScheduleEvent[]
  preferences: Preferences
}

/** 新建 / 编辑课程的入参。 */
export type CourseInput = Omit<Course, 'id' | 'createdAt' | 'updatedAt'>

/** 新建 / 编辑日程的入参。 */
export type ScheduleEventInput = Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'>

/** 预设颜色。 */
export interface ColorOption {
  id: string
  /** 颜色名称，用于辅助技术与表单文案。 */
  name: string
  /** 浅色背景，用于课程块与色块。 */
  bg: string
  /** 深色文字，保证与背景的对比度。 */
  text: string
  /** 强调色，用于左侧标识条与选中态。 */
  bar: string
}

/** 导出文件结构。 */
export interface ExportPayload {
  schemaVersion: number
  app: string
  exportedAt: number
  data: AppData
}

/** 导入预览统计。 */
export interface ImportStats {
  semesterName: string
  courses: number
  events: number
  totalWeeks: number
  startDate: string
}

/** 轻量 Store 的完整状态。 */
export interface AppState {
  /** 是否已从本地存储完成首次加载。 */
  ready: boolean
  data: AppData
}

/** 字段级校验错误。 */
export type FieldErrors = Record<string, string>

/** 校验结果。 */
export interface ValidationResult {
  ok: boolean
  errors: FieldErrors
  /** 第一个出错字段名，用于聚焦。 */
  firstError: string | null
}

/** 课表网格中的一行（节次行或休息行）。 */
export interface GridSectionRow {
  type: 'section'
  section: number
  /** 节次标题，例如「1」。 */
  label: string
  /** 节次时间，例如 `08:00\n08:45`。 */
  startText: string
  endText: string
  timeText: string
  top: number
  height: number
}

export interface GridBreakRow {
  type: 'break'
  label: string
  top: number
  height: number
}

export type GridRow = GridSectionRow | GridBreakRow

/** 课表网格中已定位的课程块。 */
export interface PositionedCourse {
  course: Course
  top: number
  height: number
  /** 左侧偏移百分比 0-100。 */
  leftPercent: number
  /** 宽度百分比 0-100。 */
  widthPercent: number
  /** 在同行中是否与其他课程时间冲突。 */
  conflict: boolean
}

/** 今日时间线条目。 */
export interface TimelineEntry {
  id: string
  type: 'course' | 'event'
  title: string
  subtitle: string
  timeText: string
  location: string
  colorId: string
  completed: boolean
  isTodo: boolean
  /** 排序用的分钟数。 */
  startMinutes: number
  /** 状态：未开始 / 进行中 / 已结束。 */
  status: 'pending' | 'ongoing' | 'finished'
}

/** 下一节课摘要。 */
export interface NextCourseInfo {
  course: Course
  status: 'ongoing' | 'upcoming'
  startTime: string
  endTime: string
  startMinutes: number
  endMinutes: number
  /** 距离开始还有多少分钟，进行中为 0。 */
  minutesUntil: number
}

/**
 * 课表网格中的课程块视图模型。
 * 页面只向组件传递视图需要的数据，避免传输完整课程对象。
 */
export interface CourseBlockVM {
  id: string
  name: string
  location: string
  teacher: string
  timeText: string
  weeksText: string
  colorId: string
  /** 距网格顶部的位置（rpx）。 */
  top: number
  height: number
  leftPercent: number
  widthPercent: number
  isOngoing: boolean
  isFinished: boolean
  conflict: boolean
}
