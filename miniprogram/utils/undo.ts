import type { Course, ScheduleEvent } from '../types/models'
import { courseService } from '../services/course-service'
import { eventService } from '../services/event-service'

/**
 * 删除后的撤销快照。
 * 使用 WeakMap 绑定到页面实例，避免在 data 中传递大对象。
 */
export interface UndoSnapshot {
  kind: 'course' | 'event'
  label: string
  course?: Course
  event?: ScheduleEvent
}

const SLOTS = new WeakMap<object, UndoSnapshot | null>()

export function setUndo(target: object, snapshot: UndoSnapshot | null): void {
  SLOTS.set(target, snapshot)
}

/** 取出并清空快照，避免重复撤销。 */
export function takeUndo(target: object): UndoSnapshot | null {
  const snapshot = SLOTS.get(target) || null
  SLOTS.set(target, null)
  return snapshot
}

/** 恢复被删除的数据。 */
export function restoreUndo(snapshot: UndoSnapshot): void {
  if (snapshot.kind === 'course' && snapshot.course) {
    courseService.restore(snapshot.course)
    return
  }
  if (snapshot.kind === 'event' && snapshot.event) {
    eventService.restore(snapshot.event)
  }
}
