import type { AppData, ImportStats } from '../../types/models'
import type { ImportPreview } from '../../services/export-service'
import { appStore, commitAppData } from '../../store/app-store'
import { exportService } from '../../services/export-service'
import { summarize } from '../../utils/schema'
import { formatFullDate } from '../../utils/date'
import { refreshPageTheme } from '../../utils/theme'
import { showToast } from '../../utils/feedback'
import { errorMessage, logError } from '../../utils/logger'

/**
 * 数据导入与导出页。
 *
 * 导入流程严格分为两步：先校验并预览，再由用户确认覆盖。
 * 校验失败或本次会话中数据未通过校验时，现有数据不会被修改。
 */

const UNSUBSCRIBES = new WeakMap<object, () => void>()

/** 已通过校验、等待用户确认写入的数据。不放进 data，避免整包数据传到渲染层。 */
const PENDING_IMPORT = new WeakMap<object, AppData | null>()

interface PreviewRow {
  label: string
  value: string
}

/** 导出区展示的当前数据统计。 */
function buildExportRows(stats: ImportStats): PreviewRow[] {
  return [
    { label: '学期名称', value: stats.semesterName },
    { label: '课程数', value: `${stats.courses} 门` },
    { label: '日程数', value: `${stats.events} 条` }
  ]
}

/** 导入预览的完整统计。 */
function buildPreviewRows(stats: ImportStats): PreviewRow[] {
  return [
    { label: '学期名称', value: stats.semesterName },
    { label: '开学日期', value: stats.startDate ? formatFullDate(stats.startDate) : '未配置' },
    { label: '总周数', value: stats.totalWeeks > 0 ? `${stats.totalWeeks} 周` : '未配置' },
    { label: '课程数', value: `${stats.courses} 门` },
    { label: '日程数', value: `${stats.events} 条` }
  ]
}

function failureText(error: unknown, fallback: string): string {
  logError('数据导入导出失败', error)
  return errorMessage(error) || fallback
}

Page({
  data: {
    themeClass: 'theme-light',
    exportRows: buildExportRows(summarize(appStore.getData())),
    inputText: '',
    hasPreview: false,
    previewOk: false,
    previewMessage: '',
    previewIssues: [] as string[],
    previewRows: [] as PreviewRow[],
    busy: false,
    picking: false
  },

  onLoad() {
    const unsubscribe = appStore.subscribe(() => {
      refreshPageTheme(this)
      this.syncSummary()
    })
    UNSUBSCRIBES.set(this, unsubscribe)
  },

  onShow() {
    refreshPageTheme(this)
    this.syncSummary()
  },

  onUnload() {
    const unsubscribe = UNSUBSCRIBES.get(this)
    if (unsubscribe) unsubscribe()
    UNSUBSCRIBES.delete(this)
    PENDING_IMPORT.delete(this)
  },

  /** 重新统计当前数据，导出前与返回本页时都需要刷新。 */
  syncSummary() {
    this.setData({ exportRows: buildExportRows(summarize(appStore.getData())) })
  },

  onInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({
      inputText: event.detail.value,
      hasPreview: false,
      previewOk: false,
      previewMessage: '',
      previewIssues: [],
      previewRows: []
    })
    PENDING_IMPORT.set(this, null)
  },

  onCopy() {
    if (this.data.busy) return
    this.setData({ busy: true })
    exportService
      .copyToClipboard(appStore.getData())
      .then(() => {
        this.setData({ busy: false })
        showToast(this, { message: '已复制', type: 'success' })
      })
      .catch((error: unknown) => {
        this.setData({ busy: false })
        showToast(this, { message: failureText(error, '复制失败，请重试'), type: 'error' })
      })
  },

  onSaveFile() {
    if (this.data.busy) return
    this.setData({ busy: true })

    let filePath = ''
    try {
      filePath = exportService.writeFile(appStore.getData())
    } catch (error) {
      this.setData({ busy: false })
      showToast(this, { message: failureText(error, '生成导出文件失败，请重试'), type: 'error' })
      return
    }

    exportService
      .saveFile(filePath)
      .then((result) => {
        this.setData({ busy: false })
        showToast(this, {
          message: result === 'disk' ? '文件已保存到本地磁盘' : '文件已转发到聊天，请在聊天中保存',
          type: 'success'
        })
      })
      .catch((error: unknown) => {
        this.setData({ busy: false })
        showToast(this, { message: failureText(error, '保存文件失败，请改用复制功能'), type: 'error' })
      })
  },

  /** 校验输入框中的文本；输入框为空时先尝试读取剪贴板。 */
  onParse() {
    const text = this.data.inputText
    if (!text.trim()) {
      this.pasteAndParse()
      return
    }
    this.applyPreview(exportService.parse(text))
  },

  pasteAndParse() {
    wx.getClipboardData({
      success: (res) => {
        const text = typeof res.data === 'string' ? res.data : ''
        if (!text.trim()) {
          showToast(this, { message: '剪贴板中没有可用的 JSON 文本', type: 'error' })
          return
        }
        this.setData({ inputText: text })
        this.applyPreview(exportService.parse(text))
      },
      fail: () => {
        showToast(this, { message: '读取剪贴板失败，请手动粘贴到输入框', type: 'error' })
      }
    })
  },

  onPickFile() {
    if (this.data.picking) return
    this.setData({ picking: true })
    exportService
      .pickFile()
      .then((file) => {
        this.setData({ picking: false, inputText: file.text })
        this.applyPreview(exportService.parse(file.text))
      })
      .catch((error: unknown) => {
        this.setData({ picking: false })
        const detail = errorMessage(error)
        if (detail === '已取消选择') return
        showToast(this, { message: detail || '选择文件失败，请重试', type: 'error' })
      })
  },

  /** 写入校验结果；只有校验通过的数据才会被暂存等待确认。 */
  applyPreview(preview: ImportPreview) {
    if (!preview.ok || !preview.data || !preview.stats) {
      PENDING_IMPORT.set(this, null)
      this.setData({
        hasPreview: true,
        previewOk: false,
        previewMessage: preview.message,
        previewIssues: preview.issues,
        previewRows: []
      })
      return
    }

    PENDING_IMPORT.set(this, preview.data)
    this.setData({
      hasPreview: true,
      previewOk: true,
      previewMessage: preview.message,
      previewIssues: preview.issues,
      previewRows: buildPreviewRows(preview.stats)
    })
  },

  /** 二次确认后整体覆盖本地数据；写入失败时保持原数据不变。 */
  onConfirmImport() {
    const pending = PENDING_IMPORT.get(this)
    if (!pending) {
      showToast(this, { message: '请先校验导入内容', type: 'error' })
      return
    }
    this.confirmOverwrite(pending)
  },

  confirmOverwrite(pending: AppData) {
    wx.showModal({
      title: '覆盖本地数据',
      content: '导入会覆盖当前所有课程与日程，且无法撤销。确定继续吗？',
      confirmText: '确认覆盖',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        try {
          commitAppData(pending)
        } catch (error) {
          logError('导入数据保存失败', error)
          showToast(this, { message: errorMessage(error) || '导入失败，请重试', type: 'error' })
          return
        }
        PENDING_IMPORT.set(this, null)
        showToast(this, { message: '导入完成', type: 'success' })
        wx.navigateBack()
      }
    })
  }
})
