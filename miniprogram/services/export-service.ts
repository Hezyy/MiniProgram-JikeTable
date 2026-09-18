import type { AppData, ExportPayload, ImportStats } from '../types/models'
import { errorMessage, logError, logWarn } from '../utils/logger'
import {
  buildExportPayload,
  parseImportPayload,
  type ParseImportResult
} from '../utils/schema'

/**
 * 数据导入导出。
 *
 * 导出：复制 JSON 到剪贴板（全平台可用）/ 写入本地文件后保存到磁盘或转发到聊天。
 * 导入：粘贴 JSON 文本 / 从聊天记录选择文件。
 */

export interface ImportPreview {
  ok: boolean
  message: string
  data?: AppData
  stats?: ImportStats
  issues: string[]
}

/** 兼容未在当前 typings 中声明、但运行时存在的能力。 */
type ShareFileMessageFn = (options: {
  filePath: string
  fileName?: string
  success?: () => void
  fail?: (error: unknown) => void
}) => void

type SaveFileToDiskFn = (options: {
  filePath: string
  success?: () => void
  fail?: (error: unknown) => void
}) => void

function getShareFileMessage(): ShareFileMessageFn | null {
  const api = wx as unknown as { shareFileMessage?: ShareFileMessageFn }
  return typeof api.shareFileMessage === 'function' ? api.shareFileMessage : null
}

function getSaveFileToDisk(): SaveFileToDiskFn | null {
  const api = wx as unknown as { saveFileToDisk?: SaveFileToDiskFn }
  return typeof api.saveFileToDisk === 'function' ? api.saveFileToDisk : null
}

function timestampSuffix(date: Date = new Date()): string {
  const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`)
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}`
}

function exportDirectory(): string {
  return `${wx.env.USER_DATA_PATH}/export`
}

export const exportService = {
  /** 构造导出负载。 */
  payload(data: AppData): ExportPayload {
    return buildExportPayload(data)
  },

  /** 序列化为可读 JSON 文本。 */
  toJson(data: AppData): string {
    return JSON.stringify(buildExportPayload(data), null, 2)
  },

  /** 复制导出内容到剪贴板。 */
  copyToClipboard(data: AppData): Promise<void> {
    const content = exportService.toJson(data)
    return new Promise<void>((resolve, reject) => {
      wx.setClipboardData({
        data: content,
        success: () => resolve(),
        fail: (error) => {
          logError('复制导出数据失败', error)
          reject(new Error('复制失败，请重试'))
        }
      })
    })
  },

  /** 写入本地文件，返回文件路径。 */
  writeFile(data: AppData): string {
    const content = exportService.toJson(data)
    const fs = wx.getFileSystemManager()
    const dir = exportDirectory()
    try {
      fs.mkdirSync(dir, true)
    } catch (error) {
      logWarn('创建导出目录失败或目录已存在', error)
    }
    const filePath = `${dir}/jike-timetable-${timestampSuffix()}.json`
    try {
      fs.writeFileSync(filePath, content, 'utf8')
    } catch (error) {
      logError('写入导出文件失败', error)
      throw new Error('生成导出文件失败，请重试')
    }
    return filePath
  },

  /**
   * 保存导出文件：
   * 优先使用「保存到磁盘」（PC / Mac），移动端回退到转发到聊天。
   */
  saveFile(filePath: string): Promise<'disk' | 'share'> {
    const saveToDisk = getSaveFileToDisk()
    if (saveToDisk) {
      return new Promise<'disk' | 'share'>((resolve, reject) => {
        saveToDisk({
          filePath,
          success: () => resolve('disk'),
          fail: () => {
            const share = getShareFileMessage()
            if (!share) {
              reject(new Error('当前环境不支持保存文件，请使用复制功能'))
              return
            }
            share({
              filePath,
              fileName: '即课课表数据.json',
              success: () => resolve('share'),
              fail: (error) => {
                logError('转发导出文件失败', error)
                reject(new Error('保存文件失败，请使用复制功能'))
              }
            })
          }
        })
      })
    }

    const share = getShareFileMessage()
    if (!share) {
      return Promise.reject(new Error('当前环境不支持保存文件，请使用复制功能'))
    }
    return new Promise<'disk' | 'share'>((resolve, reject) => {
      share({
        filePath,
        fileName: '即课课表数据.json',
        success: () => resolve('share'),
        fail: (error) => {
          logError('转发导出文件失败', error)
          reject(new Error('保存文件失败，请使用复制功能'))
        }
      })
    })
  },

  /** 从聊天记录选择 JSON 文件并读取文本。 */
  pickFile(): Promise<{ text: string; name: string }> {
    return new Promise((resolve, reject) => {
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['json'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0]
          if (!file || !file.path) {
            reject(new Error('未选择文件'))
            return
          }
          try {
            const text = wx.getFileSystemManager().readFileSync(file.path, 'utf8')
            resolve({ text: typeof text === 'string' ? text : String(text), name: file.name || '' })
          } catch (error) {
            logError('读取导入文件失败', error)
            reject(new Error('文件读取失败，请确认是文本格式的 JSON'))
          }
        },
        fail: (error) => {
          const detail = errorMessage(error)
          if (/cancel/i.test(detail)) {
            reject(new Error('已取消选择'))
            return
          }
          reject(new Error('选择文件失败'))
        }
      })
    })
  },

  /** 校验导入内容，不修改现有数据。 */
  parse(text: string): ImportPreview {
    const result: ParseImportResult = parseImportPayload(text)
    return result
  },

  /** 校验并解析已读取的文件内容。 */
  parseFileContent(text: string): ImportPreview {
    return exportService.parse(text)
  }
}
