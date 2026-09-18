import type { ScheduleEvent, TimelineEntry } from '../../types/models'
import { appStore } from '../../store/app-store'
import { eventService } from '../../services/event-service'
import type { EventFilter } from '../../services/event-service'
import {
  addDaysToDateString,
  diffDateStrings,
  formatFullDateWithWeekday,
  formatRelativeDate,
  timeToMinutes,
  todayString
} from '../../utils/date'
import { confirmAction } from '../../utils/dialog'
import { showToast } from '../../utils/feedback'
import { logError } from '../../utils/logger'
import { refreshPageTheme } from '../../utils/theme'
import { restoreUndo, setUndo, takeUndo } from '../../utils/undo'

const UNSUBSCRIBERS = new WeakMap<object, () => void>()

/** 初始时间窗口：前后各覆盖一段时间，避免一次渲染全部日程。 */
const WINDOW_BACK_DAYS = 30
const WINDOW_FORWARD_DAYS = 90
/** 每次「加载更多」向前延伸的天数。 */
const LOAD_MORE_DAYS = 90
/** 时间窗口上限，防止无限制扩展。 */
const MAX_WINDOW_DAYS = 730

interface EventGroup {
  date: string
  relativeLabel: string
  fullLabel: string
  isToday: boolean
  items: TimelineEntry[]
}

function toEntry(event: ScheduleEvent, isToday: boolean, now: Date): TimelineEntry {
  const startMinutes = timeToMinutes(event.startTime)
  const timed = event.kind === 'event' && !!event.endTime
  const endMinutes = timed ? timeToMinutes(event.endTime) : startMinutes
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  let status: TimelineEntry['status'] = 'pending'
  if (event.completed) {
    status = 'finished'
  } else if (isToday && timed) {
    if (nowMinutes >= startMinutes && nowMinutes < endMinutes) status = 'ongoing'
    else if (nowMinutes >= endMinutes) status = 'finished'
  }
  return {
    id: event.id,
    type: 'event',
    title: event.title,
    subtitle: event.kind === 'todo' ? '待办' : '',
    timeText: timed ? `${event.startTime} - ${event.endTime}` : event.startTime,
    location: event.location,
    colorId: event.colorId,
    completed: event.completed,
    isTodo: event.kind === 'todo',
    startMinutes,
    status
  }
}

