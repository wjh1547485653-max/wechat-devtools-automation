# 官方 CLI 能干什么

安装目录下有个 `cli.bat`（macOS 是 `cli`），能驱动工具做不少事。

```powershell
$CLI = 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat'
& $CLI --help
```

## 好用的命令

| 命令 | 用途 |
|---|---|
| `cli islogin` | 看登录状态，返回 `{"login":true}` |
| `cli login` | 拉起登录二维码 |
| `cli preview --project <目录>` | 生成预览二维码 |
| `cli upload --project <目录> --version x --desc y` | 上传代码 |
| `cli open --project <目录>` | 打开项目 |
| `cli build-npm --project <目录>` | 构建 npm |
| `cli quit` | 退出工具 |
| `cli auto --project <目录> --auto-port 9420` | **自动化模式**（见下） |

## 坑一：`open` 会校验 AppID ★★

```powershell
& $CLI open --project "D:\my-project"
# → 失败，提示 AppID 不合法 / 未登录 / 无法打开项目
```

**试过不行的取值**：

- `touristappid` —— 游客身份，不认
- `600001` —— 老教程里的测试 AppID，不认

**原因**：`open` 要求项目配的是**真实且已登录**的 AppID。

**所以还在用测试号的话，这条路走不通**，改用：

```bash
node scripts/launch.js              # 启动工具 + 调试端口
node scripts/list-targets.js        # 然后走 CDP
```

或者**在工具里手动打开项目**（一次就够，它会记住）。

## 坑二：`--auto` 的端口和 CDP 端口是两回事

`cli auto --auto-port 9420` 会起一个**自动化服务**，它自己的协议跟 CDP 不一样。
**不要把它和 `--remote-debugging-port=9222` 搞混**——后者才是本仓库用的。

## 坑三：路径里有中文或空格

CLI 对参数的解析比较朴素，**路径带空格时一定要加引号**，中文路径有时也会出问题。

**稳妥做法**：用绝对路径 + 双引号：

```powershell
& $CLI preview --project "D:\projects\miniapp"
```

## Windows PowerShell 5.1 的额外坑

**PowerShell 5.1 读无 BOM 的 UTF-8 脚本时，会按系统 ANSI 代码页解码。**

后果：**含中文的 `.ps1` 脚本会乱码**，解析失败。

**两条出路**：

1. **脚本内容保持全 ASCII**（中文放进参数或单独的数据文件）
2. 或者**存成带 BOM 的 UTF-8**

我用的是第一条——写出来的 `.ps1` 里一个中文字符都没有，
中文都从命令行参数传进去。虽然丑，但稳。
