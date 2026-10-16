# CDP 操作手册

开发者工具是 Electron 应用。带上 `--remote-debugging-port=9222` 启动后，
就能用标准的 Chrome DevTools Protocol 操作它——**跟调试一个 Chrome 页面是一回事**。

## 三类 target，各管什么

这是最需要先搞清楚的一件事。跑一下 `node scripts/list-targets.js` 会看到：

```
[webview]  /__pageframe__/pages/index/index
[webview]  /__pageframe__/pages/detail/detail
[webview]  /appservice/s0/<sessionId>/simulator-app-session-s0/mainframe
[page]     file:///.../electron-project.html
[worker]   /appservice/__WORKER__/worker.js
```

| target URL 含 | 是什么 | 能干什么 | 不能干什么 |
|---|---|---|---|
| `__pageframe__/pages/...` | 页面**渲染层**（每个页面一个 target） | 读 DOM、读 input 值、`Page.captureScreenshot` | **拿不到 `wx`** |
| `appservice/.../mainframe` | 小程序**逻辑层** | 可能拿到 `wx`、`__wxConfig` 等 | 没有页面 DOM |
| `electron-project.html` | 工具**本体界面** | 点编译按钮、读编辑器内容、截图 | 不能读小程序页面 |
| `devtools://` / `chrome-extension://` | 工具内部的调试器面板 | 一般不用管 | — |

**同理，`instanceframe.html` 是个空壳容器**，页面不在它里面，别去那儿找。

## 基本操作

```javascript
// 列出所有 target（HTTP 接口，不用 WebSocket）
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()

// 连上某一个
const ws = new WebSocket(target.webSocketDebuggerUrl)

// CDP 的应答是异步的，靠 id 配对
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
                         params: { expression: '1+1', returnByValue: true } }))
```

`scripts/lib/cdp.js` 把这些封好了：

```js
const cdp = require('./scripts/lib/cdp')
const value = await cdp.evaluate('__pageframe__/pages/index', 'document.title')
```

## 常用命令

### Runtime.evaluate —— 万能

```js
{ method: 'Runtime.evaluate',
  params: {
    expression: '...',
    returnByValue: true,    // 把结果序列化带回来（不然拿到的是对象引用 id）
    awaitPromise: true      // 表达式里有 await 时必须要
  } }
```

**报错怎么读**：返回值里的 `exceptionDetails` 才是页面内的异常，
`result.value` 是正常返回。`scripts/eval.js` 会把异常单独打出来。

### Page.captureScreenshot

```js
{ method: 'Page.captureScreenshot', params: { format: 'png' } }
// 返回 base64，自己存文件
```

**比系统截图好**：不需要窗口在前台、不怕被挡、不受多屏/DPI 影响。

### Input.dispatchMouseEvent / Input.dispatchTouchEvent

派发点击、移动、滚动。

**⚠️ 只对工具自己的界面可靠。** 点在模拟器的小程序页面上会**时灵时不灵**——
原因和证据见 [`05-gotchas.md` 第 1 条](05-gotchas.md#1-模拟器里的点击cdp-注入事件不可靠-)。

### Runtime.consoleAPICalled / Runtime.exceptionThrown

**这两个是事件推送**，不是请求，所以要：

1. 先发 `Runtime.enable`
2. 在 `ws.onmessage` 里监听，而不是等 `send()` 的应答

`scripts/console.js` 是现成的例子。

### Log.enable + Log.entryAdded

抓浏览器级别的日志（网络失败、安全策略拦截这类），比 console 更底层。

## 一个排查套路

**脚本突然没反应时，按这个顺序查**：

```bash
# 1. 端口还通吗
curl http://127.0.0.1:9222/json/version

# 2. target 列表变了吗（页面栈变了？工具重启了？）
node scripts/list-targets.js

# 3. 换一个最简单的表达式，看通道本身通不通
node scripts/eval.js __pageframe__/pages/index "1+1"

# 4. 还是不行 → 重启工具（见 05-gotchas.md 第 6 条）
```

## 关于端口

`--remote-debugging-port` **必须在启动时给**，跑起来之后开不了。

`scripts/launch.js` 处理了这事。端口可以用 `WXDT_DEBUG_PORT` 环境变量改。

## Node 版本要求

Node 18+，因为用到了内置的 `fetch` 和 `WebSocket`（不需要 `ws` 包）。

**这也是本仓库零依赖的原因**——不需要 `npm install`，clone 下来就能跑。
