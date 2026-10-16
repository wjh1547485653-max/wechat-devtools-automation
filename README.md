# 微信开发者工具自动化 · 实操笔记与脚本

**用 CDP 操作微信开发者工具的个人实操记录。** 包括能用的、不能用的、以及踩过的坑。

> **English**: Field notes and small scripts (no dependencies) for driving the WeChat
> DevTools IDE over the Chrome DevTools Protocol — plus an honest account of what
> **doesn't** work, which is the more useful half. Written from real project experience.

---

## 先说实话：这些能力不是都能用

我在这上面花了大量时间反复试错。**最重要的一条经验是：哪些路走得通、哪些走不通，得先说清楚**，不然你会跟我一样在白费功夫的地方耗掉好几天。

| 想做的事 | 靠不靠谱 | 怎么做 |
|---|---|---|
| **连上工具、列出页面/逻辑层** | ✅ 稳 | `scripts/list-targets.js` |
| **读模拟器页面的内容和输入框的值** | ✅ 稳 | `scripts/read-page.js` |
| **截模拟器的图**（不怕被窗口挡住） | ✅ 稳 | `scripts/shot.js` |
| **抓 console 报错** | ✅ 稳 | `scripts/console.js` |
| **点工具自己的界面**（编译按钮、菜单） | ✅ 稳 | `scripts/click.js` `scripts/compile.js` |
| **配置编译模式，直接启动到指定页** | ✅ 稳 | `scripts/set-compile-mode.js` |
| **在小程序逻辑层里查 `wx` 对象** | ✅ 可以用 | `scripts/eval.js appservice "typeof wx.xxx"` |
| **点模拟器里页面的按钮** | ❌ **时灵时不灵** | 别做，见下 |
| **往模拟器的输入框打字** | ⚠️ 输入本身可以，但**后续点击不可靠**，整条链走不通 | 别做，见下 |
| **CDP 拿不到** `wx.showModal` 这类原生弹窗 | ❌ 不在 DOM 里 | — |

### 「点模拟器里的按钮」为什么不行

实测下来的规律是：**刚重启工具时能点成功一次，之后就失效**。我试过：

- `Input.dispatchMouseEvent`（真实的鼠标事件）
- `Input.dispatchTouchEvent`（触摸事件，更接近 tap）
- 直接在 DOM 上 `dispatchEvent(new MouseEvent('click'))`

**三种都一样。** 这不是"选错了事件类型"，是模拟器那套同层渲染对 CDP 注入的事件处理有问题。

**我最后是怎么绕过去的**：不去操作 UI，而是**直接跑页面自己的 JS 做断言**。
见 [`docs/06-testing.md`](docs/06-testing.md) —— 那套做法比 UI 自动化**快、稳、还能进 CI**，
我现在认为它才是正解，UI 点击最多算"聊胜于无"。

---

## 快速开始

**没有任何依赖**，只要 Node 18+（用到内置的 `fetch` 和 `WebSocket`）。

```bash
# 0. 拿到代码（零依赖，不需要 npm install）
git clone https://github.com/wjh1547485653-max/wechat-devtools-automation.git
cd wechat-devtools-automation

# 1. 启动工具并打开调试端口（端口必须启动时给，事后开不了）
node scripts/launch.js

# 2. 等 30-40 秒，然后看有什么可操作的
node scripts/list-targets.js

# 3. ★ 触发一次编译 —— 这一步不能省，否则模拟器页面是个空 div
node scripts/compile.js

# 4. 看看当前页面长什么样
node scripts/read-page.js
```

**第 3 步容易被忽略**：工具刚启动时，`__pageframe__` 下的页面 target 是存在、
CDP 也连得上，但读出来是空的。见
[`docs/05-gotchas.md` 第 16 条](docs/05-gotchas.md#16-工具刚启动时模拟器页面是个空-div-)。

`WXDT_DEBUG_PORT` 环境变量可以改端口（默认 `9222`）。

---

## 目录

| 文件 | 内容 |
|---|---|
| [`docs/01-install.md`](docs/01-install.md) | 装开发工具（winget / 手动）、找到可执行文件 |
| [`docs/02-cli.md`](docs/02-cli.md) | 官方 CLI 能干什么、有哪些坑 |
| [`docs/03-cdp.md`](docs/03-cdp.md) | CDP 操作手册：三类 target 各管什么、常用命令 |
| [`docs/04-compile-modes.md`](docs/04-compile-modes.md) | 编译模式：直接启动到指定页面 |
| **[`docs/05-gotchas.md`](docs/05-gotchas.md)** | **踩坑清单（← 最值得看的）** |
| **[`docs/06-testing.md`](docs/06-testing.md)** | **不用 UI 自动化怎么测小程序（← 第二值得看）** |
| [`docs/07-real-device.md`](docs/07-real-device.md) | 模拟器 vs 真机：哪些东西在本机根本验不了 |

脚本清单见 [`scripts/README.md`](scripts/README.md)。

---

## 适用范围与版本

这些笔记对应的是：

| | |
|---|---|
| 开发者工具 | **2.02.2609231**（32 位安装包在 `C:\Program Files (x86)\Tencent\微信web开发者工具`） |
| 基础库 | 3.17.4 |
| 系统 | Windows 11 |
| Node | 18+ |

**⚠️ 这些是内部实现，不是公开 API。** 微信随时可能改 ——
target 的 URL 结构、`WX-VIEW` 这类自定义元素名、工具栏按钮的类名，
都是我从运行时观察出来的，**没有任何兼容性保证**。

如果哪天脚本不好使了，先跑 `node scripts/list-targets.js` 看看结构变没变，
再回来改选择器。**这正是我把「怎么排查」也一起写下来的原因。**

---

## 许可

MIT，见 [LICENSE](LICENSE)。

**免责**：这些脚本在 Windows 上验证过。macOS / Linux 上路径和进程启动方式都要改
（`scripts/launch.js` 目前只处理 Windows）。
