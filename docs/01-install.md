# 安装开发者工具

## Windows

### 方式一：winget（推荐）

```powershell
winget install Tencent.WeixinDevTools
```

**注意**：装完在 `C:\Program Files (x86)\Tencent\微信web开发者工具\`
——**是 `(x86)` 那个目录**，即使是 64 位系统。现在发的包是 32 位的。

### 方式二：官网手动下

<https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html>

选 **Windows 64 位**（装完还是在 `(x86)` 目录下，别找错）。

## 安装后确认这几件事

```powershell
# 1. 可执行文件在哪
Get-ChildItem 'C:\Program Files (x86)\Tencent\微信web开发者工具' -Filter '*.exe' |
  Select-Object Name

# 2. CLI 也在同一个目录（cli.bat）
Test-Path 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat'

# 3. 看看版本
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' -v
```

## macOS / Linux

macOS 是 `.dmg`，装完在 `/Applications/wechatwebdevtools.app`。

**本仓库的脚本目前在 Windows 上验证过**，macOS 上要改：
- `scripts/launch.js` 里的进程启动方式（不能再用 `Win32_Process`）
- 路径

## 首次运行要做的设置

1. **用微信扫码登录**（不登录的话工具基本不能干活）
2. 如果有测试号/正式 AppID，在项目设置里填上
3. **「详情 → 本地设置」勾选「不校验合法域名」** —— 本地跑后端时必须要，
   否则 `wx.request` 到 `http://127.0.0.1` 会被拦

## 关于测试号

没有正式账号时，工具允许用**测试号**开发。

**测试号的限制**（会影响你能做什么）：

- ❌ **不能发体验版** → 装不到手机上
- ❌ 不能用云开发/云托管
- ✅ 能在模拟器里开发调试
- ✅ 能验证大部分逻辑

**所以**：测试号只够把功能跑起来，**真机验证必须用正式账号**。
详见 [`07-real-device.md`](07-real-device.md)。
