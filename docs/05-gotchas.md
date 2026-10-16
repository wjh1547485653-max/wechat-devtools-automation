# 踩坑清单

按"坑有多大"排序。**前三条是重点**——它们决定了你该走哪条路。

---

## 1. 模拟器里的点击/CDP 注入事件不可靠 ★★★

**症状**：往模拟器页面的按钮上派发点击，有时成功、有时毫无反应（不报错）。

**规律**：刚重启工具时**能成功一次**，之后基本就失效了。

**试过并失败的方案**：

```js
// ① 真实鼠标事件
Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 })

// ② 触摸事件（小程序的 tap 本质是 touch，本以为更接近）
Input.dispatchTouchEvent({ type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })

// ③ 直接在 DOM 上派发
el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] }))
```

**三种都试过，三种都不行。**

**为什么**：模拟器不是普通网页。它用同层渲染把 `WX-VIEW` / `WX-TEXT` 这些自定义元素
投到 WebView 上，真正的事件分发在小程序逻辑层里走。CDP 注入的事件能进到 DOM，
但进不了那套事件系统。

**所以**：**别在这上面投入时间。** 想做交互验证，看
[`06-testing.md`](06-testing.md) —— 直接跑页面代码，绕过 UI。

**唯一能用它点的**：工具**自己**的界面（编译按钮、下拉菜单），那些是正常的 Electron
DOM。见 `scripts/click.js`。

---

## 2. 小程序的自定义元素名和普通 HTML 不一样 ★★★

**症状**：`document.querySelectorAll('img')` 返回空，但页面上明明有图片。

**原因**：小程序把 `<image>`、`<view>`、`<text>` 渲染成 `<wx-image>`、`<wx-view>`、
`<wx-text>`。而且里面常常再套一层原生标签：

```
WX-VIEW.thumbs
  └── WX-IMAGE        ← src 在这个上面
        └── ...       （内部的 img 可能是空的或用来渲染的）
```

**要这样写**：

```js
// 找图片
const imgs = [...document.querySelectorAll('wx-image')]

// 找某个 class 的元素
const items = [...document.querySelectorAll('.user-item')]

// 按文字找（注意可能匹配到多个：一个 text 节点 + 它的父 view）
const el = [...document.querySelectorAll('*')]
  .filter(e => (e.innerText || '').trim() === '登录')
```

**踩过的具体例子**：一个登录页上有"管理员"两个文本——一个是姓名字段，一个是角色**标签**
（角色名也叫"管理员"）。按文字找元素时会随机命中其中一个，点了没反应却不知道为什么。
**后面改成按 CSS 选择器 + 序号定位**（`scripts/click.js` 就是这么做的）。

---

## 3. `wx` 对象在 `__pageframe__` 里不存在 ★★★

**症状**：

```js
// 在页面 target 里执行
wx.getStorageSync('token')
// → ReferenceError: wx is not defined
```

**原因**：模拟器把**渲染层**和**逻辑层**拆成了两个 target：

| target URL 含 | 是什么 | 能干什么 |
|---|---|---|
| `__pageframe__/pages/...` | 页面的**渲染层**（DOM） | 读 DOM、读 input 值、截图 |
| `appservice/.../mainframe` | 小程序的**逻辑层** | `wx.*` API、`getApp()`、`Page` 实例 |

**所以**：

```bash
# 读页面内容 → 渲染层
node scripts/read-page.js

# 查 wx API 存不存在 → 逻辑层
node scripts/eval.js appservice "typeof wx.shareFileMessage"

# 看本机基础库版本
node scripts/eval.js appservice "wx.getSystemInfoSync().SDKVersion"
```

**注意**：即使连到 `appservice`，`wx` 也**不一定挂在 `window` 上**——它可能只在小程序的
模块作用域里。所以 `typeof wx` 有可能仍然是 `undefined`。**能稳定拿到的是
`__wxConfig`、`__wxAppCode__` 这类全局**（不同版本可能变）。

---

## 4. 原生弹窗不在 DOM 里，CDP 点不到 ★★

**症状**：代码里调了 `wx.showModal`，想用 CDP 点它的"确定"按钮，但 DOM 里找不到。

**原因**：`showModal` / `showActionSheet` / `showToast` 都是**原生组件**，
由工具自己渲染，**不在页面的 DOM 树里**。

