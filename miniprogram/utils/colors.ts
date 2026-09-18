import type { ColorOption } from '../types/models'

/**
 * 预设色板：浅色背景 + 深色文字，保证正文对比度；
 * `bar` 用于左侧标识条与选中态，不得仅靠颜色传达状态。
 */
export const PRESET_COLORS: ColorOption[] = [
  { id: 'blue', name: '天蓝', bg: '#E4EEFF', text: '#1B5BB5', bar: '#3B82F6' },
  { id: 'teal', name: '青碧', bg: '#DFF4F1', text: '#126B5C', bar: '#14B8A6' },
  { id: 'green', name: '草绿', bg: '#E2F5E8', text: '#1A7043', bar: '#34C77B' },
  { id: 'amber', name: '麦黄', bg: '#FCF1D8', text: '#845C10', bar: '#E3A521' },
  { id: 'orange', name: '暖橙', bg: '#FCE9DC', text: '#8F4E16', bar: '#F0803C' },
  { id: 'rose', name: '绯红', bg: '#FCE4E8', text: '#97263A', bar: '#EF5A72' },
  { id: 'violet', name: '紫罗兰', bg: '#EFE8FD', text: '#5438A8', bar: '#8B5CF6' },
  { id: 'pink', name: '樱粉', bg: '#FBE5F1', text: '#94215C', bar: '#EC6BB0' },
  { id: 'slate', name: '雾灰', bg: '#E8EDF5', text: '#42556F', bar: '#64748B' }
]

export const DEFAULT_COURSE_COLOR_ID = 'blue'
export const DEFAULT_EVENT_COLOR_ID = 'violet'

const FALLBACK: ColorOption = PRESET_COLORS[0]

/** 按 id 取颜色，未知 id 回退到第一个预设色。 */
export function getColor(colorId: string | undefined | null): ColorOption {
  if (typeof colorId === 'string') {
    for (let i = 0; i < PRESET_COLORS.length; i += 1) {
      if (PRESET_COLORS[i].id === colorId) return PRESET_COLORS[i]
    }
  }
  return FALLBACK
}

/** 判断是否为合法的预设颜色 id。 */
export function isValidColorId(colorId: unknown): boolean {
  if (typeof colorId !== 'string') return false
  for (let i = 0; i < PRESET_COLORS.length; i += 1) {
    if (PRESET_COLORS[i].id === colorId) return true
  }
  return false
}
