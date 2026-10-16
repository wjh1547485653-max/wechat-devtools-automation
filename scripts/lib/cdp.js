/**
 * 用 CDP (Chrome DevTools Protocol) 连上微信开发者工具。
 *
 * 开发者工具是 Electron 应用，开了 `--remote-debugging-port` 之后就能用标准的
 * Chrome 调试协议操作它。这个小库把连接、发消息、找 target 这几件事封起来。
 *
 * 为什么不用现成的 puppeteer：这里只是要往一个已经跑着的 Electron 里发几条
 * CDP 消息，用 Node 内置的 WebSocket 就够，不引依赖。
 */
const PORT = process.env.WXDT_DEBUG_PORT || '9222'
const BASE = 'http://127.0.0.1:' + PORT

/** 列出当前所有可调试的 target */
async function listTargets() {
  let res
  try {
    res = await fetch(BASE + '/json/list')
  } catch (e) {
    throw new Error(
      '连不上开发者工具的调试端口 ' + PORT + '。\n' +
      '  · 确认工具正在运行\n' +
      '  · 确认启动时带了 --remote-debugging-port=' + PORT + '\n' +
      '  · 或者改环境变量 WXDT_DEBUG_PORT'
    )
  }
  return res.json()
}

/** 按 URL 子串找 target，找不到时把可选项列出来，省得猜 */
function findTarget(targets, urlPart) {
  const t = targets.find((x) => String(x.url).indexOf(urlPart) >= 0)
  if (!t) {
    const avail = targets
      .map((x) => '  [' + x.type + '] ' + String(x.url).slice(0, 90))
      .join('\n')
    throw new Error('没有 URL 含 "' + urlPart + '" 的 target。当前有：\n' + avail)
  }
  return t
}

/**
 * 连上某个 target，返回一个 send(method, params) 函数和关闭方法。
 *
 * CDP 的应答是异步的，用 id 配对；这里用一个 pending Map 把 Promise 挂上去。
 */
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()

  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result)
      pending.delete(m.id)
    }
  }
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error('WebSocket 连接失败'))
  })

  return {
    send(method, params) {
      return new Promise((resolve) => {
        const i = ++id
        pending.set(i, resolve)
        ws.send(JSON.stringify({ id: i, method, params }))
      })
    },
    close() {
      ws.close()
    }
  }
}

/**
 * 在匹配的 target 里执行一段 JS，返回值带回来。
 *
 * `awaitPromise: true` 是为了能跑 async 表达式（比如等个 setTimeout）。
 */
async function evaluate(urlPart, expression) {
  const targets = await listTargets()
  const target = findTarget(targets, urlPart)
  const conn = await connect(target)
  try {
    const r = await conn.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    })
    if (r && r.exceptionDetails) {
      const d = r.exceptionDetails
      throw new Error(
        '被求值的表达式抛错了: ' + (d.text || '') + ' ' +
        ((d.exception && d.exception.description) || '')
      )
    }
    return r && r.result ? r.result.value : r
  } finally {
    conn.close()
  }
}

/** 把结果打出来（字符串原样，其它 JSON 化） */
function print(value) {
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

module.exports = { BASE, PORT, listTargets, findTarget, connect, evaluate, print }
