import type { AppData, AppState } from '../types/models'
import { createDefaultAppData } from '../utils/schema'
import { logError } from '../utils/logger'
import { storageService } from '../services/storage'

/** Store 订阅回调。 */
export type AppStoreListener = (state: AppState) => void

/**
 * 轻量单例 Store。
 * 只保存当前学期、课程、日程与 UI 级筛选状态，不引入第三方状态库。
 */
class AppStore {
  private state: AppState = { ready: false, data: createDefaultAppData() }

  private listeners: AppStoreListener[] = []

  getState(): AppState {
    return this.state
  }

  getData(): AppData {
    return this.state.data
  }

  /** 合并式更新状态并通知订阅者。 */
  setState(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch }
    this.notify()
  }

  setData(data: AppData): void {
    this.setState({ data })
  }

  subscribe(listener: AppStoreListener): () => void {
    if (this.listeners.indexOf(listener) === -1) this.listeners.push(listener)
    return () => {
      this.unsubscribe(listener)
    }
  }

  unsubscribe(listener: AppStoreListener): void {
    const index = this.listeners.indexOf(listener)
    if (index >= 0) this.listeners.splice(index, 1)
  }

  private notify(): void {
    const snapshot = this.listeners.slice()
    for (let i = 0; i < snapshot.length; i += 1) {
      try {
        snapshot[i](this.state)
      } catch (error) {
        logError('Store 订阅回调执行失败', error)
      }
    }
  }
}

export const appStore = new AppStore()

/**
 * 数据写入的唯一出口：先持久化，成功后再更新 Store。
 * 持久化失败会抛出 StorageError，调用方必须向用户反馈，不得假装保存成功。
 */
export function commitAppData(next: AppData): void {
  storageService.save(next)
  appStore.setData(next)
}
