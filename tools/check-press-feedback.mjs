/**
 * 按压反馈覆盖检查。
 *
 * 产品要求：所有可点击元素在按下时必须有可视化反馈（hover-class），且不得使用触觉（震动）反馈。
 * 由于 WXML 没有默认 hover-class，只能靠约定保证，因此用脚本守住这条规则。
 *
 * 检查项：
 *  1. 所有带 bindtap / catchtap / bindlongpress 的原生元素必须声明 hover-class；
 *  2. <picker> 本身不支持 hover-class，其内部第一个元素必须声明 hover-class；
 *  3. 源码中不得出现 wx.vibrateShort / wx.vibrateLong 等触觉调用；
 *  4. 自定义组件的按压态在其自身模板中检查，页面只需绑定事件即可。
 *
 * 用法：node tools/check-press-feedback.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'miniprogram')

const TAP_ATTRS = ['bindtap=', 'catchtap=', 'bindlongpress=']

/**
 * 允许没有按下态的原生元素：
 * - `sheet__mask` / `sheet__panel`：「点击空白关闭」的容器以及用于吞掉冒泡的面板，
 *   它们本身不是操作目标，按下时不应变形。
 */
const EXEMPT_CLASSES = ['sheet__mask', 'sheet__panel']

/**
 * 原生标签白名单。带连字符但不在此列表中的标签视为自定义组件：
 * 自定义组件把按压态实现在自身模板的根节点上，由该组件自己的 wxml 接受检查。
 */
const NATIVE_TAGS = new Set([
  'view',
  'text',
  'button',
  'input',
  'textarea',
  'image',
  'scroll-view',
  'picker',
  'switch',
  'icon',
  'block',
  'navigator',
  'swiper',
  'swiper-item',
  'form',
  'label',
  'checkbox',
  'radio',
  'slider',
  'progress',
  'canvas',
  'video',
  'audio',
  'map',
  'web-view',
  'rich-text',
  'movable-area',
  'movable-view',
  'cover-view',
  'cover-image',
  'page-meta',
  'navigation-bar',
  'match-media',
  'keyboard-accessory',
  'open-data',
  'official-account',
  'voip-room',
  'ad',
  'ad-custom',
  'functional-page-navigator'
])

function walk(dir) {
  const result = []
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) result.push(...walk(full))
    else result.push(full)
  }
  return result
}

const files = walk(SRC)
const problems = []
let tappableCount = 0

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const where = relative(ROOT, file)

  if (file.endsWith('.ts') || file.endsWith('.wxml')) {
    const vibrate = /wx\.(vibrateShort|vibrateLong)\s*\(/.exec(source)
    if (vibrate) {
      const line = source.slice(0, vibrate.index).split('\n').length
      problems.push(`${where}:${line} 使用了触觉反馈 ${vibrate[0].trim()}`)
    }
  }

  if (!file.endsWith('.wxml')) continue

  const tagPattern = /<([a-zA-Z][-a-zA-Z0-9]*)((?:"[^"]*"|[^>])*?)\/?>/g
  let match = tagPattern.exec(source)
  while (match) {
    const tag = match[1]
    const attrs = match[2]
    const line = source.slice(0, match.index).split('\n').length

    if (tag === 'picker') {
      const rest = source.slice(match.index + match[0].length, match.index + match[0].length + 500)
      if (!/hover-class=/.test(rest)) {
        problems.push(`${where}:${line} <picker> 的直接子元素没有 hover-class`)
      }
    } else if (TAP_ATTRS.some((attr) => attrs.indexOf(attr) >= 0) && NATIVE_TAGS.has(tag)) {
      const className = (attrs.match(/class="([^"]*)"/) || [])[1] || ''
      const exempt = EXEMPT_CLASSES.some((name) => className.indexOf(name) >= 0)
      if (exempt) {
        match = tagPattern.exec(source)
        continue
      }
      tappableCount += 1
      if (!/hover-class=/.test(attrs)) {
        const label = className || tag
        problems.push(`${where}:${line} <${tag} class="${label}"> 缺少 hover-class`)
      }
    }

    match = tagPattern.exec(source)
  }
}

console.log(`已检查 ${files.length} 个源码文件，可点击元素 ${tappableCount} 个`)
if (problems.length > 0) {
  console.error(`发现 ${problems.length} 处问题：`)
  for (const item of problems) console.error(`  ✖ ${item}`)
  process.exit(1)
}
console.log('所有可点击元素均有按压反馈，且未使用触觉反馈。')
