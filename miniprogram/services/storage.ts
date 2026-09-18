import type { AppData } from '../types/models'
import { errorMessage, logError, logWarn } from '../utils/logger'
import {
  BACKUP_KEY,
  STORAGE_KEY,
  createDefaultAppData,
  migrateAppData
} from '../utils/schema'

/** 本地存储写入失败。调用方必须向用户提示，不得假装保存成功。 */
export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageError'
  }
}

export interface LoadResult {
  data: AppData
  /** fresh = 首次启动；loaded = 正常读取；recovered = 数据损坏已恢复默认值。 */
  status: 'fresh' | 'loaded' | 'recovered'
  issues: string[]
  /** 是否已把损坏的原始数据保存到备份键。 */
  backupSaved: boolean
}

export interface StorageBackupInfo {
  savedAt: number
  size: number
}

function describeSaveError(error: unknown): string {
  const detail = errorMessage(error)
  if (/exceed|quota|full|storage/i.test(detail)) return '本地存储空间不足，请清理后重试'
  return '本地数据保存失败，请重试'
}

/** 把无法解析的原始数据备份到独立的存储键，避免静默清空。 */
function saveCorruptBackup(raw: unknown): boolean {
  try {
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
    if (!text) return false
    wx.setStorageSync(BACKUP_KEY, { savedAt: Date.now(), raw: text })
    return true
  } catch (error) {
    logWarn('备份损坏数据失败', error)
    return false
  }
}

export const storageService = {
  /** 读取并迁移本地数据。任何异常都会降级为默认数据并保留备份。 */
  load(): LoadResult {
    let raw: unknown
    try {
      raw = wx.getStorageSync(STORAGE_KEY)
    } catch (error) {
      logError('读取本地数据失败', error)
      return {
        data: createDefaultAppData(),
        status: 'recovered',
        issues: ['本地数据读取失败，请检查设备存储'],
        backupSaved: false
      }
    }

    if (raw === '' || raw === null || raw === undefined) {
      return { data: createDefaultAppData(), status: 'fresh', issues: [], backupSaved: false }
    }

    try {
      const result = migrateAppData(raw)
      return { data: result.data, status: 'loaded', issues: result.issues, backupSaved: false }
    } catch (error) {
      logError('本地数据解析失败，已备份原始数据', error)
      const backupSaved = saveCorruptBackup(raw)
      return {
        data: createDefaultAppData(),
        status: 'recovered',
        issues: [
          backupSaved
            ? '本地数据已损坏，原始数据已备份，可导出诊断'
            : '本地数据已损坏，且备份失败'
        ],
        backupSaved
      }
    }
  },

  /** 写入本地数据，失败时抛出 StorageError。 */
  save(data: AppData): void {
    try {
      wx.setStorageSync(STORAGE_KEY, data)
    } catch (error) {
      logError('保存本地数据失败', error)
      throw new StorageError(describeSaveError(error))
    }
  },

  /** 结构迁移。 */
  migrate(raw: unknown): { data: AppData; migrated: boolean; issues: string[] } {
    return migrateAppData(raw)
  },

  /** 清空主数据，保留备份键。 */
  clear(): void {
    try {
      wx.removeStorageSync(STORAGE_KEY)
    } catch (error) {
      logError('清空本地数据失败', error)
      throw new StorageError('清空本地数据失败，请重试')
    }
  },

  /** 是否存在损坏数据备份。 */
  backupInfo(): StorageBackupInfo | null {
    try {
      const raw = wx.getStorageSync(BACKUP_KEY)
      if (!raw || typeof raw !== 'object') return null
      const record = raw as Record<string, unknown>
      const text = typeof record.raw === 'string' ? record.raw : ''
      const savedAt = typeof record.savedAt === 'number' ? record.savedAt : 0
      if (!text) return null
      return { savedAt, size: text.length }
    } catch (error) {
      logWarn('读取备份信息失败', error)
      return null
    }
  },

  /** 读取备份的原始文本，用于诊断导出。 */
  readBackupText(): string {
    try {
      const raw = wx.getStorageSync(BACKUP_KEY)
      if (!raw || typeof raw !== 'object') return ''
      const record = raw as Record<string, unknown>
      return typeof record.raw === 'string' ? record.raw : ''
    } catch (error) {
      logWarn('读取备份内容失败', error)
      return ''
    }
  },

  /** 删除备份。 */
  clearBackup(): void {
    try {
      wx.removeStorageSync(BACKUP_KEY)
    } catch (error) {
      logWarn('删除备份失败', error)
    }
  }
}
