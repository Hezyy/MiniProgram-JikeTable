/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    /** 本地数据的读取结果：fresh 首次启动 / loaded 正常 / recovered 损坏后恢复。 */
    storageStatus: 'fresh' | 'loaded' | 'recovered'
    /** 启动时需要提示用户的数据问题。 */
    startupIssues: string[]
  }
}
