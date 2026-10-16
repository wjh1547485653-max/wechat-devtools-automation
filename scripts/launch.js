#!/usr/bin/env node
/**
 * 启动微信开发者工具，并打开调试端口。
 *
 * 用法:
 *   node scripts/launch.js                     # 只启动
 *   node scripts/launch.js --port 9222
 *   node scripts/launch.js --path "C:\...\微信开发者工具.exe"
 *
 * 为什么需要这个脚本：**调试端口必须在启动时就传进去**，工具跑起来之后再想开
 * 是开不了的，只能重启。所以自动化之前先用它把工具带起来。
 *
 * 另外它用的是 Win32_Process.Create 而不是 start，原因见文档
 * 「为什么不能用 Start-Process」。
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const DEFAULT_PATHS = [
  'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\微信开发者工具.exe',
  'C:\\Program Files\\Tencent\\微信web开发者工具\\微信开发者工具.exe'
]

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

function main() {
  const port = arg('port', '9222')
  let exe = arg('path', '')

  if (!exe) {
    exe = DEFAULT_PATHS.find((p) => fs.existsSync(p)) || ''
  }
  if (!exe || !fs.existsSync(exe)) {
    console.error('找不到微信开发者工具。用 --path 指定，常见位置：')
    DEFAULT_PATHS.forEach((p) => console.error('  ' + p))
    return 1
  }

  const cmd = '"' + exe + '" --remote-debugging-port=' + port
  console.log('启动:', exe)
  console.log('调试端口:', port)

  if (process.platform !== 'win32') {
    console.error('这个脚本目前只处理 Windows。其它平台请手动带 --remote-debugging-port 启动。')
    return 1
  }

  // 用 Win32_Process.Create 而不是 start/Start-Process：
  // 由 shell 直接 spawn 的 GUI 进程，父进程一退出子进程常常跟着被回收，
  // 工具就"启动完立刻消失"了。Create 是交给系统去建的，不受这个影响。
  const ps = '$p = Get-Process -Name "\u5fae\u4fe1\u5f00\u53d1\u8005\u5de5\u5177" ' +
    '-ErrorAction SilentlyContinue | Select-Object -First 1; ' +
    'if ($p) { "already-running" } else { ' +
    '([wmiclass]\'Win32_Process\').Create(\'' + cmd.replace(/'/g, "''") + '\') | Out-Null; "started" }'
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
    encoding: 'utf8'
  })
  const out = (r.stdout || '').trim()
  console.log('状态:', out || '（没拿到输出）', r.stderr ? String(r.stderr).slice(0, 200) : '')

  if (out === 'already-running') {
    console.log('\n工具已经在跑了。**调试端口是启动时定的**，所以要让它生效得先关掉再启动一次。')
  } else {
    console.log('\n等它启动完（约 30-40 秒），然后跑：node scripts/list-targets.js')
  }
  return 0
}

process.exit(main())
