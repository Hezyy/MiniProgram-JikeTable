const SLOTS = new WeakMap<object, number[]>()

/** 注册一个可被统一清理的定时器。 */
export function registerInterval(target: object, callback: () => void, delay: number): number {
  const id = setInterval(callback, delay)
  const list = SLOTS.get(target) || []
  list.push(id)
  SLOTS.set(target, list)
  return id
}

/** 清理该宿主注册的全部定时器，避免泄漏。 */
export function clearRegisteredTimers(target: object): void {
  const list = SLOTS.get(target)
  if (!list || list.length === 0) return
  for (let i = 0; i < list.length; i += 1) clearInterval(list[i])
  SLOTS.set(target, [])
}
