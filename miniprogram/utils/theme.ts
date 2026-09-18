import type { ThemePreference } from '../types/models'
import { appStore } from '../store/app-store'
import { logWarn } from './logger'

/**
 * 主题解析与导航栏 / 窗口背景适配。
 * 页面根节点通过 `theme-light` / `theme-dark` 类切换设计令牌。
 */

export type ResolvedTheme = 'light' | 'dark'

interface ThemeColors {
  background: string
  /** 导航栏前景色，微信只接受 #000000 或 #ffffff。 */
  front: '#000000' | '#ffffff'
}

export const THEME_COLORS: Record<ResolvedTheme, ThemeColors> = {
  light: { background: '#F4F7FB', front: '#000000' },
  dark: { background: '#0F1420', front: '#ffffff' }
}

/** 把主题偏好解析为实际主题，`system` 跟随系统。 */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'dark') return 'dark'
  if (preference === 'light') return 'light'
  try {
    const info = wx.getSystemInfoSync()
    return info && info.theme === 'dark' ? 'dark' : 'light'
  } catch (error) {
    logWarn('读取系统主题失败，回退到浅色', error)
    return 'light'
  }
}

/** 应用导航栏与窗口背景色，失败不得影响主流程。 */
export function applyTheme(theme: ResolvedTheme): void {
  const colors = THEME_COLORS[theme]
  try {
    wx.setNavigationBarColor({
      frontColor: colors.front,
      backgroundColor: colors.background
    })
  } catch (error) {
    logWarn('设置导航栏颜色失败', error)
  }
  try {
    wx.setBackgroundColor({
      backgroundColor: colors.background,
      backgroundColorTop: colors.background,
      backgroundColorBottom: colors.background
    })
  } catch (error) {
    logWarn('设置窗口背景色失败', error)
  }
}

/** 主题类名，用于页面根节点。 */
export function themeClass(theme: ResolvedTheme): string {
  return theme === 'dark' ? 'theme-dark' : 'theme-light'
}

/** 能接收 setData 的宿主（页面或组件实例）。 */
export interface SetDataHost {
  setData(data: Record<string, unknown>): void
}

/**
 * 按当前偏好刷新页面主题：更新导航栏 / 窗口背景，并写入页面根节点的主题类。
 * 页面在 onShow 中调用，并在订阅回调中重复调用以响应系统主题变化。
 */
export function refreshPageTheme(host: SetDataHost): ResolvedTheme {
  const theme = resolveTheme(appStore.getData().preferences.theme)
  applyTheme(theme)
  host.setData({ theme: theme, themeClass: themeClass(theme) })
  return theme
}
