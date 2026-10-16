#!/usr/bin/env node
/**
 * 点击"工具本体界面"上的元素（编译按钮、菜单项这类）。
 *
 * 用法:
 *   node scripts/click.js <css选择器> [序号]
 *   node scripts/click.js .ui-icon-refresh        # 点编译按钮
 *   node scripts/click.js '.dropdown-item' 2      # 点下拉里第 3 项
 *
 * ★ 重要边界：**这个只适合点工具自己的界面，不要指望它点模拟器里的小程序。**
 *
 *   工具界面（Electron 主进程渲染的）用真实的鼠标事件点，可靠。
 *   模拟器里的页面是另一套渲染（同层渲染），同样的事件打上去会**时灵时不灵**——
 *   我实测过：刚重启工具时能点成功，之后再点就没反应，换触摸事件、DOM 事件
 *   都一样。**别在这上面耗时间**，见 docs/05-gotchas.md 第 1 条，
 *   以及 docs/06-testing.md 说的替代做法。
 *
 * 另一个坑：元素在视口外时点击会**静默落空**（不报错，就是没反应）。
 * 所以这里会先 scrollIntoView，再核对坐标确实落在视口内。
 */
const cdp = require('./lib/cdp')

function findExpr(selector, index) {
  return `(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = els[${index}];
    if (!el) return JSON.stringify({ ok: false, count: els.length });
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) {
      return JSON.stringify({ ok: false, reason: '滚不到视口里', rect: [r.top, r.bottom, vh] });
    }
    return JSON.stringify({
      ok: true,
      count: els.length,
      tag: el.tagName,
      cls: String(el.className).slice(0, 50),
      text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2)
    });
  })()`
}

async function main() {
  const selector = process.argv[2]
  const index = parseInt(process.argv[3] || '0', 10)
  if (!selector) {
    console.error('用法: node scripts/click.js <css选择器> [序号]')
    return 1
  }

  const targets = await cdp.listTargets()
  const target = cdp.findTarget(targets, 'electron-project')
  const conn = await cdp.connect(target)
  try {
    const r = await conn.send('Runtime.evaluate', {
      expression: findExpr(selector, index),
      returnByValue: true
    })
    const pos = JSON.parse(r.result.value)
    if (!pos.ok) {
      console.error('没找到可点的元素（匹配到 ' + pos.count + ' 个）' +
        (pos.reason ? '：' + pos.reason : ''))
      return 1
    }
    console.log('目标:', pos.tag, pos.text ? '"' + pos.text + '"' : '', '@', pos.x, pos.y,
      '（共 ' + pos.count + ' 个匹配）')

    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await conn.send('Input.dispatchMouseEvent', {
        type,
        x: pos.x,
        y: pos.y,
        button: type === 'mouseMoved' ? 'none' : 'left',
        buttons: type === 'mousePressed' ? 1 : 0,
        clickCount: 1
      })
      await new Promise((rr) => setTimeout(rr, 100))
    }
    console.log('已点击')
  } finally {
    conn.close()
  }
  return 0
}

main().then((c) => process.exit(c || 0)).catch((e) => {
  console.error(e.message)
  process.exit(1)
})