**所以**：

- 自动化测试**不要依赖弹窗**。要么绕开（用页面里的自定义弹层），要么改成断言"弹窗被调用了"
- 手工验证时，这类弹窗只能人手点

**这也是我后来把一些界面从 `wx.showModal({editable: true})` 改成页面内自绘输入框的原因之一**——
顺便还解决了"`editable` 的输入框显示明文密码"这个问题。

---

## 5. 元素在视口外时点击会**静默落空** ★★

**症状**：`getBoundingClientRect()` 拿到了坐标，`Input.dispatchMouseEvent` 也发了，
**不报错，但什么都没发生**。

**原因**：长页面里按钮滚到了视口外，而 `getBoundingClientRect()` 给的是**相对视口的**
坐标——于是你点的是屏幕外的位置。

**修法**（`scripts/click.js` 里已经这么做了）：

```js
el.scrollIntoView({ block: 'center', inline: 'center' })
const r = el.getBoundingClientRect()
// 再核对一次确实落在视口内，不然直接报错，别静默失败
if (r.bottom < 0 || r.top > window.innerHeight) throw new Error('滚不到视口里')
```

**这个坑我踩了很久**：详情页很长的按钮，点十次没一次有反应，而同一个脚本点列表页的
短元素却次次成功——**因为短页面的元素本来就在视口里**。

**教训**：**会自动化的东西，出错时一定要喊出来。** 静默失败最耗时间。

---

## 6. 工具跑久了 CDP 会失效 ★★

**症状**：同一个脚本，前面跑得好好的，突然全部没反应；`list-targets` 还有输出，
但执行/点击都不生效。

**修法**：**重启工具**。这不是你代码的问题。

**建议**：长跑自动化时，隔一段时间重启一次；或者把"重启工具"写进流程里。

---

## 7. 官方 CLI 的 `open` 会校验 AppID ★★

```bash
cli.bat open --project "D:\my-project"
```

**会失败**，报类似「AppID 不合法 / 未登录」的错。试过不行的取值：

- `touristappid`（游客身份，不认）
- `600001`（老教程里提到的测试 AppID，不认）

**为什么**：`open` 这条路要求项目里配的是**真实且已登录的 AppID**。

**所以**：如果你还在用**测试号**或者才刚注册，`cli open` 这条路走不通，
**改用 `--remote-debugging-port` + CDP**（就是本仓库的做法）。

顺带一提，`cli.bat` 本身在 `...\微信web开发者工具\cli.bat`，
`cli islogin` 之类的只读命令是好用的。

---

## 8. 调试端口必须**启动时**给 ★★

```bash
# 这样才有用
"微信开发者工具.exe" --remote-debugging-port=9222

# 工具已经跑起来了之后再想开？不行，只能关掉重来
```

`scripts/launch.js` 会帮你判断是否已经在跑。

---

## 9. 用 `Start-Process` 启动 GUI 会被回收 ★★

**症状**：脚本里用 `Start-Process` 或 `&` 启动开发者工具，
脚本一结束，**工具也消失了**。

**原因**：由 shell 直接 spawn 的 GUI 进程，父进程退出时常常被连带回收。

**修法**：交给系统去创建：

```powershell
([wmiclass]'Win32_Process').Create('"C:\path\to\tool.exe" --remote-debugging-port=9222')
```

`scripts/launch.js` 用的是这个办法。

---

## 10. `project.config.json` 和 `project.private.config.json` 分工 ★

| 文件 | 提交到版本库？ | 放什么 |
|---|---|---|
| `project.config.json` | ✅ 应该 | 项目名、AppID 相关、公共设置 |
| `project.private.config.json` | ❌ **不该** | 个人设置、**编译模式**、本机路径 |

**所以**：想给同事加一个编译模式，别写进 `project.config.json`；
写进 `project.private.config.json`（`scripts/set-compile-mode.js` 就是往这儿写）。

---

## 11. 编译模式改了文件**不会立刻生效** ★

`project.private.config.json` 里的 `condition.miniprogram.list` 写好了，
但**已经在跑的工具看不到**——它启动时读一次。

**生效方式**：重启工具，或者在下拉框里手动选一下那个模式。

---

## 12. 工具自己也会弹「文件的内容较新」 ★

**症状**：

