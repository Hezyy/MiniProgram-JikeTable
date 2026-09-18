import {
  courseImportService,
  type CourseImportPreview,
  type ImportPreviewItem
} from '../../services/course-import-service'
import { appStore } from '../../store/app-store'
import { getColor } from '../../utils/colors'
import { confirmAction } from '../../utils/dialog'
import { showToast } from '../../utils/feedback'
import { errorMessage, logError } from '../../utils/logger'
import { refreshPageTheme } from '../../utils/theme'

/**
 * 从教务系统粘贴课表文本导入课程。
 *
 * 流程：粘贴 → 解析预览 → 选择导入方式 → 二次确认（覆盖时）→ 写入。
 * 解析与写入全部在本机完成，不涉及账号密码，也不发起任何网络请求。
 */

interface IssueRow {
  key: string
  message: string
  raw: string
}

/** 预览条目：在服务层数据之上补好课程块配色，避免 wxml 里反复取值。 */
interface PreviewItemView extends ImportPreviewItem {
  bg: string
  text: string
  bar: string
}

type ImportMode = 'merge' | 'replace'

const MODE_OPTIONS = [
  { label: '追加到现有课程', value: 'merge' },
  { label: '覆盖全部课程', value: 'replace' }
]

const UNSUBSCRIBES = new WeakMap<object, () => void>()

/** 已解析成功、等待写入的方案。courses 数据量大，不放进 data。 */
const PENDING_PREVIEW = new WeakMap<object, CourseImportPreview | null>()

/** 当前学期总周数，未设置学期时为 0。 */
function currentSemesterWeeks(): number {
  const semester = appStore.getData().semester
  return semester ? semester.totalWeeks : 0
}

function buildItems(items: ImportPreviewItem[]): PreviewItemView[] {
  return items.map((item) => {
    const color = getColor(item.colorId)
    return { ...item, bg: color.bg, text: color.text, bar: color.bar }
  })
}

function buildIssues(issues: CourseImportPreview['issues']): IssueRow[] {
  return issues.map((issue, index) => ({
    key: `issue-${index}`,
    message: issue.message,
    raw: issue.raw
  }))
}

