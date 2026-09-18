import type { FieldErrors } from '../../types/models'
import { appStore, commitAppData } from '../../store/app-store'
import { createDefaultAppData, createDemoAppData, createSemester } from '../../utils/schema'
import { startOfWeek, toDateString } from '../../utils/date'
import { refreshPageTheme } from '../../utils/theme'
import { showToast } from '../../utils/feedback'
import { errorMessage, logError } from '../../utils/logger'
import { LIMITS, MAX_TOTAL_WEEKS, MIN_TOTAL_WEEKS, validateSemesterInput } from '../../utils/validation'

/**
 * 首次初始化页（小程序启动页）。
 *
 * 已完成初始化的用户会立即被送往「今日」页，避免重复初始化；
 * 未初始化的用户在填写学期信息或选择示例数据后进入「今日」页。
 */

const UNSUBSCRIBES = new WeakMap<object, () => void>()

/** 已经触发过跳转的页面实例，避免 onLoad / onShow 重复跳转。 */
const REDIRECTED = new WeakSet<object>()

/** 总周数默认值。 */
const DEFAULT_TOTAL_WEEKS = 20

/** 错误提示的展示顺序，与表单字段顺序一致。 */
const FIELD_ORDER = ['name', 'startDate', 'totalWeeks']

const TODAY_PAGE = '/pages/today/index'

function buildWeekOptions(): string[] {
  const options: string[] = []
  for (let week = MIN_TOTAL_WEEKS; week <= MAX_TOTAL_WEEKS; week += 1) {
    options.push(`${week} 周`)
  }
  return options
}

const WEEK_OPTIONS: string[] = buildWeekOptions()

/** 总周数换算成 picker 下标。 */
function indexOfWeeks(totalWeeks: number): number {
  const raw = totalWeeks - MIN_TOTAL_WEEKS
  if (raw < 0) return 0
  if (raw > WEEK_OPTIONS.length - 1) return WEEK_OPTIONS.length - 1
  return raw
}

/** 取第一条校验错误文案。 */
function firstErrorText(errors: FieldErrors): string {
  for (let i = 0; i < FIELD_ORDER.length; i += 1) {
    const message = errors[FIELD_ORDER[i]]
    if (message) return message
  }
  return '请检查填写内容'
}

/** 把持久化异常转换成可读文案，同时记录日志。 */
function saveErrorMessage(error: unknown): string {
  logError('初始化页保存数据失败', error)
  return errorMessage(error) || '保存失败，请重试'
}

/** 本周周一，作为开学日期的默认值。 */
function defaultStartDate(): string {
  return toDateString(startOfWeek(new Date(), 1))
}

Page({
  data: {
    themeClass: 'theme-light',
    name: '',
    nameMaxLength: LIMITS.semesterName,
    startDate: defaultStartDate(),
    totalWeeks: DEFAULT_TOTAL_WEEKS,
    weekOptions: WEEK_OPTIONS,
    weekIndex: indexOfWeeks(DEFAULT_TOTAL_WEEKS),
    errors: {} as FieldErrors,
    nameFocus: false,
    saving: false
  },

  onLoad() {
    const unsubscribe = appStore.subscribe(() => {
      refreshPageTheme(this)
    })
    UNSUBSCRIBES.set(this, unsubscribe)
    this.redirectIfInitialized()
  },

  onShow() {
    refreshPageTheme(this)
    this.redirectIfInitialized()
  },

  onUnload() {
    const unsubscribe = UNSUBSCRIBES.get(this)
    if (unsubscribe) unsubscribe()
    UNSUBSCRIBES.delete(this)
  },

  /** 已完成初始化时直接进入今日页。 */
  redirectIfInitialized() {
    if (!appStore.getData().initialized) return
    if (REDIRECTED.has(this)) return
    REDIRECTED.add(this)
    wx.switchTab({
      url: TODAY_PAGE,
      fail: () => {
        // 页面尚未就绪时允许 onShow 再试一次。
        REDIRECTED.delete(this)
      }
    })
  },

  onNameInput(event: WechatMiniprogram.Input) {
    this.setData({ name: event.detail.value })
  },

  onNameBlur() {
    this.clearError('name')
  },

  onStartDateChange(event: WechatMiniprogram.PickerChange) {
    const value = typeof event.detail.value === 'string' ? event.detail.value : ''
    if (!value) return
    this.setData({ startDate: value })
    this.clearError('startDate')
  },

  onWeeksChange(event: WechatMiniprogram.PickerChange) {
    const picked = event.detail.value
    const raw = Array.isArray(picked) ? Number(picked[0]) : Number(picked)
    if (!Number.isInteger(raw) || raw < 0 || raw >= WEEK_OPTIONS.length) return
    this.setData({
      weekIndex: raw,
      totalWeeks: MIN_TOTAL_WEEKS + raw
    })
    this.clearError('totalWeeks')
  },

  /** 清除单个字段的错误，避免用户已修正仍显示红字。 */
  clearError(field: string) {
    const errors = this.data.errors
    if (!errors[field]) return
    const next: FieldErrors = {}
    const keys = Object.keys(errors)
    for (let i = 0; i < keys.length; i += 1) {
      if (keys[i] !== field) next[keys[i]] = errors[keys[i]]
    }
    this.setData({ errors: next })
  },

  /** 校验并保存学期配置，成功后进入今日页。 */
  onSubmit() {
    if (this.data.saving) return

    const name = this.data.name.trim()
    const startDate = this.data.startDate
    const totalWeeks = this.data.totalWeeks
    const result = validateSemesterInput({ name, startDate, totalWeeks })

    if (!result.ok) {
      this.setData({
        errors: result.errors,
        nameFocus: result.firstError === 'name'
      })
      showToast(this, { message: firstErrorText(result.errors), type: 'error' })
      return
    }

    this.setData({ saving: true, errors: {} })
    try {
      const semester = createSemester(name, startDate, totalWeeks)
      commitAppData({ ...createDefaultAppData(), initialized: true, semester })
    } catch (error) {
      this.setData({ saving: false })
      showToast(this, { message: saveErrorMessage(error), type: 'error' })
      return
    }

    REDIRECTED.add(this)
    wx.switchTab({
      url: TODAY_PAGE,
      fail: () => {
        REDIRECTED.delete(this)
        this.setData({ saving: false })
        showToast(this, { message: '进入今日页失败，请重试', type: 'error' })
      }
    })
  },

  /** 写入示例数据，方便用户先体验再自行编辑。 */
  onUseDemo() {
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      commitAppData(createDemoAppData())
    } catch (error) {
      this.setData({ saving: false })
      showToast(this, { message: saveErrorMessage(error), type: 'error' })
      return
    }

    REDIRECTED.add(this)
    wx.switchTab({
      url: TODAY_PAGE,
      fail: () => {
        REDIRECTED.delete(this)
        this.setData({ saving: false })
        showToast(this, { message: '进入今日页失败，请重试', type: 'error' })
      }
    })
  }
})