> 未能保存"settings.json"：文件的内容较新。请将你的版本与此文件内容进行比较。
> 　[比较]　[覆盖]

**是什么**：工具的某个配置文件被外部改过（或者它自己两次保存撞车），
它内存里的版本比磁盘上的旧。

**⚠️ 别直接点「覆盖」**——那会拿旧版本盖掉磁盘上的新版本。
**先点「比较」看一眼**，或者干脆关掉提示、重启工具。

**这个报错的 `settings.json` 不是你项目里的文件**（项目里根本没有这个名字的文件），
是工具自己的设置。**不影响你的代码。**

---

## 13. 热重载救不了"新增页面" ★

`compileHotReLoad: true` 只在改**已有页面**的时候好用。

**这些改动必须完整重新编译**：

- `app.json` 里新增/删除页面
- 新建的页面文件
- `app.wxss`
- 项目配置

**验证方法**：编译之后跑 `node scripts/list-targets.js`，看 `__pageframe__` 下
页面列表变没变。

---

## 14. 模拟器里"看起来能用"的功能，真机上可能完全不是一回事 ★★

差别最大的是**文件系统**：

| | 模拟器 | 真机 |
|---|---|---|
| `wx.env.USER_DATA_PATH` | 你电脑上的一个目录，能直接打开看 | **手机上的沙箱**，用户在文件管理器里**找不到** |
| `wx.saveFileToDisk` | 有（PC 版微信） | ❌ 没有 |
| 相册 / 拍照 | 弹文件选择框 | 真的调相机 |
| 图片压缩 | 可能直接跳过 | 真的压 |

**所以**：凡是跟"文件存到哪、能不能被用户看到"有关的功能，
**在模拟器里验证通过 ≠ 真机可用**。

**具体到我踩的坑**：做了一个"下载表格到本地"的功能，模拟器里一切正常（文件确实出现在
电脑的临时目录里），**真机上用户根本找不到那个文件**。后来改成了「转发到微信聊天」
——那才是手机上唯一真正可用的出口。

---

## 15. 用 CDP 读页面比截图 + OCR 好得多 ★

这条不是坑，是被我**试出来的正确做法**。

**一开始**：截图 → 丢给视觉模型 → 让它描述页面内容。

**问题**：
- 慢（一次几秒）
- 会**识别错**（尤其是小字、中文、相近的颜色）
- **拿不到隐藏信息**（input 的实际值、元素的 class、元素的层级）

**后来改成**：`document.body.innerText` + `querySelectorAll` 直接读。

**结果**：又快又准，而且能精确断言（"这个 input 的 value 是不是 `p@ssw0rd`"）。

**教训**：**能用结构化数据就别用像素。** 截图留给"要看排版对不对"这种场合。

（这个仓库里 `scripts/read-page.js` 就是干这个的。它能读出这类东西：

```
=== /__pageframe__/pages/login/login ===
售后维修工单 请输入你的姓名和密码登录 姓名 你的姓名 密码 密码 登录 …
--- 输入框 ---
  [0] input/text      value=""
  [1] input/password  value=""          ← 连 type 都能区分
  [2] input/text      value="http://127.0.0.1:8787"
```

**这是截图 + OCR 无论如何拿不到的精度。**）

---

## 16. 工具刚启动时，模拟器页面是个空 div ★★

**症状**：用 `launch.js` 启动工具，等 40 秒，`list-targets` 能看到
`__pageframe__/pages/xxx`，但用 CDP 读它：

```json
{ "bodyChildren": ["DIV.", "SCRIPT."], "innerTextLen": 0 }
```

**就是个空 `<div></div>`** —— 页面压根没渲染。

**与此同时工具界面里一切正常**：项目开着、编译模式对、页面路径也对。

**修法**：**触发一次编译**。

```bash
node scripts/compile.js --wait 25000
node scripts/read-page.js        # 现在有内容了
```

**所以自动化的开头应该固定是**：

```bash
node scripts/launch.js      # 启动（等 30-40 秒）
node scripts/compile.js     # ★ 这一步不能省，否则读到的永远是空的
node scripts/read-page.js   # 然后才开始干活
```

**这个坑阴的地方在于**：target 存在、CDP 连得上、`evaluate` 也不报错，
**就是返回空**——很容易误判成"脚本写错了"，然后去改一堆没问题的代码。