Page({
  data: {
    themeClass: 'theme-light',
    hasSemester: !!appStore.getData().semester,
    currentTotalWeeks: currentSemesterWeeks(),
    inputText: '',
    hasPreview: false,
    previewOk: false,
    previewMessage: '',
    warnings: [] as string[],
    issues: [] as IssueRow[],
    items: [] as PreviewItemView[],
    maxWeek: 0,
    suggestedTotalWeeks: 0,
    extendTotalWeeks: false,
    mode: 'merge' as ImportMode,
    modeOptions: MODE_OPTIONS,
    canImport: false,
    busy: false
  },

  onLoad() {
    const unsubscribe = appStore.subscribe(() => {
      refreshPageTheme(this)
      this.syncSemester()
    })
    UNSUBSCRIBES.set(this, unsubscribe)
    this.syncSemester()
  },

  onShow() {
    refreshPageTheme(this)
    this.syncSemester()
  },

  onUnload() {
    const unsubscribe = UNSUBSCRIBES.get(this)
    if (unsubscribe) unsubscribe()
    UNSUBSCRIBES.delete(this)
    PENDING_PREVIEW.delete(this)
  },

  /** 同步学期信息；没有学期时清空预览，改为展示空状态。 */
  syncSemester() {
    const semester = appStore.getData().semester
    if (!semester) {
      if (!this.data.hasSemester) return
      PENDING_PREVIEW.set(this, null)
      this.setData({
        hasSemester: false,
        currentTotalWeeks: 0,
        hasPreview: false,
        previewOk: false,
        previewMessage: '',
        warnings: [],
        issues: [],
        items: [],
        canImport: false
      })
      return
    }
    if (this.data.hasSemester && this.data.currentTotalWeeks === semester.totalWeeks) return
    this.setData({ hasSemester: true, currentTotalWeeks: semester.totalWeeks })
  },

  onInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({
      inputText: event.detail.value,
      hasPreview: false,
      previewOk: false,
      previewMessage: '',
      warnings: [],
      issues: [],
      items: [],
      canImport: false
    })
    PENDING_PREVIEW.set(this, null)
  },

  /** 解析输入框中的文本；输入框为空时先尝试读取剪贴板。 */
  onParse() {
    const text = this.data.inputText
    if (!text.trim()) {
      this.readClipboardAndParse()
      return
    }
    this.applyPreview(courseImportService.buildPreview(text))
  },

  onPasteFromClipboard() {
    this.readClipboardAndParse()
  },

  readClipboardAndParse() {
    wx.getClipboardData({
      success: (res) => {
        const text = typeof res.data === 'string' ? res.data : ''
        if (!text.trim()) {
          showToast(this, { message: '剪贴板里没有文字，请先复制课表', type: 'error' })
          return
        }
        this.setData({ inputText: text })
        this.applyPreview(courseImportService.buildPreview(text))
      },
      fail: () => {
        showToast(this, { message: '读取剪贴板失败，请手动粘贴到输入框', type: 'error' })
      }
    })
  },

  /** 写入解析结果。解析失败时保留用户粘贴的文本，方便修改后重试。 */
  applyPreview(preview: CourseImportPreview) {
    const ok = preview.ok && preview.items.length > 0
    PENDING_PREVIEW.set(this, ok ? preview : null)
    this.setData({
      hasPreview: true,
      previewOk: ok,
      previewMessage: preview.message,
      warnings: preview.warnings,
      issues: buildIssues(preview.issues),
      items: ok ? buildItems(preview.items) : [],
      canImport: ok,
      maxWeek: ok ? preview.maxWeek : 0,
      suggestedTotalWeeks: ok ? preview.suggestedTotalWeeks : this.data.currentTotalWeeks,
      extendTotalWeeks: ok && preview.suggestedTotalWeeks > this.data.currentTotalWeeks
    })
  },

  onModeChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const mode: ImportMode = String(event.detail.value) === 'replace' ? 'replace' : 'merge'
    this.setData({ mode })
  },

  onToggleExtend() {
    this.setData({ extendTotalWeeks: !this.data.extendTotalWeeks })
  },

  onGoSettings() {
    wx.switchTab({ url: '/pages/settings/index' })
  },

  /** 覆盖导入前二次确认；其余情况直接写入。 */
  onImport() {
    if (this.data.busy || !this.data.canImport) return
    const preview = PENDING_PREVIEW.get(this)
    if (!preview || !preview.ok) {
      showToast(this, { message: '请先成功解析课表', type: 'error' })
      return
    }
    if (this.data.mode !== 'replace') {
      this.runImport(preview)
      return
    }
    confirmAction({
      title: '覆盖全部课程',
      content: `导入会先删除当前所有课程，再写入解析出的 ${preview.items.length} 门课程，且无法撤销。确定继续吗？`,
      confirmText: '覆盖导入',
      danger: true
    }).then((confirmed) => {
      if (!confirmed) return
      this.runImport(preview)
    })
  },

  runImport(preview: CourseImportPreview) {
    const mode: ImportMode = this.data.mode === 'replace' ? 'replace' : 'merge'
    this.setData({ busy: true })
    try {
      const result = courseImportService.apply(preview, {
        mode,
        extendTotalWeeks: this.data.extendTotalWeeks
      })
      showToast(this, { message: `已导入 ${result.added} 门课程`, type: 'success' })
      // 保持 busy 一直到离开页面，避免返回前被重复触发
      setTimeout(() => {
        wx.navigateBack({
          fail: () => {
            this.setData({ busy: false })
          }
        })
      }, 600)
    } catch (error) {
      logError('导入课表失败', error)
      this.setData({ busy: false })
      showToast(this, { message: errorMessage(error) || '导入失败，请重试', type: 'error' })
    }
  }
})
