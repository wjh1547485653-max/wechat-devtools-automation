# 编译模式：直接启动到指定页面

调试深层页面时，不用每次手动点一串入口。**编个"直接打开详情页"的模式，点一下就到。**

## 它存在哪

`project.private.config.json`：

```json
{
  "condition": {
    "miniprogram": {
      "list": [
        { "name": "登录页", "pathName": "pages/login/login", "query": "", "scene": null },
        { "name": "详情页", "pathName": "pages/detail/detail",
          "query": "no=20261015-001", "scene": null }
      ]
    }
  }
}
```

| 字段 | 说明 |
|---|---|
| `name` | 下拉框里显示的名字 |
| `pathName` | 页面路径，**不带前导斜杠**，不带 `.js` |
| `query` | 启动参数，等价于 `navigateTo` 的 url 里的 `?a=b`。可以用来"直接打开第 42 号工单" |
| `scene` | 场景值，一般 `null` |

## 为什么写进 private 而不是 config

| 文件 | 进版本库？ | 放什么 |
|---|---|---|
| `project.config.json` | ✅ 该进 | 项目名、AppID 相关、公共设置 |
| `project.private.config.json` | ❌ **不该** | 个人设置、编译模式、本机路径 |

编译模式往往是"我这个页面在调，别人不需要"，所以放 private。
（工具自己的 `.gitignore` 模板也会把 private 那个文件忽略掉。）

## 用脚本加

```bash
# 看现有的
node scripts/set-compile-mode.js --project "D:\my-miniapp" --list

# 加一个
node scripts/set-compile-mode.js --project "D:\my-miniapp" \
     --name 详情页 --page pages/detail/detail --query "no=20261015-001"
```

## ★ 改完不会立刻生效

**已经在跑的工具，启动时只读一次配置。** 光改文件它看不到。

**两种生效方式**：

1. **重启工具**
2. **在编译模式下拉框里手动选一下那个模式**（这样它会去读）

**所以**：改完文件之后，如果你的脚本还在跟那个工具打交道，
它看到的还是旧的编译模式——**先重启**。

## 用它做什么

**① 跳过繁琐的入口**

一个需要登录 → 进列表 → 点某一行 → 才到详情页的流程，
配个 `pages/detail/detail?no=xxx` 的模式就直接到了。

**② 配合自动化读页面**

自动化脚本常需要"把模拟器切到某个页面"。稳定的做法是：

```bash
# 用编译模式启动到目标页
node scripts/set-compile-mode.js --project . --name T --page pages/detail/detail
# 手动或重启使模式生效，然后在下拉里选它
node scripts/read-page.js detail
```

**注意**：这里**没法完全自动**——"让工具重新读配置"这步要么重启，要么人手选一下。
这是工具的限制，不是脚本能绕过去的。

**③ 给同事预设好调试入口**

但别忘了上面那条：编译模式写在 **private** 配置里，**不会跟着 git 走**。
想分享给别人，得单独说明。

## 验证模式生效了

```bash
node scripts/list-targets.js
```

看 `__pageframe__/` 下面出现的是不是你配的那个页面。
