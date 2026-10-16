# 不用 UI 自动化，怎么测小程序

**这一篇可能是本仓库最有用的东西。**

因为[第 1 条坑](05-gotchas.md#1-模拟器里的点击cdp-注入事件不可靠-)堵死了 UI 自动化，
你总得有条别的路。我的方案是：**把 `wx` 换成桩，直接加载页面自己的 JS 做断言。**

它比 UI 自动化好在：

| | UI 自动化 | 跑页面代码 |
|---|---|---|
| 稳定性 | ❌ 时灵时不灵 | ✅ 确定性的 |
| 速度 | 每次几秒～几十秒 | **几十毫秒** |
| 能不能进 CI | 难（要开 IDE、要图形界面） | ✅ **能** |
| 能断言什么 | 只能看"点下去有没有变化" | **能精确断言数据结构、调用参数** |
| 拿不到什么 | — | 真实渲染、真实 API 行为、样式 |

---

## 核心思路

小程序的页面文件（`pages/xxx/xxx.js`）本质上就是**一个普通的 CommonJS 模块**，
它调用全局的 `Page({...})` 把配置注册出去。

所以：**提供自己的 `Page`、`wx`、`getApp`，然后 `require` 那个文件**，
就能拿到页面的所有方法，直接调用、直接断言。

```js
// 1. 先铺好全局桩
let pageOptions = null
global.Page = (opts) => { pageOptions = opts }
global.getApp = () => ({ globalData: {} })
global.wx = {
  showToast: (o) => calls.push({ api: 'showToast', title: o.title }),
  showModal: (o) => calls.push({ api: 'showModal', content: o.content }),
  navigateTo: (o) => calls.push({ api: 'navigateTo', url: o.url }),
  // ...按需
}

// 2. 加载真实页面代码
require('./miniprogram/pages/login/login.js')

// 3. pageOptions 就是 Page({...}) 里那个对象
```

---

## 完整例子

假设页面长这样：

```js
// miniprogram/pages/login/login.js
const api = require('../../utils/api.js')

Page({
  data: { name: '', password: '', err: '' },

  onSubmit() {
    if (!this.data.name) return this.setData({ err: '请填姓名' })
    api.login(this.data.name, this.data.password)
      .then(() => wx.reLaunch({ url: '/pages/index/index' }))
      .catch((e) => {
        this.setData({ password: '', err: e.message })
        wx.showModal({ title: '登录失败', content: e.message, showCancel: false })
      })
  }
})
```

测试：

```js
// tools/login.test.js
const path = require('path')
const Module = require('module')

let PASS = 0, FAIL = 0
function check(label, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { PASS++; console.log('  ✓ ' + label) }
  else { FAIL++; console.log('  ✗ ' + label + ' 期望 ' + JSON.stringify(want) + '，实际 ' + JSON.stringify(got)) }
}

// ---------- 桩 ----------
let calls = []
let loginResult = null

global.wx = {
  showToast: (o) => calls.push({ api: 'showToast', title: o.title }),
  showModal: (o) => calls.push({ api: 'showModal', title: o.title, content: o.content }),
  reLaunch: (o) => calls.push({ api: 'reLaunch', url: o.url })
}
global.getApp = () => ({ globalData: { apiBase: 'http://127.0.0.1:8787' } })

let pageOptions = null
global.Page = (opts) => { pageOptions = opts }

// ---------- 把 utils/api.js 换成桩 ----------
// 关键：页面 require 的那个模块要能替换，不然会真的发网络请求
const fakeApi = {
  login: () => loginResult.ok
    ? Promise.resolve(loginResult.data)
    : Promise.reject(Object.assign(new Error(loginResult.err.message), { code: loginResult.err.code }))
}

const origLoad = Module._load
Module._load = function (request) {
  if (request.indexOf('utils/api.js') >= 0) return fakeApi
  return origLoad.apply(this, arguments)
}

require(path.join(__dirname, '..', 'miniprogram', 'pages', 'login', 'login.js'))

// ---------- 造一个够用的页面实例 ----------
function makePage() {
  const page = Object.assign({}, pageOptions)
  page.data = JSON.parse(JSON.stringify(pageOptions.data))
  page.setData = function (patch) {
    // ★ 必须支持路径写法！见下方「容易踩的坑」
    Object.keys(patch).forEach((k) => {
      if (k.indexOf('.') < 0 && k.indexOf('[') < 0) { page.data[k] = patch[k]; return }
      const parts = k.replace(/\[(\d+)\]/g, '.$1').split('.')
      let o = page.data
      for (let i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] === undefined) o[parts[i]] = {}
        o = o[parts[i]]
      }
      o[parts[parts.length - 1]] = patch[k]
    })
  }
  return page
}

// ---------- 开始测 ----------
async function main() {
  // 用例 1：空姓名，应该本地拦下，不发请求
  calls = []
  let page = makePage()
  page.onSubmit()
  await new Promise(r => setTimeout(r, 20))
  check('提示要填姓名', page.data.err, '请填姓名')
  check('没弹窗', calls.filter(c => c.api === 'showModal').length, 0)

  // 用例 2：密码错，应该弹窗 + 清空密码框
  calls = []
  loginResult = { ok: false, err: { code: 'bad_password', message: '密码不对（还能试 4 次）' } }
  page = makePage()
  page.setData({ name: '张三', password: 'wrong' })
  page.onSubmit()
  await new Promise(r => setTimeout(r, 20))

  const modal = calls.filter(c => c.api === 'showModal')[0]
  check('弹了窗', !!modal, true)
  check('内容带剩余次数', modal.content, '密码不对（还能试 4 次）')
  check('清空密码框', page.data.password, '')

  // 用例 3：成功，应该跳首页
  calls = []
  loginResult = { ok: true, data: { name: '张三', token: 'tk' } }
  page = makePage()
  page.setData({ name: '张三', password: 'right' })
  page.onSubmit()
  await new Promise(r => setTimeout(r, 20))
  check('跳首页', calls.filter(c => c.api === 'reLaunch')[0].url, '/pages/index/index')

  console.log(FAIL ? `失败 ${FAIL} 项，通过 ${PASS} 项` : `全部通过（${PASS} 项）`)
  process.exit(FAIL ? 1 : 0)
}

main()
```

跑起来是这样：

```
  ✓ 提示要填姓名
  ✓ 没弹窗
  ✓ 弹了窗
  ✓ 内容带剩余次数
  ✓ 清空密码框
  ✓ 跳首页
全部通过（6 项）
```

**几十毫秒，而且不需要打开开发者工具。**

---

## 几个容易踩的坑

### ① `setData` 的路径写法必须支持

页面里常这么写：

```js
this.setData({ 'form.party': '某某公司' })   // 注意：这是"路径"，不是普通键名
this.setData({ ['items[' + i + '].qty']: '3' })
```

**桩要是做浅赋值，`page.data.form.party` 根本不会变**，你会得到一个"假通过"
（断言 `page.data['form.party']` 竟然是对的，因为它真被当成一个键挂上去了）。

**这是我实际踩过的**：加了个人面板功能，测试报"发出去的姓名是 null"，
查了半天才发现是桩的问题，不是页面的问题。

### ② 替换页面的依赖模块

页面 `require` 的东西（API 层、工具函数）要能换成桩。
上面的例子用 `Module._load` 拦截是最省事的办法。

**不替换会怎样**：页面真的去调 `wx.request`，而你的 `wx` 桩没有这个函数 → 报错；
或者你以为在测逻辑，其实在测网络。

### ③ 异步要等

`onSubmit()` 里是 Promise 链，调用完**不会同步完成**。
`await new Promise(r => setTimeout(r, 20))` 是最土但最好用的等待。

**更稳的做法**：让页面方法把 Promise 返回出来，或者断言"调用次数"而不是"最终状态"。

### ④ 事件对象要自己造

页面里 `e.currentTarget.dataset.xxx` 这种写法很常见，测试时得照着造：

```js
page.onPick({ currentTarget: { dataset: { name: '张三', role: 'admin' } } })
page.onInput({ detail: { value: '新内容' } })
```

**别偷懒只传 `{}`** —— 会 `TypeError: Cannot read property 'dataset' of undefined`。

### ⑤ 弹窗回调默认不会触发

`wx.showModal` 的 `success` 是用户点了才调。桩默认不调（这样才能断言"先弹了确认框"）。

要测"用户点了确定之后"的流程，加个开关：

```js
global.__autoConfirm = false
global.wx.showModal = (o) => {
  calls.push({ api: 'showModal', title: o.title })
  if (global.__autoConfirm && o.success) o.success({ confirm: true })
}
```

### ⑥ 一个测试文件里测多个页面

`require` 有缓存，第二个页面拿到的是上一个的。清掉：

```js
delete require.cache[require.resolve(pagePath)]
```

---

## 这套方案测不了什么

**诚实地划清楚边界**：

| 测不了 | 为什么 | 怎么办 |
|---|---|---|
| 真实渲染、样式 | 没有渲染引擎 | 看截图 / 真机 |
| `wx.*` 的真实行为 | 都是桩 | **真机验证** |
| 照片压缩、文件系统 | 同上 | 真机 |
| `wx.shareFileMessage` | 同上 | **真机，而且必须真机** |
| 页面跳转是否真的跳了 | 只断言了 `navigateTo` 被调用 | 结合实际点一次 |

**所以正确的组合是**：

```
逻辑（能占 80%）→ 跑页面代码，快、稳、进 CI
渲染 + 真实 API  → 手工在模拟器/真机点一遍
```

**别指望任何单一方案覆盖全部。** 我在真实项目里就是这么分工的。

---

## 一个额外的提醒：别在模块顶层包装 `sys.stdout`

这条是 Python 的，但坑是同一类，顺手记在这。

很多命令行工具为了在 Windows 上正确输出中文，会在文件顶部写：

```python
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
```

**平时没事。但一旦这个文件被别的脚本 `import`**：

1. 它会把**调用方的 stdout 也换掉**
2. 第二次包装会让**前一个 wrapper 的 buffer 被关闭**
3. 于是调用方下一次 `print` 直接 `I/O operation on closed file`

**修法**：把包装放进 `main()`，只在真正作为脚本运行时才做。

**同类的坑**：任何"模块级有副作用"的写法，在被 `import` 时都会咬你一口。
