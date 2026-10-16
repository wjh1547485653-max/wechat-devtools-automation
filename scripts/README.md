# 脚本清单

**零依赖**，Node 18+ 直接跑（用到内置的 `fetch` 和 `WebSocket`）。

| 脚本 | 干什么 | 可靠性 |
|---|---|---|
| `launch.js` | 启动工具并打开调试端口 | ✅ |
| `list-targets.js` | 列出所有可调试的 target | ✅ |
| `read-page.js` | 读模拟器页面的文本和输入框值 | ✅ **最常用** |
| `shot.js` | 截模拟器画面 / 工具界面 | ✅ |
| `console.js` | 抓 console 和未捕获异常 | ✅ |
| `eval.js` | 在任意 target 里执行 JS（万能兜底） | ✅ |
| `click.js` | 点工具**自己**的界面 | ✅ |
| `compile.js` | 触发一次编译 | ✅ |
| `set-compile-mode.js` | 配置编译模式（启动到指定页） | ✅ |
| `lib/cdp.js` | 上面共用的 CDP 连接库 | — |

**「可靠性 ✅」的意思是"我反复用过、没出过问题"**，不是"有保证"。
工具内部实现随时可能改，见 README 的「适用范围与版本」。

## 典型用法

```bash
# 起步三连
node scripts/launch.js
node scripts/list-targets.js
node scripts/read-page.js

# 改完代码重新编译
node scripts/compile.js --wait 30000

# 看某个页面长什么样（连输入框的值）
node scripts/read-page.js detail --full

# 排查白屏 —— 抓逻辑层的报错
node scripts/console.js appservice 8000

# 查基础库版本
node scripts/eval.js appservice "wx.getSystemInfoSync().SDKVersion"

# 点点工具的编译按钮
node scripts/click.js .ui-icon-refresh

# 配个"直接打开登录页"的编译模式
node scripts/set-compile-mode.js --project "D:\my-miniapp" \
     --name 登录页 --page pages/login/login
```

## 环境变量

| | 默认 | 说明 |
|---|---|---|
| `WXDT_DEBUG_PORT` | `9222` | 工具的调试端口 |

## 设计上的几个选择

**① 零依赖。** 不引 `ws`、不引 `puppeteer`。
Node 18 自带 `WebSocket` 和 `fetch`，够用了。clone 下来就能跑，不用 `npm install`。

**② 出错时把可选项列出来。** 找 target 失败时，不会只说"没找到"，而是把当前所有 target
打出来；找元素失败时，把工具栏上有什么可点的列出来。
**因为在工具里排查问题，最耗时间的就是"我不知道现在到底是什么状态"。**

**③ 该报错就报错，不静默。** 滚动不到视口里、坐标落到屏幕外，一律抛异常。
"点了没反应"是最难查的失败模式，见 [`../docs/05-gotchas.md`](../docs/05-gotchas.md) 第 5 条。

**④ 单个脚本一个职责。** 这样任何一个坏了都好定位。
