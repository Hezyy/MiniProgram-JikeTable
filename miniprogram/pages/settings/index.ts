import type {
  AppData,
  Preferences,
  Semester,
  ThemePreference,
  WeekStart
} from '../../types/models'
import { appStore, commitAppData } from '../../store/app-store'
import { storageService } from '../../services/storage'
import { DEFAULT_TOTAL_WEEKS, createDefaultAppData } from '../../utils/schema'
import { LIMITS, MAX_TOTAL_WEEKS, MIN_TOTAL_WEEKS, validateSemesterInput } from '../../utils/validation'
import { refreshPageTheme } from '../../utils/theme'
import { showToast } from '../../utils/feedback'
import { errorMessage, logError } from '../../utils/logger'

/**
 * 设置页。
 *
 * 按「学期 / 显示 / 数据 / 关于」分组，每组是一个行式列表。
 * 所有写操作都通过 commitAppData 持久化：失败时提示错误并回滚界面状态。
 */

const UNSUBSCRIBES = new WeakMap<object, () => void>()

/** 关于分组展示的版本号。 */
const APP_VERSION = '1.0.0'

const WEEK_OPTIONS: string[] = buildRangeOptions(MIN_TOTAL_WEEKS, MAX_TOTAL_WEEKS)
const WEEK_START_OPTIONS: string[] = ['周一', '周日']
const THEME_OPTIONS: string[] = ['跟随系统', '浅色', '深色']
const THEME_VALUES: ThemePreference[] = ['system', 'light', 'dark']

function buildRangeOptions(min: number, max: number): string[] {
  const options: string[] = []
  for (let value = min; value <= max; value += 1) {
    options.push(`${value} 周`)
  }
  return options
}

/** 总周数换算成 picker 下标。 */
function indexOfWeeks(totalWeeks: number): number {
  const raw = totalWeeks - MIN_TOTAL_WEEKS
  if (raw < 0) return 0
  if (raw > WEEK_OPTIONS.length - 1) return WEEK_OPTIONS.length - 1
  return raw
}

function themeIndexOf(theme: ThemePreference): number {
  const index = THEME_VALUES.indexOf(theme)
  return index < 0 ? 0 : index
}

/** 读取 picker 事件的选中下标。 */
function pickerIndex(value: string | number[] | [string, string, string]): number {
  const raw = Array.isArray(value) ? Number(value[0]) : Number(value)
  return Number.isInteger(raw) && raw >= 0 ? raw : -1
}

function withSemester(data: AppData, patch: Partial<Semester>): AppData {
  if (!data.semester) return data
  return { ...data, semester: { ...data.semester, ...patch } }
}

function withPreferences(data: AppData, patch: Partial<Preferences>): AppData {
  return { ...data, preferences: { ...data.preferences, ...patch } }
}

/** 从 Store 取一份界面快照，onLoad / onShow 与写入回滚都复用。 */
function currentSnapshot() {
  const data = appStore.getData()
  const semester = data.semester
  const totalWeeks = semester ? semester.totalWeeks : DEFAULT_TOTAL_WEEKS
  const backup = storageService.backupInfo()
  return {
    semesterName: semester ? semester.name : '',
    startDate: semester ? semester.startDate : '',
    weekIndex: indexOfWeeks(totalWeeks),
    weekStartIndex: data.preferences.weekStartsOn === 7 ? 1 : 0,
    themeIndex: themeIndexOf(data.preferences.theme),
    hasBackup: backup !== null,
    backupSize: backup ? backup.size : 0
  }
}

