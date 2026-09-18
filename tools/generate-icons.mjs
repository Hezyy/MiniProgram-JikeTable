/**
 * 图标资源生成脚本（无第三方依赖）。
 *
 * 生成内容：
 *  1. miniprogram/assets/icons/*.png —— tabBar 所需的本地 PNG 图标（81x81，含抗锯齿）；
 *  2. miniprogram/styles/icons.less —— 公共图标类的 data URI（统一风格、无远程依赖）。
 *
 * 用法：node tools/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PNG_DIR = resolve(ROOT, 'miniprogram/assets/icons')
const LESS_FILE = resolve(ROOT, 'miniprogram/styles/icons.less')

const SIZE = 81
const CENTER = SIZE / 2

// ---------------------------------------------------------------- 距离场基元

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}

function sdRing(px, py, cx, cy, radius, halfWidth) {
  return Math.abs(Math.hypot(px - cx, py - cy) - radius) - halfWidth
}

function sdSegment(px, py, ax, ay, bx, by, halfWidth) {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const len2 = vx * vx + vy * vy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2))
  return Math.hypot(wx - t * vx, wy - t * vy) - halfWidth
}

function union(shapes) {
  return (px, py) => {
    let best = Infinity
    for (const shape of shapes) best = Math.min(best, shape(px, py))
    return best
  }
}

// ---------------------------------------------------------------- PNG 编码

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(raw) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function renderShape(shape, hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const stride = SIZE * 4 + 1
  const raw = Buffer.alloc(stride * SIZE)
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * stride] = 0
    for (let x = 0; x < SIZE; x += 1) {
      const distance = shape(x + 0.5, y + 0.5)
      const coverage = Math.max(0, Math.min(1, 0.5 - distance))
      const offset = y * stride + 1 + x * 4
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      raw[offset + 3] = Math.round(coverage * 255)
    }
  }
  return encodePng(raw)
}

// ---------------------------------------------------------------- tabBar 图标

const rect = (cx, cy, hw, hh, radius) => (px, py) => sdRoundRect(px, py, cx, cy, hw, hh, radius)
const outline = (cx, cy, hw, hh, radius, halfWidth) => (px, py) =>
  Math.abs(sdRoundRect(px, py, cx, cy, hw, hh, radius)) - halfWidth
const ring = (cx, cy, radius, halfWidth) => (px, py) => sdRing(px, py, cx, cy, radius, halfWidth)
const line = (ax, ay, bx, by, halfWidth) => (px, py) => sdSegment(px, py, ax, ay, bx, by, halfWidth)

function calendarIcon() {
  return union([
    outline(CENTER, 45, 27.5, 23, 8, 3.2),
    line(28, 14, 28, 22, 3.2),
    line(53, 14, 53, 22, 3.2),
    line(26, 40, 55, 40, 2.6),
    line(26, 51, 46, 51, 2.6)
  ])
}

function timetableIcon() {
  return union([
    outline(CENTER, CENTER, 26, 22, 7, 3.2),
    line(CENTER, 18.5, CENTER, 62.5, 2.4),
    line(14.5, CENTER, 66.5, CENTER, 2.4)
  ])
}

function scheduleIcon() {
  const shapes = []
  for (const y of [24, 40.5, 57]) {
    shapes.push(rect(22, y, 7.5, 7.5, 3.2))
    shapes.push(line(37, y, 66, y, 2.9))
  }
  return union(shapes)
}

function settingsIcon() {
  const shapes = [ring(CENTER, CENTER, 14.2, 3.5)]
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    shapes.push(line(CENTER + 15 * cos, CENTER + 15 * sin, CENTER + 23.5 * cos, CENTER + 23.5 * sin, 3.7))
  }
  return union(shapes)
}

const TAB_ICONS = [
  { name: 'tab-today', shape: calendarIcon() },
  { name: 'tab-timetable', shape: timetableIcon() },
  { name: 'tab-schedule', shape: scheduleIcon() },
  { name: 'tab-settings', shape: settingsIcon() }
]

const TAB_COLORS = { normal: '#657087', active: '#2675EC' }

// ---------------------------------------------------------------- 界面图标

const SVG_ICONS = {
  'chevron-left': '<path d="M15 5 8 12l7 7"/>',
  'chevron-right': '<path d="M9 5l7 7-7 7"/>',
  'chevron-down': '<path d="M5 9l7 7 7-7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 13l5 5L19 7"/>',
  edit: '<path d="M4 20l.5-3.5L15.5 5.5l3 3L7.5 19.5z"/><path d="M13.5 7.5l3 3"/>',
  trash:
    '<path d="M4.5 7h15"/><path d="M9.5 7V4.6h5V7"/><path d="M6.8 7l.9 12.4h8.6L17.2 7"/><path d="M10.4 10.8v5.6M13.6 10.8v5.6"/>',
  calendar:
    '<rect x="3.6" y="5.4" width="16.8" height="15" rx="3"/><path d="M3.6 10h16.8"/><path d="M8.2 3.2v4M15.8 3.2v4"/>',
  clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.2V12l3.2 2"/>',
  location:
    '<path d="M12 21.2s7-5.9 7-11.2a7 7 0 1 0-14 0c0 5.3 7 11.2 7 11.2z"/><circle cx="12" cy="10" r="2.6"/>',
  download: '<path d="M12 3.8v11.4"/><path d="M7.5 10.7 12 15.2l4.5-4.5"/><path d="M4.8 19.6h14.4"/>',
  upload: '<path d="M12 15.6V4.2"/><path d="M7.5 8.7 12 4.2l4.5 4.5"/><path d="M4.8 19.6h14.4"/>',
  refresh: '<path d="M19.6 12a7.6 7.6 0 1 1-2.3-5.4"/><path d="M19.6 4.4V9h-4.6"/>',
  info:
    '<circle cx="12" cy="12" r="8.8"/><path d="M12 11v5.6"/><circle cx="12" cy="7.8" r="1.15" fill="COLOR" stroke="none"/>',
  warning:
    '<path d="M12 3.9 20.8 19.5H3.2z"/><path d="M12 10v4.3"/><circle cx="12" cy="17.1" r="1.15" fill="COLOR" stroke="none"/>',
  list:
    '<path d="M8.4 6.4h11.2M8.4 12h11.2M8.4 17.6h11.2"/><circle cx="4.6" cy="6.4" r="1.35" fill="COLOR" stroke="none"/><circle cx="4.6" cy="12" r="1.35" fill="COLOR" stroke="none"/><circle cx="4.6" cy="17.6" r="1.35" fill="COLOR" stroke="none"/>',
  grid:
    '<rect x="3.8" y="3.8" width="7.2" height="7.2" rx="2.2"/><rect x="13" y="3.8" width="7.2" height="7.2" rx="2.2"/><rect x="3.8" y="13" width="7.2" height="7.2" rx="2.2"/><rect x="13" y="13" width="7.2" height="7.2" rx="2.2"/>'
}

const TONES = {
  default: '#657087',
  strong: '#172033',
  primary: '#2675EC',
  success: '#1F9D68',
  warning: '#D9822B',
  danger: '#D9485F',
  inverse: '#FFFFFF'
}

function buildSvg(inner, color) {
  const body = inner.split('COLOR').join(color)
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' +
    color +
    '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    body +
    '</svg>'
  )
}

// ---------------------------------------------------------------- 输出

mkdirSync(PNG_DIR, { recursive: true })

const written = []
for (const icon of TAB_ICONS) {
  for (const [state, color] of Object.entries(TAB_COLORS)) {
    const suffix = state === 'active' ? '-active' : ''
    const file = resolve(PNG_DIR, `${icon.name}${suffix}.png`)
    writeFileSync(file, renderShape(icon.shape, color))
    written.push(`${icon.name}${suffix}.png`)
  }
}

const lines = [
  '// 本文件由 tools/generate-icons.mjs 自动生成，请勿手工修改。',
  '// 图标为内联 SVG data URI，风格统一且不依赖远程资源。',
  '',
  '.jk-icon {',
  '  display: inline-block;',
  '  flex: none;',
  '  background-repeat: no-repeat;',
  '  background-position: center;',
  '  background-size: 100% 100%;',
  '  vertical-align: middle;',
  '}',
  ''
]

for (const [name, inner] of Object.entries(SVG_ICONS)) {
  for (const [tone, color] of Object.entries(TONES)) {
    const encoded = Buffer.from(buildSvg(inner, color), 'utf8').toString('base64')
    lines.push(`.jk-i-${name}.jk-t-${tone} {`)
    lines.push(`  background-image: url("data:image/svg+xml;base64,${encoded}");`)
    lines.push('}')
  }
}

writeFileSync(LESS_FILE, `${lines.join('\n')}\n`, 'utf8')

console.log(`已生成 ${written.length} 个 tabBar 图标 -> miniprogram/assets/icons/`)
console.log(
  `已生成 ${Object.keys(SVG_ICONS).length * Object.keys(TONES).length} 条图标样式 -> miniprogram/styles/icons.less`
)
