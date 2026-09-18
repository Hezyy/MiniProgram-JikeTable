import type { AppData, ScheduleEvent, ScheduleEventInput } from '../types/models'
import { appStore, commitAppData } from '../store/app-store'
import { DEFAULT_EVENT_COLOR_ID, isValidColorId } from '../utils/colors'
import {
  isValidDateString,
  isValidTimeString,
  minutesToTime,
  timeToMinutes
} from '../utils/date'
import { createId } from '../utils/id'

/**
 * 日程与待办业务逻辑。
 */

export type EventFilter = 'all' | 'pending' | 'completed'

function currentData(): AppData {
  return appStore.getData()
}

function normalizeInput(input: ScheduleEventInput): ScheduleEventInput {
  const kind: ScheduleEvent['kind'] = input.kind === 'todo' ? 'todo' : 'event'
  const startTime = isValidTimeString(input.startTime) ? input.startTime : '09:00'
  let endTime = isValidTimeString(input.endTime) ? input.endTime : ''
  if (kind === 'event') {
    if (!endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      endTime = minutesToTime(Math.min(timeToMinutes(startTime) + 60, 23 * 60 + 59))
    }
  } else if (endTime && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    endTime = ''
  }
  return {
    title: (input.title || '').trim(),
    date: isValidDateString(input.date) ? input.date : '',
    startTime,
    endTime,
    kind,
    completed: input.completed === true,
    location: (input.location || '').trim(),
    note: (input.note || '').trim(),
    colorId: isValidColorId(input.colorId) ? input.colorId : DEFAULT_EVENT_COLOR_ID
  }
}

function sortEvents(events: ScheduleEvent[]): ScheduleEvent[] {
  return events.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const diff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    if (diff !== 0) return diff
    return a.createdAt - b.createdAt
  })
}

function matchesFilter(event: ScheduleEvent, filter: EventFilter): boolean {
  if (filter === 'pending') return event.kind === 'todo' && !event.completed
  if (filter === 'completed') return event.completed
  return true
}

export const eventService = {
  /** 全部日程，按日期与时间排序。 */
  list(filter: EventFilter = 'all'): ScheduleEvent[] {
    const events = currentData().events
    const result: ScheduleEvent[] = []
    for (let i = 0; i < events.length; i += 1) {
      if (matchesFilter(events[i], filter)) result.push({ ...events[i] })
    }
    return sortEvents(result)
  },

  count(filter: EventFilter = 'all'): number {
    const events = currentData().events
    if (filter === 'all') return events.length
    let total = 0
    for (let i = 0; i < events.length; i += 1) {
      if (matchesFilter(events[i], filter)) total += 1
    }
    return total
  },

  listByDate(date: string, filter: EventFilter = 'all'): ScheduleEvent[] {
    const events = currentData().events
    const result: ScheduleEvent[] = []
    for (let i = 0; i < events.length; i += 1) {
      if (events[i].date === date && matchesFilter(events[i], filter)) result.push({ ...events[i] })
    }
    return sortEvents(result)
  },

  listRange(startDate: string, endDate: string, filter: EventFilter = 'all'): ScheduleEvent[] {
    const events = currentData().events
    const result: ScheduleEvent[] = []
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i]
      if (event.date >= startDate && event.date <= endDate && matchesFilter(event, filter)) {
        result.push({ ...event })
      }
    }
    return sortEvents(result)
  },

  getById(id: string): ScheduleEvent | null {
    const events = currentData().events
    for (let i = 0; i < events.length; i += 1) {
      if (events[i].id === id) return { ...events[i] }
    }
    return null
  },

  create(input: ScheduleEventInput): ScheduleEvent {
    const data = currentData()
    const normalized = normalizeInput(input)
    if (!normalized.title) throw new Error('请填写标题')
    if (!normalized.date) throw new Error('请选择有效日期')
    const now = Date.now()
    const event: ScheduleEvent = {
      ...normalized,
      id: createId('event'),
      createdAt: now,
      updatedAt: now
    }
    commitAppData({ ...data, events: data.events.concat([event]) })
    return event
  },

  update(id: string, patch: Partial<ScheduleEventInput>): ScheduleEvent {
    const data = currentData()
    let index = -1
    for (let i = 0; i < data.events.length; i += 1) {
      if (data.events[i].id === id) {
        index = i
        break
      }
    }
    if (index === -1) throw new Error('日程不存在或已被删除')

    const merged: ScheduleEventInput = { ...data.events[index], ...patch }
    const normalized = normalizeInput(merged)
    if (!normalized.title) throw new Error('请填写标题')
    if (!normalized.date) throw new Error('请选择有效日期')

    const updated: ScheduleEvent = {
      ...normalized,
      id: data.events[index].id,
      createdAt: data.events[index].createdAt,
      updatedAt: Date.now()
    }
    const events = data.events.slice()
    events[index] = updated
    commitAppData({ ...data, events })
    return updated
  },

  toggleComplete(id: string): ScheduleEvent {
    const current = eventService.getById(id)
    if (!current) throw new Error('日程不存在或已被删除')
    return eventService.update(id, { completed: !current.completed })
  },

  /** 删除日程，返回被删除的数据便于撤销。 */
  remove(id: string): ScheduleEvent {
    const data = currentData()
    let removed: ScheduleEvent | null = null
    const events: ScheduleEvent[] = []
    for (let i = 0; i < data.events.length; i += 1) {
      if (data.events[i].id === id) removed = data.events[i]
      else events.push(data.events[i])
    }
    if (!removed) throw new Error('日程不存在或已被删除')
    commitAppData({ ...data, events })
    return removed
  },

  /** 撤销删除。 */
  restore(event: ScheduleEvent): void {
    const data = currentData()
    for (let i = 0; i < data.events.length; i += 1) {
      if (data.events[i].id === event.id) return
    }
    commitAppData({ ...data, events: data.events.concat([event]) })
  },

  /** 整体替换日程列表，用于导入。 */
  replaceAll(events: ScheduleEvent[]): void {
    const data = currentData()
    commitAppData({ ...data, events: events.slice() })
  },

  /** 有日程的日期集合，按升序排列。 */
  listDates(): string[] {
    const events = currentData().events
    const seen: { [date: string]: boolean } = {}
    const dates: string[] = []
    for (let i = 0; i < events.length; i += 1) {
      const date = events[i].date
      if (!seen[date]) {
        seen[date] = true
        dates.push(date)
      }
    }
    dates.sort()
    return dates
  }
}