Page({
  data: {
    themeClass: 'theme-light',
    semesterName: '',
    semesterNameMax: LIMITS.semesterName,
    startDate: '',
    weekOptions: WEEK_OPTIONS,
    weekIndex: indexOfWeeks(DEFAULT_TOTAL_WEEKS),
    weekStartOptions: WEEK_START_OPTIONS,
    weekStartIndex: 0,
    themeOptions: THEME_OPTIONS,
    themeIndex: 0,
    hasBackup: false,
    backupSize: 0,
    version: APP_VERSION
  },

  onLoad() {
    const unsubscribe = appStore.subscribe(() => {
      refreshPageTheme(this)
      this.syncFromStore()
    })
    UNSUBSCRIBES.set(this, unsubscribe)
    this.syncFromStore()
  },

  onShow() {
    refreshPageTheme(this)
    this.syncFromStore()
  },

  onUnload() {
    const unsubscribe = UNSUBSCRIBES.get(this)
    if (unsubscribe) unsubscribe()
    UNSUBSCRIBES.delete(this)
  },

  /** 用 Store 中的真实数据重绘界面；写入失败时也靠它回滚。 */
  syncFromStore() {
    this.setData(currentSnapshot())
  },

  /** 唯一的写入口：持久化成功才提示「已保存」，失败则回滚并提示原因。 */
  saveData(next: AppData, successMessage: string): boolean {
    try {
      commitAppData(next)
    } catch (error) {
      logError('设置页保存失败', error)
      showToast(this, { message: errorMessage(error) || '保存失败，请重试', type: 'error' })
      this.syncFromStore()
      return false
    }
    this.syncFromStore()
    showToast(this, { message: successMessage, type: 'success' })
    return true
  },

  onNameInput(event: WechatMiniprogram.Input) {
    this.setData({ semesterName: event.detail.value })
  },

  onNameBlur(event: WechatMiniprogram.InputBlur) {
    this.saveName(event.detail.value)
  },

  onNameConfirm(event: WechatMiniprogram.InputConfirm) {
    this.saveName(event.detail.value)
  },

  saveName(raw: string) {
    const data = appStore.getData()
    const semester = data.semester
    if (!semester) return
    const name = (raw || '').trim()
    if (name === semester.name) {
      this.setData({ semesterName: name })
      return
    }
    const result = validateSemesterInput({
      name,
      startDate: semester.startDate,
      totalWeeks: semester.totalWeeks
    })
    if (!result.ok) {
      showToast(this, { message: result.errors.name || '学期名称不合法', type: 'error' })
      this.syncFromStore()
      return
    }
    this.saveData(withSemester(data, { name }), '已保存')
  },

  onStartDateChange(event: WechatMiniprogram.PickerChange) {
    const value = typeof event.detail.value === 'string' ? event.detail.value : ''
    const data = appStore.getData()
    const semester = data.semester
    if (!semester || !value || value === semester.startDate) return

    wx.showModal({
      title: '修改开学日期',
      content: '修改开学日期会重新计算所有课程的周次，确定继续吗？',
      confirmText: '确定修改',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) {
          this.syncFromStore()
          return
        }
        this.saveData(withSemester(appStore.getData(), { startDate: value }), '已保存')
      },
      fail: () => {
        this.syncFromStore()
      }
    })
  },

  onWeeksChange(event: WechatMiniprogram.PickerChange) {
    const index = pickerIndex(event.detail.value)
    if (index < 0 || index >= WEEK_OPTIONS.length) return
    const totalWeeks = MIN_TOTAL_WEEKS + index
    const data = appStore.getData()
    if (!data.semester || data.semester.totalWeeks === totalWeeks) return
    this.saveData(withSemester(data, { totalWeeks }), '已保存')
  },

  onWeekStartChange(event: WechatMiniprogram.PickerChange) {
    const index = pickerIndex(event.detail.value)
    if (index < 0 || index >= WEEK_START_OPTIONS.length) return
    const weekStartsOn: WeekStart = index === 1 ? 7 : 1
    const data = appStore.getData()
    if (data.preferences.weekStartsOn === weekStartsOn) return
    this.saveData(withPreferences(data, { weekStartsOn }), '已保存')
  },

  onThemeChange(event: WechatMiniprogram.PickerChange) {
    const index = pickerIndex(event.detail.value)
    if (index < 0 || index >= THEME_VALUES.length) return
    const theme = THEME_VALUES[index]
    const data = appStore.getData()
    if (data.preferences.theme === theme) return
    if (!this.saveData(withPreferences(data, { theme }), '已保存')) return
    refreshPageTheme(this)
  },

  onOpenCourseImport() {
    wx.navigateTo({ url: '/pages/course-import/index' })
  },

  onOpenTransfer() {
    wx.navigateTo({ url: '/pages/data-transfer/index' })
  },

  /** 清空数据需要两次确认，第二次必须点「确认清空」。 */
  onClearAll() {
    wx.showModal({
      title: '清空所有数据',
      content: '将删除本机保存的学期、课程与日程，删除后无法恢复。是否继续？',
      confirmText: '继续',
      cancelText: '取消',
      success: (first) => {
        if (!first.confirm) return
        wx.showModal({
          title: '再次确认',
          content: '请点击「确认清空」完成删除，点击取消则保留现有数据。',
          confirmText: '确认清空',
          cancelText: '取消',
          success: (second) => {
            if (!second.confirm) return
            this.performClear()
          }
        })
      }
    })
  },

  performClear() {
    try {
      storageService.clear()
    } catch (error) {
      logError('清空本地数据失败', error)
      showToast(this, { message: errorMessage(error) || '清空失败，请重试', type: 'error' })
      return
    }
    appStore.setData(createDefaultAppData())
    wx.reLaunch({ url: '/pages/onboarding/index' })
  },

  onExportBackup() {
    const text = storageService.readBackupText()
    if (!text) {
      showToast(this, { message: '备份内容为空，无法导出', type: 'error' })
      this.syncFromStore()
      return
    }
    wx.setClipboardData({
      data: text,
      success: () => {
        showToast(this, { message: '备份内容已复制', type: 'success' })
      },
      fail: () => {
        showToast(this, { message: '复制失败，请重试', type: 'error' })
      }
    })
  },

  onDeleteBackup() {
    wx.showModal({
      title: '删除备份',
      content: '删除后无法再导出这份损坏数据的备份。',
      confirmText: '删除',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        storageService.clearBackup()
        this.syncFromStore()
        showToast(this, { message: '已删除备份', type: 'success' })
      }
    })
  }
})
