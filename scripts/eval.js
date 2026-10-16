#!/usr/bin/env node
/**
 * 在某个 target 里执行一段 JS，把结果打回来。万能兜底工具。
 *
 * 用法:
 *   node scripts/eval.js <url子串> "<js 表达式>"
 *   node scripts/eval.js <url子串> --file 表达式.js
 *
 * 例子:
 *   # 看看模拟器页面里有多少个图片元素
 *   node scripts/eval.js __pageframe__/pages/index \
 *     "document.querySelectorAll('wx-image').length"
 *
 *   # 在小程序逻辑层里查 wx 有没有某个 API
 *   node scripts/eval.js appservice "typeof wx.shareFileMessage"
 *
 *   # 连工具的界面一起操作（比如点编译按钮）
 *   node scripts/eval.js electron-project "document.title"
 *
 * 表达式里可以用 await（内部开了 awaitPromise）。
 */
const fs = require('fs')
const cdp = require('./lib/cdp')

async function main() {
  const urlPart = process.argv[2]
  if (!urlPart) {
    console.error('用法: node scripts/eval.js <url子串> "<表达式>" | --file <文件>')
    console.error('先跑 node scripts/list-targets.js 看看有哪些 target')
    return 1
  }

  let expr
  if (process.argv[3] === '--file') {
    expr = fs.readFileSync(process.argv[4], 'utf8')
  } else {
    expr = process.argv[3]
  }
  if (!expr) {
    console.error('没给表达式')
    return 1
  }

  const value = await cdp.evaluate(urlPart, expr)
  cdp.print(value)
  return 0
}

main().then((c) => process.exit(c || 0)).catch((e) => {
  console.error(e.message)
  process.exit(1)
})
