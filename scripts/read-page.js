#!/usr/bin/env node
/**
 * 在指定的 target 里读页面内容 —— 这是最常用、也最可靠的一个。
 *
 * 用法:
 *   node scripts/read-page.js                       # 读当前所有模拟器页面的可见文本
 *   node scripts/read-page.js detail                # 只看 URL 含 "detail" 的页面
 *   node scripts/read-page.js --full                # 连输入框的值也带上
 *
 * 为什么不用截图 + OCR：慢、还可能识别错。直接读 DOM 的 innerText 又快又准，
 * 而且能拿到截图里看不出来的东西（比如 input 的实际值、元素的 class）。
 */
const cdp = require('./lib/cdp')

const READ = `(() => {
  const norm = s => (s || '').replace(/\\s+/g, ' ').trim()
  const inputs = [...document.querySelectorAll('input, textarea')].map(e => ({
    tag: e.tagName.toLowerCase(),
    type: e.getAttribute('type') || 'text',
    value: e.value || '',
    placeholder: e.placeholder || ''
  }))
  return JSON.stringify({
    text: norm(document.body ? document.body.innerText : ''),
    inputs,
    title: document.title || ''
  })
})()`

async function main() {
  const args = process.argv.slice(2)
  const full = args.includes('--full')
  const filter = args.find((a) => !a.startsWith('--')) || ''

  const targets = await cdp.listTargets()
  let pages = targets.filter((t) => String(t.url).indexOf('__pageframe__/pages') >= 0)
  if (filter) {
    pages = pages.filter((t) => String(t.url).indexOf(filter) >= 0)
  }
  if (!pages.length) {
    console.error('没有匹配的模拟器页面。当前有：')
    targets.forEach((t) => console.error('  ' + String(t.url).slice(0, 90)))
    return 1
  }

  for (const target of pages) {
    const short = String(target.url).replace(/^https?:\/\/127\.0\.0\.1:\d+/, '')
    console.log('=== ' + short + ' ===')
    const conn = await cdp.connect(target)
    try {
      const r = await conn.send('Runtime.evaluate', {
        expression: READ,
        returnByValue: true
      })
      if (r && r.exceptionDetails) {
        console.log('  求值失败:', JSON.stringify(r.exceptionDetails).slice(0, 200))
        continue
      }
      const data = JSON.parse(r.result.value)
      console.log(data.text)
      if (full && data.inputs.length) {
        console.log('--- 输入框 ---')
        data.inputs.forEach((i, n) => {
          console.log('  [' + n + '] ' + i.tag + '/' + i.type +
            '  value=' + JSON.stringify(i.value) +
            (i.placeholder ? '  placeholder=' + JSON.stringify(i.placeholder) : ''))
        })
      }
    } finally {
      conn.close()
    }
    console.log('')
  }
  return 0
}

main().then((c) => process.exit(c || 0)).catch((e) => {
  console.error(e.message)
  process.exit(1)
})
