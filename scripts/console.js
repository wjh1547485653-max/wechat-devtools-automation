#!/usr/bin/env node
/**
 * 抓某个 target 的 console 输出和未捕获异常。
 *
 * 用法:
 *   node scripts/console.js <url子串> [等待毫秒]
 *   node scripts/console.js __pageframe__/pages/index 5000
 *   node scripts/console.js appservice 8000
 *
 * 排查"页面白屏 / 点了没反应"的时候很有用——小程序里的报错不一定显示在
 * 工具界面上，但会从 console 出来。
 *
 * 注意：只抓**连接之后**产生的日志。想抓打开页面时的报错，先连上再在模拟器里
 * 手动触发一次（比如点一下重新编译）。
 */
const cdp = require('./lib/cdp')

async function main() {
  const urlPart = process.argv[2]
  if (!urlPart) {
    console.error('用法: node scripts/console.js <url子串> [等待毫秒]')
    return 1
  }
  const waitMs = parseInt(process.argv[3] || '5000', 10)

  const targets = await cdp.listTargets()
  const target = cdp.findTarget(targets, urlPart)
  const conn = await cdp.connect(target)

  const logs = []
  // 监听要靠 CDP 的事件推送，所以这里不能只用 send，还得自己挂 onmessage
  const raw = target.webSocketDebuggerUrl
  // 复用 connect 建立的那条连接做不到（它没暴露 onmessage 钩子），
  // 于是这里直接用原生 WebSocket 再来一条专门收事件的。
  conn.close()

  const ws = new WebSocket(raw)
  let id = 0
  const pending = new Map()
  const send = (method, params) =>
    new Promise((res) => {
      const i = ++id
      pending.set(i, res)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result)
      pending.delete(m.id)
      return
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const args = (m.params.args || [])
        .map((a) => (a.value !== undefined ? a.value : a.description || a.type))
        .join(' ')
      logs.push('[' + m.params.type + '] ' + args)
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {}
      logs.push('[异常] ' + (d.text || '') + ' ' +
        ((d.exception && d.exception.description) || ''))
    }
    if (m.method === 'Log.entryAdded') {
      const en = m.params.entry || {}
      logs.push('[' + en.level + '] ' + (en.text || ''))
    }
  }
  await new Promise((r) => {
    ws.onopen = r
  })
  await send('Runtime.enable', {})
  await send('Log.enable', {})

  console.log('监听中… (' + waitMs + 'ms)')
  await new Promise((r) => setTimeout(r, waitMs))

  console.log('\n捕获 ' + logs.length + ' 条：')
  logs.forEach((l) => console.log('  ' + l.slice(0, 300)))
  if (!logs.length) {
    console.log('  （空。想抓加载时的报错，先在工具里手动重新编译一次）')
  }
  ws.close()
  return 0
}

main().then((c) => process.exit(c || 0)).catch((e) => {
  console.error(e.message)
  process.exit(1)
})
