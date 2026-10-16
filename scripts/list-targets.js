#!/usr/bin/env node
/**
 * 列出开发者工具里当前所有可调试的 target。
 *
 * 用法:
 *   node scripts/list-targets.js
 *
 * 这是做任何自动化的第一步——先看看有什么可操作，再决定连哪个。
 *
 * 典型的输出长这样：
 *
 *   [webview]  http://127.0.0.1:xxxxx/__pageframe__/pages/index/index
 *   [webview]  http://127.0.0.1:xxxxx/__pageframe__/pages/detail/detail
 *   [webview]  http://127.0.0.1:xxxxx/appservice/s0/.../mainframe
 *   [page]     file:///.../electron-project.html
 *
 * 三类 target 各管什么，见 docs/03-cdp.md：
 *   __pageframe__/...       模拟器里渲染的每个页面（读 DOM、截图看这个）
 *   appservice/.../mainframe 小程序的逻辑层（wx 对象只在这里有）
 *   electron-project.html   工具本体界面（编译按钮、编辑器都在这）
 */
const cdp = require('./lib/cdp')

async function main() {
  const targets = await cdp.listTargets()
  console.log('调试端口:', cdp.PORT, '\n')

  const groups = { miniprogram: [], appservice: [], ide: [], other: [] }
  for (const t of targets) {
    const url = String(t.url)
    if (url.indexOf('__pageframe__/pages') >= 0) groups.miniprogram.push(t)
    else if (url.indexOf('appservice') >= 0 && url.indexOf('mainframe') >= 0) groups.appservice.push(t)
    else if (url.indexOf('electron-') >= 0) groups.ide.push(t)
    else groups.other.push(t)
  }

  const label = {
    miniprogram: '模拟器页面（读 DOM / 截图用这个）',
    appservice: '小程序逻辑层（wx 对象在这）',
    ide: '工具本体界面（编译按钮、编辑器）',
    other: '其它（debugger / worker / 扩展，一般不用管）'
  }

  for (const key of ['miniprogram', 'appservice', 'ide', 'other']) {
    if (!groups[key].length) continue
    console.log('--- ' + label[key] + ' ---')
    for (const t of groups[key]) {
      let short = String(t.url)
      // 把一长串本机端口号压掉，看着清爽
      short = short.replace(/^https?:\/\/127\.0\.0\.1:\d+\//, '/')
      if (short.length > 110) short = short.slice(0, 110) + '…'
      console.log('  [' + t.type + '] ' + short)
    }
    console.log('')
  }

  if (!targets.length) {
    console.log('一个 target 都没有。工具可能还没启动完，或者没开调试端口。')
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
