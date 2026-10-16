#!/usr/bin/env node
/**
 * 触发一次编译（等价于点工具栏上那个刷新图标）。
 *
 * 用法:
 *   node scripts/compile.js              # 编译，然后等 20 秒
 *   node scripts/compile.js --wait 30000
 *
 * 为什么需要主动编译：你改了磁盘上的代码之后，模拟器里的还是旧的。
 * 工具不会自动重载（除非开了热重载，而热重载对新增页面/改 app.json 无效），
 * 所以要显式触发。
 *
 * 编译按钮的选择器在不同版本里可能变。这个脚本会依次试几个已知的类名，
 * 都找不到就把工具栏上可点的元素列出来，方便你照着改。
 */
const cdp = require('./lib/cdp')

// 按可靠性排序。工具的图标按钮类名换过几轮，多试几个
const CANDIDATES = [
  '.ui-icon-refresh.simulator-actionbar-icon-item',
  '.ui-icon-refresh',
  '[class*="simulator-actionbar"] [class*="refresh"]'
]

function probeExpr() {
  return `(() => {
    const sels = ${JSON.stringify(CANDIDATES)};
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return JSON.stringify({
          ok: true, sel: s,
          x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2)
        });
      }
    }
    const items = [...document.querySelectorAll('.simulator-actionbar-icon-item, .simulator-toolbar-item')]
      .map(e => String(e.className).replace(/\\s+/g, ' ').trim() + ' :: ' +
                (e.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 20));
    return JSON.stringify({ ok: false, available: items });
  })()`
}

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}

async function main() {
  const wait = parseInt(arg('wait', '20000'), 10)

  const targets = await cdp.listTargets()
  const target = cdp.findTarget(targets, 'electron-project')
  const conn = await cdp.connect(target)
  try {
    const r = await conn.send('Runtime.evaluate', {
      expression: probeExpr(),
      returnByValue: true
    })
    const info = JSON.parse(r.result.value)
    if (!info.ok) {
      console.error('没找到编译按钮。工具栏上现在有这些元素：')
      ;(info.available || []).forEach((a) => console.error('  ' + a))
      console.error('\n把正确的那条加进 CANDIDATES 数组，或者用：')
      console.error('  node scripts/click.js "<选择器>"')
      return 1
    }

    console.log('编译按钮:', info.sel)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await conn.send('Input.dispatchMouseEvent', {
        type, x: info.x, y: info.y,
        button: type === 'mouseMoved' ? 'none' : 'left',
        buttons: type === 'mousePressed' ? 1 : 0,
        clickCount: 1
      })
      await new Promise((rr) => setTimeout(rr, 100))
    }
    console.log('已触发编译，等 ' + wait + 'ms…')
  } finally {
    conn.close()
  }

  await new Promise((rr) => setTimeout(rr, wait))
  console.log('编译等待结束。用 node scripts/list-targets.js 看看页面栈变没变。')
  return 0
}

main().then((c) => process.exit(c || 0)).catch((e) => {
  console.error(e.message)
  process.exit(1)
})