Page({
  data: {
    themeClass: 'theme-light',
    filter: 'all' as EventFilter,
    filterOptions: [] as Array<{ label: string; value: string; badge: number }>,
    anchorDate: '',
    anchorLabel: '',
    windowStart: '',
    windowEnd: '',
    groups: [] as EventGroup[],
    groupCount: 0,
    itemCount: 0,
    canLoadMore: false,
    emptyTitle: '',
    emptyDesc: ''
  },

  onLoad() {
    const unsubscribe = appStore.subscribe(() => {
      refreshPageTheme(this)
    })
    UNSUBSCRIBERS.set(this, unsubscribe)
  },

  onShow() {
    refreshPageTheme(this)
    if (!appStore.getData().initialized) {
      wx.reLaunch({ url: '/pages/onboarding/index' })
      return
    }
    const today = todayString()
    if (!this.data.anchorDate) {
      this.setData({
        anchorDate: today,
        anchorLabel: formatFullDateWithWeekday(today),
        windowStart: addDaysToDateString(today, -WINDOW_BACK_DAYS),
        windowEnd: addDaysToDateString(today, WINDOW_FORWARD_DAYS)
      })
    }
    this.refresh()
  },

  onUnload() {
    const unsubscribe = UNSUBSCRIBERS.get(this)
    if (unsubscribe) unsubscribe()
    UNSUBSCRIBERS.set(this, undefined as unknown as () => void)
  },

  refresh() {
    const filter = this.data.filter
    const now = new Date()
    const today = todayString(now)
    const events = eventService.listRange(this.data.windowStart, this.data.windowEnd, filter)

    const groups: EventGroup[] = []
    let current: EventGroup | null = null
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i]
      let group: EventGroup | null = current
      if (!group || group.date !== event.date) {
        const isToday = event.date === today
        group = {
          date: event.date,
          relativeLabel: formatRelativeDate(event.date, today),
          fullLabel: formatFullDateWithWeekday(event.date),
          isToday,
          items: []
        }
        groups.push(group)
        current = group
      }
      const activeGroup: EventGroup = group
      activeGroup.items.push(toEntry(event, activeGroup.isToday, now))
    }

    const counts = {
      all: eventService.count('all'),
      pending: eventService.count('pending'),
      completed: eventService.count('completed')
    }
    const filterOptions = [
      { label: '全部', value: 'all', badge: counts.all },
      { label: '待完成', value: 'pending', badge: counts.pending },
      { label: '已完成', value: 'completed', badge: counts.completed }
    ]

    let itemCount = 0
    for (let i = 0; i < groups.length; i += 1) itemCount += groups[i].items.length

    const span = this.windowSpan()
    const canLoadMore = span < MAX_WINDOW_DAYS

    let emptyTitle = '还没有日程'
    let emptyDesc = '点击右下角的按钮添加日程或待办。'
    if (filter === 'pending') {
      emptyTitle = '没有待完成的待办'
      emptyDesc = '所有待办都已完成。'
    } else if (filter === 'completed') {
      emptyTitle = '还没有已完成的事项'
      emptyDesc = '完成待办后会出现在这里。'
    } else if (itemCount === 0 && counts.all > 0) {
      emptyTitle = '当前时间范围内没有日程'
      emptyDesc = '可以调整时间范围或点击「加载更多」查看更远的日程。'
    }

    this.setData({
      filterOptions,
      groups,
      groupCount: groups.length,
      itemCount,
      canLoadMore,
      emptyTitle,
      emptyDesc
    })
  },

  windowSpan(): number {
    const start = this.data.windowStart
    const end = this.data.windowEnd
    if (!start || !end) return 0
    return diffDateStrings(start, end)
  },

  onFilterChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const value = event.detail.value
    const filter: EventFilter =
      value === 'pending' ? 'pending' : value === 'completed' ? 'completed' : 'all'
    this.setData({ filter }, () => this.refresh())
  },

  onPickAnchor(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const date = String(event.detail.value)
    if (!date) return
    this.setData(
      {
        anchorDate: date,
        anchorLabel: formatFullDateWithWeekday(date),
        windowStart: addDaysToDateString(date, -WINDOW_BACK_DAYS),
        windowEnd: addDaysToDateString(date, WINDOW_FORWARD_DAYS)
      },
      () => this.refresh()
    )
  },

  onLoadMore() {
    const span = this.windowSpan()
    if (span >= MAX_WINDOW_DAYS) {
      showToast(this, { message: '已到达可查看的时间范围上限', type: 'info' })
      return
    }
    this.setData(
      { windowEnd: addDaysToDateString(this.data.windowEnd, LOAD_MORE_DAYS) },
      () => this.refresh()
    )
  },

  onAddEvent() {
    wx.navigateTo({ url: `/pages/event-edit/index?date=${this.data.anchorDate || todayString()}` })
  },

  onTapItem(event: WechatMiniprogram.CustomEvent<{ id: string; type: string }>) {
    const id = event.detail && event.detail.id
    if (!id) return
    wx.navigateTo({ url: `/pages/event-edit/index?id=${id}` })
  },

  onToggleTodo(event: WechatMiniprogram.CustomEvent<{ id: string; completed: boolean }>) {
    const detail = event.detail
    if (!detail) return
    try {
      eventService.update(detail.id, { completed: detail.completed })
      this.refresh()
    } catch (error) {
      logError('更新待办状态失败', error)
      showToast(this, { message: '更新失败，请重试', type: 'error' })
    }
  },

  /** 长按作为删除 / 完成的快捷入口，编辑页内仍有可见的删除按钮。 */
  onLongPressItem(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string
    if (!id) return
    const target = eventService.getById(id)
    if (!target) {
      showToast(this, { message: '该日程可能已被删除', type: 'error' })
      this.refresh()
      return
    }
    const actions = target.kind === 'todo' ? ['编辑', target.completed ? '恢复为未完成' : '标记为已完成', '删除'] : ['编辑', '删除']
    wx.showActionSheet({
      itemList: actions,
      success: (res) => {
        const label = actions[res.tapIndex]
        if (label === '编辑') {
          wx.navigateTo({ url: `/pages/event-edit/index?id=${id}` })
        } else if (label === '删除') {
          this.deleteEvent(id)
        } else if (label && label.indexOf('标记') === 0) {
          this.toggleById(id, true)
        } else if (label === '恢复为未完成') {
          this.toggleById(id, false)
        }
      },
      fail: () => undefined
    })
  },

  toggleById(id: string, completed: boolean) {
    try {
      eventService.update(id, { completed })
      this.refresh()
    } catch (error) {
      logError('更新待办状态失败', error)
      showToast(this, { message: '更新失败，请重试', type: 'error' })
    }
  },

  deleteEvent(id: string) {
    const target = eventService.getById(id)
    if (!target) {
      showToast(this, { message: '该日程可能已被删除', type: 'error' })
      this.refresh()
      return
    }
    confirmAction({
      title: '删除日程',
      content: `确定删除「${target.title}」吗？删除后可在提示中撤销。`,
      confirmText: '删除',
      danger: true
    }).then((confirmed) => {
      if (!confirmed) return
      try {
        const removed = eventService.remove(id)
        setUndo(this, { kind: 'event', label: removed.title, event: removed })
        showToast(this, { message: '已删除', type: 'success', actionText: '撤销' })
        this.refresh()
      } catch (error) {
        logError('删除日程失败', error)
        showToast(this, { message: '删除失败，请重试', type: 'error' })
      }
    })
  },

  onToastAction() {
    const snapshot = takeUndo(this)
    if (!snapshot) return
    try {
      restoreUndo(snapshot)
      showToast(this, { message: '已恢复', type: 'success' })
      this.refresh()
    } catch (error) {
      logError('恢复删除失败', error)
      showToast(this, { message: '恢复失败，请重试', type: 'error' })
    }
  }
})
