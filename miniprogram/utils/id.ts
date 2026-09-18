// 统一 ID 生成：时间戳 + 随机串，禁止依赖数组下标。

/**
 * 生成一个局部唯一 ID。
 * @param prefix 业务前缀，便于排查数据来源。
 */
export function createId(prefix = 'id'): string {
  const time = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  const salt = Math.random().toString(36).slice(2, 6)
  return `${prefix}_${time}${random}${salt}`
}
