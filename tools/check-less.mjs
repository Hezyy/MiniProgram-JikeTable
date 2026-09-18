/**
 * Less 语法与引用完整性检查。
 *
 * 微信开发者工具用内置的 Less 编译插件处理 .less，本地无法直接验证；
 * 本脚本用官方 less 编译器逐个编译 miniprogram 下的每个 .less 文件，
 * 至少保证语法、变量、混入与 @import 路径正确。
 *
 * 用法：node tools/check-less.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import less from 'less'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'miniprogram')

function walk(dir) {
  const result = []
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) result.push(...walk(full))
    else result.push(full)
  }
  return result
}

const files = walk(SRC).filter((file) => file.endsWith('.less'))
let failed = 0
let totalBytes = 0

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  try {
    const output = await less.render(source, { filename: file, paths: [SRC] })
    totalBytes += output.css.length
  } catch (error) {
    failed += 1
    const where = error.filename ? relative(ROOT, error.filename) : relative(ROOT, file)
    console.error(`✖ ${where}:${error.line || 0} ${error.message}`)
  }
}

console.log(`已编译 ${files.length} 个 Less 文件，输出 ${(totalBytes / 1024).toFixed(1)} KB，失败 ${failed} 个`)

if (failed > 0) process.exit(1)
