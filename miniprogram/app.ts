import { appStore } from './store/app-store'
import { storageService } from './services/storage'
import { logError } from './utils/logger'
import { applyTheme, resolveTheme } from './utils/theme'

App<IAppOption>({
  globalData: {
    storageStatus: 'fresh',
    startupIssues: []
  },

  onLaunch() {
    // 首版无后端：启动时一次性读取本地数据并写入 Store。
    const result = storageService.load()
    appStore.setState({ ready: true, data: result.data })
    this.globalData.storageStatus = result.status
    this.globalData.startupIssues = result.issues
    applyTheme(resolveTheme(result.data.preferences.theme))
    if (result.issues.length > 0) {
      logError('启动时发现本地数据问题', result.issues)
    }
  },

  onThemeChange() {
    // 只有跟随系统时才需要响应；其余情况由页面按用户偏好设置。
    if (appStore.getData().preferences.theme !== 'system') return
    applyTheme(resolveTheme('system'))
    // 触发订阅者刷新根节点主题类
    appStore.setState({})
  }
})
