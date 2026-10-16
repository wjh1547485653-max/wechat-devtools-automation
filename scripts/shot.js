#!/usr/bin/env node
/**
 * 截取模拟器画面（不依赖屏幕坐标，也不怕窗口被挡）。
 *
 * 用法:
 *   node scripts/shot.js                       # 存到 ./shots/
 *   node scripts/shot.js --out shot.png
 *   node scripts/shot.js --target detail       # 只截 URL 含 detail 的页面
 *   node scripts/shot.js --ide                 # 截工具整个界面（含编辑器）
 *
 * 比系统截图好在哪：
 *   · 不需要窗口在前台，被别的窗口盖住也能截
 *   · 不受多屏 / DPI 缩放影响
 *   · 能单独截某一个页面
 */
const fs = require('fs')
const path = require('path')
const cdp = require('./lib/cdp')

function arg(name) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : ''
}

async function main() {
  const wantIde = process.argv.includes('--ide')
  const filter = arg('target')
  const outArg = arg('out')

  const targets = await cdp.listTargets()
  let target
  if (wantIde) {
    target = targets.find((t) => String(t.url).indexOf('electron-project') >= 0)
  } else {
    const pages = targets.filter((t) => String(t.url).indexOf('__pageframe__/pages') >= 0)
    target = filter ? pages.find((t) => String(t.url).indexOf(filter) >= 0) : pages[0]
  }
  if (!target) {
    console.error('没找到要截的 target。当前有：')
    targets.forEach((t) => console.error('  ' + String(t.url).slice(0, 90)))
    return 1
  }

  const conn = await cdp.connect(target)
  try {
    const r = await conn.send('Page.captureScreenshot', { format: 'png' })
    if (!r || !r.data) {
      console.error('截图失败，没拿到数据')
      return 1
    }
    const out = outArg || path.join(
      'shots',
      'shot-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png'
    )
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'))
    const kb = (fs.statSync(out).size / 1024).toFixed(0)
    console.log('已保存:', out, '(' + kb + ' KB)')
    console.log('来源:', String(target.url).replace(/^https?:\/\/127\.0\.0\.1:\d+/, ''))
  } finally {
    conn.close()
  }
  return 0
}

main().then((c) => process.exit(c || 0)).catch((e) => {
  console.error(e.message)
  process.exit(1)
})
